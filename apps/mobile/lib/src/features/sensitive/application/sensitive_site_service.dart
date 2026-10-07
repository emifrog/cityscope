import 'dart:convert';
import 'dart:math';

import 'package:etare_ops/src/core/platform/platform_services.dart';
import 'package:etare_ops/src/core/security/local_code.dart';
import 'package:etare_ops/src/core/storage/storage_guard.dart';
import 'package:etare_ops/src/data/local/app_database.dart';
import 'package:etare_ops/src/data/local/daos/sensitive_dao.dart';
import 'package:etare_ops/src/features/ops/domain/published_site.dart';
import 'package:etare_ops/src/features/reports/application/report_providers.dart'
    show newClientReportId;
import 'package:etare_ops/src/features/sync/application/package_verification.dart';
import 'package:etare_ops/src/features/sync/application/trust_store.dart';
import 'package:etare_ops/src/features/sync/data/device_identity_store.dart';
import 'package:etare_ops/src/features/sync/data/device_keys.dart';
import 'package:etare_ops/src/features/sync/data/ed25519_keys.dart';
import 'package:etare_ops/src/features/sync/data/sync_api.dart';
import 'package:etare_ops/src/features/sync/domain/package_models.dart';
import 'package:flutter/foundation.dart';

/// Un site sensible ouvert reste consultable 24 heures sur la tablette (ADR-025).
const onDemandAccess = Duration(hours: 24);

/// Site sensible déverrouillé par le code : en mémoire seulement, le temps
/// de la consultation (oublié au verrouillage de l'application).
@immutable
final class UnlockedSite {
  const UnlockedSite({
    required this.siteId,
    required this.publicationId,
    required this.key,
    required this.site,
    required this.expiresAt,
  });

  final String siteId;
  final String publicationId;

  /// Clé du site : déchiffre ses fichiers à la demande.
  final Uint8List key;
  final PublishedSite site;
  final DateTime expiresAt;
}

/// Code erroné à l'ouverture d'un site sensible.
final class SensitiveCodeRejected implements Exception {
  const SensitiveCodeRejected(this.remaining);

  final int remaining;
}

/// Trop d'erreurs de code : l'agent est déconnecté.
final class SensitiveCodeLockedOut implements Exception {
  const SensitiveCodeLockedOut();
}

/// Site non proposé, non ouvert, expiré ou ouvert par un autre agent.
final class SensitiveSiteUnavailable implements Exception {
  const SensitiveSiteUnavailable(this.message);

  final String message;
}

/// Sites sensibles « restreints » (PER-02, ADR-025) : jamais installés en
/// masse ; ouverts un à un avec le réseau et le code de l'agent, vérifiés
/// comme une synchronisation, puis chiffrés par une clé propre au site,
/// elle-même chiffrée par la clé du code. Consultables 24 h, rouverts avec le
/// code à chaque fois ; chaque consultation est remontée au journal.
class SensitiveSiteService {
  SensitiveSiteService({
    required this._api,
    required this._dao,
    required this._identities,
    required this._trust,
    required this._codes,
    this._clock = DateTime.now,
    Random? random,
    DeviceKeys? keys,
    this._storage,
  }) : _random = random ?? Random.secure(),
       _keys = keys ?? DeviceKeys(const SoftwarePlatformServices());

  /// Clé du terminal (Keystore, ou Ed25519 des premières tablettes).
  final DeviceKeys _keys;

  /// Espace libre contrôlé avant une ouverture (CAP-02).
  final StorageGuard? _storage;

  final SyncApi _api;
  final SensitiveDao _dao;
  final DeviceIdentityStore _identities;

  /// Clés reconnues (jeu de clés retenu à la dernière synchronisation).
  final TrustStore _trust;
  final LocalCodeStore _codes;
  final DateTime Function() _clock;
  final Random _random;

  DateTime get _now => _clock().toUtc();

  Uint8List _bytes(int length) =>
      Uint8List.fromList(List.generate(length, (_) => _random.nextInt(256)));

  Future<Uint8List> _checkCode(String userId, String code) async =>
      switch (await _codes.verify(userId, code)) {
        LocalCodeAccepted(:final wrapKey) => wrapKey,
        LocalCodeRejected(:final remaining) => throw SensitiveCodeRejected(
          remaining,
        ),
        LocalCodeLockedOut() => throw const SensitiveCodeLockedOut(),
      };

  Future<DeviceCredentials> _device() async {
    final identity = await _identities.read();
    if (identity == null) {
      throw const SensitiveSiteUnavailable('Tablette non enrôlée.');
    }
    return _keys.credentials(identity);
  }

  /// Valable : ouvert par cet agent, ni expiré ni « dans le futur » (horloge
  /// reculée après l'ouverture).
  bool _valid(SensitiveSiteRow row, String userId) =>
      row.userId == userId &&
      !_now.isBefore(row.openedAt) &&
      _now.isBefore(row.expiresAt);

  /// Ouvre un site proposé (réseau requis) : code, paquet vérifié, fichiers
  /// obligatoires vérifiés par empreinte, puis stockage chiffré.
  Future<UnlockedSite> open({
    required String userId,
    required String siteId,
    required String code,
  }) async {
    final wrapKey = await _checkCode(userId, code);
    final offered = await _dao.offered(siteId);
    if (offered == null) {
      throw const SensitiveSiteUnavailable(
        'Ce site n’est plus proposé à la demande : synchronisez la tablette.',
      );
    }
    final device = await _device();
    final entry = CatalogEntry(
      siteId: offered.siteId,
      publicationId: offered.publicationId,
      publicationNumber: offered.publicationNumber,
      manifestHash: offered.manifestHash,
      publishedAt: offered.publishedAt,
      sizeBytes: offered.sizeBytes,
      etareNumber: offered.etareNumber,
      siteName: offered.siteName,
    );
    final package = await _api.package(device, entry.publicationId);
    final verified = await verifyPackage(
      trustedKeys: await _trust.current(),
      package: package,
      entry: entry,
      tenantId: device.identity.tenantId,
    );

    final siteKey = _bytes(32);
    final files = verified.manifest.requiredFiles;
    // Scellés entiers : la place se vérifie avant le premier octet (CAP-02).
    await _storage?.ensure(
      files.fold(0, (total, file) => total + file.sizeBytes),
    );
    final sealed = <SealedFile>[];
    if (files.isNotEmpty) {
      final urls = await _api.downloadUrls(device, entry.publicationId, [
        for (final file in files) file.sha256,
      ]);
      for (final file in files) {
        final url = urls[file.sha256];
        if (url == null) throw const SyncIntegrityException('FILE_UNAVAILABLE');
        final bytes = await _api.download(url);
        if (bytes.length != file.sizeBytes || sha256Hex(bytes) != file.sha256) {
          throw const SyncIntegrityException('FILE_HASH_MISMATCH');
        }
        sealed.add(
          SealedFile(
            sha256: file.sha256,
            path: file.path,
            mediaType: file.mediaType,
            cipher: await SealedBox.seal(siteKey, bytes),
          ),
        );
      }
    }

    final now = _now;
    final limit = now.add(onDemandAccess);
    final granted = package.accessExpiresAt;
    final expiresAt = granted != null && granted.isBefore(limit)
        ? granted
        : limit;
    await _dao.saveOpened(
      SensitiveSitesCompanion.insert(
        siteId: entry.siteId,
        publicationId: entry.publicationId,
        publicationNumber: entry.publicationNumber,
        userId: userId,
        siteName: entry.siteName,
        openedAt: now,
        expiresAt: expiresAt,
        wrappedKey: await SealedBox.seal(wrapKey, siteKey),
        dataCipher: await SealedBox.seal(siteKey, verified.dataBytes),
      ),
      sealed,
    );
    return _consulted(
      siteId: entry.siteId,
      publicationId: entry.publicationId,
      userId: userId,
      key: siteKey,
      dataText: utf8.decode(verified.dataBytes),
      expiresAt: expiresAt,
    );
  }

  /// Rouvre un site déjà ouvert, sans réseau : le code est demandé à chaque fois.
  Future<UnlockedSite> unlock({
    required String userId,
    required String siteId,
    required String code,
  }) async {
    final wrapKey = await _checkCode(userId, code);
    final row = await _dao.opened(siteId);
    if (row == null || !_valid(row, userId)) {
      if (row != null) await _dao.removeSite(siteId);
      throw const SensitiveSiteUnavailable(
        'Consultation expirée : ouvrez de nouveau ce site (réseau requis).',
      );
    }
    final siteKey = await SealedBox.open(wrapKey, row.wrappedKey);
    final data = await SealedBox.open(siteKey, row.dataCipher);
    return _consulted(
      siteId: row.siteId,
      publicationId: row.publicationId,
      userId: userId,
      key: siteKey,
      dataText: utf8.decode(data),
      expiresAt: row.expiresAt,
    );
  }

  /// Chaque consultation est remontée au journal au contact suivant.
  Future<UnlockedSite> _consulted({
    required String siteId,
    required String publicationId,
    required String userId,
    required Uint8List key,
    required String dataText,
    required DateTime expiresAt,
  }) async {
    await _dao.queueEvent(
      AccessEventOutboxCompanion.insert(
        clientEventId: newClientReportId(_random),
        userId: userId,
        siteId: siteId,
        publicationId: publicationId,
        occurredAt: _now,
      ),
    );
    return UnlockedSite(
      siteId: siteId,
      publicationId: publicationId,
      key: key,
      site: PublishedSite.fromJsonText(dataText).withInstalledDocumentsOnly(),
      expiresAt: expiresAt,
    );
  }

  /// Fichier d'un site déverrouillé (plan, PDF, photo), déchiffré en mémoire.
  Future<Uint8List?> file(UnlockedSite site, String sha256) async {
    final row = await _dao.file(site.siteId, sha256);
    return row == null ? null : SealedBox.open(site.key, row.cipher);
  }

  /// Empreinte du PDF ETARE d'un site ouvert.
  Future<String?> etarePdf(String siteId) async =>
      (await _dao.files(siteId))
          .where((file) => file.path == 'etare.pdf')
          .firstOrNull
          ?.sha256;

  /// Efface les sites dont la consultation de 24 h est terminée.
  Future<int> purgeExpired() => _dao.purgeExpired(_now);

  /// Remonte les consultations de [userId] (une fois chacune) ; renvoie leur nombre.
  Future<int> flushEvents(String userId) async {
    final events = await _dao.dueEvents(userId);
    if (events.isEmpty) return 0;
    final device = await _device();
    await _api.submitAccessEvents(device, [
      for (final event in events)
        {
          'client_event_id': event.clientEventId,
          'site_id': event.siteId,
          'publication_id': event.publicationId,
          'action': 'view',
          'occurred_at': event.occurredAt.toUtc().toIso8601String(),
        },
    ]);
    await _dao.sentEvents([for (final event in events) event.clientEventId]);
    return events.length;
  }
}
