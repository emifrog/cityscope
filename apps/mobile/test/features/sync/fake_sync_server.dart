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
  });

  final String siteId;
  final String publicationId;
  final int number;
  final String siteName;
  final Map<String, Object?> address;

  /// Fichiers requis (plans, PDF) par chemin.
  final Map<String, List<int>> files;

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
    'manifest_version': 1,
    'tenant_id': tenantId,
    'publication_id': publicationId,
    'site_id': siteId,
    'publication_number': number,
    'min_reader_version': '1.0.0',
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
    ],
  });
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

  /// Altérations simulées.
  bool signCatalogWithPublicationKey = false;
  bool tamperManifest = false;
  final Set<String> corruptedFiles = {};

  /// Hors ligne pour les fichiers à partir du n-ième téléchargement.
  int? filesOfflineAfter;
  String catalogUserId = userId;

  final List<String> packageRequests = [];
  final List<String> downloadedFiles = [];
  final List<Map<String, Object?>> receipts = [];
  int clockSkewRefusals = 0;

  void publish(FakePublication publication) {
    catalog[publication.siteId] = publication;
    generation++;
  }

  void withdraw(String siteId) {
    catalog.remove(siteId);
    generation++;
  }

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
        'catalog_version': 1,
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
      return _json(200, {
        'files': [
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
    final hash = options.uri.pathSegments.last;
    final offlineAfter = filesOfflineAfter;
    if (offlineAfter != null && downloadedFiles.length >= offlineAfter) {
      throw DioException.connectionError(
        requestOptions: options,
        reason: 'hors ligne (simulé)',
      );
    }
    for (final publication in catalog.values) {
      for (final bytes in publication.files.values) {
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
