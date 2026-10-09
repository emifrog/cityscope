# Sprint 14 — rapport de livraison

Validation locale du **9 octobre 2026** sur Windows, préproduction `https://firescape.io`. Trois
commits sur `main` (branche unique) :

- QR code du site sur le dossier ETARE, lu par l'application OPS (`a6bbebb`) ;
- matières dangereuses et fiches de données de sécurité structurées, RISK-03 (`6615a57`) ;
- export de réversibilité du SIS, ADMIN-04 (`8af69da`) ;
- puis ce rapport et la version 0.6.0 de l'application.

Périmètre : trois écarts visibles en démonstration face au concurrent, choisis par le porteur le
9 octobre, en attendant l'activation de la sauvegarde hors site (Scaleway) et des e-mails (domaine).
Choix du porteur :

- **QR code** lu par la caméra en direct (ML Kit embarqué, permission caméra au premier usage) ;
- **export** complet : données **et** fichiers, et non les données seules.

## Réalisé

### Lot A — QR code du site (ETARE-02, architecture §16)

- **Lien du site** `https://<adresse publique>/sites/<identifiant>` : nomme le dossier, sans secret ni
  droit d'accès. Un téléphone ouvre la page du back-office, derrière la connexion.
- **PDF** (gabarit `etare-pdf/5`) : QR code vectoriel à droite du bloc de titre, légende « Scanner :
  ouvrir le site dans FireScape OPS ». Sans `APP_BASE_URL`, le worker le dit au démarrage et le PDF
  reste sans code. Les PDF antérieurs ne sont pas régénérés.
- **Back-office** : carte « Code QR du site » sur la fiche, même lien.
- **Application OPS** : « Scanner un dossier » dans l'accueil ; le code ouvre la version installée du
  site, ou le site sensible proposé à la demande ; un code étranger ou un site absent de la tablette
  sont dits. Décodage sur la tablette, aucune image conservée.

### Lot B — matières dangereuses et FDS (RISK-03, ADR-032)

- **Table `hazardous_substance`** : produit, classes CLP (pictogrammes GHS01 à GHS09, libellés
  français), n° ONU, état physique, quantité et unité (toujours ensemble), bâtiment, niveau, zone
  (cohérence vérifiée par la base, niveau et bâtiment déduits de la zone), note, **FDS = document du
  même site classé FDS et actif** (vérifié par l'API puis par la base). Portée site, audit, édition
  comptée dans la révision, archivage sans suppression.
- **API** `/sites/{id}/substances`, `/substances/{id}` (If-Match).
- **Instantané ETARE** : section optionnelle `substances`, additive (anciens instantanés intacts, anciens
  lecteurs indifférents) ; la fiche n'est nommée que si elle est parmi les documents publiés ; le
  contrôle avant soumission avertit des matières sans fiche prête ; la comparaison des révisions liste
  les matières.
- **Restitution** : PDF (bloc « Matières dangereuses » de la section Risques), aperçu web, application
  OPS (tuiles et fiche dans la section Risques, bouton « Fiche de données de sécurité » par le circuit
  des documents, installée ou à la demande ; compteur de la tuile Risques).
- **Back-office** : onglet « Matières dangereuses » de la fiche du site (liste, formulaire, FDS parmi les
  documents FDS du site, archivage).
- Seed de démonstration : oxygène médical et fioul de l'EHPAD.

### Lot C — export de réversibilité (ADMIN-04, ADR-033)

- **Permission `export:manage`** (second facteur, administrateur du SIS), un export à la fois par SIS,
  demande et travail `export.build` dans la même transaction, audit `export.requested`.
- **Worker** : lecture des tables par liste blanche et pages (par clé primaire ; secrets de la
  plateforme exclus, catalogue national compris), fichiers vérifiés et PDF publiés ; parties ZIP de
  32 Mo au plus (`fflate`, MIT), fichier plus gros copié tel quel ; `donnees.zip` avec chaque table en
  JSON, les référentiels en CSV (« ; », UTF-8 avec BOM), `manifeste.json` (lignes par table, empreinte
  de chaque fichier, parties), `LISEZMOI.md`. Chaque objet est enregistré avant d'être écrit, chaque
  étape est clôturée par le travail en cours ; un travail mort laisse l'export en échec.
- **Téléchargement** par partie, URL signée de 60 s, audit `export.downloaded` ; expiration à 7 jours,
  objets purgés par la maintenance horaire des fichiers (`export.purged`), un export en échec purgé un
  jour après.
- **Administration** : onglet « Export de réversibilité » (demande, état rafraîchi, parties, échéance,
  erreurs).

## Base de données

Deux migrations :

- `20261112000100_hazardous_substances` : table, garde (FDS, cohérence du lieu, archivage), RLS par
  périmètre, audit, édition de révision ;
- `20261113000100_exports` : permission, `export_run`, fonctions de l'API (`request_export`,
  `export_runs`, `export_part`) et du worker (`worker_start_export` sous clôture, `worker_export_rows`,
  `worker_export_files`, enregistrement des objets, clôture, échec, purge), déclencheur sur les travaux
  morts.

Projet hébergé : les deux migrations s'appliquent par l'éditeur SQL (fichier remis au porteur), avec
leur inscription dans l'historique.

## Tests

| Suite                              | Résultat                                                                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Unitaires et composants (`vitest`) | 490 tests, 79 fichiers (lien du site, rendu PDF, instantané, export, composants web)                                                 |
| Base de données (pgTAP)            | 731 tests, 38 fichiers (dont `340_hazardous_substances`, `350_exports`)                                                              |
| Intégration (Auth → API → RLS)     | 159 tests, 36 fichiers, dont `substances` et `exports` (archive relue de bout en bout)                                               |
| Flutter (`flutter test`)           | 308 tests, 1 ignoré (lien, scan, matières et FDS)                                                                                    |
| CI GitHub (5 jobs)                 | au vert sur `a6bbebb` et `6615a57` ; `8af69da` arrêté au lint du schéma, `60d3b59` au test de la version déclarée ; corrigés ensuite |

Points couverts :

- QR code : lien lu et refusé (origines, formats), modules dessinés sur la première page seulement,
  titre rétréci à côté ; scan vers un site installé, code étranger, site absent ;
- matières : classes, quantité et unité, n° ONU, FDS d'un autre site ou d'une autre catégorie,
  cohérence zone/niveau/bâtiment, lecteur et autre SIS, audit ; instantané avec et sans fiche,
  comparaison, avertissement ; PDF ; tablette avec FDS installée ou absente ;
- export : partage par parties, gros fichier copié, fichiers manquants listés, clôture et travail
  mort, purge, droits (lecteur, administrateur sans second facteur), archive téléchargée et contrôlée
  (empreinte de la partie, CSV des sites, manifeste, secrets absents).

Vérifié en local : l'exercice complet de l'export sur la pile locale (CSV des sites, manifeste, 120
lignes et plus). Sur l'émulateur et la tablette, l'APK 0.6.0 reste à installer et à essayer : scan du
QR d'un dossier imprimé, fiche d'une matière, ouverture de sa FDS.

## Décisions prises

- Complément de l'[ADR-014](decisions/ADR-014-etare-pdf.md) : QR code et matières dans le gabarit
  `etare-pdf/5`.
- [ADR-032](decisions/ADR-032-matieres-dangereuses.md) : table dédiée, FDS = document du site, section
  optionnelle de l'instantané.
- [ADR-033](decisions/ADR-033-export-reversibilite.md) : export par le worker, parties de 32 Mo, 7 jours,
  audit, purge.

## Écarts

- **QR code** : l'adresse publique doit être réglée sur le worker (`APP_BASE_URL`) ; les PDF publiés
  avant n'ont pas de code (republier pour l'obtenir). L'application demande désormais la permission
  caméra.
- **Matières** : pas de saisie assistée depuis la FDS (architecture §25), pas de phrases H/P, pas de
  position sur le plan (un lien vers un risque est la piste, ADR-032). Le portail exploitant ne les
  reçoit pas, comme les risques.
- **Export** : une seule archive par partie en mémoire (32 Mo) ; sur un SIS très volumineux, la copie
  des fichiers peut dépasser l'heure du travail (réexamen ADR-033). Les fonds de carte ne sont pas
  exportés. Le test d'intégration enrôle un second facteur sur le compte administrateur de
  démonstration et le retire ensuite ; un passage interrompu le laisse en place (nettoyage en SQL).
- **Poste de développement** : les chemins contenant des espaces cassent `pnpm mobile:release build`
  (arguments découpés) ; le chemin court Windows contourne.
- Au passage complet local, `offline-distribution` a échoué une fois au chargement du fichier, puis
  passé seul : à surveiller en CI.

## Dette technique

- Le compteur « Risques » de la tablette additionne risques, points à risque et matières ; un libellé
  distinct serait plus clair.
- L'export relit chaque fichier en mémoire pour en calculer l'empreinte ; une copie côté serveur (S3)
  l'éviterait.

## Prochaine étape

- Activer sur la préproduction : migrations du sprint, `APP_BASE_URL`, redéploiement, APK 0.6.0 sur la
  tablette ; puis Scaleway (sauvegarde hors site, e-mails) dès que le porteur ouvre les ressources.
- Reprendre la tranche R4/R5 : cérémonie des clés, mesures sur la tablette en release, EXP-05, SEC-06.
