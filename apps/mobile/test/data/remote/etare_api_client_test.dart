import 'package:etare_ops/src/core/errors/app_exception.dart';
import 'package:etare_ops/src/data/remote/etare_api_client.dart';
import 'package:etare_ops/src/features/account/data/api_account_repository.dart';
import 'package:etare_ops/src/features/sites/data/api_sites_repository.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../support/fakes.dart';

const _apiUrl = 'http://api.test/api/v1';

Map<String, Object?> siteJson({bool withAddress = true}) => {
  'id': '44444444-4444-4444-4444-444444444444',
  'tenant_id': '22222222-2222-2222-2222-222222222222',
  'name': 'EHPAD Les Oliviers',
  'short_name': null,
  'status': 'active',
  'site_type': 'health',
  'sensitivity': 'normal',
  'etare_number': '06-0428',
  'address': withAddress
      ? {
          'label': '12 avenue des Mimosas, 06000 Nice',
          'city': 'Nice',
          'postal_code': '06000',
        }
      : null,
  'location': withAddress
      ? {
          'type': 'Point',
          'coordinates': [7.26, 43.7],
        }
      : null,
  'updated_at': '2026-09-27T10:00:00Z',
};

void main() {
  group('EtareApiClient', () {
    test('GET /me : profil et rattachements', () async {
      final (dio, adapter) = fakeDio(
        _apiUrl,
        (_) => FakeResponse(200, meJson()),
      );
      final repository = ApiAccountRepository(EtareApiClient(dio));

      final account = await repository.fetchCurrentAccount();

      expect(adapter.requests.single.uri.toString(), '$_apiUrl/me');
      expect(account.id, '11111111-1111-1111-1111-111111111111');
      expect(account.email, 'agent@sdis06.test');
      expect(account.displayName, isNull);
      expect(account.memberships, hasLength(2));
      final first = account.memberships.first;
      expect(first.tenantId, '22222222-2222-2222-2222-222222222222');
      expect(first.tenantName, 'SDIS DEMO 06');
      expect(first.tenantSlug, 'sdis-demo-06');
      expect(first.roles, ['PREVISION_EDITOR']);
    });

    test(
      'GET /sites : pagination, en-tête X-Tenant-Id, champs nullables',
      () async {
        final (dio, adapter) = fakeDio(
          _apiUrl,
          (_) => FakeResponse(200, {
            'items': [siteJson(), siteJson(withAddress: false)],
            'next_cursor': 'opaque-cursor-2',
          }),
        );
        final repository = ApiSitesRepository(EtareApiClient(dio));

        final page = await repository.listSites(
          tenantId: '22222222-2222-2222-2222-222222222222',
          cursor: 'opaque-cursor-1',
        );

        final request = adapter.requests.single;
        expect(request.uri.path, '/api/v1/sites');
        expect(request.uri.queryParameters, {
          'limit': '25',
          'cursor': 'opaque-cursor-1',
        });
        expect(
          request.headers['X-Tenant-Id'],
          '22222222-2222-2222-2222-222222222222',
        );

        expect(page.nextCursor, 'opaque-cursor-2');
        expect(page.hasMore, isTrue);
        final site = page.items.first;
        expect(site.name, 'EHPAD Les Oliviers');
        expect(site.shortName, isNull);
        expect(site.etareNumber, '06-0428');
        expect(site.address?.city, 'Nice');
        expect(site.address?.postalCode, '06000');
        expect(site.location?.longitude, 7.26);
        expect(site.location?.latitude, 43.7);
        expect(site.updatedAt, DateTime.utc(2026, 9, 27, 10));
        expect(page.items.last.address, isNull);
        expect(page.items.last.location, isNull);
      },
    );

    test(
      'GET /sites : pas de paramètre cursor pour la première page',
      () async {
        final (dio, adapter) = fakeDio(
          _apiUrl,
          (_) => const FakeResponse(200, {
            'items': <Object?>[],
            'next_cursor': null,
          }),
        );

        final page = await EtareApiClient(dio).listSites(tenantId: 't');

        expect(adapter.requests.single.uri.queryParameters, {'limit': '25'});
        expect(page.items, isEmpty);
        expect(page.nextCursor, isNull);
      },
    );

    test('enveloppe d’erreur → ApiException typée', () async {
      final (dio, _) = fakeDio(
        _apiUrl,
        (_) => const FakeResponse(422, {
          'error': {
            'code': 'VALIDATION_FAILED',
            'message': 'Paramètre invalide',
            'trace_id': '55555555-5555-5555-5555-555555555555',
            'fields': [
              {'path': 'limit', 'message': 'doit être ≤ 100'},
            ],
          },
        }),
      );

      await expectLater(
        EtareApiClient(dio).listSites(tenantId: 't'),
        throwsA(
          isA<ApiException>()
              .having((e) => e.code, 'code', ApiErrorCode.validationFailed)
              .having((e) => e.statusCode, 'status', 422)
              .having(
                (e) => e.traceId,
                'traceId',
                '55555555-5555-5555-5555-555555555555',
              )
              .having((e) => e.fields.single.path, 'field', 'limit'),
        ),
      );
    });

    test('codes métier : TENANT_REQUIRED, FORBIDDEN, code inconnu', () async {
      Future<ApiException> errorFor(String code, int status) async {
        final (dio, _) = fakeDio(
          _apiUrl,
          (_) => FakeResponse(status, {
            'error': {'code': code, 'message': 'm', 'trace_id': 't'},
          }),
        );
        try {
          await EtareApiClient(dio).getMe();
        } on ApiException catch (e) {
          return e;
        }
        fail('ApiException attendue');
      }

      expect(
        (await errorFor('TENANT_REQUIRED', 400)).code,
        ApiErrorCode.tenantRequired,
      );
      expect((await errorFor('FORBIDDEN', 403)).code, ApiErrorCode.forbidden);
      expect((await errorFor('NOT_FOUND', 404)).code, ApiErrorCode.notFound);
      expect((await errorFor('INTERNAL', 500)).code, ApiErrorCode.internal);
      expect((await errorFor('NEW_CODE', 409)).code, ApiErrorCode.unknown);
    });

    test('corps d’erreur non standard : code déduit du statut HTTP', () async {
      final (dio, _) = fakeDio(_apiUrl, (_) => const FakeResponse(503, 'oops'));

      await expectLater(
        EtareApiClient(dio).getMe(),
        throwsA(
          isA<ApiException>().having(
            (e) => e.code,
            'code',
            ApiErrorCode.internal,
          ),
        ),
      );
    });

    test('réseau indisponible → NetworkException(offline)', () async {
      final (dio, _) = fakeDio(_apiUrl, (_) => const FakeResponse.offline());

      await expectLater(
        EtareApiClient(dio).getMe(),
        throwsA(
          isA<NetworkException>().having(
            (e) => e.failure,
            'failure',
            NetworkFailure.offline,
          ),
        ),
      );
    });

    test('réponse 200 hors contrat → UnexpectedResponseException', () async {
      final (dio, _) = fakeDio(
        _apiUrl,
        (_) => const FakeResponse(200, {
          'user': {'id': 42},
        }),
      );

      await expectLater(
        EtareApiClient(dio).getMe(),
        throwsA(isA<UnexpectedResponseException>()),
      );
    });
  });
}
