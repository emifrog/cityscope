import 'package:dio/dio.dart';
import 'package:etare_ops/src/core/network/auth_interceptor.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../support/fakes.dart';

void main() {
  group('AuthInterceptor', () {
    late String? accessToken;
    late String? tenantId;
    late int refreshCalls;
    late String? Function() onRefresh;

    setUp(() {
      accessToken = 'access-1';
      tenantId = null;
      refreshCalls = 0;
      onRefresh = () => accessToken = 'access-2';
    });

    (Dio, FakeHttpAdapter) buildDio(
      FakeResponse Function(RequestOptions request) handler,
    ) {
      final (dio, adapter) = fakeDio('http://api.test/api/v1', handler);
      dio.interceptors.add(
        AuthInterceptor(
          readAccessToken: () async => accessToken,
          refreshAccessToken: () async {
            refreshCalls++;
            return onRefresh();
          },
          readTenantId: () => tenantId,
          retryClient: dio,
        ),
      );
      return (dio, adapter);
    }

    test('ajoute Authorization et X-Tenant-Id', () async {
      tenantId = 'tenant-a';
      final (dio, adapter) = buildDio((_) => const FakeResponse(200, {}));

      await dio.get<Object?>('/me');

      final headers = adapter.requests.single.headers;
      expect(headers['Authorization'], 'Bearer access-1');
      expect(headers['X-Tenant-Id'], 'tenant-a');
    });

    test('n’ajoute pas X-Tenant-Id sans SIS actif', () async {
      final (dio, adapter) = buildDio((_) => const FakeResponse(200, {}));

      await dio.get<Object?>('/me');

      expect(
        adapter.requests.single.headers.containsKey('X-Tenant-Id'),
        isFalse,
      );
    });

    test('respecte un X-Tenant-Id fixé explicitement par la requête', () async {
      tenantId = 'tenant-a';
      final (dio, adapter) = buildDio((_) => const FakeResponse(200, {}));

      await dio.get<Object?>(
        '/sites',
        options: Options(headers: {'X-Tenant-Id': 'tenant-b'}),
      );

      expect(adapter.requests.single.headers['X-Tenant-Id'], 'tenant-b');
    });

    test('sur 401 : rafraîchit une fois puis rejoue la requête', () async {
      final (dio, adapter) = buildDio(
        (request) => request.headers['Authorization'] == 'Bearer access-2'
            ? const FakeResponse(200, {'ok': true})
            : const FakeResponse(401, {
                'error': {'code': 'UNAUTHENTICATED', 'message': 'expired'},
              }),
      );

      final response = await dio.get<Object?>('/me');

      expect(response.statusCode, 200);
      expect(response.data, {'ok': true});
      expect(refreshCalls, 1);
      expect(adapter.requests, hasLength(2));
      expect(adapter.requests.last.headers['Authorization'], 'Bearer access-2');
    });

    test('un second 401 est propagé sans boucle', () async {
      final (dio, adapter) = buildDio(
        (_) => const FakeResponse(401, {
          'error': {'code': 'UNAUTHENTICATED', 'message': 'nope'},
        }),
      );

      await expectLater(
        dio.get<Object?>('/me'),
        throwsA(
          isA<DioException>().having(
            (e) => e.response?.statusCode,
            'status',
            401,
          ),
        ),
      );
      expect(refreshCalls, 1);
      expect(adapter.requests, hasLength(2));
    });

    test(
      'session non renouvelable : l’erreur 401 d’origine est propagée',
      () async {
        onRefresh = () => null;
        final (dio, adapter) = buildDio(
          (_) => const FakeResponse(401, {
            'error': {'code': 'UNAUTHENTICATED', 'message': 'expired'},
          }),
        );

        await expectLater(
          dio.get<Object?>('/me'),
          throwsA(isA<DioException>()),
        );
        expect(refreshCalls, 1);
        expect(adapter.requests, hasLength(1));
      },
    );
  });
}
