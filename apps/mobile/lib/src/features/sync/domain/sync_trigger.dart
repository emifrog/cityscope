/// Volume au-delà duquel une synchronisation en arrière-plan reporte une mise
/// à jour au Wi-Fi (architecture §12 : « les transferts cellulaires lourds
/// exigent une politique explicite »). Proposition à valider avec le SIS.
const backgroundDownloadBudgetBytes = 50 * 1024 * 1024;

/// Origine d'une synchronisation (SYN-01) : elle fixe son budget de
/// téléchargement et la façon d'enchaîner l'envoi des signalements.
enum SyncTrigger {
  /// Demandée par l'agent (« Synchroniser ») : sans limite de volume.
  manual,

  /// Ouverture ou retour de l'application : sans limite, l'agent voit la
  /// progression.
  automatic,

  /// Tâche périodique Android, sur tout réseau : une mise à jour plus lourde
  /// que [backgroundDownloadBudgetBytes] attend le Wi-Fi.
  background,

  /// Tâche Android lancée en Wi-Fi pour les mises à jour reportées.
  unmetered;

  /// Sans écran : l'agent ne voit ni progression ni bouton.
  bool get unattended => this == background || this == unmetered;

  /// Volume borné : sur réseau mobile, sans que l'agent l'ait demandé.
  bool get budgeted => this == background;
}
