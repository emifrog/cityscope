import 'package:etare_ops/src/core/errors/app_exception.dart';

/// Message lisible d'une purge (révocation, terminal inconnu).
String purgeMessage(ApiErrorCode reason, {int discardedReports = 0}) {
  final base = switch (reason) {
    ApiErrorCode.deviceRevoked =>
      'Tablette révoquée par votre SIS : données hors ligne effacées.',
    _ => 'Tablette inconnue du serveur : données effacées, réenrôlez-la.',
  };
  return switch (discardedReports) {
    0 => base,
    1 => '$base 1 signalement non transmis a été effacé.',
    _ => '$base $discardedReports signalements non transmis ont été effacés.',
  };
}
