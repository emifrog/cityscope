import 'dart:convert';

import 'package:etare_ops/src/core/security/trusted_keys.dart';
import 'package:flutter/foundation.dart';

/// Environnement d'exécution, fourni par `--dart-define=ENV=...`.
enum AppEnvironment {
  dev,
  staging,
  prod;

  /// Hors `dev`, les URL doivent être en HTTPS.
  bool get requiresHttps => this != AppEnvironment.dev;
}

/// Problème de configuration détecté au démarrage (message en français,
/// affiché sur l'écran d'erreur de configuration).
@immutable
final class ConfigIssue {
  const ConfigIssue(this.key, this.message);

  /// Nom du `--dart-define` concerné.
  final String key;

  /// Explication lisible par un développeur / administrateur.
  final String message;

  @override
  String toString() => '$key : $message';
}

/// Résultat du chargement de la configuration.
sealed class ConfigLoadResult {
  const ConfigLoadResult();
}

final class ConfigLoaded extends ConfigLoadResult {
  const ConfigLoaded(this.config);

  final AppConfig config;
}

final class ConfigRejected extends ConfigLoadResult {
  const ConfigRejected(this.issues);

  final List<ConfigIssue> issues;
}

/// Configuration immuable de l'application, construite à partir des
/// `--dart-define` et validée au démarrage.
@immutable
final class AppConfig {
  const AppConfig({
    required this.environment,
    required this.apiBaseUrl,
    required this.authUrl,
    required this.authPublishableKey,
    this.trustedKeys = TrustedKeys.empty,
  });

  static const envKey = 'ENV';
  static const apiBaseUrlKey = 'API_BASE_URL';
  static const authUrlKey = 'AUTH_URL';
  static const authPublishableKeyKey = 'AUTH_PUBLISHABLE_KEY';
  static const trustedSigningKeysKey = 'TRUSTED_SIGNING_KEYS';

  /// Valeurs par défaut pensées pour l'émulateur Android (10.0.2.2 = hôte).
  static const defaultApiBaseUrl = 'http://10.0.2.2:3000/api/v1';
  static const defaultAuthUrl = 'http://10.0.2.2:54321/auth/v1';

  final AppEnvironment environment;

  /// URL de base de l'API produit, sans `/` final (ex. `.../api/v1`).
  final String apiBaseUrl;

  /// URL de base de Supabase Auth (GoTrue), sans `/` final (ex. `.../auth/v1`).
  final String authUrl;

  /// Clé *publishable* Supabase : publique par conception (équivalent de
  /// l'ancienne clé `anon`), mais jamais journalisée pour autant.
  final String authPublishableKey;

  /// Clés publiques serveur approuvées pour les paquets hors ligne (ADR-015).
  /// Vide en développement si non fournie : la synchronisation est alors
  /// indisponible, jamais faite sans vérification.
  final TrustedKeys trustedKeys;

  /// Lit les `--dart-define` compilés dans l'application puis les valide.
  static ConfigLoadResult load() => parse(readDartDefines());

  /// Seules les clés effectivement définies sont renvoyées, ce qui permet de
  /// distinguer « absent » de « vide ».
  static Map<String, String> readDartDefines() => {
    if (const bool.hasEnvironment(envKey))
      envKey: const String.fromEnvironment(envKey),
    if (const bool.hasEnvironment(apiBaseUrlKey))
      apiBaseUrlKey: const String.fromEnvironment(apiBaseUrlKey),
    if (const bool.hasEnvironment(authUrlKey))
      authUrlKey: const String.fromEnvironment(authUrlKey),
    if (const bool.hasEnvironment(authPublishableKeyKey))
      authPublishableKeyKey: const String.fromEnvironment(
        authPublishableKeyKey,
      ),
    if (const bool.hasEnvironment(trustedSigningKeysKey))
      trustedSigningKeysKey: const String.fromEnvironment(
        trustedSigningKeysKey,
      ),
  };

  /// Construit et valide la configuration à partir d'un dictionnaire de
  /// valeurs brutes (testable sans `--dart-define`).
  static ConfigLoadResult parse(Map<String, String> defines) {
    final issues = <ConfigIssue>[];

    final rawEnv = defines[envKey]?.trim() ?? '';
    final environment = rawEnv.isEmpty
        ? AppEnvironment.dev
        : AppEnvironment.values.where((e) => e.name == rawEnv).firstOrNull;
    if (environment == null) {
      issues.add(
        ConfigIssue(
          envKey,
          'Valeur « $rawEnv » inconnue : utilisez dev, staging ou prod.',
        ),
      );
    }
    final effectiveEnv = environment ?? AppEnvironment.dev;

    final apiBaseUrl = _parseBaseUrl(
      key: apiBaseUrlKey,
      raw: defines[apiBaseUrlKey],
      fallback: defaultApiBaseUrl,
      environment: effectiveEnv,
      issues: issues,
    );
    final authUrl = _parseBaseUrl(
      key: authUrlKey,
      raw: defines[authUrlKey],
      fallback: defaultAuthUrl,
      environment: effectiveEnv,
      issues: issues,
    );

    final publishableKey = defines[authPublishableKeyKey]?.trim() ?? '';
    if (publishableKey.isEmpty) {
      issues.add(
        const ConfigIssue(
          authPublishableKeyKey,
          'Clé publique Supabase manquante : relancez avec '
          '--dart-define=AUTH_PUBLISHABLE_KEY=<clé publishable>.',
        ),
      );
    } else if (_looksLikeSecretKey(publishableKey)) {
      issues.add(
        const ConfigIssue(
          authPublishableKeyKey,
          'Clé secrète détectée (sb_secret_… ou service_role) : seule la clé '
          'publishable peut être embarquée dans l’application.',
        ),
      );
    }

    var trustedKeys = TrustedKeys.empty;
    try {
      trustedKeys = TrustedKeys.parse(defines[trustedSigningKeysKey] ?? '');
    } on FormatException catch (error) {
      issues.add(ConfigIssue(trustedSigningKeysKey, error.message));
    }
    final complete =
        trustedKeys.has(KeyPurpose.publication) &&
        trustedKeys.has(KeyPurpose.catalog);
    if (effectiveEnv != AppEnvironment.dev && !complete) {
      issues.add(
        ConfigIssue(
          trustedSigningKeysKey,
          'Clés publiques de publication et de catalogue obligatoires en '
          'environnement ${effectiveEnv.name}.',
        ),
      );
    }

    if (issues.isNotEmpty || apiBaseUrl == null || authUrl == null) {
      return ConfigRejected(List.unmodifiable(issues));
    }
    return ConfigLoaded(
      AppConfig(
        environment: effectiveEnv,
        apiBaseUrl: apiBaseUrl,
        authUrl: authUrl,
        authPublishableKey: publishableKey,
        trustedKeys: trustedKeys,
      ),
    );
  }

  static String? _parseBaseUrl({
    required String key,
    required String? raw,
    required String fallback,
    required AppEnvironment environment,
    required List<ConfigIssue> issues,
  }) {
    final trimmed = raw?.trim() ?? '';
    final value = trimmed.isEmpty ? fallback : trimmed;
    final uri = Uri.tryParse(value);
    final isHttp =
        uri != null && (uri.scheme == 'http' || uri.scheme == 'https');
    if (!isHttp || uri.host.isEmpty || uri.hasQuery || uri.hasFragment) {
      issues.add(
        ConfigIssue(key, 'URL absolue http(s) attendue (valeur : « $value »).'),
      );
      return null;
    }
    if (environment.requiresHttps && uri.scheme != 'https') {
      issues.add(
        ConfigIssue(
          key,
          'HTTPS obligatoire en environnement ${environment.name} '
          '(valeur : « $value »).',
        ),
      );
      return null;
    }
    var normalized = value;
    while (normalized.endsWith('/')) {
      normalized = normalized.substring(0, normalized.length - 1);
    }
    return normalized;
  }

  /// Refuse les clés qui donneraient un accès privilégié si elles étaient
  /// extraites de l'APK : nouvelles clés secrètes Supabase et anciens JWT
  /// `service_role`.
  static bool _looksLikeSecretKey(String key) {
    if (key.startsWith('sb_secret_')) return true;
    final parts = key.split('.');
    if (parts.length != 3) return false;
    try {
      final payload = utf8.decode(
        base64Url.decode(base64Url.normalize(parts[1])),
      );
      final claims = jsonDecode(payload);
      return claims is Map<String, Object?> && claims['role'] == 'service_role';
    } on FormatException {
      return false;
    }
  }

  @override
  String toString() =>
      'AppConfig(env: ${environment.name}, api: $apiBaseUrl, auth: $authUrl, '
      'publishableKey: <masquée>)';
}
