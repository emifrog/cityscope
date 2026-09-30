import 'package:flutter/foundation.dart';

/// Phase de la synchronisation hors ligne (colonne `sync_state.status`).
enum SyncPhase {
  never,
  idle,
  running,
  failed,

  /// Valeur écrite par une version plus récente de l'application.
  unknown;

  static SyncPhase fromStorage(String value) =>
      SyncPhase.values.where((p) => p.name == value).firstOrNull ?? unknown;
}

/// Vue métier de l'état de synchronisation.
@immutable
final class SyncStatus {
  const SyncStatus({
    required this.phase,
    this.activeGeneration,
    this.lastSyncAt,
  });

  static const initial = SyncStatus(phase: SyncPhase.never);

  /// Génération de publication installée localement (null = aucune).
  final int? activeGeneration;

  /// Dernière synchronisation réussie (UTC), null = jamais.
  final DateTime? lastSyncAt;
  final SyncPhase phase;

  bool get hasPublication => activeGeneration != null;
}
