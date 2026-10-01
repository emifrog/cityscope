# Suivi des exigences

**État au 1er octobre 2026**, après le Sprint 4 (consultation OPS hors ligne). Ce
tableau est le point d’entrée courant ; les rapports de sprint restent des photographies datées.
Priorités et lots : [cahier des charges MVP](reference/01_Cahier_des_charges_MVP_ETARE_numerique.pdf).

« Présent » signifie trouvé dans le code avec des tests automatisés, **pas réceptionné par un SIS
pilote**. Les chemins de tests sont relatifs à la racine du dépôt.

## Exigences

| Exigence                                               | Prio. | État                 | Preuves (tests)                                                                                                       | Réserves ou suite                                                                                                 |
| ------------------------------------------------------ | ----- | -------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| SITE-01 à 04 — sites, bâtiments, classements, contacts | P0    | Présent              | `tests/integration/referential.test.ts`, pgTAP `60_referential_editing`                                               | recette utilisateur sur données représentatives                                                                   |
| SITE-05 — photos et documents                          | P0    | Présent avec réserve | `tests/integration/documents.test.ts`, pgTAP `70_document_uploads`                                                    | **antivirus non raccordé** (contrôles de type, taille, empreinte seulement)                                       |
| SITE-06 — recherche                                    | P0    | Partiel              | `tests/integration/referential.test.ts`                                                                               | filtre par risque absent ; délai de 2 s non mesuré sur un jeu pilote                                              |
| MAP-01, MAP-02 — carte, emprises, points               | P0    | Présent              | `tests/integration/map.test.ts`, `geometry.test.ts`, `objects.test.ts`, pgTAP `90`                                    | volumétrie et usage tablette à éprouver                                                                           |
| MAP-03 — import GeoJSON/CSV                            | P1    | À venir              | —                                                                                                                     | MVP+                                                                                                              |
| MAP-04 — mesure de distances                           | P1    | À venir              | —                                                                                                                     | MVP+                                                                                                              |
| PLAN-01, PLAN-06 — fonds de plans versionnés           | P0    | Présent              | `tests/integration/plans.test.ts`                                                                                     | pas de calibration ni d’orientation (aucune mesure en mètres)                                                     |
| PLAN-02 à 04 — placement, objets typés, calques        | P0    | Présent              | `tests/integration/plan-items.test.ts`, pgTAP `100_plan_placement`                                                    | glisser-déposer vérifié à la main ; rattachement des objets non recalculé quand une zone bouge                    |
| PLAN-05 — photos attachées aux objets                  | P0    | Présent              | `tests/integration/object-photos.test.ts`, pgTAP `130_object_photos`, tests Flutter `ops`                             | photos absentes du PDF ETARE ; pas de miniatures calculées côté serveur                                           |
| RISK-01 — catalogue de risques du SIS                  | P0    | Présent              | `tests/integration/plan-items.test.ts`, pgTAP `100_plan_placement`                                                    | catalogue d’objets non configurable (ADMIN-03)                                                                    |
| RISK-02 — localisation des risques                     | P0    | Partiel              | `tests/integration/plan-items.test.ts`                                                                                | sur plan et par portée ; dessin des risques extérieurs absent de l’interface                                      |
| RISK-03 — matières dangereuses et FDS                  | P1    | À venir              | —                                                                                                                     | un document classé FDS ne remplace pas cette fonction                                                             |
| ETARE-01 — assemblage et aperçu                        | P0    | Présent avec réserve | `tests/integration/etare-workflow.test.ts`, `snapshot-consistency.test.ts`                                            | sections dans l’ordre fixe de la maquette (voir ambiguïtés)                                                       |
| ETARE-02 — PDF standardisé                             | P0    | Présent              | `packages/adapters/src/pdf/etare-pdf.test.ts`, `etare-workflow.test.ts`                                               | polices standard (caractères hors WinAnsi remplacés)                                                              |
| ETARE-03, ETARE-04 — modèle par SIS, scénarios         | P1    | À venir              | —                                                                                                                     | MVP+                                                                                                              |
| WF-01 — statuts du dossier                             | P0    | Présent avec réserve | pgTAP `20_rbac_workflow`, `25_revision_authorship`, `30_publication`                                                  | archivage du dossier non exposé dans l’interface                                                                  |
| WF-02 — validation avant publication                   | P0    | Présent              | `etare-workflow.test.ts`, pgTAP `35_publication_access`, `110_publication_build`                                      | —                                                                                                                 |
| WF-03 — comparaison de versions                        | P1    | Partiel              | `packages/application/src/etare-snapshot.test.ts`                                                                     | par élément (ajout, suppression, modification), sans le détail par champ                                          |
| WF-04 — journal d’audit                                | P0    | Présent              | pgTAP `40_audit`                                                                                                      | —                                                                                                                 |
| OPS-01 à 03 — synthèse, plans tactiles, recherche      | P0    | Présent avec réserve | tests Flutter `test/features/ops` (parcours sans réseau), émulateur                                                   | éprouvé sur émulateur Android, pas sur tablette physique ni en conditions terrain ; PDF non lu dans l’application |
| OPS-04 — signalement terrain                           | P0    | À venir              | —                                                                                                                     | reporté au sprint suivant (annoncé au lancement du Sprint 4)                                                      |
| OPS-05 — âge de la donnée                              | P0    | Présent              | `sync_domain_test.dart` (fraîcheur), `ops_flow_test.dart`                                                             | version, date de publication et de synchronisation affichées                                                      |
| OFF-01, OFF-02 — paquets et synchronisation            | P0    | Présent avec réserve | `tests/integration/offline-distribution.test.ts`, pgTAP `120`, `sync_service_test.dart`, `local_stack_sync_test.dart` | synchronisation à l’ouverture et à la demande, pas en tâche de fond ; sites sensibles non distribués              |
| OFF-03 — chiffrement local                             | P0    | Présent avec réserve | tests Flutter (`apps/mobile`), ADR-016                                                                                | fichiers des paquets dans la base SQLCipher ; ni rotation de la clé ni verrouillage applicatif                    |
| OFF-04 — révocation d’un terminal                      | P0    | Présent              | `offline-distribution.test.ts`, pgTAP `120`, `sync_service_test.dart` (purge)                                         | effective au premier contact réseau ; hors réseau, l’autorisation locale expire après 7 jours                     |
| OFF-05 — politique de rétention                        | P1    | À venir              | —                                                                                                                     | MVP+                                                                                                              |
| PORTAL-01 à 03 — portail exploitant                    | P0    | À venir              | —                                                                                                                     | invitation des membres du SIS existante, pas d’invitation exploitant par site ni de contribution                  |
| ADMIN-01 — RBAC et périmètres                          | P0    | Partiel              | `tests/integration/members.test.ts`, `rbac-parity.test.ts`, pgTAP `80`                                                | rôles, membres, double authentification ; secteurs et politiques de sensibilité non opérationnels                 |
| ADMIN-02 — terminaux                                   | P0    | Présent              | `offline-distribution.test.ts`, pgTAP `120`                                                                           | déclaration, code d’enrôlement, inventaire, état, révocation ; limitation de débit des codes à prévoir            |
| ADMIN-03 — catalogues configurables                    | P1    | Partiel              | `plan-items.test.ts`                                                                                                  | risques configurables par le SIS ; objets non                                                                     |
| ADMIN-04 — exports et rapports                         | P1    | Partiel              | —                                                                                                                     | PDF ETARE ; pas d’export CSV                                                                                      |

## Corrections de la revue du 30 septembre 2026

Défauts relevés par le [bilan d’alignement](bilan-alignement-2026-09-30.md), tous corrigés :

| Défaut                                                  | Correction                                                                                                    | Tests                                                                                         |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| A — PDF publié écrasé par une tentative obsolète        | PDF immuable adressé par empreinte, référence enregistrée avec le manifeste, jeton de fencing du bail en base | `publication-build.test.ts` (tentative tardive après reprise), pgTAP `50_jobs`, `110`         |
| B — instantané mélangeant deux états                    | aperçu et soumission en `REPEATABLE READ`, contributeurs du même instantané, conflits rejoués                 | `snapshot-consistency.test.ts` (fond remplacé pendant la soumission, témoin `READ COMMITTED`) |
| C — publication bloquée « en fabrication » après pannes | échec définitif du travail propagé à la publication (y compris dernier bail expiré), relance auditée          | pgTAP `110`, `etare-workflow.test.ts` (panne puis relance)                                    |
| D — plan WebP absent du PDF avec ses objets             | conversion sans perte en PNG, aucun plan omis, fabrication en échec si un fond manque                         | `etare-pdf.test.ts` (contenu visuel de la page du plan, PNG, JPEG, WebP)                      |

## Réserves transverses avant pilote

- Antivirus à raccorder (indisponibilité, reprise, quarantaine sans admission silencieuse).
- Sites sensibles : politique d’accès renforcée, journalisation des consultations ; exclus de la
  distribution hors ligne tant que cette politique n’est pas définie.
- Double authentification : les appels API ordinaires d’un compte enrôlé peuvent encore utiliser `aal1`.
- Limitation de débit, CSP, purge des objets non référencés (dépôts abandonnés, PDF des tentatives
  perdantes), sauvegarde et restauration, supervision.
- Volumétrie (10 000 sites) non éprouvée ; la liste des dossiers ETARE est plafonnée à 1 000 sans
  pagination.
- Essais sur tablette physique : le Sprint 4 a été éprouvé sur émulateur Android (enrôlement,
  synchronisation signée, mode avion, redémarrage à froid) et par tests (coupure pendant le
  téléchargement, reprise) ; restent le réseau dégradé réel, la volumétrie d’un SIS et l’usage terrain.
- Clés de signature de la distribution lues dans l’environnement : gestionnaire de secrets ou KMS à
  brancher.
- Secteurs : la portée des habilitations par secteur n’est pas encore opérationnelle, ni pour le
  back-office ni pour la distribution.

## Ambiguïtés du cahier des charges à trancher

- ETARE-01 (P0) demande des « sections configurables » alors qu’ETARE-03 (P1) couvre le modèle par SIS.
- L’import/export CSV figure dans le périmètre général mais en P1 dans la table des exigences.
