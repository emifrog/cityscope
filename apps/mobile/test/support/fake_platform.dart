import 'dart:convert';

import 'package:cryptography/cryptography.dart';
import 'package:etare_ops/src/core/platform/platform_services.dart';
import 'package:flutter/services.dart';

/// Keystore de test : chaque alias porte une clé Ed25519 (la vraie clé
/// P-256 du Keystore n'existe que sur la tablette ; le serveur vérifie la
/// vraie signature ECDSA dans ses propres tests). Le faux serveur vérifie
/// donc ces signatures en Ed25519.
final class FakeHardwareKeys implements HardwareKeys {
  final Map<String, SimpleKeyPair> keys = {};

  /// Le prochain appel lève une erreur du Keystore.
  bool failNext = false;

  void _maybeFail() {
    if (failNext) {
      failNext = false;
      throw PlatformException(code: 'KEYSTORE', message: 'indisponible');
    }
  }

  @override
  Future<String> create(String alias) async {
    _maybeFail();
    final pair = keys[alias] ??= await Ed25519().newKeyPair();
    return base64.encode((await pair.extractPublicKey()).bytes);
  }

  @override
  Future<String?> publicKey(String alias) async {
    final pair = keys[alias];
    if (pair == null) return null;
    return base64.encode((await pair.extractPublicKey()).bytes);
  }

  @override
  Future<String> sign(String alias, String text) async {
    _maybeFail();
    final pair = keys[alias];
    if (pair == null) throw PlatformException(code: 'KEYSTORE', message: alias);
    final signature = await Ed25519().sign(utf8.encode(text), keyPair: pair);
    return base64.encode(signature.bytes);
  }

  @override
  Future<void> delete(String alias) async => keys.remove(alias);

  @override
  Future<KeySecurity?> security(String alias) async =>
      keys.containsKey(alias) ? KeySecurity.tee : null;
}

/// Plateforme de test : Keystore simulé, horloge monotone et espace libre
/// réglables, appels de protection d'écran enregistrés.
final class FakePlatformServices implements PlatformServices {
  FakePlatformServices({this.withHardwareKeys = true});

  final bool withHardwareKeys;
  final FakeHardwareKeys keys = FakeHardwareKeys();

  /// Horloge monotone (null : indisponible).
  MonotonicTime? monotonic = const MonotonicTime(elapsedMs: 1000, bootCount: 3);

  /// Espace libre annoncé (null : inconnu).
  int? freeBytes;

  final List<bool> secureWindow = [];

  void advance(Duration duration) {
    final current = monotonic;
    if (current == null) return;
    monotonic = MonotonicTime(
      elapsedMs: current.elapsedMs + duration.inMilliseconds,
      bootCount: current.bootCount,
    );
  }

  /// La tablette redémarre : l'horloge monotone repart de zéro.
  void reboot() {
    final current = monotonic;
    monotonic = MonotonicTime(
      elapsedMs: 1000,
      bootCount: (current?.bootCount ?? 0) + 1,
    );
  }

  @override
  HardwareKeys? get hardwareKeys => withHardwareKeys ? keys : null;

  @override
  Future<MonotonicTime?> monotonicTime() async => monotonic;

  @override
  Future<int?> availableBytes(String path) async => freeBytes;

  @override
  Future<void> setSecureWindow({required bool secure}) async =>
      secureWindow.add(secure);
}
