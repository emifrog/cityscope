/// Identité de l'application OPS transmise au serveur (administration des
/// terminaux, ADMIN-02) et version du format de paquet qu'elle sait lire.
abstract final class AppInfo {
  /// Doit rester égale à la version de `pubspec.yaml` (vérifié par un test).
  static const version = '0.5.0';

  /// Plus haute version de paquet lisible (`min_reader_version` du manifeste).
  static const readerVersion = '1.0.0';
}
