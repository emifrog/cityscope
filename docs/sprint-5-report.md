# Sprint 5 — rapport de livraison

Validation locale du **1er octobre 2026**, sur Windows, sur émulateur Android (API 36) et dans le
navigateur, puis CI GitHub sur `main` (branche unique). Six commits : roadmap et bilan du dépôt
(`de4f381`), signalements côté serveur (`6d42c48`), instruction par la Prévision (`d78f1a9`),
signalements sur la tablette (`5773faf`), lecteur PDF hors ligne (`6c09cbd`), antivirus ClamAV
(`0233b86`). Aucun déploiement ; aucune donnée réelle.

Périmètre retenu au lancement (roadmap, R1) : TER-01 à TER-05 et DOC-01, avec SEC-01 en parallèle.
Décisions prises par le porteur le 1er octobre, consignées dans l’ADR-017 : états du modèle de
données présentés à l’agent comme « en attente / reçu / traité », localisation par l’élément visé et un
point du plan publié (GPS reporté), file d’envoi liée à son auteur et purgée à la révocation.

## Réalisé

### Lot 0 — roadmap et bilan du dépôt

- Roadmap complète (R0 à R7) et bilan du 1er octobre intégrés au dépôt, avec une échelle d’état unique
  partagée par la roadmap et le suivi des exigences.
- Corrections convenues : OPS-01 à 03 « à qualifier » (émulateur seulement), OFF-01 rattaché à son
  critère, interprétation d’OFF-02 à faire accepter (DEC-08), seuil d’accès au risque critique à
  harmoniser (DEC-09), version minimale d’application ajoutée au backlog (SYN-02).

### Lot A — signalements côté serveur (OPS-04, TER-03)

- Un signalement est transmis par une requête signée du terminal enrôlé, avec le jeton de l’agent
  (`offline:download` et `field_report:create`), et vise la version publiée consultée.
- Réception une seule fois par (SIS, terminal, identifiant client) : un renvoi identique (accusé perdu)
  rend le même signalement et la même empreinte du contenu accepté ; un autre contenu sous le même
  identifiant est refusé (409).
- Élément visé (point, risque, zone) et point sur un plan vérifiés dans l’instantané de la version
  consultée ; heure du constat jamais dans le futur ; 5 photos au plus, images de 15 Mo au plus, par la
  chaîne de dépôt contrôlé.
- Constat immuable et jamais supprimé ; instruction `new` → `triaged` → `resolved` ou `rejected`,
  motivée et définitive, affectation à un membre du SIS, lien vers la révision en brouillon qui porte la
  correction ; audit.
- Une photo jointe à un signalement n’inscrit pas l’agent parmi les auteurs des données de travail :
  la séparation des tâches de la validation reste intacte.
- Suite donnée à l’agent : `GET /sync/reports` (état, motif, révision liée et numéro de sa publication).

### Lot B — instruction par la Prévision (TER-04)

- Page « Signalements » : à traiter (avec compteur), traités, tous ; gravité, catégorie, élément visé,
  version consultée, agent, état, pagination.
- Détail : constat, version consultée comparée à la version publiée actuelle, état actuel de l’élément,
  position sur le plan, photos contrôlées.
- Prise en charge, ouverture d’une révision ou intégration au brouillon du site, décision « traité » ou
  « rejeté » motivée, lue par l’agent ; indicateur au tableau de bord ; signalements intégrés affichés
  sur l’écran de validation de la révision.

### Lot C — signalements sur la tablette (TER-01, TER-02, TER-05)

- Saisie hors ligne depuis la synthèse d’un site, la fiche d’un point, d’un risque ou d’une zone, ou par
  appui long sur le plan : catégorie, importance, description, photos (appareil photo du système ou
  galerie, compressées à la prise ; la copie temporaire est supprimée dès lecture).
- File chiffrée (schéma local v3 dans SQLCipher), liée à l’auteur : invisible des autres utilisateurs,
  conservée à la déconnexion (avertissement), purgée à la révocation avec le nombre de signalements
  effacés indiqué.
- Envoi après chaque synchronisation et à la demande : corps reconstruit à l’identique, photos par URL
  signée (un fichier déjà présent compte comme reçu), demande de contrôle, nouvel essai à délai
  croissant ; un refus du serveur est signalé à l’agent.
- « Mes signalements » : en attente d’envoi, reçu, traité ou rejeté avec le motif de la Prévision et la
  version qui corrige ; pastille du nombre en attente sur l’accueil.

### Lot D — lecteur PDF hors ligne (DOC-01)

- PDF lus dans l’application avec `pdfrx` (moteur PDFium), ouverts depuis la mémoire après lecture dans
  la base chiffrée : aucun fichier en clair ; zoom, pages précédente et suivante, message si illisible.
- Dossier ETARE (PDF de la version installée) accessible depuis la synthèse du site ; documents
  essentiels lus de la même façon.

### Lot E — antivirus (SEC-01)

- ClamAV par le démon clamd (commande `INSTREAM`) : fichier sain admis, infecté refusé (`MALWARE`),
  au-delà de la limite du démon refusé (`UNSCANNABLE`) ; démon injoignable, en erreur ou muet : le
  travail est rejoué et le fichier reste en quarantaine.
- `ANTIVIRUS_URL` obligatoire en préproduction et en production ; en développement seulement, sans
  démon, le verdict `not_scanned` reste explicite.

## Structure

Nouveaux modules : `domain/field-reports`, `contracts/field-reports`, `application/field-reports`,
adaptateurs `postgres/field-report-repository` et `antivirus/clamav` ; web `signalements/*` ; mobile
`features/reports` (domaine, DAO `reports_dao`, expéditeur, écrans), `ops/presentation/pdf_reader.dart`.
Le terminal de test des intégrations est partagé (`tests/integration/terminal.ts`), de même que l’app OPS
des tests Flutter (`test/features/ops/ops_app.dart`). Dépendances mobiles ajoutées : `image_picker`
(flutter.dev, Apache-2.0) et `pdfrx` (MIT, moteur PDFium sous licence BSD).

## Base de données

| Migration                          | Objet                                                                                                                 |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `20261005000100_field_reports.sql` | signalements et photos, permission `field_report:review`, fonctions des terminaux, photos exclues des auteurs du site |

Le schéma `app` passe `supabase db lint` sans avertissement.

## Sécurité

- Signalements : requêtes signées par le terminal, idempotence et empreinte côté serveur, vérification
  dans la version consultée, constat immuable, instruction réservée à la Prévision, isolation multi-SIS
  testée (autre SIS, lecteur, agent sans droit).
- Tablette : photos et signalements uniquement dans la base chiffrée ; PDF lus en mémoire ; aucune
  permission caméra, stockage ni localisation demandée.
- Antivirus obligatoire hors développement ; aucune admission silencieuse quand le démon manque.

## Tests

| Suite                              | Résultat                                       |
| ---------------------------------- | ---------------------------------------------- |
| Unitaires et composants (`vitest`) | 263 tests, 47 fichiers                         |
| Base de données (pgTAP)            | 286 tests, 17 fichiers                         |
| Intégration (Auth → API → RLS)     | 80 tests, 17 fichiers, dont ClamAV réel en CI  |
| Flutter (`flutter test`)           | 120 tests, 1 ignoré (bout en bout sur demande) |
| CI GitHub (3 jobs)                 | tous les commits du sprint au vert             |

L’intégration couvre la boucle complète : envoi d’un signalement avec photo depuis un terminal enrôlé,
renvoi après accusé perdu (un seul signalement), fichier envoyé deux fois, photo contrôlée, refus d’un
élément absent de la version, instruction réservée à la Prévision, intégration au brouillon, décision
motivée et définitive, publication de la correction, suite donnée vue par le terminal. Les tests Flutter
couvrent l’expéditeur (rejeu, doublon, hors ligne, refus, isolation entre agents, purge) et les parcours
de saisie depuis le site, la fiche et le plan, ainsi que la lecture des PDF.

Vérifié sur émulateur Android contre la pile locale : signalement en mode avion depuis le plan avec une
photo de l’appareil photo du système, arrêt forcé puis relance (signalement conservé), envoi au retour
du réseau, instruction dans le back-office, retour « traité : rejeté » avec le motif ; PDF ETARE lu en
mode avion (3 pages) ; aucun fichier en clair dans le stockage de l’application. Dans le navigateur :
liste, détail, prise en charge, ouverture de révision, intégration et décision.

## Décisions prises

- ADR-017 : signalements terrain (origine terminal, idempotence, photos, instruction, retour, file
  locale) ; ADR-009 complété (antivirus ClamAV) ; ADR-016 complété (file des signalements, PDF en
  mémoire).

## Écarts

- **Tablette physique** : non disponible ; OPS-01 à 04 restent « à qualifier ».
- Localisation GPS d’un signalement et sort de la file non transmise à la révocation : décisions du
  porteur à confirmer avec le SIS (DEC-04).
- Aucun canal de notification de la Prévision : compteur et liste seulement (portail exploitant, R2).
- Documents « à la demande » (DOC-02), synchronisation en arrière-plan (SYN-01) et version minimale
  d’application (SYN-02) : non réalisés, prévus en fin de R1.
- Photos des objets toujours absentes du PDF ETARE (MET-05).
- Durée de conservation des signalements et de leurs photos à décider (DEC-07).

## Dette technique

- `image_picker` conserve dans ses préférences le chemin de la dernière prise (fichier déjà supprimé,
  sans contenu) ; à purger si l’analyse de risques l’exige.
- ClamAV : mise à jour des signatures, supervision du démon et `StreamMaxLength` ≥ 50 Mo à organiser
  avec l’exploitation.
- Toujours à traiter avant le pilote : limitation de débit, second facteur exigé par l’API, CSP,
  purge des dépôts abandonnés, KMS pour les clés de signature.

## Prochaine étape

Sur nouvelle instruction : fin de R1 (DOC-02, SYN-01, SYN-02), puis R2 portail exploitant, qui
réutilisera la chaîne d’instruction des signalements ; décisions R0 à engager (DEC-01 matériel,
DEC-04 accès) et premier essai sur tablette physique.
