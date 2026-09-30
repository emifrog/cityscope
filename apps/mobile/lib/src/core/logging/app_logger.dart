import 'dart:developer' as developer;

import 'package:flutter/foundation.dart';

/// Niveaux alignés sur `package:logging` (valeurs lues par DevTools).
enum LogLevel {
  debug(500),
  info(800),
  warning(900),
  error(1000);

  const LogLevel(this.value);

  final int value;
}

/// Journalisation minimale, locale uniquement (aucun SDK tiers d'analytics
/// ou de crash reporting).
///
/// Règles : ne jamais journaliser de jeton, mot de passe ou clé. Les messages
/// passent malgré tout par [redactSecrets] par défense en profondeur.
final class AppLogger {
  const AppLogger(this.name);

  final String name;

  void debug(String message) => _log(LogLevel.debug, message);

  void info(String message) => _log(LogLevel.info, message);

  void warning(String message, {Object? error}) =>
      _log(LogLevel.warning, message, error: error);

  void error(String message, {Object? error, StackTrace? stackTrace}) =>
      _log(LogLevel.error, message, error: error, stackTrace: stackTrace);

  void _log(
    LogLevel level,
    String message, {
    Object? error,
    StackTrace? stackTrace,
  }) {
    // En release, seuls les avertissements et erreurs sont émis.
    if (!kDebugMode && level.value < LogLevel.warning.value) return;
    developer.log(
      redactSecrets(message),
      name: 'etare.$name',
      level: level.value,
      error: error == null ? null : redactSecrets(error.toString()),
      stackTrace: stackTrace,
    );
  }
}

final _jwtPattern = RegExp(r'eyJ[\w-]+\.[\w-]+\.[\w-]+');
final _bearerPattern = RegExp(r'Bearer\s+\S+', caseSensitive: false);
final _secretFieldPattern = RegExp(
  r'("?(?:access_token|refresh_token|password|apikey|api_key|key)"?\s*[:=]\s*)"?[^",\s}&]+"?',
  caseSensitive: false,
);
final _supabaseKeyPattern = RegExp(r'sb_(?:publishable|secret)_[\w-]+');

/// Masque les éléments ressemblant à des secrets dans une chaîne.
String redactSecrets(String input) => input
    .replaceAll(_jwtPattern, '[jeton masqué]')
    .replaceAll(_bearerPattern, 'Bearer [masqué]')
    .replaceAll(_supabaseKeyPattern, '[clé masquée]')
    .replaceAllMapped(_secretFieldPattern, (m) => '${m.group(1)}[masqué]');
