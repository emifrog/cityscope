# Sprint 8 — rapport de livraison

Validation locale du **3 octobre 2026**, sur Windows, dans le navigateur et contre la pile locale, puis CI
GitHub sur `main` (branche unique). Six commits : roadmap à jour après le Sprint 7 (`7b94a30`), recherche
par risque et dossiers paginés (`a397d63`), risques extérieurs (`9bc1f6a`), cohérence des zones
(`71e0baf`), retrait et archivage (`0704b49`), puis ce rapport. Aucun déploiement ; aucune donnée réelle.

Périmètre retenu (roadmap) : R3, lots sans arbitrage préalable — MET-01 à MET-04. Décisions du porteur du
3 octobre : retrait par un validateur avec second facteur et motif ; archivage seulement après retrait de la
version en vigueur, par l’administration du SIS ou la Prévision, avec motif ; recalcul automatique des
rattachements aux zones et contrôle bloquant ; recherche par type de risque et gravité minimale.

## Réalisé

### Lot A — recherche (MET-01)

- Liste des sites et carte : filtre par **type de risque** du catalogue (types retirés compris) et
  **gravité minimale**, sur les risques actifs des données de travail, combinable avec le texte, le type de
  site, le statut et la commune ; la carte gagne le filtre par commune. Les filtres vivent dans l’adresse
  de la page et passent de la liste à la carte.
- Dossiers ETARE : **pagination par nom**, filtres d’état (à valider, en préparation, publiés, sans version
  publiée) et recherche, avec des **compteurs exacts** sur tout le SIS : fin du plafond silencieux de 1 000.
  Le tableau de bord affiche des nombres exacts (sites hors archives, ETARE publiés).

### Lot B — risques extérieurs (MET-02)

- Un risque peut être situé **sur la carte** (point ou zone de danger), avec sa portée (site ou bâtiment),
  en plus ou à la place d’une position sur plan ; retrait de la carte sans perte du risque ; une ligne est
  refusée.
- Panneau « Localisation » : risques sur la carte et risques sans position, placement, modification ;
  carte générale : couche des risques au zoom de détail.
- Instantané : position figée (clé absente sinon, comme pour les instantanés antérieurs) ; aperçu et PDF
  « sur carte » ; contrôle avant soumission : risques comptés sur carte et alerte au-delà de 2 km du point
  de référence. Tablette : un risque situé sur la carte est signalé « à l’extérieur ».

### Lot C — cohérence des zones (MET-03)

- Une zone **tracée, déplacée, archivée ou réactivée** rattache de nouveau les objets et risques placés sur
  le même fond (plus petite zone active qui les couvre), par des mises à jour ordinaires, auditées au nom
  de la personne qui modifie la zone.
- Un élément placé tire toujours sa zone de sa position ; un risque sans position garde la zone choisie,
  sauf si elle est archivée. Une référence à une zone qui n’est plus active **bloque la soumission**.

### Lot D — cycle de vie (MET-04)

- **Retrait** de la version en vigueur par un validateur (second facteur, motif) ; la base enregistre qui et
  quand ; la publication reste dans l’historique ; le site disparaît des tablettes au contact suivant.
- **Archivage** d’un site et de son dossier avec motif, refusé tant qu’une version est en vigueur, qu’une
  publication est en fabrication ou qu’une révision attend une décision ; brouillons clos ; aucune révision
  ni publication ne démarre sur un site archivé ; **restauration**. Le statut « archivé » ne se modifie plus
  directement.
- **Tablette** : le catalogue signé indique pourquoi un site détenu disparaît (version retirée ou site
  archivé, date, motif) ; l’application le conserve dans sa base chiffrée et l’affiche sur la carte de
  synchronisation et à l’ouverture d’un site retiré.

## Structure

Nouveaux modules : composants web `risk-filter-fields`, `map/risk-layers`, `lifecycle-cards` ; mobile
`sync/domain/removal_notice.dart`. Aucune nouvelle dépendance.

## Base de données

Trois migrations : index de recherche par risque ; `zone_for_position` et trigger `zone_reattach`
(règle de placement commune) ; cycle de vie (`withdrawn_by`, `site.archived_*`, triggers d’archivage et de
gel, raisons dans `sync_catalog`). Aucune donnée existante réécrite.

## Sécurité

- Retrait réservé aux validateurs avec second facteur, motivé ; archivage refusé tant qu’une décision est
  en attente ; tout acte audité au nom de son auteur ; rien n’est effacé.
- Les raisons de retrait voyagent dans le catalogue **signé** et sont conservées dans la base chiffrée de
  la tablette, effacées à la révocation.

## Tests

| Suite                              | Résultat                                                       |
| ---------------------------------- | -------------------------------------------------------------- |
| Unitaires et composants (`vitest`) | 294 tests, 52 fichiers                                         |
| Base de données (pgTAP)            | 429 tests, 23 fichiers (dont 190 et 200 pour ce sprint)        |
| Intégration (Auth → API → RLS)     | 107 tests, 24 fichiers (dont recherche, risques, cycle de vie) |
| Flutter (`flutter test`)           | 163 tests, 1 ignoré (bout en bout sur demande)                 |
| CI GitHub (3 jobs)                 | au vert sur chaque commit du sprint                            |

L’intégration couvre les filtres par risque (liste, carte, autre SIS, risque archivé), la pagination et les
compteurs des dossiers, le risque situé sur la carte (contrat, couche de détail, instantané, retrait), et le
cycle de vie complet avec un terminal enrôlé (retrait refusé sans droit ou sans second facteur, raison dans
le catalogue signé, archivage refusé puis accepté, gel, restauration). pgTAP couvre les bords, zones
imbriquées, déplacements, archivage et réactivation des zones, et chaque règle du retrait et de
l’archivage.

Vérifié dans le navigateur contre la pile locale : dossiers ETARE (onglets d’état avec compteurs, filtre « À
valider »), filtres par risque de la liste des sites alimentés par le catalogue, panneau « Localisation »
avec la liste des risques sur la carte, onglet ETARE : archivage bloqué avec son explication tant qu’une
version est en vigueur, bouton de retrait absent pour un rédacteur.

## Décisions prises

- ADR-021 : cycle de vie d’un dossier (retrait, archivage, restauration, raisons sur la tablette).
- ADR-012 complété (cohérence des zones, risques sur la carte).

## Écarts

- **Tracé sur la carte non éprouvé dans le navigateur** : le panneau du navigateur intégré ne rendait pas
  le canevas (captures impossibles, clics non transmis à la carte) ; le tracé des risques réutilise le
  mécanisme déjà en place pour les points opérationnels, et l’API est couverte par les tests.
- La tablette n’a pas de carte (CAR-02) : un risque extérieur y est seulement signalé « à l’extérieur ».
- Un site archivé avant cette règle n’a pas de motif (contrainte non rétroactive).
- Tablette physique toujours attendue ; mesure de la recherche en moins de 2 s sur jeu pilote (R5).

## Dette technique

- Les compteurs exacts des dossiers sont recalculés à chaque page : à mesurer sur 10 000 sites (CAP-01).
- Le rattachement aux zones recalcule les éléments du fond à chaque modification d’une zone : à mesurer
  sur des plans très chargés.
- Toujours à traiter avant le pilote : limitation de débit, CSP, purge des dépôts abandonnés, KMS pour les
  clés de signature, fournisseur d’envoi des e-mails.

## Prochaine étape

R3 restant suppose des arbitrages : DEC-05 (sections, MET-05), DEC-04 (secteurs et sites sensibles,
PER-01/02), DEC-02 (fonds IGN hors ligne, CAR-01 à 03). En attendant, R4 peut avancer sans arbitrage
(second facteur imposé par l’API, limitation de débit et CSP, cycle des fichiers), avec les premiers essais
sur la tablette de référence dès sa livraison.
