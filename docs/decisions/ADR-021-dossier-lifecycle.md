# ADR-021 — Cycle de vie d’un dossier : retrait et archivage

- Statut : acceptée — Sprint 8, 03/10/2026
- Sources : roadmap R3, MET-04 (« archivage du dossier et retrait motivé d’une publication, permissions,
  historique, diffusion du retrait et statut intelligible sur le terminal ; ne pas effacer l’audit ») ;
  ADR-005 (publications immuables), ADR-013 (validation), ADR-015 (distribution) ; décisions du porteur du
  3 octobre 2026

## Contexte

Une publication en vigueur peut devenir dangereuse (bâtiment démoli, plans faux) avant qu’une version
corrigée soit prête ; un site peut fermer définitivement. La base portait déjà l’état `withdrawn` d’une
publication et l’état `archived` d’un site, sans parcours, sans motif obligatoire, et un site archivé restait
distribué aux tablettes. L’intervenant voyait seulement « N site(s) retiré(s) ».

## Décision

1. **Retrait de la version en vigueur** par un validateur (`publication:publish`, second facteur), avec un
   **motif** (3 à 1 000 caractères). La base enregistre qui et quand (`withdrawn_by`, `withdrawn_at`) ; la
   publication reste dans l’historique, immuable. Le site n’a plus de version en vigueur ; la génération de
   distribution avance et les tablettes le retirent à leur prochain contact.
2. **Archivage d’un site et de son dossier** par ceux qui modifient le site (`site:write`), avec un motif,
   **seulement si** aucune version n’est en vigueur (un validateur la retire d’abord), aucune publication
   n’est en fabrication et aucune révision n’attend de décision. Les brouillons sont clos (`superseded`), le
   dossier passe `archived`, aucune révision ni publication ne peut démarrer. La modification directe du
   statut vers `archived` est refusée (contrat et contrainte en base). **Restaurer** rend le dossier actif ;
   l’historique (révisions, publications, audit) reste consultable.
3. **Statut intelligible sur la tablette.** Le catalogue signé porte, pour les sites que le terminal
   détient, la raison de leur disparition (`withdrawals` : version retirée ou site archivé, date, motif).
   L’application conserve ces avis dans sa base chiffrée (vingt au plus, effacés à la révocation et quand
   le site est publié de nouveau) et les affiche : carte de synchronisation et écran d’un site retiré.
4. Chaque acte reste une mise à jour ordinaire, auditée au nom de son auteur ; rien n’est effacé.

## Conséquences

- Contrat : `POST /publications/{id}/withdrawal`, `POST /sites/{id}/archive`, `POST /sites/{id}/restore`
  (version attendue) ; `PublicationSummary.withdrawal`, `SiteDetail.archive`, `SyncCatalog.withdrawals`
  (ajout compatible : les applications antérieures l’ignorent).
- Un site archivé avant cette règle n’a pas de motif ; la contrainte n’est pas imposée rétroactivement.
- Retirer une version laisse les intervenants sans dossier pour ce site jusqu’à une nouvelle publication :
  l’écran de retrait le dit avant confirmation.

## Critère de réexamen

Retrait d’urgence sans second facteur (astreinte), retrait programmé, ou conservation d’une version
retirée consultable sur la tablette avec un avertissement.
