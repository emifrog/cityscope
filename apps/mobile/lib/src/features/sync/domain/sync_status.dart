import 'package:etare_ops/src/features/sync/domain/terminal_policy.dart';
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

/// Fraîcheur affichée en permanence (OPS-05, cahier des charges §6.2).
enum Freshness {
  /// Jamais synchronisé : aucune donnée publiée sur ce terminal.
  never,

  /// Dernière synchronisation réussie il y a moins de 24 heures.
  upToDate,

  /// Dernière synchronisation réussie trop ancienne.
  late,

  /// La dernière tentative a échoué (les données installées restent lisibles).
  error,
}

/// Délai au-delà duquel les données sont signalées « en retard » : le
/// renouvellement quotidien proposé par l'architecture (§19).
const freshnessLateAfter = Duration(hours: 24);

/// Vue métier de l'état de synchronisation.
@immutable
final class SyncStatus {
  const SyncStatus({
    required this.phase,
    this.activeGeneration,
    this.lastSyncAt,
    this.catalogGeneration,
    this.lastAttemptAt,
    this.lastError,
    this.serverTime,
    this.authorizedUserId,
    this.authorizationExpiresAt,
    this.installedSites = 0,
    this.requiredAppVersion,
    this.terminalPolicy = TerminalPolicy.defaults,
  });

  static const initial = SyncStatus(phase: SyncPhase.never);

  /// Génération du catalogue entièrement installée (null = aucune).
  final int? activeGeneration;

  /// Dernière synchronisation réussie (UTC), null = jamais.
  final DateTime? lastSyncAt;
  final SyncPhase phase;

  /// Plus haute génération de catalogue acceptée (refus du rejeu d'un ancien).
  final int? catalogGeneration;
  final DateTime? lastAttemptAt;

  /// Message de la dernière erreur, destiné à l'utilisateur.
  final String? lastError;

  /// Heure du serveur au dernier catalogue (plancher contre un recul d'horloge).
  final DateTime? serverTime;

  /// Personne autorisée à consulter localement, et jusqu'à quand.
  final String? authorizedUserId;
  final DateTime? authorizationExpiresAt;
  final int installedSites;

  /// Version minimale exigée par le serveur quand l'application est trop
  /// ancienne pour le contenu reçu (SYN-02) ; chaîne vide si elle est inconnue.
  final String? requiredAppVersion;

  /// Politique des tablettes reçue avec le dernier catalogue (SEC-05).
  final TerminalPolicy terminalPolicy;

  /// Les nouvelles versions ne s'installeront qu'après mise à jour de
  /// l'application ; les données installées restent consultables.
  bool get appUpdateRequired => requiredAppVersion != null;

  bool get hasPublication => activeGeneration != null || installedSites > 0;

  /// Heure retenue pour les contrôles locaux : jamais avant la dernière heure
  /// connue du serveur ni la dernière synchronisation (une horloge reculée ne
  /// prolonge pas l'autorisation ; une horloge avancée l'écourte).
  DateTime effectiveNow(DateTime deviceNow) {
    var now = deviceNow.toUtc();
    for (final floor in [serverTime, lastSyncAt]) {
      if (floor != null && floor.isAfter(now)) now = floor;
    }
    return now;
  }

  /// Consultation locale permise à [userId] (autorisation de 7 jours délivrée
  /// avec le dernier catalogue, ADR-015).
  bool canConsult({required String? userId, required DateTime now}) {
    final expiresAt = authorizationExpiresAt;
    return userId != null &&
        userId == authorizedUserId &&
        expiresAt != null &&
        effectiveNow(now).isBefore(expiresAt);
  }

  Freshness freshness(DateTime now) {
    final syncedAt = lastSyncAt;
    if (phase == SyncPhase.failed) return Freshness.error;
    if (syncedAt == null) return Freshness.never;
    return effectiveNow(now).difference(syncedAt) > freshnessLateAfter
        ? Freshness.late
        : Freshness.upToDate;
  }
}
