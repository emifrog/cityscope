import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:etare_ops/src/core/config/app_info.dart';
import 'package:etare_ops/src/core/errors/app_exception.dart';
import 'package:etare_ops/src/core/json/json_reader.dart';
import 'package:etare_ops/src/core/network/api_error_mapper.dart';
import 'package:etare_ops/src/core/network/auth_interceptor.dart';
import 'package:etare_ops/src/features/sync/data/ed25519_keys.dart';
import 'package:etare_ops/src/features/sync/domain/device_identity.dart';
import 'package:etare_ops/src/features/sync/domain/signed_content.dart';
import 'package:flutter/foundation.dart';

/// Ce terminal et sa clé, chargés pour une synchronisation.
@immutable
final class DeviceCredentials {
  const DeviceCredentials(this.identity, this.key);

  final DeviceIdentity identity;
  final DeviceKey key;
}

/// Réponse d'enrôlement.
@immutable
final class EnrollmentResult {
  const EnrollmentResult({
    required this.deviceId,
    required this.deviceName,
    required this.tenantId,
    required this.tenantName,
  });

  final String deviceId;
  final String deviceName;
  final String tenantId;
  final String tenantName;
}

/// Texte signé reçu tel quel (la signature porte sur ces octets exacts).
@immutable
final class SignedPayload {
  const SignedPayload(this.text, this.signature);

  final String text;
  final SignatureEnvelope signature;
}

/// Paquet d'une publication : manifeste signé et fichier de données.
@immutable
final class PackagePayload {
  const PackagePayload({
    required this.manifest,
    required this.signature,
    required this.data,
  });

  final String manifest;
  final SignatureEnvelope signature;
  final String data;
}

/// Client des points d'accès `/sync/*` (ADR-015). Chaque requête est signée
/// par la clé du terminal sur la méthode, le chemin exact, l'heure et le
/// SHA-256 du corps ; le jeton de l'utilisateur est ajouté par l'intercepteur.
///
/// Lève [ApiException], [NetworkException] ou [UnexpectedResponseException].
final class SyncApi {
  SyncApi({
    required this._api,
    required this._files,
    this._clock = DateTime.now,
  });

  static const deviceIdHeader = 'X-Device-Id';
  static const deviceTimeHeader = 'X-Device-Time';
  static const deviceSignatureHeader = 'X-Device-Signature';
  static const appVersionHeader = 'X-App-Version';
  static const clientPlatformHeader = 'X-Client-Platform';

  final Dio _api;
  final Dio _files;
  final DateTime Function() _clock;

  /// Écart mesuré avec l'horloge du serveur (en-tête `Date`) après un refus
  /// pour horloge décalée.
  Duration _clockOffset = Duration.zero;

  /// Enrôle ce terminal : la preuve est la signature du code par sa clé.
  Future<EnrollmentResult> enroll({
    required String tenantId,
    required String code,
    required DeviceKey key,
    required String platform,
  }) async {
    final publicKey = await key.publicKeyBase64();
    final proof = await key.sign(
      enrollmentText(tenantId: tenantId, code: code, publicKey: publicKey),
    );
    final json = await _call(
      () => _api.post<Object?>(
        '/sync/enrollment',
        data: jsonEncode({
          'code': code,
          'public_key': publicKey,
          'platform': platform,
          'app_version': AppInfo.version,
          'proof': proof,
        }),
        options: Options(
          headers: {
            AuthInterceptor.tenantHeader: tenantId,
            clientPlatformHeader: 'mobile',
          },
          contentType: Headers.jsonContentType,
        ),
      ),
      '/sync/enrollment',
    );
    return EnrollmentResult(
      deviceId: json.requireString('device_id'),
      deviceName: json.requireString('device_name'),
      tenantId: json.requireString('tenant_id'),
      tenantName: json.requireString('tenant_name'),
    );
  }

  Future<SignedPayload> catalog(DeviceCredentials device) async {
    final json = await _signed(device, 'GET', '/sync/catalog');
    return SignedPayload(
      json.requireString('catalog'),
      SignatureEnvelope.fromJson(json.requireObject('signature')),
    );
  }

  Future<PackagePayload> package(
    DeviceCredentials device,
    String publicationId,
  ) async {
    final json = await _signed(
      device,
      'GET',
      '/sync/publications/$publicationId',
    );
    return PackagePayload(
      manifest: json.requireString('manifest'),
      signature: SignatureEnvelope.fromJson(json.requireObject('signature')),
      data: json.requireString('data'),
    );
  }

  /// URL temporaires des fichiers demandés, par empreinte.
  Future<Map<String, Uri>> downloadUrls(
    DeviceCredentials device,
    String publicationId,
    List<String> hashes,
  ) async {
    final urls = <String, Uri>{};
    for (var start = 0; start < hashes.length; start += 500) {
      final chunk = hashes.sublist(
        start,
        start + 500 > hashes.length ? hashes.length : start + 500,
      );
      final json = await _signed(
        device,
        'POST',
        '/sync/publications/$publicationId/downloads',
        body: {'sha256': chunk},
      );
      for (final file in json.requireObjectList('files')) {
        final url = Uri.tryParse(file.requireString('url'));
        if (url != null) urls[file.requireString('sha256')] = url;
      }
    }
    return urls;
  }

  Future<void> receipt(
    DeviceCredentials device, {
    required int generation,
    required String status,
    required String? errorCode,
    required List<String> installed,
  }) async {
    await _signed(
      device,
      'POST',
      '/sync/receipts',
      body: {
        'generation': generation,
        'status': status,
        'error_code': errorCode,
        'installed': installed,
      },
    );
  }

  /// Transmet un signalement (renvoi idempotent : même corps, même accusé).
  Future<JsonMap> submitReport(DeviceCredentials device, JsonMap body) =>
      _signed(device, 'POST', '/sync/reports', body: body);

  /// Photos du signalement envoyées : le serveur planifie leur contrôle.
  Future<void> confirmReportUploads(
    DeviceCredentials device,
    String reportId,
  ) async {
    await _signed(device, 'POST', '/sync/reports/$reportId/uploaded');
  }

  /// Suite donnée aux signalements de l'agent depuis ce terminal.
  Future<List<JsonMap>> reportStatuses(DeviceCredentials device) async =>
      (await _signed(
        device,
        'GET',
        '/sync/reports',
      )).requireObjectList('items');

  /// Dépose un fichier par une URL signée du stockage (sans jeton). Renvoie
  /// faux quand le fichier y était déjà (envoi précédent dont la réponse a été
  /// perdue) : il n'est jamais remplacé.
  Future<bool> upload(
    Uri url,
    Map<String, String> headers,
    Uint8List content,
  ) async {
    try {
      await _files.putUri<Object?>(
        url,
        data: content,
        options: Options(headers: headers, responseType: ResponseType.plain),
      );
      return true;
    } on DioException catch (error) {
      final body = '${error.response?.data ?? ''}';
      if (error.response?.statusCode == 409 ||
          body.contains('KeyAlreadyExists') ||
          body.contains('"statusCode":"409"')) {
        return false;
      }
      throw mapDioException(error);
    }
  }

  /// Télécharge un fichier depuis une URL signée du stockage (sans jeton).
  Future<Uint8List> download(
    Uri url, {
    void Function(int received, int total)? onProgress,
  }) async {
    try {
      final response = await _files.getUri<List<int>>(
        url,
        options: Options(responseType: ResponseType.bytes),
        onReceiveProgress: onProgress,
      );
      final data = response.data;
      if (data == null) throw const UnexpectedResponseException('Fichier vide');
      return data is Uint8List ? data : Uint8List.fromList(data);
    } on DioException catch (error) {
      throw mapDioException(error);
    }
  }

  Future<JsonMap> _signed(
    DeviceCredentials device,
    String method,
    String path, {
    Object? body,
  }) async {
    final raw = body == null ? null : jsonEncode(body);
    Future<Response<Object?>> send() async {
      final url = Uri.parse('${_api.options.baseUrl}$path');
      final timestamp = _clock().add(_clockOffset).millisecondsSinceEpoch;
      final signature = await device.key.sign(
        deviceRequestText(
          method: method,
          path: url.hasQuery ? '${url.path}?${url.query}' : url.path,
          timestamp: timestamp,
          bodySha256: raw == null ? emptyBodySha256 : sha256OfText(raw),
        ),
      );
      return _api.request<Object?>(
        path,
        data: raw,
        options: Options(
          method: method,
          headers: {
            AuthInterceptor.tenantHeader: device.identity.tenantId,
            deviceIdHeader: device.identity.deviceId,
            deviceTimeHeader: '$timestamp',
            deviceSignatureHeader: signature,
            appVersionHeader: AppInfo.version,
            clientPlatformHeader: 'mobile',
          },
          contentType: raw == null ? null : Headers.jsonContentType,
        ),
      );
    }

    try {
      return _json(await send(), path);
    } on DioException catch (error) {
      final failure = mapDioException(error);
      final serverDate = error.response?.headers.value('date');
      if (failure is ApiException &&
          failure.code == ApiErrorCode.deviceClockSkew &&
          serverDate != null) {
        // L'horloge de la tablette est fausse : on se cale sur celle du
        // serveur (en-tête Date), une seule fois.
        try {
          _clockOffset = HttpDate.parse(serverDate).difference(_clock());
        } on HttpException {
          throw failure;
        }
        return _call(send, path);
      }
      throw failure;
    }
  }

  Future<JsonMap> _call(
    Future<Response<Object?>> Function() send,
    String path,
  ) async {
    try {
      return _json(await send(), path);
    } on DioException catch (error) {
      throw mapDioException(error);
    }
  }

  static JsonMap _json(Response<Object?> response, String path) {
    try {
      return asJsonMap(response.data, path);
    } on FormatException catch (error) {
      throw UnexpectedResponseException('$path : ${error.message}');
    }
  }
}
