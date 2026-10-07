import 'dart:convert';
import 'dart:io';

import 'package:drift/drift.dart' show Value;
import 'package:etare_ops/src/core/errors/app_exception.dart';
import 'package:etare_ops/src/core/json/json_reader.dart';
import 'package:etare_ops/src/core/logging/app_logger.dart';
import 'package:etare_ops/src/core/security/trusted_keys.dart';
import 'package:etare_ops/src/core/storage/storage_guard.dart';
import 'package:etare_ops/src/data/local/app_database.dart';
import 'package:etare_ops/src/data/local/daos/basemap_dao.dart';
import 'package:etare_ops/src/features/basemaps/data/basemap_store.dart';
import 'package:etare_ops/src/features/basemaps/domain/basemap_models.dart';
import 'package:etare_ops/src/features/sync/application/package_verification.dart';
import 'package:etare_ops/src/features/sync/data/ed25519_keys.dart';
import 'package:etare_ops/src/features/sync/data/sync_api.dart';
import 'package:etare_ops/src/features/sync/domain/package_models.dart';
import 'package:etare_ops/src/features/sync/domain/signed_content.dart';
import 'package:etare_ops/src/features/sync/domain/sync_trigger.dart';
import 'package:flutter/foundation.dart';

/// Fond qui n'a pas pu être installé ; l'éventuelle version précédente reste.
@immutable
final class BasemapFailure {
  const BasemapFailure(this.sectorName, this.code);

  final String sectorName;
  final String code;
}

@immutable
final class BasemapProgress {
  const BasemapProgress({
    required this.sectorName,
    required this.doneBytes,
    required this.totalBytes,
  });

  final String sectorName;
  final int doneBytes;
  final int totalBytes;
}

/// Résultat d'un passage sur les fonds de carte.
@immutable
final class BasemapSyncReport {
  const BasemapSyncReport({
    this.installed = 0,
    this.removed = 0,
    this.deferredBytes = 0,
    this.failures = const [],
    this.interrupted = false,
  });

  final int installed;
  final int removed;

  /// Volume des fonds laissés au Wi-Fi (au-delà de 50 Mo, ADR-018).
  final int deferredBytes;
  final List<BasemapFailure> failures;

  /// Réseau perdu : le téléchargement reprendra à la partie suivante.
  final bool interrupted;
}

/// Un fond attend le Wi-Fi.
final class _Deferred implements Exception {
  const _Deferred(this.bytes);

  final int bytes;
}

/// Synchronisation des fonds de carte (CAR-03, ADR-024) : les fonds du
/// catalogue signé sont téléchargés partie par partie (reprise après
/// coupure), vérifiés (signature du manifeste, empreinte de chaque partie et
/// du fichier entier), puis installés d'un bloc ; l'ancienne version d'un
/// secteur reste affichée jusque-là. Au-delà de 50 Mo, un fond attend le
/// Wi-Fi. Un secteur qui n'est plus reçu perd son fond.
final class BasemapSync {
  BasemapSync({
    required this._api,
    required this._dao,
    required this._store,
    this._clock = DateTime.now,
    this._largeThresholdBytes = backgroundDownloadBudgetBytes,
    this._budgetBytes = basemapDeviceBudgetBytes,
    this._storage,
  });

  static const _logger = AppLogger('basemaps');

  final SyncApi _api;
  final BasemapDao _dao;
  final BasemapStore _store;
  final DateTime Function() _clock;
  final int _largeThresholdBytes;
  final int _budgetBytes;

  /// Espace libre contrôlé avant chaque fond (CAP-02).
  final StorageGuard? _storage;

  /// [allowLarge] : synchronisation en Wi-Fi (tâche Android sur réseau non
  /// limité) ; sinon un fond de plus de 50 Mo à télécharger est reporté.
  /// [trustedKeys] : clés reconnues pour ce passage (jeu de clés relu).
  Future<BasemapSyncReport> synchronize(
    DeviceCredentials device,
    List<CatalogBasemap> wanted, {
    required TrustedKeys trustedKeys,
    required bool allowLarge,
    void Function(BasemapProgress progress)? onProgress,
  }) async {
    // Ni fond demandé ni fond détenu : rien à faire, pas même sur le disque.
    if (wanted.isEmpty && (await _dao.all()).isEmpty) {
      return const BasemapSyncReport();
    }
    final wantedSectors = {for (final entry in wanted) entry.sectorId};
    var removed = 0;
    for (final row in await _dao.all()) {
      if (!wantedSectors.contains(row.sectorId)) {
        await _dao.remove(row.packId);
        await _store.remove(row.packId);
        removed++;
      }
    }
    await _store.discardIncoming(
      except: {for (final entry in wanted) entry.packId},
    );
    final held = {for (final row in await _dao.all()) row.packId: row};
    await _store.discardOrphans(installed: held.keys.toSet());

    var installed = 0;
    var deferredBytes = 0;
    var interrupted = false;
    final failures = <BasemapFailure>[];
    for (final entry in wanted) {
      final current = held[entry.packId];
      if (current != null) {
        await _reverify(device, entry, current, trustedKeys, failures);
        continue;
      }
      final others = held.values
          .where((row) => row.sectorId != entry.sectorId)
          .fold(0, (total, row) => total + row.totalBytes);
      if (others + entry.totalBytes > _budgetBytes) {
        failures.add(BasemapFailure(entry.sectorName, 'BASEMAP_BUDGET'));
        continue;
      }
      try {
        final row = await _install(
          device,
          entry,
          trustedKeys,
          allowLarge,
          onProgress,
        );
        held
          ..removeWhere((_, old) => old.sectorId == entry.sectorId)
          ..[entry.packId] = row;
        installed++;
      } on _Deferred catch (deferred) {
        deferredBytes += deferred.bytes;
      } on NetworkException {
        interrupted = true;
        break;
      } on SyncIntegrityException catch (error) {
        _logger.warning('Fond refusé (${error.code}) : ${entry.sectorName}.');
        await _store.remove(entry.packId);
        failures.add(BasemapFailure(entry.sectorName, error.code));
      } on StorageInsufficientException catch (error) {
        _logger.warning('Fond reporté, place insuffisante : $error');
        failures.add(
          BasemapFailure(entry.sectorName, StorageInsufficientException.code),
        );
      } on FileSystemException catch (error) {
        _logger.warning('Fond non écrit : ${entry.sectorName}.', error: error);
        failures.add(
          BasemapFailure(
            entry.sectorName,
            isStorageFull(error) ? storageFullCode : 'BASEMAP_STORAGE',
          ),
        );
      } on ApiException catch (error) {
        if (error.code == ApiErrorCode.deviceRevoked ||
            error.code == ApiErrorCode.deviceNotEnrolled ||
            error.code == ApiErrorCode.deviceProofInvalid) {
          rethrow;
        }
        failures.add(BasemapFailure(entry.sectorName, error.code.wireValue));
      }
    }

    try {
      await _api.basemapReceipt(device, [
        for (final row in await _dao.all()) row.packId,
      ]);
    } on NetworkException {
      // L'accusé repartira au prochain passage.
    } on ApiException catch (error) {
      _logger.info('Accusé des fonds refusé (${error.code.wireValue}).');
    }
    return BasemapSyncReport(
      installed: installed,
      removed: removed,
      deferredBytes: deferredBytes,
      failures: List.unmodifiable(failures),
      interrupted: interrupted,
    );
  }

  /// Révocation : fonds et index effacés.
  Future<void> purge() async {
    await _dao.purgeAll();
    await _store.purgeAll();
  }

  /// Fond déjà installé dont la clé de signature n'est plus reconnue (ou
  /// inconnue, installé avant la v8) : le manifeste, identique par empreinte,
  /// est revérifié avec sa signature renouvelée, sans rien retélécharger.
  /// En cas d'échec le fond reste affiché : le catalogue signé atteste déjà
  /// son empreinte, la vérification sera retentée au contact suivant.
  Future<void> _reverify(
    DeviceCredentials device,
    CatalogBasemap entry,
    InstalledBasemapRow row,
    TrustedKeys trustedKeys,
    List<BasemapFailure> failures,
  ) async {
    final keyId = row.signatureKeyId;
    if (keyId != null &&
        trustedKeys.find(keyId, KeyPurpose.publication) != null) {
      return;
    }
    try {
      final (_, _, signature) = await _verifiedManifest(
        device,
        entry,
        trustedKeys,
      );
      await _dao.updateSignatureKey(row.packId, signature.keyId);
    } on SyncIntegrityException catch (error) {
      failures.add(BasemapFailure(entry.sectorName, error.code));
    } on ApiException catch (error) {
      if (error.code == ApiErrorCode.deviceRevoked ||
          error.code == ApiErrorCode.deviceNotEnrolled ||
          error.code == ApiErrorCode.deviceProofInvalid) {
        rethrow;
      }
      failures.add(BasemapFailure(entry.sectorName, error.code.wireValue));
    }
  }

  Future<InstalledBasemapRow> _install(
    DeviceCredentials device,
    CatalogBasemap entry,
    TrustedKeys trustedKeys,
    bool allowLarge,
    void Function(BasemapProgress progress)? onProgress,
  ) async {
    final (manifest, text, signature) = await _verifiedManifest(
      device,
      entry,
      trustedKeys,
    );
    final incoming = await _store.incoming(entry.packId, entry.manifestHash);
    final remaining = manifest.totalBytes - incoming.partialLength;
    if (!allowLarge && remaining > _largeThresholdBytes) {
      throw _Deferred(remaining);
    }
    // L'ancienne version du secteur reste affichée jusqu'au bout : la
    // nouvelle demande toute sa place.
    await _storage?.ensure(remaining);

    var done = incoming.partialLength;
    void report() => onProgress?.call(
      BasemapProgress(
        sectorName: entry.sectorName,
        doneBytes: done,
        totalBytes: manifest.totalBytes,
      ),
    );
    report();

    final tiles = manifest.tiles;
    final pending = tiles.parts.skip(incoming.completedParts).toList();
    final others = [
      for (final file in manifest.files)
        if (file.path != basemapTilesFile) file,
    ];
    final wanted = {
      for (final part in pending) part.sha256,
      for (final file in others) file.sha256,
    }.toList();
    var urls = wanted.isEmpty
        ? <String, Uri>{}
        : await _api.basemapDownloadUrls(device, entry.packId, wanted);

    Future<List<int>> fetch(String sha256, int size) async {
      var url = urls[sha256];
      if (url == null) {
        throw const SyncIntegrityException('BASEMAP_FILE_UNAVAILABLE');
      }
      List<int> bytes;
      try {
        bytes = await _api.download(url);
      } on ApiException {
        // URL expirée pendant un long transfert : nouvelle autorisation.
        urls = await _api.basemapDownloadUrls(device, entry.packId, [sha256]);
        url = urls[sha256];
        if (url == null) {
          throw const SyncIntegrityException('BASEMAP_FILE_UNAVAILABLE');
        }
        bytes = await _api.download(url);
      }
      if (bytes.length != size || sha256Hex(bytes) != sha256) {
        throw const SyncIntegrityException('BASEMAP_PART_MISMATCH');
      }
      return bytes;
    }

    for (final part in pending) {
      final bytes = await fetch(part.sha256, part.sizeBytes);
      await incoming.appendPart(incoming.completedParts, bytes);
      done += bytes.length;
      report();
    }
    if (incoming.partialLength != tiles.sizeBytes ||
        await incoming.tilesSha256() != tiles.sha256) {
      throw const SyncIntegrityException('BASEMAP_HASH_MISMATCH');
    }
    for (final file in others) {
      final bytes = await fetch(file.sha256, file.sizeBytes);
      await incoming.writeFile(file.path, bytes);
      done += bytes.length;
      report();
    }

    await incoming.finalize(await _store.directoryOf(entry.packId), text);
    final previous = [
      for (final row in await _dao.all())
        if (row.sectorId == entry.sectorId && row.packId != entry.packId)
          row.packId,
    ];
    final row = InstalledBasemapRow(
      packId: entry.packId,
      sectorId: entry.sectorId,
      sectorName: manifest.sectorName,
      version: manifest.version,
      manifestHash: entry.manifestHash,
      manifestText: text,
      totalBytes: manifest.totalBytes,
      builtAt: manifest.builtAt,
      renewAfter: manifest.renewAfter,
      installedAt: _clock().toUtc(),
      signatureKeyId: signature.keyId,
    );
    await _dao.install(
      InstalledBasemapsCompanion(
        packId: Value(row.packId),
        sectorId: Value(row.sectorId),
        sectorName: Value(row.sectorName),
        version: Value(row.version),
        manifestHash: Value(row.manifestHash),
        manifestText: Value(row.manifestText),
        totalBytes: Value(row.totalBytes),
        builtAt: Value(row.builtAt),
        renewAfter: Value(row.renewAfter),
        installedAt: Value(row.installedAt),
        signatureKeyId: Value(row.signatureKeyId),
      ),
    );
    // L'ancienne version du secteur a quitté l'index : ses fichiers suivent.
    for (final packId in previous) {
      await _store.remove(packId);
    }
    return row;
  }

  /// Manifeste signé par la clé des publications, conforme au catalogue
  /// signé (empreinte), émis pour ce SIS et ce fond.
  Future<(BasemapManifest, String, SignatureEnvelope)> _verifiedManifest(
    DeviceCredentials device,
    CatalogBasemap entry,
    TrustedKeys trustedKeys,
  ) async {
    final payload = await _api.basemap(device, entry.packId);
    final valid = await verifyServerSignature(
      trustedKeys: trustedKeys,
      purpose: KeyPurpose.publication,
      envelope: payload.signature,
      text: signedText(SignatureContexts.basemap, payload.text),
    );
    if (!valid) throw const SyncIntegrityException('BASEMAP_SIGNATURE_INVALID');
    if (sha256OfText(payload.text) != entry.manifestHash) {
      throw const SyncIntegrityException('BASEMAP_HASH_MISMATCH');
    }
    final BasemapManifest manifest;
    try {
      manifest = BasemapManifest.fromJson(asJsonMap(jsonDecode(payload.text)));
    } on NewerFormatException {
      throw const SyncIntegrityException(readerTooOldCode);
    } on FormatException {
      throw const SyncIntegrityException('BASEMAP_INVALID');
    }
    if (manifest.packId != entry.packId ||
        manifest.sectorId != entry.sectorId ||
        manifest.tenantId != device.identity.tenantId) {
      throw const SyncIntegrityException('BASEMAP_MISMATCH');
    }
    return (manifest, payload.text, payload.signature);
  }
}
