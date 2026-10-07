import 'dart:convert';

import 'package:drift/drift.dart' show Value;
import 'package:etare_ops/src/core/config/app_info.dart';
import 'package:etare_ops/src/core/errors/app_exception.dart';
import 'package:etare_ops/src/core/errors/error_messages.dart';
import 'package:etare_ops/src/core/formatting/date_formatting.dart';
import 'package:etare_ops/src/core/json/json_reader.dart';
import 'package:etare_ops/src/core/logging/app_logger.dart';
import 'package:etare_ops/src/core/platform/platform_services.dart';
import 'package:etare_ops/src/core/security/trusted_keys.dart';
import 'package:etare_ops/src/core/text/search_text.dart';
import 'package:etare_ops/src/core/time/trusted_clock.dart';
import 'package:etare_ops/src/data/local/app_database.dart';
import 'package:etare_ops/src/data/local/daos/offline_dao.dart';
import 'package:etare_ops/src/data/local/daos/reports_dao.dart';
import 'package:etare_ops/src/data/local/daos/sync_state_dao.dart';
import 'package:etare_ops/src/features/basemaps/application/basemap_sync.dart';
import 'package:etare_ops/src/features/sync/application/package_verification.dart';
import 'package:etare_ops/src/features/sync/application/trust_store.dart';
import 'package:etare_ops/src/features/sync/data/device_identity_store.dart';
import 'package:etare_ops/src/features/sync/data/device_keys.dart';
import 'package:etare_ops/src/features/sync/data/ed25519_keys.dart';
import 'package:etare_ops/src/features/sync/data/sync_api.dart';
import 'package:etare_ops/src/features/sync/domain/package_models.dart';
import 'package:etare_ops/src/features/sync/domain/removal_notice.dart';
import 'package:etare_ops/src/features/sync/domain/signed_content.dart';
import 'package:etare_ops/src/features/sync/domain/sync_plan.dart';
import 'package:flutter/foundation.dart';

export 'package:etare_ops/src/features/sync/application/package_verification.dart'
    show SyncIntegrityException;

/// Étape en cours, pour l'affichage de la progression (OFF-01).
enum SyncStep { catalog, downloading, installing, receipt, basemaps }

@immutable
final class SyncProgress {
  const SyncProgress({
    required this.step,
    this.doneBytes = 0,
    this.totalBytes = 0,
    this.sitesDone = 0,
    this.sitesTotal = 0,
    this.siteName,
  });

  final SyncStep step;
  final int doneBytes;
  final int totalBytes;
  final int sitesDone;
  final int sitesTotal;
  final String? siteName;

  double? get fraction =>
      totalBytes <= 0 ? null : (doneBytes / totalBytes).clamp(0, 1).toDouble();
}

/// Site dont la nouvelle version n'a pas pu être installée (l'ancienne reste).
@immutable
final class SyncFailure {
  const SyncFailure(this.siteName, this.code);

  final String siteName;
  final String code;
}

sealed class SyncReport {
  const SyncReport();
}

/// Terminal non enrôlé : rien à synchroniser.
final class SyncNotEnrolled extends SyncReport {
  const SyncNotEnrolled();
}

/// Terminal révoqué ou inconnu du serveur : données et identité effacées,
/// signalements non transmis compris (ADR-017).
final class SyncPurged extends SyncReport {
  const SyncPurged(this.reason, {this.discardedReports = 0});

  final ApiErrorCode reason;

  /// Signalements effacés avant d'avoir été transmis.
  final int discardedReports;
}

final class SyncCompleted extends SyncReport {
  const SyncCompleted({
    required this.installed,
    required this.removed,
    required this.unchanged,
    required this.failures,
    required this.downloadedBytes,
    required this.interrupted,
    this.deferredBytes = 0,
    this.basemaps,
  });

  final int installed;
  final int removed;
  final int unchanged;
  final List<SyncFailure> failures;
  final int downloadedBytes;

  /// Réseau perdu en cours de route : la suite reprendra au prochain contact.
  final bool interrupted;

  /// Volume annoncé des versions laissées pour plus tard parce qu'elles
  /// dépassaient le budget de téléchargement (synchronisation en arrière-plan,
  /// SYN-01) ; 0 si rien n'a été reporté.
  final int deferredBytes;

  /// Passage sur les fonds de carte (ADR-024) ; null s'il n'a pas eu lieu.
  /// Il ne rend jamais la synchronisation des ETARE incomplète.
  final BasemapSyncReport? basemaps;

  bool get complete => failures.isEmpty && !interrupted && deferredBytes == 0;
}

/// Ce moteur n'a plus le bail de synchronisation (il a été gelé ou arrêté
/// trop longtemps et un autre l'a repris) : il n'active ni n'écrit rien.
final class SyncSuperseded implements Exception {
  const SyncSuperseded();
}

/// Une version dépasse le budget de téléchargement de cette synchronisation.
final class _DownloadDeferred implements Exception {
  const _DownloadDeferred();
}

/// Application trop ancienne pour le catalogue reçu (SYN-02) : aucune nouvelle
/// version n'est installée, ce qui est installé reste consultable ; les sites
/// retirés du catalogue le sont quand même.
final class SyncUpdateRequired extends SyncReport {
  const SyncUpdateRequired({required this.minVersion, this.removed = 0});

  /// Version exigée ; null quand le format reçu est trop récent pour la lire.
  final String? minVersion;
  final int removed;
}

/// Message destiné à l'agent quand l'application doit être mise à jour.
String appUpdateMessage(String? minVersion) =>
    'Mise à jour de l’application requise'
    '${minVersion == null || minVersion.isEmpty ? '' : ' (version $minVersion minimum, installée ${AppInfo.version})'}'
    ' : les ETARE déjà installés restent consultables, les nouvelles versions '
    'seront installées après la mise à jour de FireScape.';

/// Synchronisation descendante (architecture §11) : catalogue signé, plan,
/// téléchargement des seuls fichiers manquants, vérification complète, puis
/// activation en UNE transaction et accusé de réception. Une version qui ne
/// passe pas la vérification n'est jamais installée ; l'ancienne reste.
final class SyncService {
  SyncService({
    required this._api,
    required this._offline,
    required this._reports,
    required this._state,
    required this._identities,
    required this._trust,
    this._basemaps,
    this._clock = DateTime.now,
    DeviceKeys? keys,
    this._trustedClock,
    this._wipeSecrets,
  }) : _keys = keys ?? DeviceKeys(const SoftwarePlatformServices());

  static const _logger = AppLogger('sync');

  final SyncApi _api;
  final OfflineDao _offline;
  final ReportsDao _reports;
  final SyncStateDao _state;
  final DeviceIdentityStore _identities;

  /// Clés reconnues (SEC-04) : jeu de clés lu avant chaque catalogue.
  final TrustStore _trust;

  /// Clés reconnues pour ce passage, une fois le jeu de clés relu.
  TrustedKeys _trustedKeys = TrustedKeys.empty;

  /// Fonds de carte de la tablette (ADR-024) ; null : pas de carte.
  final BasemapSync? _basemaps;
  final DateTime Function() _clock;

  /// Clé du terminal : Keystore, ou Ed25519 des premières tablettes (SEC-05).
  final DeviceKeys _keys;

  /// Heure de confiance (SEC-05) ; null : horloge [_clock].
  final TrustedClock? _trustedClock;

  /// Révocation : session, code personnel et clé de la base locale effacés
  /// (SEC-05) ; null dans les tests du service seul.
  final Future<void> Function()? _wipeSecrets;

  DateTime get _now => (_trustedClock?.now() ?? _clock()).toUtc();

  /// Heure du serveur au catalogue de ce passage, et horloge monotone à sa
  /// réception : le nouveau repère de temps de confiance (SEC-05).
  TimeAnchor? _anchor;

  /// Confirme, juste avant d'activer, que ce moteur mène toujours la
  /// synchronisation (bail partagé entre moteurs, SYN-01).
  Future<bool> Function()? _holdsLease;

  /// Synchronisation en Wi-Fi : les fonds de plus de 50 Mo sont téléchargés.
  bool _allowLargeBasemaps = false;

  Future<void> _activate(ActivationRecord activation) async {
    final holdsLease = _holdsLease;
    if (holdsLease != null && !await holdsLease()) {
      throw const SyncSuperseded();
    }
    await _offline.activate(activation);
    final anchor = activation.timeAnchor;
    if (anchor != null) _trustedClock?.anchorAt(anchor);
  }

  /// [maxDownloadBytes] borne ce qui est téléchargé (fichiers manquants) : une
  /// version qui le dépasserait est reportée, les précédentes sont installées
  /// (synchronisation en arrière-plan sur réseau mobile, SYN-01). Null : sans
  /// limite.
  Future<SyncReport> run({
    required String userId,
    void Function(SyncProgress progress)? onProgress,
    int? maxDownloadBytes,
    Future<bool> Function()? holdsLease,
    bool allowLargeBasemaps = false,
  }) async {
    _holdsLease = holdsLease;
    _allowLargeBasemaps = allowLargeBasemaps;
    final identity = await _identities.read();
    if (identity == null) return const SyncNotEnrolled();
    if (!_trust.verifiesKeysets) {
      final embedded = await _trust.current();
      if (!embedded.has(KeyPurpose.publication) ||
          !embedded.has(KeyPurpose.catalog)) {
        throw const SyncIntegrityException('TRUSTED_KEYS_MISSING');
      }
    }
    DeviceCredentials device;
    try {
      device = await _keys.credentials(identity);
    } on DeviceKeyLost {
      // Keystore réinitialisé : la tablette ne peut plus rien prouver.
      _logger.warning('Clé du terminal perdue : purge.');
      final discarded = await _reports.pendingCount();
      await purge();
      return SyncPurged(
        ApiErrorCode.deviceNotEnrolled,
        discardedReports: discarded,
      );
    }
    await _state.write(
      SyncStateCompanion(
        status: const Value('running'),
        lastAttemptAt: Value(_now),
      ),
    );
    try {
      onProgress?.call(const SyncProgress(step: SyncStep.catalog));
      device = await _rotateKey(device);
      await _refreshKeyset(device);
      _trustedKeys = await _trust.current();
      if (!_trustedKeys.has(KeyPurpose.publication) ||
          !_trustedKeys.has(KeyPurpose.catalog)) {
        throw const SyncIntegrityException('TRUSTED_KEYS_MISSING');
      }
      return await _synchronize(
        device,
        userId,
        onProgress ?? (_) {},
        maxDownloadBytes,
      );
    } on ApiException catch (error) {
      switch (error.code) {
        case ApiErrorCode.deviceRevoked ||
            ApiErrorCode.deviceNotEnrolled ||
            ApiErrorCode.deviceProofInvalid:
          _logger.warning('Terminal refusé (${error.code.wireValue}) : purge.');
          final discarded = await _reports.pendingCount();
          await purge();
          return SyncPurged(error.code, discardedReports: discarded);
        case ApiErrorCode.forbidden:
          // L'utilisateur n'a plus le droit : son accès local cesse aussi.
          await _fail(describeError(error), revokeAccess: true);
          rethrow;
        default:
          await _fail(describeError(error));
          rethrow;
      }
    } on SyncSuperseded {
      // L'autre moteur tient l'état : rien n'est écrit ici.
      rethrow;
    } on SyncIntegrityException catch (error) {
      if (error.code == _updateRequired) {
        // Catalogue d'un format plus récent : rien n'est lu ni installé.
        await _state.write(
          SyncStateCompanion(
            status: const Value('failed'),
            lastError: Value(appUpdateMessage(null)),
            lastAttemptAt: Value(_now),
            requiredAppVersion: const Value(''),
          ),
        );
        await _sendReceipt(
          device,
          generation: (await _state.read()).catalogGeneration ?? 0,
          status: 'error',
          errorCode: _updateRequired,
        );
        return const SyncUpdateRequired(minVersion: null);
      }
      await _fail(_integrityMessage(error.code));
      rethrow;
    } on NetworkException catch (error) {
      // Pas de réseau n'est pas une panne : la fraîcheur dépend seulement de
      // l'âge de la dernière synchronisation réussie.
      await _state.write(
        SyncStateCompanion(
          status: const Value('idle'),
          lastError: Value(describeError(error)),
          lastAttemptAt: Value(_now),
        ),
      );
      rethrow;
    } on Object catch (error) {
      await _fail(describeError(error));
      rethrow;
    }
  }

  /// Jeu de clés lu avant le catalogue (SEC-04, ADR-027) : vérifié par la
  /// clé racine, jamais plus ancien que celui retenu. Un serveur sans jeu
  /// (404) laisse la tablette sur les clés qu'elle connaît.
  Future<void> _refreshKeyset(DeviceCredentials device) async {
    if (!_trust.verifiesKeysets) return;
    final SignedPayload signed;
    try {
      signed = await _api.keyset(device);
    } on ApiException catch (error) {
      if (error.code == ApiErrorCode.notFound) return;
      rethrow;
    }
    final change = await _trust.accept(signed);
    if (change.newlyRevokedPublicationKeys.isNotEmpty) {
      // Les sites sensibles ouverts ne gardent pas leur signature : refermés,
      // ils seront revérifiés à leur prochaine ouverture.
      _logger.warning(
        'Clé de publication révoquée : sites sensibles refermés.',
      );
      await _offline.closeOpenedSensitiveSites();
    }
  }

  /// Passage à une clé du Keystore (SEC-05) : la requête est signée par la
  /// clé actuelle, la nouvelle signe le texte de rotation. Si la réponse se
  /// perd, la rotation engagée est reprise au passage suivant : le serveur
  /// refuse alors l'ancienne clé, la nouvelle le prouve et la rotation
  /// s'achève. Toute autre erreur laisse la clé actuelle en place.
  Future<DeviceCredentials> _rotateKey(DeviceCredentials device) async {
    final identity = device.identity;
    if (identity.hardwareKey || !_keys.hardware) return device;
    final alias = identity.pendingKeyAlias ?? _keys.newAlias();
    final KeystoreDeviceKey? next;
    try {
      next = await _keys.hardwareKey(alias);
    } on Exception catch (error) {
      _logger.warning(
        'Keystore indisponible : clé actuelle gardée.',
        error: error,
      );
      return device;
    }
    if (next == null) return device;
    if (identity.pendingKeyAlias == null) {
      await _identities.write(identity.withPendingKey(alias));
    }
    final publicKey = await next.publicKeyBase64();
    try {
      await _api.rotateDeviceKey(
        device,
        algorithm: next.algorithm,
        publicKey: publicKey,
        proof: await next.sign(
          deviceKeyRotationText(
            tenantId: identity.tenantId,
            deviceId: identity.deviceId,
            algorithm: next.algorithm,
            publicKey: publicKey,
          ),
        ),
      );
    } on ApiException catch (error) {
      if (error.code != ApiErrorCode.deviceProofInvalid) {
        // Serveur antérieur à SEC-05 (route inconnue), refus passager : plus tard.
        _logger.warning(
          'Rotation de la clé reportée (${error.code.wireValue}).',
        );
        return device;
      }
      // L'ancienne clé est refusée : la rotation a peut-être abouti sans
      // réponse. La nouvelle clé le prouve, ou le terminal est bien refusé.
      final candidate = DeviceCredentials(identity, next);
      try {
        await _api.keyset(candidate);
      } on ApiException catch (probe) {
        if (probe.code != ApiErrorCode.notFound) throw error;
      }
    }
    final rotated = identity.withHardwareKey(alias);
    await _identities.write(rotated);
    _logger.info('Clé du terminal déplacée dans le Keystore.');
    return DeviceCredentials(rotated, next);
  }

  /// Révocation (OFF-04) : données installées, fonds de carte, état,
  /// identité et clés du terminal effacés ; puis session, code personnel et
  /// clé de la base locale (SEC-05).
  Future<void> purge() async {
    await _reports.purgeAll();
    await _offline.purgeAll();
    await _basemaps?.purge();
    await _keys.discard(await _identities.read());
    await _identities.clear();
    await _wipeSecrets?.call();
  }

  Future<SyncReport> _synchronize(
    DeviceCredentials device,
    String userId,
    void Function(SyncProgress progress) onProgress,
    int? maxDownloadBytes,
  ) async {
    onProgress(const SyncProgress(step: SyncStep.catalog));
    final catalog = await _verifiedCatalog(device, userId);
    final installed = await _offline.installed();
    // Une version signée par une clé révoquée est revérifiée : même version,
    // signature renouvelée par le serveur, fichiers déjà présents.
    final plan = planSync(
      [
        for (final row in installed)
          InstalledVersion(
            siteId: row.siteId,
            publicationId: row.publicationId,
            manifestHash: row.manifestHash,
            signatureKeyId: row.signatureKeyId,
          ),
      ],
      catalog,
      trusted: (keyId) =>
          _trustedKeys.find(keyId, KeyPurpose.publication) != null,
    );

    final minVersion = catalog.minAppVersion;
    if (minVersion != null &&
        compareVersions(minVersion, AppInfo.version) > 0) {
      return _holdForUpdate(device, catalog, plan, minVersion);
    }

    final prepared = <InstallRecord>[];
    final failures = <SyncFailure>[];
    final keep = <String>{};
    var interrupted = false;
    var doneBytes = 0;
    var downloadedBytes = 0;
    var deferredBytes = 0;
    var reservedBytes = 0;
    final totalBytes = plan.announcedBytes;
    // Budget de téléchargement : une version entière, ou rien.
    bool reserve(int bytes) {
      final budget = maxDownloadBytes;
      if (budget != null && reservedBytes + bytes > budget) return false;
      reservedBytes += bytes;
      return true;
    }

    for (final (index, entry) in plan.toInstall.indexed) {
      void report(int bytes) {
        doneBytes += bytes;
        onProgress(
          SyncProgress(
            step: SyncStep.downloading,
            doneBytes: doneBytes,
            totalBytes: totalBytes,
            sitesDone: index,
            sitesTotal: plan.toInstall.length,
            siteName: entry.siteName,
          ),
        );
      }

      report(0);
      try {
        final record = await _prepare(device, entry, keep, (bytes, downloaded) {
          downloadedBytes += downloaded;
          report(bytes);
        }, reserve);
        prepared.add(record);
      } on _DownloadDeferred {
        // Trop lourd pour cette synchronisation : cette version et les
        // suivantes attendront le Wi-Fi ou une synchronisation manuelle.
        deferredBytes = plan.toInstall
            .skip(index)
            .fold(0, (total, pending) => total + pending.sizeBytes);
        break;
      } on NetworkException {
        // Coupure : on active ce qui est prêt, la suite reprendra.
        interrupted = true;
        break;
      } on SyncIntegrityException catch (error) {
        failures.add(SyncFailure(entry.siteName, error.code));
      } on ApiException catch (error) {
        if (error.code == ApiErrorCode.deviceRevoked ||
            error.code == ApiErrorCode.deviceNotEnrolled ||
            error.code == ApiErrorCode.deviceProofInvalid) {
          rethrow;
        }
        failures.add(SyncFailure(entry.siteName, error.code.wireValue));
      }
    }

    onProgress(
      SyncProgress(
        step: SyncStep.installing,
        doneBytes: doneBytes,
        totalBytes: totalBytes,
        sitesDone: plan.toInstall.length,
        sitesTotal: plan.toInstall.length,
      ),
    );
    final complete = failures.isEmpty && !interrupted && deferredBytes == 0;
    await _activate(
      ActivationRecord(
        install: prepared,
        removeSites: plan.toRemove,
        notices: _noticesOf(catalog, plan),
        onDemand: catalog.onDemand,
        generation: catalog.generation,
        serverTime: catalog.issuedAt,
        authorizedUserId: catalog.authorizedUserId,
        authorizationExpiresAt: catalog.authorizationExpiresAt,
        complete: complete,
        now: _now,
        error: complete
            ? null
            : _partialMessage(failures, interrupted, deferredBytes),
        keepBlobs: keep,
        // Version de paquet trop récente pour ce lecteur : mise à jour requise
        // (version exigée inconnue), l'ancienne version du site reste.
        requiredAppVersion:
            failures.any((failure) => failure.code == _readerTooOld)
            ? ''
            : null,
        timeAnchor: _anchor,
        terminalPolicy: catalog.terminalPolicy?.encode(),
      ),
    );

    onProgress(const SyncProgress(step: SyncStep.receipt));
    await _sendReceipt(
      device,
      generation: catalog.generation,
      status: complete
          ? 'installed'
          : (prepared.isEmpty && interrupted ? 'error' : 'partial'),
      errorCode: interrupted
          ? 'NETWORK_INTERRUPTED'
          : failures.firstOrNull?.code ??
                (deferredBytes > 0 ? 'DOWNLOAD_DEFERRED' : null),
    );
    final basemaps = interrupted
        ? null
        : await _synchronizeBasemaps(device, catalog, onProgress);
    return SyncCompleted(
      installed: prepared.length,
      removed: plan.toRemove.length,
      unchanged: plan.unchanged,
      failures: List.unmodifiable(failures),
      downloadedBytes: downloadedBytes,
      interrupted: interrupted,
      deferredBytes: deferredBytes,
      basemaps: basemaps,
    );
  }

  /// Fonds de carte du catalogue, après les ETARE (ADR-024) : un incident
  /// sur un fond ne remet jamais en cause les fiches installées.
  Future<BasemapSyncReport?> _synchronizeBasemaps(
    DeviceCredentials device,
    SyncCatalog catalog,
    void Function(SyncProgress progress) onProgress,
  ) async {
    final basemaps = _basemaps;
    if (basemaps == null) return null;
    try {
      return await basemaps.synchronize(
        device,
        catalog.basemaps,
        trustedKeys: _trustedKeys,
        allowLarge: _allowLargeBasemaps,
        onProgress: (progress) => onProgress(
          SyncProgress(
            step: SyncStep.basemaps,
            doneBytes: progress.doneBytes,
            totalBytes: progress.totalBytes,
            siteName: progress.sectorName,
          ),
        ),
      );
    } on ApiException catch (error) {
      if (error.code == ApiErrorCode.deviceRevoked ||
          error.code == ApiErrorCode.deviceNotEnrolled ||
          error.code == ApiErrorCode.deviceProofInvalid) {
        rethrow;
      }
      _logger.warning('Fonds de carte non synchronisés.', error: error);
      return null;
    } on Object catch (error) {
      _logger.warning('Fonds de carte non synchronisés.', error: error);
      return null;
    }
  }

  /// Application trop ancienne pour ce catalogue (SYN-02, architecture §12) :
  /// rien de nouveau n'est téléchargé ni installé, mais les sites retirés du
  /// catalogue sont retirés et l'autorisation de consultation est renouvelée :
  /// le référentiel installé reste lisible, sans rien garder de ce qui n'est
  /// plus autorisé.
  Future<SyncReport> _holdForUpdate(
    DeviceCredentials device,
    SyncCatalog catalog,
    SyncPlan plan,
    String minVersion,
  ) async {
    _logger.warning(
      'Application ${AppInfo.version} trop ancienne (minimum $minVersion).',
    );
    await _activate(
      ActivationRecord(
        install: const [],
        removeSites: plan.toRemove,
        notices: _noticesOf(catalog, plan),
        onDemand: catalog.onDemand,
        generation: catalog.generation,
        serverTime: catalog.issuedAt,
        authorizedUserId: catalog.authorizedUserId,
        authorizationExpiresAt: catalog.authorizationExpiresAt,
        complete: false,
        now: _now,
        error: appUpdateMessage(minVersion),
        requiredAppVersion: minVersion,
        timeAnchor: _anchor,
        terminalPolicy: catalog.terminalPolicy?.encode(),
      ),
    );
    await _sendReceipt(
      device,
      generation: catalog.generation,
      status: 'partial',
      errorCode: _updateRequired,
    );
    return SyncUpdateRequired(
      minVersion: minVersion,
      removed: plan.toRemove.length,
    );
  }

  /// Raisons des sites retirés par ce passage (MET-04), lues dans le
  /// catalogue signé.
  static List<RemovalNotice> _noticesOf(SyncCatalog catalog, SyncPlan plan) {
    final removed = plan.toRemove.toSet();
    return [
      for (final notice in catalog.withdrawals)
        if (removed.contains(notice.siteId)) notice,
    ];
  }

  /// Catalogue signé par la clé de catalogue, émis pour CE terminal et CET
  /// utilisateur, jamais plus ancien que le dernier accepté (rejeu).
  Future<SyncCatalog> _verifiedCatalog(
    DeviceCredentials device,
    String userId,
  ) async {
    final signed = await _api.catalog(device);
    // Horloge monotone à la réception : avec l'heure du catalogue, le repère
    // de temps de confiance (SEC-05).
    final reading = await _trustedClock?.monotonic();
    final valid = await verifyServerSignature(
      trustedKeys: _trustedKeys,
      purpose: KeyPurpose.catalog,
      envelope: signed.signature,
      text: signedText(SignatureContexts.catalog, signed.text),
    );
    if (!valid) throw const SyncIntegrityException('CATALOG_SIGNATURE_INVALID');
    final SyncCatalog catalog;
    try {
      catalog = SyncCatalog.fromJson(asJsonMap(jsonDecode(signed.text)));
    } on NewerFormatException {
      throw const SyncIntegrityException(_updateRequired);
    } on FormatException {
      throw const SyncIntegrityException('CATALOG_INVALID');
    }
    if (catalog.tenantId != device.identity.tenantId ||
        catalog.deviceId != device.identity.deviceId) {
      throw const SyncIntegrityException('CATALOG_MISMATCH');
    }
    if (catalog.authorizedUserId != userId) {
      throw const SyncIntegrityException('CATALOG_USER_MISMATCH');
    }
    final accepted = (await _state.read()).catalogGeneration;
    if (accepted != null && catalog.generation < accepted) {
      throw const SyncIntegrityException('CATALOG_REPLAYED');
    }
    _anchor = reading == null
        ? null
        : TimeAnchor(
            serverTime: catalog.issuedAt,
            elapsedMs: reading.elapsedMs,
            bootCount: reading.bootCount,
          );
    return catalog;
  }

  /// Télécharge et vérifie une version ; ne touche pas aux versions actives.
  Future<InstallRecord> _prepare(
    DeviceCredentials device,
    CatalogEntry entry,
    Set<String> keep,
    void Function(int bytes, int downloaded) onBytes,
    bool Function(int bytes) reserve,
  ) async {
    final package = await _api.package(device, entry.publicationId);
    final verified = await verifyPackage(
      trustedKeys: _trustedKeys,
      package: package,
      entry: entry,
      tenantId: device.identity.tenantId,
    );
    final manifest = verified.manifest;
    final dataBytes = verified.dataBytes;
    final search = _searchRecord(package.data, entry);
    onBytes(dataBytes.length, dataBytes.length);

    final files = manifest.requiredFiles;
    keep.addAll(files.map((file) => file.sha256));
    final present = await _offline.presentBlobs(files.map((f) => f.sha256));
    final missing = [
      for (final file in files)
        if (!present.contains(file.sha256)) file,
    ];
    final missingBytes = missing.fold(
      0,
      (total, file) => total + file.sizeBytes,
    );
    if (missingBytes > 0 && !reserve(missingBytes)) {
      throw const _DownloadDeferred();
    }
    for (final file in files) {
      if (present.contains(file.sha256)) onBytes(file.sizeBytes, 0);
    }
    if (missing.isNotEmpty) {
      await _download(device, entry, missing, onBytes);
    }

    return InstallRecord(
      siteId: entry.siteId,
      publicationId: entry.publicationId,
      publicationNumber: entry.publicationNumber,
      manifestHash: entry.manifestHash,
      manifestText: package.manifest,
      signatureKeyId: package.signature.keyId,
      signature: package.signature.signature,
      etareNumber: entry.etareNumber,
      siteName: entry.siteName,
      publishedAt: entry.publishedAt,
      files: [
        for (final file in manifest.files)
          FileRecord(
            path: file.path,
            sha256: file.sha256,
            sizeBytes: file.sizeBytes,
            mediaType: file.mediaType,
            required: file.required,
          ),
      ],
      dataFile: manifest.dataFile,
      dataText: package.data,
      search: search,
    );
  }

  Future<void> _download(
    DeviceCredentials device,
    CatalogEntry entry,
    List<ManifestFile> missing,
    void Function(int bytes, int downloaded) onBytes,
  ) async {
    var urls = await _api.downloadUrls(device, entry.publicationId, [
      for (final file in missing) file.sha256,
    ]);
    for (final file in missing) {
      final url = urls[file.sha256];
      if (url == null) throw const SyncIntegrityException('FILE_UNAVAILABLE');
      List<int> bytes;
      try {
        bytes = await _api.download(url);
      } on ApiException {
        // URL expirée pendant un long transfert : nouvelle autorisation.
        urls = await _api.downloadUrls(device, entry.publicationId, [
          file.sha256,
        ]);
        final renewed = urls[file.sha256];
        if (renewed == null) {
          throw const SyncIntegrityException('FILE_UNAVAILABLE');
        }
        bytes = await _api.download(renewed);
      }
      if (bytes.length != file.sizeBytes || sha256Hex(bytes) != file.sha256) {
        throw const SyncIntegrityException('FILE_HASH_MISMATCH');
      }
      await _offline.storeBlob(file.sha256, Uint8List.fromList(bytes), _now);
      onBytes(file.sizeBytes, file.sizeBytes);
    }
  }

  /// Index de recherche (OPS-03) tiré du fichier de données vérifié.
  SearchRecord _searchRecord(String dataText, CatalogEntry entry) {
    try {
      final payload = asJsonMap(jsonDecode(dataText));
      final publication = payload.requireObject('publication');
      final site = payload.requireObject('data').requireObject('site');
      if (publication.requireString('id') != entry.publicationId ||
          site.requireString('id') != entry.siteId) {
        throw const SyncIntegrityException('DATA_MISMATCH');
      }
      final address = site.optionalObject('address');
      final name = site.requireString('name');
      final etareNumber = site.optionalString('etare_number');
      final label = address?.optionalString('label');
      final city = address?.optionalString('city');
      return SearchRecord(
        name: name,
        etareNumber: etareNumber,
        addressLabel: label,
        city: city,
        searchText: normalizeForSearch(
          [
            name,
            site.optionalString('short_name'),
            etareNumber,
            label,
            city,
            address?.optionalString('postal_code'),
          ].nonNulls.join(' '),
        ),
      );
    } on FormatException {
      throw const SyncIntegrityException('DATA_INVALID');
    }
  }

  Future<void> _sendReceipt(
    DeviceCredentials device, {
    required int generation,
    required String status,
    required String? errorCode,
  }) async {
    try {
      await _api.receipt(
        device,
        generation: generation,
        status: status,
        errorCode: errorCode,
        installed: [
          for (final row in await _offline.installed()) row.publicationId,
        ],
        keysetSequence: await _trust.sequence(),
      );
      await _state.write(
        const SyncStateCompanion(receiptPending: Value(false)),
      );
    } on NetworkException {
      // L'accusé repartira au prochain contact (receipt_pending).
      _logger.info('Accusé non transmis : nouvel essai au prochain contact.');
    }
  }

  Future<void> _fail(String message, {bool revokeAccess = false}) =>
      _state.write(
        SyncStateCompanion(
          status: const Value('failed'),
          lastError: Value(message),
          lastAttemptAt: Value(_now),
          authorizationExpiresAt: revokeAccess
              ? Value(_now)
              : const Value.absent(),
        ),
      );

  static String _partialMessage(
    List<SyncFailure> failures,
    bool interrupted,
    int deferredBytes,
  ) {
    if (interrupted) {
      return 'Réseau interrompu : la synchronisation reprendra au prochain '
          'contact. Les versions déjà installées restent consultables.';
    }
    if (failures.isEmpty && deferredBytes > 0) {
      return 'Mise à jour volumineuse (environ ${formatBytesFr(deferredBytes)}) '
          'reportée : elle se fera en Wi-Fi, ou lancez « Synchroniser ». Les '
          'versions déjà installées restent consultables.';
    }
    final tooNew = [
      for (final failure in failures)
        if (failure.code == _readerTooOld) failure.siteName,
    ];
    if (tooNew.length == failures.length) {
      return 'Mise à jour de l’application requise pour installer la nouvelle '
          'version de : ${tooNew.join(', ')}. La version précédente reste '
          'consultable.';
    }
    final sites = failures.map((failure) => failure.siteName).join(', ');
    return 'Mise à jour impossible pour : $sites. La version précédente reste '
        'consultable.';
  }

  /// Codes remontés dans l'accusé quand l'application est trop ancienne.
  static const _updateRequired = appUpdateRequiredCode;
  static const _readerTooOld = readerTooOldCode;

  static String _integrityMessage(String code) => switch (code) {
    'TRUSTED_KEYS_MISSING' =>
      'Clés de vérification non configurées dans l’application.',
    'CATALOG_REPLAYED' =>
      'Catalogue plus ancien que celui déjà installé : refusé.',
    'CATALOG_USER_MISMATCH' => 'Catalogue émis pour un autre utilisateur.',
    'KEYSET_REPLAYED' || 'KEYSET_CONFLICT' =>
      'Jeu de clés de signature plus ancien que celui de la tablette : refusé.',
    'KEYSET_SIGNATURE_INVALID' =>
      'Jeu de clés de signature non reconnu par l’application : refusé.',
    _ => 'Données reçues invalides ($code) : rien n’a été installé.',
  };
}
