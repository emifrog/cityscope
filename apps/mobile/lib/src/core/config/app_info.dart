import 'package:flutter/services.dart' show appFlavor;

/// Identité de l'application OPS transmise au serveur (administration des
/// terminaux, ADMIN-02) et version du format de paquet qu'elle sait lire.
abstract final class AppInfo {
  /// Doit rester égale à la version de `pubspec.yaml` (vérifié par un test).
  static const version = '0.6.0';

  /// Plus haute version de paquet lisible (`min_reader_version` du manifeste).
  static const readerVersion = '1.0.0';

  /// Variante Android construite (EXP-04) : `prod`, `staging` (préproduction),
  /// ou null hors construction à variantes (tests).
  static const String? flavor = appFlavor;

  /// Commit de la construction, posé par le script de release
  /// (`--dart-define=BUILD_COMMIT`) ; vide en développement.
  static const commit = String.fromEnvironment('BUILD_COMMIT');

  /// Version lisible par l'agent et le support : « 0.6.0 · préproduction ·
  /// 1a2b3c4d ».
  static String describe({String? flavor = flavor, String commit = commit}) => [
    version,
    if (flavor == 'staging') 'préproduction',
    if (commit.isNotEmpty) commit.length > 8 ? commit.substring(0, 8) : commit,
  ].join(' · ');
}
