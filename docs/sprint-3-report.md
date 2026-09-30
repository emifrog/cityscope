# Sprint 3 — rapport de livraison

Validation locale du **30 septembre 2026**, sur Windows, puis CI GitHub sur `main` (branche unique).
Quatre lots livrés et poussés : plans de niveaux (`1b648c3`), objets, zones et risques sur les plans
(`1175135`), révision, validation et publication (`4213eb6`), PDF ETARE (`a80eb31`). Aucun déploiement ;
aucune donnée réelle. Le Sprint 4 n’a pas été commencé.

## Réalisé

### Lot A — plans de niveaux (PLAN-01, PLAN-06)

- Onglet « Plans » de la fiche site : plans de masse, de niveau, de réseaux, d’évacuation, rangés par
  bâtiment et niveau.
- Import d’une image (PNG, JPEG, WebP) ou d’une page de PDF, choisie sur des miniatures et convertie en
  image dans le navigateur (pdf.js, 200 dpi) : c’est cette image qui est contrôlée, validée et publiée.
  Le fond passe par la chaîne de dépôt contrôlé du Sprint 1 (quarantaine, contrôle par le worker).
- Remplacer le fond crée une nouvelle révision ; les précédentes restent consultables.
- Visionneuse zoomable (souris, clavier, tactile) ; plan de démonstration « Bâtiment A - RDC » dans le
  seed, déposé par `pnpm seed:assets` (inclus dans `pnpm db:reset`).

### Lot B — objets, zones et risques sur les plans (PLAN-02 à 04, RISK-01, RISK-02)

- Placement en pixels du fond : points, lignes et surfaces créés, déplacés, supprimés (archivés), avec
  « Annuler la dernière action ».
- Objets typés sur plan avec leur fiche et leurs champs (PLAN-03) ; zones (locaux, refuges,
  circulations…) ; risques en point ou en surface, gravité, quantité, champs propres au type.
- Calques activables : risques, eau, accès, énergie, secours, annotations, zones (PLAN-04) ; liste des
  éléments du fond utilisable au clavier.
- Risques localisés sur le site, un bâtiment, un niveau, une zone ou un plan (RISK-02) ; sur un plan, le
  niveau vient du plan et la zone est celle qui contient l’élément.
- Après un changement de fond, les éléments restés sur l’ancien fond sont listés « à replacer » : la
  position d’origine est proposée, l’agent la contrôle et enregistre (jamais de translation automatique).
- Catalogue des risques du SIS (RISK-01), onglet de l’administration : types propres au SIS avec
  pictogramme, gravité par défaut et champs spécifiques ; catalogue national en lecture seule.

### Lot C — révision, validation, publication (WF-01, WF-02, ETARE-01)

- Onglet « ETARE » : version publiée, révision en cours, **contrôle avant validation** (bloquants : point
  du site, fonds de plans contrôlés, éléments à replacer, documents contrôlés ; à vérifier : n° ETARE,
  plans de niveaux manquants, contacts non vérifiés depuis un an, points d’eau), **aperçu fidèle** rendu
  depuis l’instantané, soumission avec résumé, historique. Page « ETARE » : dossiers du SIS.
- Soumission : instantané canonique des données de travail (avec l’extrait du catalogue utilisé) figé et
  identifié par son SHA-256.
- « Validations » : file du SIS, écran de contrôle (modifications depuis la version publiée, aperçu
  figé, contributeurs, empreinte), décision « Valider et publier » ou « Demander une correction »
  motivée ; second facteur exigé ; auteur, soumetteur et contributeurs ne peuvent pas décider.
- Publication fabriquée par le worker à partir de la seule révision figée : charge utile, manifeste
  (fichiers par empreinte et taille), empreinte du manifeste, activation ; la version précédente est
  remplacée, une fabrication obsolète ne remplace jamais une version plus récente, un échec laisse la
  version précédente active et se relance.
- Tableau de bord : « ETARE publiés » et « À valider ».

### Lot D — PDF ETARE (ETARE-02)

- PDF généré par le worker à la publication, depuis l’instantané validé : sur chaque page « version
  publiée n° », date et heure, révision, empreinte du contenu, pagination ; synthèse et points critiques,
  risques, sections, contacts, annexes et une page par plan (fond validé, zones, objets, risques,
  légende).
- Fonds relus et vérifiés par empreinte avant d’être dessinés ; PDF stocké avec la publication et listé
  dans le manifeste ; téléchargement par URL signée de 60 s, tracé, ouvert aux profils OPS pour la version
  publiée.

## Structure

Mêmes couches qu’aux sprints précédents. Nouveaux modules : `contracts/plans` (positions, zones),
`contracts/risks`, `contracts/etare` ; `domain/catalog` (champs des types du SIS), `domain/canonical`
(JSON canonique) ; `application/plans`, `application/risks`, `application/etare`,
`application/etare-snapshot` (instantané, contrôles, comparaison), `application/publication-build` ;
adaptateurs `postgres/plan-repository`, `zone-repository`, `risk-repository`, `etare-repository`,
`publication-build-store`, `pdf/etare-pdf` ; handler worker `publication.build` ; web
`components/plan/*` (repère local, visionneuse, calques, pictogrammes), `components/etare/*`, pages
`/etare`, `/validations`, `/validations/[id]`. Dépendances ajoutées : `pdfjs-dist` 6.3 (web, Apache-2.0),
`pdf-lib` 1.17.1 (adaptateurs, MIT).

## Base de données

| Migration                                     | Objet                                                                                                    |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `20261003000100_plan_placement_and_risks.sql` | placement sur plan (fond courant, dans l’image, niveau du plan, zone déduite), portée cohérente, risques |
| `20261003000200_etare_workflow.sql`           | `member_name`, fabrication des publications par le worker (`worker_start/complete/fail_publication`)     |
| `20261003000300_publication_pdf.sql`          | `worker_publication_assets` (fonds de plans contrôlés, pour le PDF)                                      |

Les tables des plans, zones, risques, révisions, décisions et publications existaient depuis le
Sprint 0 ; ce sprint ajoute les règles de placement, les champs des risques et les fonctions du worker.
Le schéma `app` passe `supabase db lint` sans avertissement.

## Sécurité

- Positions sur plan contrôlées par PostgreSQL : dans le fond, sur la révision courante, niveau et
  bâtiment cohérents ; un code du catalogue national ne peut pas être repris par un SIS.
- Catalogue des risques : écriture réservée à `catalog:manage` (administrateur du SIS), catalogue
  national en lecture seule, champs déclarés par une liste typée (jamais de schéma libre).
- Workflow : décision et publication avec second facteur ; séparation des tâches vérifiée par l’API puis
  par PostgreSQL ; décision liée à l’empreinte relue (412 sinon) ; contenu figé à la soumission.
- Le worker publie par des fonctions réservées à `etare_worker`, filtrées par SIS, sans relire les
  tables de travail ; il vérifie l’empreinte de l’instantané et celle des fonds avant de fabriquer.
- Noms des collègues affichés par `app.member_name()` : membres du SIS courant seulement, sans adresse
  e-mail ; les tables d’identité restent fermées.
- PDF : contacts destinés aux intervenants seulement ; URL signée de 60 s, accès audité ; un profil OPS
  n’atteint que les versions publiées ; clés de stockage des publications validées par motif.
- Isolation multi-SIS retestée sur chaque nouvel endpoint (plans, zones, risques, catalogue, workflow,
  PDF).

## Tests

| Suite                              | Résultat                  |
| ---------------------------------- | ------------------------- |
| Unitaires et composants (`vitest`) | 211 tests, 38 fichiers    |
| Base de données (pgTAP)            | 184 tests, 14 fichiers    |
| Intégration (Auth → API → RLS)     | 58 tests, 12 fichiers     |
| Build web de production            | OK                        |
| CI GitHub (3 jobs)                 | lots A, B, C et D au vert |

L’intégration couvre la chaîne complète : aperçu et contrôles, soumission, refus au rédacteur, second
facteur exigé, empreinte périmée (412), validation et publication par le worker, recalcul des empreintes
de la charge utile et du manifeste, PDF téléchargé par un profil OPS et vérifié par empreinte, demande de
correction motivée, isolation.

Parcours vérifiés dans le navigateur sur la pile locale : import d’un PDF de deux pages (choix de la
page, rendu, contrôle), remplacement du fond et consultation de l’ancienne révision, zoom ; placement d’un
risque et d’une zone, suppression, annulation, calques ; éléments à replacer après un changement de fond
puis replacement ; création d’un type de risque du SIS ; onglet ETARE, soumission, file et écran de
validation, refus sans second facteur, activation du second facteur, validation et publication, PDF
disponible ; carte du Sprint 2 inchangée.

## Décisions prises

- ADR-011 : visionneuse de plans MapLibre dans un repère local synthétique, positions en pixels du fond,
  PDF rendu en image dans le navigateur.
- ADR-012 : règles de placement en base, catalogue des risques du SIS, suppression par archivage et
  annulation par opérations inverses.
- ADR-013 : instantané canonique (avec l’extrait du catalogue), SHA-256 du JSON canonique, contrôles
  bloquants ou à vérifier, une révision ouverte à la fois, publication fabriquée par le worker.
- ADR-014 : PDF ETARE par `pdf-lib`, identifié sur chaque page, fonds vérifiés par empreinte, URL signée.
- Signature Ed25519 du manifeste reportée au sprint des paquets hors ligne (annoncé en début de sprint).

## Écarts

- **PLAN-05 (photos attachées à un objet, P0)** : non réalisé ; il s’appuiera sur les dépôts contrôlés
  existants.
- ETARE-01 « sections configurables » : ordre fixe de la maquette ; le paramétrage par SIS relève
  d’ETARE-03 (MVP+).
- WF-03 (comparaison, P1) : liste des éléments ajoutés, supprimés ou modifiés, sans le détail champ par
  champ.
- RISK-03 (matières dangereuses et FDS, P1) : non réalisé.
- Risques placés sur la carte (hors plan) : portés par l’API (portée), pas encore dessinables.
- Plans : pas de calibration ni d’orientation (mesures en mètres exclues, affiché sur la visionneuse) ;
  une page de PDF par plan.
- PDF : polices standard (caractères hors WinAnsi remplacés, « O₂ » → « O2 ») ; fonds WebP non intégrés.
- L’archivage d’un dossier ETARE (statut « archivé » de WF-01) n’est pas exposé dans l’interface.
- Le déplacement par glisser-déposer n’a pas de test automatisé de bout en bout (vérifié par l’API ; le
  navigateur de test ne transmet pas le glisser à Terra Draw).
- La publication de démonstration du seed a un instantané simplifié : la révision n° 2 n’a pas de
  comparaison.
- Mobile : pas de consultation des publications ce sprint.

## Dette technique

- Déplacer ou archiver une zone ne met pas à jour la zone des objets qu’elle contenait.
- Ordre d’affichage des champs d’un type : celui du stockage JSONB (clés triées), pas celui déclaré.
- L’aperçu ETARE relit toutes les données de travail du site à chaque affichage (suffisant pour le MVP,
  à mesurer).
- Fichiers PDF de fabrications échouées ou devenues obsolètes : pas encore purgés du stockage.
- Localement, les tests d’intégration laissent des documents non contrôlés sur le site de démo, ce qui
  bloque sa soumission : `pnpm db:reset` rétablit l’état de démonstration.
- Toujours à traiter avant le pilote : antivirus, limitation de débit, purge des dépôts abandonnés,
  second facteur exigé par l’API pour les comptes enrôlés, CSP (IGN, workers MapLibre et pdf.js).

## Prochaine étape

Sur nouvelle instruction, démarrer le **Sprint 4 : consultation OPS hors ligne**. Première tranche :
signature Ed25519 du manifeste et catalogue de distribution des publications, paquet d’une publication
(données, fonds de plans, PDF), synchronisation et vérification sur l’application mobile, écrans OPS
(synthèse en moins de trois interactions, plans par niveau tactiles, recherche locale — OPS-01 à 03),
puis photos attachées aux objets (PLAN-05).
