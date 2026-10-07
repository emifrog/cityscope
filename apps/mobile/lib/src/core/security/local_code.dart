import 'dart:convert';
import 'dart:isolate';
import 'dart:math';

import 'package:crypto/crypto.dart' as crypto;
import 'package:cryptography/cryptography.dart';
import 'package:etare_ops/src/core/json/json_reader.dart';
import 'package:etare_ops/src/core/storage/secure_store.dart';
import 'package:flutter/foundation.dart';

/// Code personnel de l'agent sur la tablette (PER-02, ADR-025) : 6 chiffres,
/// choisis à la connexion. Il déverrouille l'application (démarrage,
/// inactivité et retour selon la politique du SIS, SEC-05) et ouvre les sites
/// sensibles, dont il protège aussi le déchiffrement local.
///
/// Rien du code n'est conservé : seulement un sel, un vérificateur et le
/// nombre d'essais manqués. La clé dérivée (PBKDF2-HMAC-SHA-256) est mêlée à
/// un secret propre à l'installation, gardé dans le stockage sécurisé : la
/// base chiffrée seule ne suffit pas à tester des codes. Limite connue : qui
/// détient à la fois ce secret et la base peut essayer le million de codes
/// possibles ; la durée de 24 h des sites sensibles borne l'exposition.
const localCodeLength = 6;

/// Au-delà, l'agent est déconnecté et se reconnecte en ligne (rien n'est effacé).
const maxLocalCodeAttempts = 5;

bool isValidLocalCode(String code) =>
    code.length == localCodeLength && RegExp(r'^[0-9]+$').hasMatch(code);

/// Clés du stockage sécurisé.
abstract final class LocalCodeKeys {
  /// Sel, vérificateur et essais manqués du code de l'agent connecté.
  static const record = 'etare.local_code.v1';

  /// Secret de l'installation mêlé à la dérivation (32 octets).
  static const pepper = 'etare.local_code.pepper.v1';
}

/// Issue d'une saisie du code.
sealed class LocalCodeCheck {
  const LocalCodeCheck();
}

/// Code juste : [wrapKey] chiffre et déchiffre les clés des sites sensibles.
final class LocalCodeAccepted extends LocalCodeCheck {
  const LocalCodeAccepted(this.wrapKey);

  final Uint8List wrapKey;
}

final class LocalCodeRejected extends LocalCodeCheck {
  const LocalCodeRejected(this.remaining);

  /// Essais restants avant la déconnexion.
  final int remaining;
}

/// Trop d'essais : l'agent doit se reconnecter en ligne.
final class LocalCodeLockedOut extends LocalCodeCheck {
  const LocalCodeLockedOut();
}

@immutable
final class _Record {
  const _Record({
    required this.userId,
    required this.salt,
    required this.verifier,
    required this.iterations,
    required this.failures,
  });

  factory _Record.fromJson(JsonMap json) => _Record(
    userId: json.requireString('user_id'),
    salt: base64.decode(json.requireString('salt')),
    verifier: base64.decode(json.requireString('verifier')),
    iterations: json.requireInt('iterations'),
    failures: json.requireInt('failures'),
  );

  final String userId;
  final Uint8List salt;
  final Uint8List verifier;
  final int iterations;
  final int failures;

  _Record withFailures(int value) => _Record(
    userId: userId,
    salt: salt,
    verifier: verifier,
    iterations: iterations,
    failures: value,
  );

  JsonMap toJson() => {
    'user_id': userId,
    'salt': base64.encode(salt),
    'verifier': base64.encode(verifier),
    'iterations': iterations,
    'failures': failures,
  };
}

/// PBKDF2-HMAC-SHA-256 sur un bloc (32 octets), pour un isolat.
Uint8List pbkdf2Sha256(List<int> password, List<int> salt, int iterations) {
  final hmac = crypto.Hmac(crypto.sha256, password);
  var block = hmac.convert([...salt, 0, 0, 0, 1]).bytes;
  final result = Uint8List.fromList(block);
  for (var round = 1; round < iterations; round++) {
    block = hmac.convert(block).bytes;
    for (var index = 0; index < result.length; index++) {
      result[index] ^= block[index];
    }
  }
  return result;
}

Uint8List _hmac(List<int> key, String label, List<int> message) =>
    Uint8List.fromList(
      crypto.Hmac(
        crypto.sha256,
        key,
      ).convert([...utf8.encode(label), ...message]).bytes,
    );

bool _sameBytes(List<int> left, List<int> right) {
  if (left.length != right.length) return false;
  var difference = 0;
  for (var index = 0; index < left.length; index++) {
    difference |= left[index] ^ right[index];
  }
  return difference == 0;
}

final class LocalCodeStore {
  LocalCodeStore(
    this._store, {
    this.iterations = 100000,
    Random? random,
    Future<Uint8List> Function(List<int> password, List<int> salt, int rounds)?
    derive,
  }) : _random = random ?? Random.secure(),
       _deriveKey = derive ?? _inIsolate;

  /// La dérivation, coûteuse, ne bloque pas l'interface.
  static Future<Uint8List> _inIsolate(
    List<int> password,
    List<int> salt,
    int rounds,
  ) => Isolate.run(() => pbkdf2Sha256(password, salt, rounds));

  final Future<Uint8List> Function(
    List<int> password,
    List<int> salt,
    int rounds,
  )
  _deriveKey;

  /// Coût de la dérivation ; réduit dans les tests.
  final int iterations;
  final SecureStore _store;
  final Random _random;

  Uint8List _bytes(int length) =>
      Uint8List.fromList(List.generate(length, (_) => _random.nextInt(256)));

  Future<_Record?> _read() async {
    final text = await _store.read(LocalCodeKeys.record);
    if (text == null) return null;
    try {
      return _Record.fromJson(asJsonMap(jsonDecode(text)));
    } on FormatException {
      return null;
    }
  }

  Future<Uint8List> _pepper() async {
    final stored = await _store.read(LocalCodeKeys.pepper);
    if (stored != null) return base64.decode(stored);
    final created = _bytes(32);
    await _store.write(LocalCodeKeys.pepper, base64.encode(created));
    return created;
  }

  Future<Uint8List> _derive(String code, Uint8List salt, int rounds) =>
      _deriveKey(utf8.encode(code), salt, rounds);

  /// Le code de [userId] est choisi sur cette tablette.
  Future<bool> isSetFor(String userId) async =>
      (await _read())?.userId == userId;

  /// Choisit (ou remplace) le code de [userId] ; rend la clé d'enveloppe.
  Future<Uint8List> set(String userId, String code) async {
    if (!isValidLocalCode(code)) {
      throw ArgumentError('Le code compte six chiffres.');
    }
    final salt = _bytes(16);
    final master = await _derive(code, salt, iterations);
    final pepper = await _pepper();
    final record = _Record(
      userId: userId,
      salt: salt,
      verifier: _hmac(pepper, 'etare.local-code.verify.v1', master),
      iterations: iterations,
      failures: 0,
    );
    await _store.write(LocalCodeKeys.record, jsonEncode(record.toJson()));
    return _hmac(pepper, 'etare.local-code.wrap.v1', master);
  }

  /// Vérifie le code de [userId] ; chaque échec est compté, même si
  /// l'application est arrêtée entre deux essais.
  Future<LocalCodeCheck> verify(String userId, String code) async {
    final record = await _read();
    if (record == null || record.userId != userId) {
      return const LocalCodeLockedOut();
    }
    if (record.failures >= maxLocalCodeAttempts) {
      return const LocalCodeLockedOut();
    }
    final master = await _derive(code, record.salt, record.iterations);
    final pepper = await _pepper();
    if (isValidLocalCode(code) &&
        _sameBytes(
          _hmac(pepper, 'etare.local-code.verify.v1', master),
          record.verifier,
        )) {
      if (record.failures > 0) {
        await _store.write(
          LocalCodeKeys.record,
          jsonEncode(record.withFailures(0).toJson()),
        );
      }
      return LocalCodeAccepted(
        _hmac(pepper, 'etare.local-code.wrap.v1', master),
      );
    }
    final failures = record.failures + 1;
    await _store.write(
      LocalCodeKeys.record,
      jsonEncode(record.withFailures(failures).toJson()),
    );
    return failures >= maxLocalCodeAttempts
        ? const LocalCodeLockedOut()
        : LocalCodeRejected(maxLocalCodeAttempts - failures);
  }

  /// Déconnexion, changement d'agent, révocation : le code de l'agent
  /// disparaît, et avec lui le secret de l'installation, renouvelé au code
  /// suivant (SEC-05) ; les sites sensibles qu'il protégeait sont déjà effacés.
  Future<void> clear() async {
    await _store.delete(LocalCodeKeys.record);
    await _store.delete(LocalCodeKeys.pepper);
  }
}

/// Chiffrement authentifié (AES-256-GCM) des contenus sensibles : le résultat
/// concatène nonce, chiffré et étiquette.
abstract final class SealedBox {
  static final _cipher = AesGcm.with256bits();

  static Future<Uint8List> seal(List<int> key, List<int> clear) async {
    final box = await _cipher.encrypt(clear, secretKey: SecretKey(key));
    return box.concatenation();
  }

  /// Lève [SecretBoxAuthenticationError] si la clé est fausse ou le contenu altéré.
  static Future<Uint8List> open(List<int> key, List<int> sealed) async {
    final box = SecretBox.fromConcatenation(
      sealed,
      nonceLength: _cipher.nonceLength,
      macLength: _cipher.macAlgorithm.macLength,
    );
    return Uint8List.fromList(
      await _cipher.decrypt(box, secretKey: SecretKey(key)),
    );
  }
}
