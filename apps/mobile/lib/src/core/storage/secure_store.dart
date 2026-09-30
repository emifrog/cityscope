import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Clés utilisées dans le stockage sécurisé.
abstract final class SecureStorageKeys {
  /// Session Supabase Auth sérialisée (jetons d'accès et de rafraîchissement).
  static const authSession = 'etare.auth.session.v1';

  /// Clé de chiffrement SQLCipher (32 octets aléatoires, en hexadécimal).
  static const databaseKey = 'etare.db.key.v1';
}

/// Stockage clé/valeur pour les SECRETS (jetons, clé de base).
///
/// Ne jamais utiliser `shared_preferences` pour ces données.
abstract interface class SecureStore {
  Future<String?> read(String key);

  Future<void> write(String key, String value);

  Future<void> delete(String key);
}

/// Implémentation adossée au Keystore Android / Keychain iOS.
final class FlutterSecureStore implements SecureStore {
  FlutterSecureStore([FlutterSecureStorage? storage])
    : _storage = storage ?? _defaultStorage;

  static const _defaultStorage = FlutterSecureStorage(
    // AES-GCM + clé enveloppée RSA-OAEP dans l'Android Keystore (défaut v11).
    aOptions: AndroidOptions.defaultOptions,
    // Accessible après le premier déverrouillage (usage en arrière-plan
    // possible plus tard pour la synchro), jamais migré vers un autre
    // appareil via sauvegarde.
    iOptions: IOSOptions(
      accessibility: KeychainAccessibility.first_unlock_this_device,
    ),
  );

  final FlutterSecureStorage _storage;

  @override
  Future<String?> read(String key) => _storage.read(key: key);

  @override
  Future<void> write(String key, String value) =>
      _storage.write(key: key, value: value);

  @override
  Future<void> delete(String key) => _storage.delete(key: key);
}
