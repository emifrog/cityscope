# ADR-005 — Révisions validées et publications immuables

- Statut : acceptée — Sprint 0, 27/09/2026
- Sources : prompt §5 ; cahier des charges WF-01..04 ; modèle de données §7, §13 ; architecture §09

## Contexte

Les trois documents décrivent le cycle avec des vocabulaires et des états différents (5 états dans le
cahier des charges, 6 dans l’architecture, `etare_version` / `published_snapshot` dans le modèle). Le
principe est commun : aucune donnée non validée n’atteint le terrain, une version publiée ne change jamais.

## Décision

Deux machines à états séparées, appliquées à la fois dans `packages/domain` et par des triggers SQL :

- **Révision** (`etare_revision`, l’« EtareVersion » du prompt) : `draft` → `submitted` → `approved`
  ou `changes_requested` ; `draft` ou `approved` → `superseded`. À la soumission, un instantané
  canonique des données de travail et son **SHA-256** sont figés.
- **Décision** (`approval`) : en ajout seul, liée à l’empreinte exacte ; refusée si le validateur est
  l’auteur, le soumetteur ou un contributeur (séparation des tâches par révision, pas seulement par rôle).
- **Publication** (`publication`) : `queued → building → ready → published → superseded | withdrawn`,
  `queued | building → failed`. Charge utile, manifeste et empreinte immuables dès `ready` ; numéro
  strictement croissant par site ; une seule active ; un build obsolète ne remplace jamais une version
  plus récente ; jamais supprimée.
- `etare.status` ne porte que le cycle de vie du dossier (`active`, `archived`).
- Le numéro de version est un entier par site (le « v4.2 » de la maquette est un format d’affichage).

## Conséquences

- L’application OPS ne lira que des publications, jamais les tables de travail.
- Toute correction = nouvelle révision puis nouvelle publication ; un retrait est un événement, pas une
  réécriture.
- La canonicalisation JSON, la génération PDF, la signature du manifeste (Ed25519) et le paquet OPS
  restent à implémenter (le seed contient une publication de démonstration simplifiée).

## Critère de réexamen

Besoin d’une dérogation d’urgence à la validation (décision de gouvernance SIS, hors chemin normal MVP).
