import 'dart:convert';

import 'package:etare_ops/src/core/json/json_reader.dart';
import 'package:flutter/foundation.dart';

/// Politique de verrouillage et de session des tablettes, réglée par le SIS et
/// portée par le catalogue signé (SEC-05, ADR-029). La tablette applique celle
/// de sa dernière synchronisation ; avant la première, les valeurs par défaut.
@immutable
final class TerminalPolicy {
  const TerminalPolicy({
    this.idleLockMinutes = 5,
    this.backgroundLockSeconds = 0,
    this.screenshotsAllowed = false,
    this.maxDaysWithoutLogin = 30,
    this.offlineAuthorizationDays = 7,
  });

  factory TerminalPolicy.fromJson(JsonMap json) {
    int bounded(String key) {
      final value = json.requireInt(key);
      final (min, max) = _bounds[key]!;
      if (value < min || value > max) {
        throw FormatException('« $key » hors des bornes');
      }
      return value;
    }

    return TerminalPolicy(
      idleLockMinutes: bounded('idle_lock_minutes'),
      backgroundLockSeconds: bounded('background_lock_seconds'),
      screenshotsAllowed: json.requireBool('screenshots_allowed'),
      maxDaysWithoutLogin: bounded('max_days_without_login'),
      offlineAuthorizationDays: bounded('offline_authorization_days'),
    );
  }

  /// Valeurs d'un SIS qui n'a rien réglé (comme le serveur).
  static const defaults = TerminalPolicy();

  /// Bornes du serveur (TERMINAL_POLICY_BOUNDS) : jamais une tablette ouverte
  /// pour de bon.
  static const _bounds = {
    'idle_lock_minutes': (1, 60),
    'background_lock_seconds': (0, 600),
    'max_days_without_login': (1, 90),
    'offline_authorization_days': (1, 14),
  };

  /// Politique conservée dans la base ; illisible ou absente : par défaut.
  static TerminalPolicy fromStored(String? text) {
    if (text == null) return defaults;
    try {
      return TerminalPolicy.fromJson(asJsonMap(jsonDecode(text)));
    } on FormatException {
      return defaults;
    }
  }

  final int idleLockMinutes;
  final int backgroundLockSeconds;
  final bool screenshotsAllowed;
  final int maxDaysWithoutLogin;
  final int offlineAuthorizationDays;

  Duration get idleLock => Duration(minutes: idleLockMinutes);
  Duration get backgroundLock => Duration(seconds: backgroundLockSeconds);
  Duration get maxWithoutLogin => Duration(days: maxDaysWithoutLogin);

  Map<String, Object> toJson() => {
    'idle_lock_minutes': idleLockMinutes,
    'background_lock_seconds': backgroundLockSeconds,
    'screenshots_allowed': screenshotsAllowed,
    'max_days_without_login': maxDaysWithoutLogin,
    'offline_authorization_days': offlineAuthorizationDays,
  };

  String encode() => jsonEncode(toJson());

  @override
  bool operator ==(Object other) =>
      other is TerminalPolicy &&
      other.idleLockMinutes == idleLockMinutes &&
      other.backgroundLockSeconds == backgroundLockSeconds &&
      other.screenshotsAllowed == screenshotsAllowed &&
      other.maxDaysWithoutLogin == maxDaysWithoutLogin &&
      other.offlineAuthorizationDays == offlineAuthorizationDays;

  @override
  int get hashCode => Object.hash(
    idleLockMinutes,
    backgroundLockSeconds,
    screenshotsAllowed,
    maxDaysWithoutLogin,
    offlineAuthorizationDays,
  );
}
