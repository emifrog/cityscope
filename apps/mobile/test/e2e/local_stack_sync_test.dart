// Test de bout en bout OPTIONNEL contre la pile locale (API Next.js + Supabase
// + worker) : enrôlement réel, catalogue et manifestes signés par le serveur
// TypeScript, vérifiés par le client Dart, fichiers téléchargés et installés.
//
// Ignoré sauf si ETARE_E2E_API est défini. Exemple (pile locale démarrée,
// `pnpm setup:local`, `pnpm dev`, un terminal déclaré dans l'administration) :
//
//   ETARE_E2E_API=http://127.0.0.1:3000/api/v1 \
//   ETARE_E2E_AUTH=http://127.0.0.1:54321/auth/v1 \
//   ETARE_E2E_PUBLISHABLE_KEY=sb_publishable_... \
//   ETARE_E2E_TRUSTED_KEYS='publication:...;catalog:...' \
//   ETARE_E2E_CODE=ABCD-EFGH-JKLM \
//   flutter test test/e2e
//
// Compte de démonstration local uniquement (ops06, mot de passe du seed).
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:drift/native.dart';
import 'package:etare_ops/src/core/security/trusted_keys.dart';
import 'package:etare_ops/src/data/local/app_database.dart';
import 'package:etare_ops/src/features/sync/application/enrollment_service.dart';
import 'package:etare_ops/src/features/sync/application/sync_service.dart';
import 'package:etare_ops/src/features/sync/data/device_identity_store.dart';
import 'package:etare_ops/src/features/sync/data/sync_api.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/fakes.dart';

final _env = Platform.environment;
String _require(String name) =>
    _env[name] ?? (throw StateError('$name manquant pour le test e2e'));

void main() {
  final enabled = _env['ETARE_E2E_API'] != null;

  test(
    'enrôlement et synchronisation réels contre la pile locale',
    () async {
      final api = _require('ETARE_E2E_API');
      for (final url in [api, _require('ETARE_E2E_AUTH')]) {
        final host = Uri.parse(url).host;
        if (host != '127.0.0.1' && host != 'localhost' && host != '10.0.2.2') {
          fail('Le test e2e ne vise que la pile locale (hôte : $host).');
        }
      }
      final auth = Dio(BaseOptions(baseUrl: _require('ETARE_E2E_AUTH')));
      final session = await auth.post<Map<String, Object?>>(
        '/token?grant_type=password',
        data: {
          'email': 'ops06@demo.etare.test',
          'password': 'Etare-Demo-2026!',
        },
        options: Options(
          headers: {'apikey': _require('ETARE_E2E_PUBLISHABLE_KEY')},
        ),
      );
      final token = session.data!['access_token']! as String;
      final userId =
          (session.data!['user']! as Map<String, Object?>)['id']! as String;

      final apiDio = Dio(
        BaseOptions(baseUrl: api, headers: {'Authorization': 'Bearer $token'}),
      );
      final syncApi = SyncApi(api: apiDio, files: Dio());
      final database = AppDatabase(NativeDatabase.memory());
      addTearDown(database.close);
      final identities = DeviceIdentityStore(InMemorySecureStore());

      final identity =
          await EnrollmentService(api: syncApi, identities: identities).enroll(
            tenantId: '06000000-0000-4000-8000-000000000000',
            code: _require('ETARE_E2E_CODE'),
          );
      expect(identity.tenantName, 'SDIS DEMO 06');

      final report = await SyncService(
        api: syncApi,
        offline: database.offlineDao,
        reports: database.reportsDao,
        state: database.syncStateDao,
        identities: identities,
        trustedKeys: TrustedKeys.parse(_require('ETARE_E2E_TRUSTED_KEYS')),
      ).run(userId: userId) as SyncCompleted;

      expect(report.failures, isEmpty);
      expect(report.complete, isTrue);
      final installed = await database.offlineDao.installed();
      expect(installed, isNotEmpty);
      for (final row in installed) {
        expect(await database.offlineDao.dataText(row.siteId), isNotNull);
      }
      // ignore: avoid_print
      print(
        'e2e : ${installed.length} site(s) installé(s), '
        '${report.downloadedBytes} octets téléchargés.',
      );
    },
    skip: enabled ? false : 'ETARE_E2E_API non défini (pile locale requise)',
    timeout: const Timeout(Duration(minutes: 2)),
  );
}
