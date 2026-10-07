import 'dart:convert';

import 'package:etare_ops/src/core/config/app_config.dart';
import 'package:etare_ops/src/core/security/trusted_keys.dart';
import 'package:flutter_test/flutter_test.dart';

AppConfig expectLoaded(ConfigLoadResult result) => switch (result) {
  ConfigLoaded(:final config) => config,
  ConfigRejected(:final issues) => fail('Configuration rejetée : $issues'),
};

List<String> rejectedKeys(ConfigLoadResult result) => switch (result) {
  ConfigRejected(:final issues) => [for (final i in issues) i.key],
  ConfigLoaded() => fail('La configuration aurait dû être rejetée'),
};

/// Clé publique factice (32 octets nuls) : seul le format est contrôlé ici.
const testKey = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
const trustedKeys =
    'root:ed25519-root:$testKey;publication:ed25519-pub:$testKey;'
    'catalog:ed25519-cat:$testKey';

void main() {
  group('clés de signature approuvées (ADR-015)', () {
    test('sont lues avec leur usage', () {
      final config = expectLoaded(
        AppConfig.parse({
          'AUTH_PUBLISHABLE_KEY': 'k',
          'TRUSTED_SIGNING_KEYS': trustedKeys,
        }),
      );
      expect(config.trustedKeys.has(KeyPurpose.publication), isTrue);
      expect(config.trustedKeys.roots.single.keyId, 'ed25519-root');
      expect(
        config.trustedKeys.find('ed25519-pub', KeyPurpose.catalog),
        isNull,
        reason: 'une clé de publication ne vaut pas pour un catalogue',
      );
    });

    test('sont facultatives en dev, obligatoires ailleurs', () {
      expect(
        expectLoaded(AppConfig.parse({'AUTH_PUBLISHABLE_KEY': 'k'}))
            .trustedKeys
            .keys,
        isEmpty,
      );
      expect(
        rejectedKeys(
          AppConfig.parse({
            'ENV': 'staging',
            'API_BASE_URL': 'https://api.example.fr/api/v1',
            'AUTH_URL': 'https://auth.example.fr/auth/v1',
            'AUTH_PUBLISHABLE_KEY': 'k',
            'TRUSTED_SIGNING_KEYS':
                'publication:ed25519-pub:$testKey;catalog:ed25519-cat:$testKey',
          }),
        ),
        ['TRUSTED_SIGNING_KEYS'],
        reason: 'hors dev, la clé racine est obligatoire (SEC-04)',
      );
      // La racine seule suffit : les clés de service viennent du jeu de clés.
      expect(
        expectLoaded(
          AppConfig.parse({
            'ENV': 'staging',
            'API_BASE_URL': 'https://api.example.fr/api/v1',
            'AUTH_URL': 'https://auth.example.fr/auth/v1',
            'AUTH_PUBLISHABLE_KEY': 'k',
            'TRUSTED_SIGNING_KEYS': 'root:ed25519-root:$testKey',
          }),
        ).trustedKeys.has(KeyPurpose.root),
        isTrue,
      );
    });

    test('refusent une entrée malformée', () {
      for (final raw in [
        'publication:ed25519-pub',
        'signature:id:$testKey',
        'catalog:id:AAAA',
        'catalog:id:@@@',
      ]) {
        expect(
          rejectedKeys(
            AppConfig.parse({
              'AUTH_PUBLISHABLE_KEY': 'k',
              'TRUSTED_SIGNING_KEYS': raw,
            }),
          ),
          ['TRUSTED_SIGNING_KEYS'],
          reason: raw,
        );
      }
    });
  });

  group('AppConfig.parse', () {
    test('applique les valeurs par défaut de l’émulateur Android', () {
      final config = expectLoaded(
        AppConfig.parse({'AUTH_PUBLISHABLE_KEY': 'sb_publishable_demo'}),
      );

      expect(config.environment, AppEnvironment.dev);
      expect(config.apiBaseUrl, 'http://10.0.2.2:3000/api/v1');
      expect(config.authUrl, 'http://10.0.2.2:54321/auth/v1');
      expect(config.authPublishableKey, 'sb_publishable_demo');
    });

    test('lit toutes les valeurs et retire les « / » finaux', () {
      final config = expectLoaded(
        AppConfig.parse({
          'ENV': 'staging',
          'API_BASE_URL': 'https://api.staging.example.fr/api/v1/',
          'AUTH_URL': 'https://auth.staging.example.fr/auth/v1//',
          'AUTH_PUBLISHABLE_KEY': '  sb_publishable_xyz  ',
          'TRUSTED_SIGNING_KEYS': trustedKeys,
        }),
      );

      expect(config.environment, AppEnvironment.staging);
      expect(config.apiBaseUrl, 'https://api.staging.example.fr/api/v1');
      expect(config.authUrl, 'https://auth.staging.example.fr/auth/v1');
      expect(config.authPublishableKey, 'sb_publishable_xyz');
      expect(config.trustedKeys.keys, hasLength(3));
    });

    test('rejette une clé publishable absente ou vide', () {
      expect(rejectedKeys(AppConfig.parse({})), ['AUTH_PUBLISHABLE_KEY']);
      expect(rejectedKeys(AppConfig.parse({'AUTH_PUBLISHABLE_KEY': '   '})), [
        'AUTH_PUBLISHABLE_KEY',
      ]);
    });

    test('rejette un environnement inconnu', () {
      expect(
        rejectedKeys(
          AppConfig.parse({'ENV': 'production', 'AUTH_PUBLISHABLE_KEY': 'k'}),
        ),
        ['ENV'],
      );
    });

    test('rejette les URL invalides', () {
      final result = AppConfig.parse({
        'API_BASE_URL': 'pas une url',
        'AUTH_URL': 'ftp://auth.example.fr',
        'AUTH_PUBLISHABLE_KEY': 'k',
      });
      expect(rejectedKeys(result), ['API_BASE_URL', 'AUTH_URL']);
    });

    test('exige HTTPS hors dev (les valeurs par défaut sont refusées)', () {
      final result = AppConfig.parse({
        'ENV': 'prod',
        'AUTH_PUBLISHABLE_KEY': 'k',
        'TRUSTED_SIGNING_KEYS': trustedKeys,
      });
      expect(rejectedKeys(result), ['API_BASE_URL', 'AUTH_URL']);
    });

    test('refuse d’embarquer une clé secrète Supabase', () {
      expect(
        rejectedKeys(
          AppConfig.parse({'AUTH_PUBLISHABLE_KEY': 'sb_secret_abcdef'}),
        ),
        ['AUTH_PUBLISHABLE_KEY'],
      );

      String segment(Map<String, Object?> json) =>
          base64Url.encode(utf8.encode(jsonEncode(json))).replaceAll('=', '');
      final serviceRoleJwt = [
        segment({'alg': 'HS256', 'typ': 'JWT'}),
        segment({'role': 'service_role', 'iss': 'supabase'}),
        'signature',
      ].join('.');
      final anonJwt = [
        segment({'alg': 'HS256', 'typ': 'JWT'}),
        segment({'role': 'anon', 'iss': 'supabase'}),
        'signature',
      ].join('.');

      expect(
        rejectedKeys(AppConfig.parse({'AUTH_PUBLISHABLE_KEY': serviceRoleJwt})),
        ['AUTH_PUBLISHABLE_KEY'],
      );
      expectLoaded(AppConfig.parse({'AUTH_PUBLISHABLE_KEY': anonJwt}));
    });

    test('ne révèle pas la clé dans toString', () {
      final config = expectLoaded(
        AppConfig.parse({'AUTH_PUBLISHABLE_KEY': 'sb_publishable_secretish'}),
      );
      expect(config.toString(), isNot(contains('sb_publishable_secretish')));
    });
  });

  group('construction de release (EXP-04)', () {
    const staging = {
      'ENV': 'staging',
      'API_BASE_URL': 'https://preprod.etare.example/api/v1',
      'AUTH_URL': 'https://preprod.etare.example/auth/v1',
      'AUTH_PUBLISHABLE_KEY': 'sb_publishable_preprod',
      'TRUSTED_SIGNING_KEYS': trustedKeys,
    };

    test('ne vise jamais l’environnement dev', () {
      expect(
        rejectedKeys(
          AppConfig.parse(
            {'AUTH_PUBLISHABLE_KEY': 'k'},
            release: true,
            flavor: 'prod',
          ),
        ),
        ['ENV'],
      );
      // En debug, le développement reste possible sur la variante par défaut.
      expectLoaded(
        AppConfig.parse({'AUTH_PUBLISHABLE_KEY': 'k'}, flavor: 'prod'),
      );
    });

    test('la variante correspond à l’environnement', () {
      expectLoaded(AppConfig.parse(staging, release: true, flavor: 'staging'));
      expect(
        rejectedKeys(AppConfig.parse(staging, release: true, flavor: 'prod')),
        ['ENV'],
      );
      // Sans variante (autre plateforme), seul l'environnement compte.
      expectLoaded(AppConfig.parse(staging, release: true, flavor: null));
    });
  });
}
