import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';
import 'package:dio/dio.dart';
import 'package:etare_ops/src/core/security/trusted_keys.dart';
import 'package:etare_ops/src/features/sync/data/ed25519_keys.dart';
import 'package:etare_ops/src/features/sync/domain/signed_content.dart';

const tenantId = '06000000-0000-4000-8000-000000000000';
const deviceId = '06000010-0000-4000-8000-000000000001';
const userId = '00000000-0000-4000-b000-000000000004';
const apiBase = 'https://api.test/api/v1';

/// Version publiée d'un site, telle que le serveur la distribue.
final class FakePublication {
  FakePublication({
    required this.siteId,
    required this.publicationId,
    required this.number,
    required this.siteName,
    required this.files,
    this.address = const {'label': '1 rue des Tests', 'city': 'Nice'},
    this.optionalFiles = const {},
    this.manifestVersion = 1,
    this.minReaderVersion = '1.0.0',
  });

  final String siteId;
  final String publicationId;
  final int number;
  final String siteName;
  final Map<String, Object?> address;

  /// Fichiers requis (plans, PDF) par chemin.
  final Map<String, List<int>> files;

  /// Documents « à la demande » (non requis), par chemin (DOC-02).
  final Map<String, List<int>> optionalFiles;

  /// Format et version de lecteur exigés (SYN-02).
  final int manifestVersion;
  final String minReaderVersion;

  late final String data = jsonEncode({
    'publication': {'id': publicationId, 'publication_number': number},
    'data': {
      'site': {
        'id': siteId,
        'name': siteName,
        'etare_number': '06-${number.toString().padLeft(4, '0')}',
        'address': address,
      },
    },
  });

  late final String manifest = jsonEncode({
    'manifest_version': manifestVersion,
    'tenant_id': tenantId,
    'publication_id': publicationId,
    'site_id': siteId,
    'publication_number': number,
    'min_reader_version': minReaderVersion,
    'data_file': 'data/site.json',
    'files': [
      {
        'path': 'data/site.json',
        'sha256': sha256OfText(data),
        'size_bytes': utf8.encode(data).length,
        'media_type': 'application/json',
        'required': true,
      },
      for (final MapEntry(:key, :value) in files.entries)
        {
          'path': key,
          'sha256': sha256Hex(value),
          'size_bytes': value.length,
          'media_type': 'image/png',
          'required': true,
        },
      for (final MapEntry(:key, :value) in optionalFiles.entries)
        {
          'path': key,
          'sha256': sha256Hex(value),
          'size_bytes': value.length,
          'media_type': 'application/pdf',
          'required': false,
        },
    ],
  });
}

/// Signalement reçu par le serveur simulé (OPS-04).
final class FakeReport {
  FakeReport({required this.id, required this.body, required this.photos});

  final String id;

  /// Corps reçu à la première réception : un renvoi doit être identique.
  final String body;
  final List<String> photos;
  int confirmations = 0;
  String status = 'new';
  String? decisionComment;
  int? revisionNo;
  int? publicationNumber;
}

/// Serveur de synchronisation simulé : signe catalogues et manifestes avec de
/// vraies clés Ed25519 et vérifie la signature de la tablette sur chaque
/// requête (méthode, chemin, heure, corps), comme l'API.
final class FakeSyncServer {
  FakeSyncServer._(this._publicationKey, this._catalogKey, this.trustedKeys);

  static Future<FakeSyncServer> start() async {
    final algorithm = Ed25519();
    final publicationKey = await algorithm.newKeyPair();
    final catalogKey = await algorithm.newKeyPair();
    return FakeSyncServer._(
      publicationKey,
      catalogKey,
      TrustedKeys([
        TrustedKey(
          purpose: KeyPurpose.publication,
          keyId: 'pub-test',
          publicKey: (await publicationKey.extractPublicKey()).bytes,
        ),
        TrustedKey(
          purpose: KeyPurpose.catalog,
          keyId: 'cat-test',
          publicKey: (await catalogKey.extractPublicKey()).bytes,
        ),
      ]),
    );
  }

  final SimpleKeyPair _publicationKey;
  final SimpleKeyPair _catalogKey;
  final TrustedKeys trustedKeys;

  /// Clé publique de la tablette enrôlée (base64), pour vérifier ses requêtes.
  String? devicePublicKey;
  DateTime serverClock = DateTime.utc(2026, 10, 1, 10);
  int generation = 1;
  final Map<String, FakePublication> catalog = {};
  bool revoked = false;

  /// Version minimale de l'application annoncée (SYN-02) et format du catalogue.
  String? minAppVersion;
  int catalogVersion = 1;

  /// Altérations simulées.
  bool signCatalogWithPublicationKey = false;
  bool tamperManifest = false;
  final Set<String> corruptedFiles = {};

  /// Hors ligne pour les fichiers à partir du n-ième téléchargement.
  int? filesOfflineAfter;
  String catalogUserId = userId;

  /// Tablette sans réseau : aucune réponse de l'API.
  bool apiOffline = false;

  /// Signalements reçus, par identifiant du terminal.
  final Map<String, FakeReport> reports = {};

  /// Le serveur enregistre le prochain signalement mais sa réponse se perd.
  bool loseNextReportAnswer = false;

  /// Code d'erreur opposé aux signalements (ex. VALIDATION_FAILED).
  String? refuseReportsWith;

  /// Objets du stockage déposés par URL signée.
  final Map<String, List<int>> storedObjects = {};
  int duplicateUploads = 0;

  final List<String> packageRequests = [];
  final List<String> downloadedFiles = [];
  final List<Map<String, Object?>> receipts = [];
  int clockSkewRefusals = 0;

  void publish(FakePublication publication) {
    catalog[publication.siteId] = publication;
    generation++;
  }

  void withdraw(String siteId, {String? reason, String kind = 'withdrawn'}) {
    final removed = catalog.remove(siteId);
    if (reason != null && removed != null) {
      withdrawals.add({
        'site_id': siteId,
        'site_name': removed.siteName,
        'kind': kind,
        'at': serverClock.toIso8601String(),
        'reason': reason,
      });
    }
    generation++;
  }

  /// Sites retirés annoncés avec leur motif (MET-04).
  final List<Map<String, Object?>> withdrawals = [];

  FakePublication _byPublicationId(String id) => catalog.values.firstWhere(
    (publication) => publication.publicationId == id,
  );

  Future<String> _sign(SimpleKeyPair key, String context, String text) async {
    final signature = await Ed25519().sign(
      utf8.encode(signedText(context, text)),
      keyPair: key,
    );
    return base64.encode(signature.bytes);
  }

  Future<ResponseBody> handleApi(RequestOptions options) async {
    if (apiOffline) {
      throw DioException.connectionError(
        requestOptions: options,
        reason: 'hors ligne (simulé)',
      );
    }
    final path = options.uri.path;
    final rawBody = options.data is String ? options.data as String : null;
    if (path.endsWith('/sync/enrollment')) {
      final body = jsonDecode(rawBody ?? '{}') as Map<String, Object?>;
      devicePublicKey = body['public_key'] as String?;
      return _json(201, {
        'device_id': deviceId,
        'device_name': 'TABLETTE TEST',
        'tenant_id': tenantId,
        'tenant_name': 'SDIS DEMO 06',
      });
    }

    final refusal = await _checkProof(options, path, rawBody);
    if (refusal != null) return refusal;
    if (revoked) return _error(403, 'DEVICE_REVOKED');

    if (path.endsWith('/sync/catalog')) {
      final text = jsonEncode({
        'catalog_version': catalogVersion,
        'tenant_id': tenantId,
        'tenant_name': 'SDIS DEMO 06',
        'device_id': deviceId,
        'generation': generation,
        'issued_at': serverClock.toIso8601String(),
        'authorization': {
          'subject': catalogUserId,
          'expires_at': serverClock
              .add(const Duration(days: 7))
              .toIso8601String(),
        },
        'min_app_version': minAppVersion,
        'withdrawals': withdrawals,
        'publications': [
          for (final publication in catalog.values)
            {
              'site_id': publication.siteId,
              'publication_id': publication.publicationId,
              'publication_number': publication.number,
              'manifest_hash': sha256OfText(publication.manifest),
              'published_at': serverClock.toIso8601String(),
              'size_bytes': publication.files.values.fold<int>(
                utf8.encode(publication.data).length,
                (total, bytes) => total + bytes.length,
              ),
              'etare_number': null,
              'site_name': publication.siteName,
            },
        ],
      });
      final key = signCatalogWithPublicationKey ? _publicationKey : _catalogKey;
      return _json(200, {
        'catalog': text,
        'signature': {
          'algorithm': 'Ed25519',
          'key_id': signCatalogWithPublicationKey ? 'pub-test' : 'cat-test',
          'signature': await _sign(key, SignatureContexts.catalog, text),
        },
      });
    }

    final package = RegExp(r'/sync/publications/([^/]+)$').firstMatch(path);
    if (package != null && options.method == 'GET') {
      final publication = _byPublicationId(package.group(1)!);
      packageRequests.add(publication.publicationId);
      final manifest = publication.manifest;
      return _json(200, {
        'manifest': tamperManifest
            ? manifest.replaceFirst('"required":true', '"required":false')
            : manifest,
        'signature': {
          'algorithm': 'Ed25519',
          'key_id': 'pub-test',
          'signature': await _sign(
            _publicationKey,
            SignatureContexts.manifest,
            manifest,
          ),
        },
        'data': publication.data,
      });
    }

    final downloads = RegExp(r'/sync/publications/([^/]+)/downloads$')
        .firstMatch(path);
    if (downloads != null) {
      final body = jsonDecode(rawBody!) as Map<String, Object?>;
      final hashes = (body['sha256']! as List<Object?>).cast<String>();
      // Comme l'API : rien pour une version qui n'est plus distribuée.
      final distributed = catalog.values.any(
        (publication) => publication.publicationId == downloads.group(1),
      );
      return _json(200, {
        'files': [
          if (distributed)
            for (final hash in hashes)
              {
                'sha256': hash,
                'url': 'https://storage.test/$hash',
                'expires_at': serverClock
                    .add(const Duration(minutes: 5))
                    .toIso8601String(),
              },
        ],
      });
    }

    if (path.endsWith('/sync/reports') && options.method == 'POST') {
      final refusal = refuseReportsWith;
      if (refusal != null) return _error(400, refusal);
      final body = jsonDecode(rawBody!) as Map<String, Object?>;
      final clientId = body['client_report_id']! as String;
      final existing = reports[clientId];
      if (existing != null && existing.body != rawBody) {
        return _error(409, 'CONFLICT');
      }
      final report =
          existing ??
          FakeReport(
            id: '0600eeee-0000-4000-8000-${(reports.length + 1).toString().padLeft(12, '0')}',
            body: rawBody,
            photos: [
              for (final photo in body['photos']! as List<Object?>)
                (photo! as Map<String, Object?>)['sha256']! as String,
            ],
          );
      reports[clientId] = report;
      if (loseNextReportAnswer) {
        loseNextReportAnswer = false;
        throw DioException.connectionError(
          requestOptions: options,
          reason: 'réponse perdue (simulé)',
        );
      }
      return _json(200, {
        'report_id': report.id,
        'client_report_id': clientId,
        'content_hash': sha256OfText(report.body),
        'received_at': serverClock.toIso8601String(),
        'created': existing == null,
        // Photos encore en attente de contrôle : URL de dépôt renouvelées.
        'uploads': [
          if (report.confirmations == 0)
            for (final hash in report.photos)
              {
                'sha256': hash,
                'upload': {
                  'asset_id': hash.substring(0, 32),
                  'method': 'PUT',
                  'url': 'https://storage.test/upload/${report.id}/$hash',
                  'headers': {'content-type': 'image/png', 'x-upsert': 'false'},
                  'expires_at': serverClock
                      .add(const Duration(hours: 2))
                      .toIso8601String(),
                },
              },
        ],
      });
    }

    final uploaded = RegExp(r'/sync/reports/([^/]+)/uploaded$')
        .firstMatch(path);
    if (uploaded != null) {
      final report = reports.values.firstWhere(
        (r) => r.id == uploaded.group(1),
      );
      report.confirmations++;
      return _json(202, {
        'report_id': report.id,
        'verifications': report.photos.length,
      });
    }

    if (path.endsWith('/sync/reports') && options.method == 'GET') {
      return _json(200, {
        'items': [
          for (final MapEntry(key: clientId, value: report) in reports.entries)
            {
              'report_id': report.id,
              'client_report_id': clientId,
              'status': report.status,
              'decision_comment': report.decisionComment,
              'decided_at': report.decisionComment == null
                  ? null
                  : serverClock.toIso8601String(),
              'received_at': serverClock.toIso8601String(),
              'photos': {
                'pending': 0,
                'clean': report.photos.length,
                'rejected': 0,
              },
              'resolution': report.revisionNo == null
                  ? null
                  : {
                      'revision_no': report.revisionNo,
                      'publication_number': report.publicationNumber,
                    },
            },
        ],
      });
    }

    if (path.endsWith('/sync/receipts')) {
      final body = jsonDecode(rawBody!) as Map<String, Object?>;
      receipts.add(body);
      return _json(200, {
        'received_at': serverClock.toIso8601String(),
        'installed_sites': (body['installed']! as List<Object?>).length,
      });
    }
    return _error(404, 'NOT_FOUND');
  }

  Future<ResponseBody> handleFile(RequestOptions options) async {
    if (options.method == 'PUT') {
      // Dépôt par URL signée : jamais de remplacement (x-upsert: false).
      final key = options.uri.path;
      if (storedObjects.containsKey(key)) {
        duplicateUploads++;
        return ResponseBody.fromString(
          '{"statusCode":"409","error":"Duplicate","code":"KeyAlreadyExists"}',
          400,
          headers: {
            Headers.contentTypeHeader: [Headers.jsonContentType],
          },
        );
      }
      storedObjects[key] = List<int>.from(options.data as List<int>);
      return ResponseBody.fromString('{"Key":"$key"}', 200);
    }
    final hash = options.uri.pathSegments.last;
    final offlineAfter = filesOfflineAfter;
    if (offlineAfter != null && downloadedFiles.length >= offlineAfter) {
      throw DioException.connectionError(
        requestOptions: options,
        reason: 'hors ligne (simulé)',
      );
    }
    for (final publication in catalog.values) {
      for (final bytes in [
        ...publication.files.values,
        ...publication.optionalFiles.values,
      ]) {
        if (sha256Hex(bytes) == hash) {
          downloadedFiles.add(hash);
          // Corruption : un octet modifié, même taille.
          final served = corruptedFiles.contains(hash)
              ? [bytes.first ^ 0xff, ...bytes.skip(1)]
              : bytes;
          return ResponseBody.fromBytes(Uint8List.fromList(served), 200);
        }
      }
    }
    return ResponseBody.fromString('', 404);
  }

  /// La requête doit être signée par la tablette, à 5 min de l'horloge serveur.
  Future<ResponseBody?> _checkProof(
    RequestOptions options,
    String path,
    String? rawBody,
  ) async {
    final key = devicePublicKey;
    final timestamp = int.tryParse('${options.headers['X-Device-Time']}');
    final signature = options.headers['X-Device-Signature'] as String?;
    if (key == null || timestamp == null || signature == null) {
      return _error(401, 'DEVICE_PROOF_INVALID');
    }
    final text = deviceRequestText(
      method: options.method,
      path: options.uri.hasQuery ? '$path?${options.uri.query}' : path,
      timestamp: timestamp,
      bodySha256: rawBody == null ? emptyBodySha256 : sha256OfText(rawBody),
    );
    final valid = await Ed25519().verify(
      utf8.encode(text),
      signature: Signature(
        base64.decode(signature),
        publicKey: SimplePublicKey(
          base64.decode(key),
          type: KeyPairType.ed25519,
        ),
      ),
    );
    if (!valid) return _error(401, 'DEVICE_PROOF_INVALID');
    final skew = serverClock.millisecondsSinceEpoch - timestamp;
    if (skew.abs() > 5 * 60 * 1000) {
      clockSkewRefusals++;
      return _error(401, 'DEVICE_CLOCK_SKEW');
    }
    return null;
  }

  ResponseBody _json(int status, Object body) => ResponseBody.fromString(
    jsonEncode(body),
    status,
    headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
      'date': [HttpDate.format(serverClock)],
    },
  );

  ResponseBody _error(int status, String code) => _json(status, {
    'error': {'code': code, 'message': code, 'trace_id': 'trace'},
  });
}

/// Adaptateur HTTP branché sur une fonction du serveur simulé.
final class ServerAdapter implements HttpClientAdapter {
  ServerAdapter(this._handler);

  final Future<ResponseBody> Function(RequestOptions options) _handler;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) => _handler(options);

  @override
  void close({bool force = false}) {}
}

Dio serverDio(
  String baseUrl,
  Future<ResponseBody> Function(RequestOptions) handler,
) =>
    Dio(BaseOptions(baseUrl: baseUrl))
      ..httpClientAdapter = ServerAdapter(handler);
