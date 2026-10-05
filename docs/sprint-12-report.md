# Sprint 12 — rapport de livraison

Validation locale du **5 octobre 2026** sur Windows. La CI GitHub tourne sur `main` (branche unique).
Cinq commits :

- clés de signature en coffre, jeu de clés signé et rotation (`63466e6`) ;
- jeu de clés de signature sur la tablette (`81f808d`) ;
- supervision de la plateforme et tableau du SIS (`8da86ff`) ;
- volumétrie de 10 000 sites et coût des périmètres (`f6bb6e8`) ;
- ce rapport.

Aucun déploiement, aucune donnée réelle.

Périmètre : R4, avec SEC-04 (secrets et rotation des clés de signature), EXP-03 (supervision) et CAP-01
(volumétrie). Choix du porteur du 5 octobre :

- **clés** : fichier de secret ou moteur Transit d’OpenBao (ou de Vault) ; la variable d’environnement
  reste réservée au développement et aux tests ;
- **rotation** : une racine hors ligne embarquée dans l’application signe un jeu de clés (active,
  retirée, révoquée, numéro croissant) ; rotation et révocation se font sans nouvelle version de
  l’application, le worker re-signant les contenus ;
- **supervision** : métriques au format texte de Prometheus sans dépendance nouvelle, propagation de la
  trace W3C, règles d’alerte et procédures versionnées, onglet Supervision du SIS ; l’export
  OpenTelemetry viendra plus tard ;
- **volumétrie** : banc local reproductible sur deux SIS fictifs, chiffres dans le rapport, points chauds
  corrigés, version réduite en CI.

## Réalisé

### Lot A — clés en coffre, jeu de clés signé, rotation (SEC-04)

- **Sources des clés** de publication et de catalogue :
  - fichier de secret (`*_SIGNING_KEY_FILE`, PEM ou base64) ;
  - moteur Transit d’OpenBao ou de Vault (`*_SIGNING_TRANSIT_KEY`). La signature se fait par la
    version de clé active du jeu, avec un jeton lu dans un fichier, puis est revérifiée localement ;
  - en préproduction et en production : la clé en variable d’environnement est refusée, le jeu de clés
    et les racines sont exigés, et Transit doit passer en HTTPS.
- **Politiques OpenBao** (`infra/openbao`) :
  - le jeton de l’API ne signe jamais avec la clé des publications, n’exporte ni ne fait tourner
    aucune clé (refus 403 vérifiés) ;
  - le worker ne signe qu’avec la clé des publications ; la rotation relève de la politique de
    cérémonie.
- **Jeu de clés** (contexte `etare.keyset.v1`) :
  - identifiant de clé dérivé de la clé publique ;
  - statuts : active, retirée (encore crue pour les publications, jamais pour un catalogue), révoquée ;
  - numéro croissant ; une seule clé active par usage ;
  - signé par la racine hors ligne et servi par `GET /sync/keyset`.
    L’API refuse de signer avec une clé qui n’est pas active dans le jeu.
- **Re-signature** :
  - tables `publication_signature` et `basemap_pack_signature` ;
  - travail `signatures.renew` du worker, qui revérifie l’empreinte et une signature d’origine avant de
    signer à nouveau ;
  - l’API sert la signature la plus récente d’une clé crue, ou répond 503.
- **Outillage** :
  - `pnpm keys` (racine, génération, clé publique, Transit, signature du jeu, affichage) ;
  - `pnpm setup:local` garde le jeu tant que les clés ne changent pas, sinon il le renumérote et retire
    les anciennes.
- **Documentation** : [ADR-027](decisions/ADR-027-signing-keys-rotation.md) et procédures de cérémonie,
  de rotation et de compromission ([clés de signature](exploitation/cles-de-signature.md)).

### Lot B — jeu de clés sur la tablette (SEC-04)

- La tablette récupère le jeu de clés avant le catalogue et le vérifie par la racine embarquée. Elle
  refuse :
  - un jeu ancien (`KEYSET_REPLAYED`) ;
  - deux jeux de même numéro différents (`KEYSET_CONFLICT`) ;
  - une signature invalide ou un jeu mal formé ;
  - un jeu d’un format plus récent, qui demande une mise à jour de l’application.
- Elle conserve le dernier jeu accepté (base locale v8) et le déclare dans ses accusés.
- **Rotation et révocation sans retéléchargement** :
  - les publications et les fonds déjà installés sont revérifiés par leur nouvelle signature, sans
    retélécharger les fichiers ;
  - à la révocation d’une clé, les sites sensibles ouverts sont refermés.
- La racine est obligatoire hors développement. Application 0.4.0.
- Administration › Terminaux : numéro du jeu servi et numéro détenu par chaque tablette.

### Lot C — supervision (EXP-03)

- **Métriques** : `GET /api/v1/metrics` au format texte de Prometheus.
  - Protégé par `METRICS_TOKEN`, comparé en temps constant ; répond 404 sans jeton configuré ; chaque
    refus est tracé.
  - Côté API : requêtes par route et statut, durées, pool SQL.
  - Côté plateforme, lu en base par `app.platform_metrics()` : travaux (attente et calcul séparés,
    morts), workers vivants, publications (délai, bloquées, en échec), parc et fraîcheur, accusés et
    erreurs d’intégrité, fichiers, signalements, fonds de carte, notifications, refus de sécurité,
    taille de la base.
  - Jamais un identifiant dans une étiquette.
- **Corrélation** :
  - trace W3C (`traceparent`) reprise ou créée, renvoyée et journalisée avec chaque requête ;
  - transmise aux travaux enfilés, que le worker journalise avec leur durée et leur code d’échec.
- **Base** :
  - chronologie des travaux (`started_at`, `first_started_at`) ;
  - battement de cœur des workers ;
  - historique des accusés des tablettes ;
  - purge horaire `maintenance.database` ;
  - santé à 503 quand la base ne répond plus.
- **Alertes** (`infra/monitoring/prometheus/alerts.yml`) :
  - 22 règles avec gravité, responsable (exploitation ou SIS), impact et lien vers leur procédure
    ([supervision](exploitation/supervision.md)) ;
  - seuils du pilote (§29) ;
  - un test vérifie chaque métrique citée et chaque procédure.
- **Onglet Supervision du SIS** (`audit:read`) :
  - publications, terminaux, synchronisations, signalements, fichiers, notifications et fonds ;
  - chaque point d’attention renvoie à l’onglet où agir.
- [ADR-028](decisions/ADR-028-supervision.md).

### Lot D — volumétrie (CAP-01)

- **Banc** `pnpm bench:volume` sur deux SIS fictifs, soit 10 000 sites, 250 000 objets, 6 000 versions
  signées, 500 terminaux, 100 000 travaux et 561 000 événements d’audit (1,15 Go).
  - Mesures par l’API réelle (jetons, RLS) et charge de 100 sessions ; les données sont retirées à la
    fin.
  - En CI, une version réduite (1 000 sites) échoue sur toute requête en erreur.
- **Défaut bloquant trouvé et corrigé** : les périmètres étaient évalués ligne à ligne.
  - Un membre limité à un secteur attendait 1,6 à 9,8 s, avec des erreurs 500 sur ses dossiers et sa
    carte. Il descend à 16–60 ms.
  - Le catalogue d’une tablette de secteur passe de 2 s à 40 ms.
- **Autres corrections** :
  - permissions de chaque requête en une seule requête ;
  - `has_permission` en PL/pgSQL ;
  - recherche par les index trigrammes malgré la RLS : 45 → 13–23 ms ;
  - compteurs des dossiers en un passage : 61 → 27 ms ;
  - lectures de l’instantané d’un dossier en séquence.
- **Charge** : 170 → 292 requêtes/s, p95 sous 420 ms (objectif de 500 ms), sans erreur.
- [Rapport de volumétrie](volumetrie/cap-01.md).

## Base de données

Trois migrations :

- re-signatures après une rotation (`publication_signature`, `basemap_pack_signature`), travail
  `signatures.renew`, jeu de clés déclaré par les tablettes ;
- supervision : chronologie des travaux, battements de cœur, historique des accusés, purge,
  `platform_metrics`, `tenant_supervision` ;
- périmètres évalués par ensemble (65 politiques réécrites), recherche par les index trigrammes,
  `current_permissions` en une requête, `has_permission` en PL/pgSQL.

## Tests

| Suite                              | Résultat                                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------------- |
| Unitaires et composants (`vitest`) | 437 tests, 69 fichiers                                                                            |
| Base de données (pgTAP)            | 648 tests, 34 fichiers (dont 290, 300 et 310 pour ce sprint)                                      |
| Intégration (Auth → API → RLS)     | 149 tests, 33 fichiers, dont `antivirus` (ClamAV) et `signing-keys` (OpenBao), optionnels hors CI |
| Flutter (`flutter test`)           | 236 tests, 1 ignoré (bout en bout sur demande)                                                    |
| Banc de volumétrie                 | 10 000 sites en local ([rapport](volumetrie/cap-01.md)), 1 000 sites en CI                        |
| CI GitHub (3 jobs)                 | au vert sur `2df7f72` (base neuve, ClamAV, OpenBao, banc réduit) ; voir Écarts                    |

En local, le test pgTAP 260 (liste exacte des sites d’un secteur) échoue toujours : la base de
développement garde les sites d’essai des tests d’intégration. La CI part d’une base neuve.

Points couverts par les tests :

- jeu de clés :
  - identifiants dérivés, statuts, une seule clé active, refus d’une clé non active ;
  - signature par la racine, rejeu et conflit refusés ;
- signature par Transit, avec la version de clé du jeu, revérifiée localement ;
- re-signature par le worker, dont le refus d’un contenu dont l’empreinte ne correspond plus ;
- sur la tablette :
  - jeu accepté, ancien, en conflit, mal signé ;
  - revérification des fonds sans retéléchargement ;
  - migration v7 → v8 ;
- métriques :
  - jeton exigé, aucun identifiant dans les étiquettes ;
  - worker vivant puis arrêté ;
  - trace d’une requête retrouvée dans le travail qu’elle enfile ;
  - règles d’alerte cohérentes avec les métriques et les procédures ;
- périmètres :
  - mêmes sites que `has_permission`, `site_in_sector` et `device_covers_site` ;
  - plus aucune politique ligne à ligne ;
  - recherche limitée au SIS courant et lue sous RLS.

Vérifié sur l’émulateur Android (APK de débogage 0.4.0, pile locale, OpenBao de développement) :

- mise à jour vers 0.4.0 et migration de la base locale. Après un réenrôlement sur le secteur de Nice,
  l’accusé déclare le jeu n° 1 ;
- **rotation** (jeu n° 2 : ancienne clé retirée, nouvelle active) :
  - le worker re-signe 20 publications et 9 fonds, sans contenu invérifiable ;
  - la tablette les accepte sans rien retélécharger ;
- **révocation** (jeu n° 3) :
  - une seule lecture du manifeste d’une publication et d’un fond, aucun fichier retéléchargé ;
  - la base de la plateforme enregistre le jeu n° 3 ;
  - la synchronisation suivante ne revérifie plus rien, et le site s’ouvre.

Vérifié dans le navigateur, sur la pile locale, avec un second facteur de test retiré ensuite :

- onglet Supervision : points d’attention et tuiles ;
- onglet Terminaux : « Jeu de clés de signature servi : n° 3 », et l’émulateur en « application 0.4.0 ·
  clés n° 3 ».

## Décisions prises

- [ADR-027](decisions/ADR-027-signing-keys-rotation.md) : clés en coffre (fichier ou Transit), racine
  hors ligne, jeu de clés signé, re-signature par le worker, procédures de cérémonie et de compromission.
- [ADR-028](decisions/ADR-028-supervision.md) : métriques au format Prometheus sans dépendance nouvelle,
  trace W3C, alertes versionnées, tableau du SIS ; OpenTelemetry plus tard.
- Image officielle d’OpenBao (`quay.io/openbao/openbao`, MPL 2.0) pour le développement et la CI.
- CAP-01 : la recherche lit les identifiants par une fonction hors RLS, réservée à l’API, puis relit
  les sites sous RLS ([sécurité](security.md)).

## Écarts

- **Clés** :
  - le KMS d’un fournisseur reste à choisir avec l’hébergement (DEC-03) ;
  - la première cérémonie (racine, racine de secours, procès-verbal) est à tenir avec le RSSI avant la
    préproduction ;
  - la compromission de la racine sans racine de secours embarquée exige une nouvelle version de
    l’application.
- **Supervision** : collecteur et outil d’alerte à choisir avec l’hébergeur ; seuils à ajuster après le
  pilote ; export OpenTelemetry non fait.
- **Volumétrie** :
  - mesurée sur un poste de développement, les valeurs absolues sont à confirmer en préproduction
    (EXP-01) ;
  - le transfert réel des paquets vers les tablettes, sur réseau et tablette réels, reste à mesurer en R5 ;
  - le volume réel d’un fond de secteur attend le Plan IGN.
- **CI** : au vert sur `2df7f72`, avec les migrations rejouées depuis une base neuve, pgTAP,
  l’intégration contre ClamAV et OpenBao, et le banc réduit. Pour y arriver :
  - les runners GitHub n’ont pas pris le job Base sur les lots B et C, ni le job Flutter sur les lots A
    et B (« not acquired by Runner ») ; les jobs exécutés étaient au vert ;
  - une fois le job Base exécuté, deux tests du sprint ont échoué. Ils ne réussissaient qu’en local. Ils
    sont corrigés (`700e25e`, `2df7f72`) :
    - le test pgTAP 310 supposait plus de deux sites dans le SIS 06 ; il crée désormais son site hors
      périmètre ;
    - le test de supervision laissait en file un travail `asset.verify`, que le test antivirus suivant
      prenait à la place du sien ;
  - en local, des échecs intermittents (503 « signature en cours de renouvellement ») venaient d’un
    worker de développement orphelin. Lancé avant la rotation, il gardait la clé révoquée depuis, et il
    prenait des travaux des tests. Il a été arrêté ; deux exécutions complètes en ordre aléatoire sont
    passées ensuite.

## Dette technique

- Compteurs des dossiers recalculés à chaque page : premier consommateur de la base sous charge (40 ms).
  Il faudra des compteurs entretenus ou mis en cache au-delà de 20 000 sites par SIS.
- La recherche dans les dossiers (nom, n° ETARE) filtre encore les lignes : 56–63 ms.
- Les agrégats de `platform_metrics` sont recalculés à chaque collecte (0,4 s sur le banc) : intervalle de
  collecte d’au moins 30 s.
- Une requête de l’API fait 4 à 6 allers-retours vers la base. À mesurer avec la latence réseau de
  l’hébergeur.

## Prochaine étape

Suite de R4, sans attendre l’hébergement :

- SEC-05 (terminal : expiration, rotation de la clé locale, horloge manipulée, tablette partagée) ;
- CAP-02 (gros fichiers sur la tablette : espace libre, réserve, mémoire) ;
- EXP-04 (livraison mobile : clé Android dédiée, paquet release, mise à jour).

Avec la décision d’hébergement (DEC-03) :

- EXP-01 (préproduction, déploiement coordonné) et EXP-02 (sauvegarde et restauration mesurées) ;
- première cérémonie des clés ;
- mesure de CAP-01 en préproduction.

Dès la fiche de droits validée et la tablette livrée : activation du Plan IGN sur un secteur pilote et
qualification de CAR-01 sur matériel.
