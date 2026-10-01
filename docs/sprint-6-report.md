# Sprint 6 — rapport de livraison

Validation locale du **1er octobre 2026**, sur Windows, sur émulateur Android (API 36) et dans le
navigateur, puis CI GitHub sur `main` (branche unique). Trois commits : version minimale de
l’application (`f38e433`), documents « à la demande » (`9f02f43`), synchronisation en arrière-plan
(`c6745d7`). Aucun déploiement ; aucune donnée réelle.

Périmètre retenu (roadmap, fin de R1) : DOC-02, SYN-01 et SYN-02. Avec le Sprint 5, R1 est réalisé,
hors localisation GPS d’un signalement (DEC-04).

## Réalisé

### Lot A — version minimale de l’application (SYN-02)

- L’API peut exiger une version minimale de l’application OPS (`MOBILE_MIN_APP_VERSION`, facultative).
  Elle voyage dans le **catalogue signé** (`min_app_version`) : un intermédiaire ne peut ni l’ajouter
  ni la retirer.
- Une tablette trop ancienne n’installe aucune nouvelle version : les ETARE installés restent
  consultables, les sites retirés du catalogue le sont quand même, l’autorisation de consultation est
  renouvelée et l’accueil affiche « Application à mettre à jour » (détail dans « Compte et
  tablette » : version exigée, version installée, conséquence). Accusé `APP_UPDATE_REQUIRED`.
- Un catalogue ou un manifeste d’un format plus récent produit la même invitation, au lieu d’un refus
  « données invalides ».
- L’onglet « Terminaux » affiche la version exigée et signale les terminaux à mettre à jour.

### Lot B — documents « à la demande » (DOC-02)

- Les documents `on_demand` sont listés sur la tablette avec les documents essentiels, avec leur taille
  et leur état : à télécharger, sur la tablette, téléchargement en cours, échec. Les documents « jamais »
  restent au back-office.
- Téléchargement **explicite** depuis l’écran du document : requête signée par le terminal (auditée),
  fichier vérifié contre la taille et l’empreinte du manifeste signé de la version installée, rangé
  dans la base chiffrée seulement si cette version le référence encore.
- Conservation tant que la version installée le référence ; retrait par l’agent (« Retirer de la
  tablette », jamais un fichier obligatoire) ; purge à la révocation.
- Messages exacts : sans réseau (le document manque, il faudra du réseau), version qui n’est plus
  distribuée (synchroniser), fichier altéré (rien n’est enregistré).

### Lot C — synchronisation en arrière-plan (SYN-01)

- WorkManager Android (plugin `workmanager`, MIT) : passage toutes les heures, réseau disponible,
  batterie et stockage non faibles ; tâche enregistrée une fois pour toutes.
- Budget de 50 Mo par passage sur réseau quelconque : au-delà, la suite est reportée à une tâche unique
  en Wi-Fi (accusé `DOWNLOAD_DEFERRED`, message à l’agent). La synchronisation manuelle ou à l’ouverture
  reste sans limite.
- Une seule synchronisation à la fois : l’application ouverte mène celle que la tâche de fond lui
  confie ; sinon un bail atomique dans la base (schéma local v5), renouvelé, rendu, repris s’il est
  échu ; un moteur qui a perdu son bail n’active rien. L’application qui trouve le bail pris affiche
  « synchronisation en arrière-plan en cours », attend puis relit la base.
- Session partagée : avant de renouveler son jeton, l’application reprend la session déjà renouvelée
  par la tâche de fond (le rejeu d’un jeton de rafraîchissement serait traité comme un vol).
- Synchronisation au retour dans l’application (dernière tentative de plus de 15 minutes) ; commande
  manuelle conservée ; les signalements en attente partent dans le même passage.

## Structure

Nouveaux modules mobiles : `sync/application/document_downloader.dart`,
`ops/application/document_downloads.dart`, `sync/background/` (planification et point d’entrée de la
tâche), `sync/domain/sync_trigger.dart`. Domaine partagé : `isAppVersionBelow`. Dépendance mobile
ajoutée : `workmanager` (Flutter Community, MIT, WorkManager 2.11).

## Base de données

Aucune migration serveur. Base locale de la tablette : schéma v4 (`required_app_version`) et v5 (bail
de synchronisation), avec leurs tests de migration et de conservation des données.

## Sécurité

- Version minimale portée par le catalogue signé ; la version déclarée par la tablette n’est qu’une
  information d’administration.
- Documents « à la demande » : requête signée, vérification contre le manifeste signé, stockage
  chiffré, aucun fichier en clair.
- Arrière-plan : mêmes vérifications que la synchronisation manuelle, une seule à la fois, session
  reprise et jamais rejouée.

## Tests

| Suite                              | Résultat                                       |
| ---------------------------------- | ---------------------------------------------- |
| Unitaires et composants (`vitest`) | 267 tests, 47 fichiers                         |
| Base de données (pgTAP)            | 286 tests, 17 fichiers                         |
| Intégration (Auth → API → RLS)     | 82 tests, 17 fichiers, dont ClamAV en CI       |
| Flutter (`flutter test`)           | 158 tests, 1 ignoré (bout en bout sur demande) |
| CI GitHub (3 jobs)                 | tous les commits du sprint au vert             |

L’intégration couvre la version minimale dans le catalogue signé et dans l’administration, et le
document « à la demande » listé comme facultatif puis servi au terminal. Les tests Flutter couvrent le
téléchargeur (vérification, conservation entre versions, altération, réseau absent, version remplacée,
retrait), le bail (dont deux connexions concurrentes à la même base), le budget et le report en Wi-Fi,
le contrôleur, la délégation à l’application ouverte et la tâche autonome, la session partagée, la
reprise au retour et les migrations v3 → v4 → v5.

Vérifié sur émulateur Android contre la pile locale :

- **DOC-02** : document « à la demande » listé avec sa taille ; en mode avion, message exact ; réseau
  revenu, téléchargé, vérifié et lu (2 pages) ; toujours lisible après arrêt forcé et relance en mode
  avion.
- **SYN-02** : avec une version minimale 0.2.0 sur l’API locale, la tablette (0.1.0) garde ses ETARE,
  renouvelle son autorisation et invite à la mise à jour ; l’onglet « Terminaux » la signale ; version
  minimale retirée, l’alerte disparaît et la version suivante s’installe.
- **SYN-01** : tâche périodique planifiée par Android avec ses contraintes ; tâche confiée à
  l’application ouverte ; application fermée (processus tué comme le fait le système), démarrage à
  froid par Android : catalogue, téléchargement et installation de la version n° 6 publiée entre-temps,
  accusé de réception et relevé des signalements en 11 secondes ; ouverte ensuite en mode avion, la
  tablette affiche cette version et l’heure de ce passage.

Constat de l’essai : ré-enregistrer la tâche à chaque lancement (`update`) changeait la génération du
travail ; la tâche système de l’ancienne génération se terminait aussitôt et le travail continuait sans
elle, dans un processus « en cache » qu’Android 16 gèle. La tâche est désormais enregistrée une fois
pour toutes (`keep`, nom versionné) et un moteur qui a perdu son bail n’active rien. Un arrêt demandé
par l’utilisateur (`am kill`, « forcer l’arrêt ») produit le même gel par une autre voie (WorkManager
replanifie tout au démarrage) : à surveiller sur la tablette de référence, l’ouverture de l’application
reprenant alors la synchronisation.

## Décisions prises

- ADR-018 : synchronisation en arrière-plan (contraintes, budget, Wi-Fi, bail, session partagée,
  reprise au retour). ADR-015 complété (version minimale), ADR-016 complété (documents « à la
  demande », tâche de fond).

## Écarts

- **Tablette physique** : non disponible ; comportement d’Android (veille, compartiments, gel des
  processus en cache) à mesurer sur la tablette de référence.
- Fréquence horaire, budget de 50 Mo et recours au Wi-Fi : propositions à arbitrer avec le SIS (DEC-01).
- iOS : pas de tâche de fond (synchronisation à l’ouverture, au retour et à la demande).
- Localisation GPS d’un signalement (DEC-04) : toujours reportée.
- Pas de contrôle d’espace libre avant un téléchargement (ADR-016).

## Dette technique

- Le plugin `workmanager` évolue vite (corrections Android 16 en août et septembre 2026) et écrit un
  marqueur sans donnée dans le répertoire temporaire : à surveiller à chaque mise à jour.
- Une installation plus longue que la durée d’une tâche WorkManager (environ 10 minutes) reprend au
  passage suivant ; pas de reprise par blocs d’un même fichier.
- Toujours à traiter avant le pilote : limitation de débit, second facteur exigé par l’API, CSP,
  purge des dépôts abandonnés, KMS pour les clés de signature.

## Prochaine étape

Sur nouvelle instruction : R2 portail exploitant, qui réutilisera la chaîne d’instruction des
signalements ; décisions R0 à engager (DEC-01 matériel et règles de synchronisation, DEC-04 accès) et
premier essai sur tablette physique.
