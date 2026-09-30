import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:etare_ops/src/core/storage/secure_store.dart';

/// Stockage sécurisé en mémoire pour les tests.
final class InMemorySecureStore implements SecureStore {
  InMemorySecureStore([Map<String, String>? initial]) : values = {...?initial};

  final Map<String, String> values;

  @override
  Future<String?> read(String key) async => values[key];

  @override
  Future<void> write(String key, String value) async => values[key] = value;

  @override
  Future<void> delete(String key) async => values.remove(key);
}

/// Réponse simulée : statut + corps JSON (ou erreur de connexion).
final class FakeResponse {
  const FakeResponse(this.statusCode, [this.body]) : offline = false;

  const FakeResponse.offline() : statusCode = 0, body = null, offline = true;

  final int statusCode;
  final Object? body;
  final bool offline;
}

/// Adaptateur HTTP factice : enregistre les requêtes et renvoie les réponses
/// produites par [handler].
final class FakeHttpAdapter implements HttpClientAdapter {
  FakeHttpAdapter(this.handler);

  final FutureOr<FakeResponse> Function(RequestOptions options) handler;
  final List<RequestOptions> requests = [];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    final response = await handler(options);
    if (response.offline) {
      throw DioException.connectionError(
        requestOptions: options,
        reason: 'hors ligne (simulé)',
      );
    }
    return ResponseBody.fromString(
      response.body == null ? '' : jsonEncode(response.body),
      response.statusCode,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

/// Crée un [Dio] branché sur un [FakeHttpAdapter].
(Dio, FakeHttpAdapter) fakeDio(
  String baseUrl,
  FutureOr<FakeResponse> Function(RequestOptions options) handler,
) {
  final adapter = FakeHttpAdapter(handler);
  final dio = Dio(BaseOptions(baseUrl: baseUrl))..httpClientAdapter = adapter;
  return (dio, adapter);
}

/// Corps JSON d'une session GoTrue valide.
Map<String, Object?> goTrueSessionJson({
  String accessToken = 'access-1',
  String refreshToken = 'refresh-1',
  int expiresAt = 1790000000,
}) => {
  'access_token': accessToken,
  'token_type': 'bearer',
  'expires_in': 3600,
  'expires_at': expiresAt,
  'refresh_token': refreshToken,
  'user': {
    'id': '11111111-1111-1111-1111-111111111111',
    'email': 'agent@sdis06.test',
  },
};

/// Corps JSON de `GET /me` conforme au contrat.
Map<String, Object?> meJson() => {
  'user': {
    'id': '11111111-1111-1111-1111-111111111111',
    'email': 'agent@sdis06.test',
    'display_name': null,
  },
  'memberships': [
    {
      'tenant_id': '22222222-2222-2222-2222-222222222222',
      'tenant_name': 'SDIS DEMO 06',
      'tenant_slug': 'sdis-demo-06',
      'roles': ['PREVISION_EDITOR'],
    },
    {
      'tenant_id': '33333333-3333-3333-3333-333333333333',
      'tenant_name': 'SDIS DEMO 83',
      'tenant_slug': 'sdis-demo-83',
      'roles': ['OPS_USER', 'READER'],
    },
  ],
};
