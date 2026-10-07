# Application OPS (Flutter)

Application mobile **opérationnelle** de **FireScape**, la plateforme ETARE numérique :
consultation terrain des plans ETARE par les sapeurs-pompiers (SIS/SDIS).
Android en priorité, structure compatible iOS.

> Sprint 4 : enrôlement de la tablette, synchronisation signée et
> installation hors ligne chiffrée des ETARE publiés (ADR-015, ADR-016).

Nom commercial : **FireScape** (libellé sous l'icône et sur les écrans).
L'identifiant d'application `fr.etare.ops` reste **provisoire** : il sera fixé
avec le domaine de publication avant la première diffusion (le changer ensuite
imposerait de réinstaller et de réenrôler chaque tablette).

---

## 1. Prérequis

| Outil | Version | Remarque |
|---|---|---|
| Flutter | 3.47.x stable (Dart 3.13) | `flutter --version` |
| JDK | 17+ | le JBR d'Android Studio convient |
| Android SDK | plateforme/Build-Tools récents, licences acceptées | `flutter doctor` |
| Émulateur Android | API 24+ | `minSdk` = 24 |
| Tablette de référence | Alldocube iPlay 40H, Android 11 (API 30) | DEC-01 ; qualification physique à venir |

**Accès réseau au premier build** : `package:sqlite3` télécharge sa
bibliothèque native (SQLCipher) depuis les *releases* GitHub de
`simolus3/sqlite3.dart` (empreintes SHA-256 vérifiées) ; Gradle télécharge
son wrapper et ses dépendances.

```bash
cd apps/mobile
flutter pub get
```

## 2. Configuration (`--dart-define`)

| Clé | Défaut | Rôle |
|---|---|---|
| `ENV` | `dev` | `dev` \| `staging` \| `prod` (HTTPS obligatoire hors `dev`) |
| `API_BASE_URL` | `http://10.0.2.2:3000/api/v1` | API produit |
| `AUTH_URL` | `http://10.0.2.2:54321/auth/v1` | Supabase Auth (GoTrue) |
| `AUTH_PUBLISHABLE_KEY` | *(vide)* | clé **publishable** Supabase (publique par conception) |
| `TRUSTED_SIGNING_KEYS` | *(vide)* | clés publiques approuvées : `root:<id>:<base64>` (clé racine des jeux de clés, obligatoire hors `dev`), puis `publication:<id>:<base64>;catalog:<id>:<base64>` pour le premier contact (SEC-04, ADR-027) |

La configuration est validée au démarrage : si elle est invalide (clé
absente, URL incorrecte, HTTP hors `dev`, clé **secrète** / `service_role`
détectée…), l'application affiche un **écran d'erreur de configuration** et
n'effectue aucun appel réseau.

`10.0.2.2` est l'adresse de la machine hôte vue depuis l'émulateur Android.

## 3. Lancer contre la pile locale (émulateur Android)

1. Démarrer la pile locale (Supabase + API) — voir le README racine.
2. Récupérer la clé *publishable* locale (`supabase status`, ligne
   « Publishable key »).
3. Le fichier de configuration local (ignoré par git)
   `dart_defines.local.json` est écrit par `pnpm setup:local` à la racine :
   clé publishable, port d'Auth et clés publiques de signature locales.

4. Lancer :

   ```bash
   flutter emulators --launch <id_emulateur>
   flutter run --dart-define-from-file=dart_defines.local.json
   # ou directement :
   flutter run --dart-define=AUTH_PUBLISHABLE_KEY=sb_publishable_xxx
   ```

Se connecter avec un compte invité existant (pas d'inscription dans
l'application : produit sur invitation).

**Fichiers des paquets (émulateur aussi)** : les URL de téléchargement signées
sont construites avec l'adresse du stockage vue par le serveur
(`http://127.0.0.1:54321/storage/...`), que la tablette ne joint pas
directement. En local, rediriger ce port avant de synchroniser :

```bash
adb reverse tcp:54321 tcp:54321
```

En préproduction et production, le stockage est servi par une URL HTTPS
publique : rien à faire.

**Appareil physique** : rediriger les ports puis utiliser `localhost` :

```bash
adb reverse tcp:3000 tcp:3000 && adb reverse tcp:54321 tcp:54321
flutter run --dart-define=API_BASE_URL=http://localhost:3000/api/v1 \
            --dart-define=AUTH_URL=http://localhost:54321/auth/v1 \
            --dart-define=AUTH_PUBLISHABLE_KEY=sb_publishable_xxx
```

HTTP en clair n'est autorisé que dans la variante **debug** et uniquement vers
`10.0.2.2`, `localhost` et `127.0.0.1`
(`android/app/src/debug/res/xml/network_security_config.xml`).

## 4. Qualité : analyse, tests, build

```bash
flutter analyze                 # doit afficher « No issues found! »
flutter test                    # tests unitaires + widgets
dart run build_runner build     # après toute modification du schéma Drift
dart run drift_dev make-migrations  # nouvelle version du schéma : instantané + test
flutter build apk --debug       # APK de développement (variante prod)
```

- Les fichiers générés (`*.g.dart`) sont **versionnés** ; ils sont exclus de
  l'analyse. Relancer `build_runner` après modification des tables/DAO.
- Premier build Android : le plugin Gradle Android installe automatiquement
  les composants manquants dont la licence est **déjà** acceptée
  (plateforme 36, NDK 28.2, CMake 3.22). Si les licences ne le sont pas :
  `flutter doctor --android-licenses` (action manuelle du développeur).
- Si `~/.gradle/gradle.properties` impose une mémoire trop faible
  (`OutOfMemoryError: Metaspace` pendant D8), surcharger ponctuellement :

  ```bash
  GRADLE_OPTS='-Dorg.gradle.jvmargs="-Xmx4g -XX:MaxMetaspaceSize=1g"' \
    flutter build apk --debug
  ```
- Les tests n'utilisent ni réseau ni stockage réel : `HttpClientAdapter`
  factice pour Dio, stockage sécurisé en mémoire, base Drift en mémoire.
- Les tests de chiffrement (`test/data/local/encrypted_database_test.dart`)
  s'exécutent sur l'hôte avec **la même build SQLCipher** que l'appareil.
- La synchronisation est testée contre un serveur simulé qui signe
  réellement (Ed25519) et vérifie la signature de chaque requête de la
  tablette (`test/features/sync/`) : installation, différentiel, retrait,
  signatures falsifiées, fichier corrompu, rejeu, coupure et reprise,
  révocation, horloge décalée.
- Test de bout en bout **optionnel** contre la pile locale
  (`test/e2e/local_stack_sync_test.dart`, ignoré sans `ETARE_E2E_API`) :
  enrôlement et synchronisation réels auprès de l'API TypeScript.

## 4 bis. Variantes et livraison (EXP-04, ADR-030)

- Deux variantes Android : `prod` (`fr.etare.ops`, « FireScape », celle de
  `flutter run` par défaut) et `staging` (`fr.etare.ops.staging`,
  « FireScape préprod »), installables côte à côte : `--flavor staging`.
- La release n'est **jamais** signée par la clé de debug : Gradle lit la clé
  désignée par `ETARE_ANDROID_SIGNING` (ou `android/key.properties`, ignoré
  par git) et s'arrête sans elle. R8 et réduction des ressources actifs.
- En release, l'application refuse de démarrer en environnement `dev` ou
  dans un environnement qui n'est pas celui de sa variante.
- Livraison : `pnpm mobile:release signing-key | build | verify` à la
  racine (clé créée hors ligne, APK tracé : SHA-256, commit, certificat),
  procédure dans `docs/exploitation/livraison-mobile.md`.
- « Compte et tablette » affiche la version, la variante et le commit, et la
  page des licences (paquets, SQLCipher, OpenSSL, glyphes Noto Sans).

## 5. Architecture

```
lib/
  main.dart                 point d'entrée → bootstrap()
  src/
    bootstrap.dart          config → base chiffrée → ProviderScope
    app.dart                MaterialApp.router (thème, locale fr)
    core/                   transverse, sans logique métier
      config/               AppConfig (dart-defines + validation)
      di/                   racine de composition Riverpod (Dio, config, base)
      domain/               types partagés (CursorPage)
      errors/               AppException, ApiException…, messages FR
      formatting/           formats d'affichage
      json/                 lecture JSON défensive (strict-casts)
      logging/              AppLogger (local, secrets masqués)
      network/              Dio, AuthInterceptor, mapping des erreurs
      routing/              go_router + redirection d'authentification
      storage/              SecureStore (flutter_secure_storage)
      theme/                brand.dart (identité) + app_theme.dart
    data/
      local/                Drift : tables, DAO, ouverture SQLCipher
      remote/               EtareApiClient + DTO (provisoires)
    features/<feature>/
      domain/               modèles + interfaces de repository
      application/          providers / contrôleurs Riverpod
      data/                 implémentations (API, Drift, GoTrue)
      presentation/         écrans et widgets
```

Fonctionnalités présentes : `auth` (connexion/déconnexion, session),
`account` (`/me`, SIS actif), `sites` (repository `/sites`, sans écran),
`sync` (enrôlement, synchronisation signée, installation hors ligne,
fraîcheur), `ops` (synthèse d'un site, listes risques / accès / eau /
coupures / contacts / documents, plans tactiles avec calques et fiches,
photos des points en plein écran, lus sur la tablette), `home` (recherche locale et fraîcheur), `account` (compte,
SIS, état de la tablette, déconnexion), `startup` (attente, erreurs de
démarrage).

Principes :

- **Dépendances vers l'intérieur** : `presentation → application → domain`,
  `data` implémente les interfaces du `domain`. `core/di` est la seule racine
  de composition.
- **Client API remplaçable** : `EtareApiClient` et ses DTO écrits à la main
  seront remplacés par un client généré depuis l'OpenAPI ; seuls les
  repositories `data/` sont concernés.
- **Authentification** : adaptateur REST minimal vers Supabase Auth
  (`POST /token?grant_type=password|refresh_token`, `POST /logout`), sans
  `supabase_flutter`. L'`AuthInterceptor` ajoute `Authorization: Bearer`,
  `X-Tenant-Id` (SIS actif), rafraîchit **une fois** sur 401 puis rejoue la
  requête ; un rafraîchissement anticipé a lieu 60 s avant l'expiration.
- **Navigation** : `/splash` (restauration de session) → `/login` ou
  `/home` selon l'état d'authentification (`resolveRedirect`, testée).
- **Identité visuelle** : nom, logos et couleurs dans
  `lib/src/core/theme/brand.dart` ; libellés Android
  (`android/app/src/main/res/values/strings.xml`) et iOS
  (`ios/Runner/Info.plist`, `CFBundleDisplayName`) alignés. Logos
  (`assets/brand/`), icônes Android (classique, adaptative et monochrome) et
  iOS sont générés par `pnpm brand:assets` depuis les originaux de
  `assets/brand/` à la racine du dépôt.
- **UX terrain** : cibles tactiles ≥ 48 dp (boutons principaux 56 dp),
  textes agrandis, contrastes élevés ; jamais de texte blanc sur l'orange du
  logo (3,3:1) : les actions utilisent l'orange foncé `accentStrong` (4,9:1).

## 6. Chiffrement de la base locale

- **Moteur** : `package:sqlite3` ≥ 3 embarque sa bibliothèque native via les
  *build hooks* Dart. La build **SQLCipher** est sélectionnée dans
  `pubspec.yaml` :

  ```yaml
  hooks:
    user_defines:
      sqlite3:
        source: sqlcipher
  ```

  Les anciens paquets `sqlcipher_flutter_libs` / `sqlite3_flutter_libs` sont
  obsolètes : ils n'apparaissent dans `pubspec.lock` que sous forme de
  versions `+eol` vides, tirées par `drift_flutter`.
- **Clé** : 32 octets issus de `Random.secure()` générés au premier
  lancement, stockés dans `flutter_secure_storage` (Android Keystore,
  Keychain iOS `first_unlock_this_device`), jamais sur disque en clair.
- **Ouverture** (`lib/src/data/local/encrypted_database.dart`) : à chaque
  connexion, `PRAGMA key = "x'<clé hex>'"` est la **première** instruction
  (clé brute, sans dérivation), puis `PRAGMA cipher_version` est vérifié :
  s'il est vide, l'ouverture échoue et l'application affiche un écran
  d'erreur fatale (**aucun repli vers une base en clair**).
- **Récupération** : la base est un cache re-téléchargeable. Si la clé a
  disparu (réinstallation, reset du Keystore) ou ne correspond plus
  (`SQLITE_NOTADB`), le fichier est supprimé puis recréé.
- **Schéma v2** (Sprint 4) : `local_meta`, `sync_state` (génération
  installée et acceptée, dernière synchronisation et tentative, autorisation
  locale, accusé en attente), `installed_publication`, `publication_file`,
  `file_blob` (contenu des fichiers, par empreinte), `site_data`,
  `site_search`. Les fichiers des paquets sont DANS la base chiffrée
  (ADR-016). Migrations pas à pas dans `app_database.dart`, instantanés de
  chaque version dans `drift_schemas/`, test de migration avec données dans
  `test/drift/`.
- **Schéma v10** (Sprint 13, CAP-02) : fichiers rangés en morceaux de 1 Mio
  (`file_chunk`) ; `file_blob` garde le nombre de morceaux et, pendant un
  téléchargement, les octets reçus (section 8 quater).
- **Licences** : SQLCipher Community Edition (licence de type BSD) et
  OpenSSL (Apache 2.0) sur Android : textes dans `assets/licenses/`,
  affichés par la page des licences de « Compte et tablette » (EXP-04).
  Les binaires peuvent être servis depuis un dépôt interne via
  `hooks.user_defines.sqlite3.url_pattern`.

## 7. Sécurité par défaut

- Permissions Android : `INTERNET`, localisation à la demande (carte, Sprint 11).
- `android:allowBackup="false"` + `fullBackupContent` /
  `dataExtractionRules` excluant tous les domaines (sauvegarde cloud **et**
  transfert d'appareil) : ni jetons, ni clé, ni base dans les sauvegardes.
- HTTP en clair interdit en release/profile ; certificats système uniquement.
- Jetons et clé de base uniquement dans le stockage sécurisé (jamais
  `shared_preferences`).
- Aucun SDK d'analytics, de crash reporting ou de publicité.
- Journalisation locale (`dart:developer`) ne contenant jamais de jeton ni de
  mot de passe ; un filtre de masquage s'applique en plus par défense en
  profondeur. Les logs HTTP n'affichent que méthode, chemin et statut.
- Les clés `sb_secret_…` / JWT `service_role` sont refusées à la
  configuration.

## 7 bis. Code personnel et sites sensibles (PER-02, ADR-025)

- **Code personnel** :
  - six chiffres, choisis par chaque agent à sa connexion sur la tablette, saisis sur un pavé à grosses
    touches (aucun clavier système) ;
  - exigé au démarrage, après l'inactivité et au retour dans l'application, selon la politique du SIS
    (section 7 quater) ;
  - verrou posé au-dessus de toute la navigation, documents ouverts compris ;
  - cinq erreurs déconnectent l'agent, qui se reconnecte en ligne ; rien d'installé n'est effacé ;
  - rien du code n'est gardé : un sel, un vérificateur et le compte des essais, dans le stockage sécurisé.
    La clé est dérivée par PBKDF2-HMAC-SHA-256 (100 000 tours, dans un isolat) et mêlée à un secret de
    l'installation.
- **Sites « restreints »** :
  - listés par le catalogue signé (`on_demand`), jamais installés en masse ;
  - ouverts un à un, avec le réseau et le code ; le paquet est vérifié comme une synchronisation ;
  - le contenu est chiffré (AES-256-GCM) par une clé propre au site, elle-même chiffrée par la clé du
    code ;
  - le code est redemandé à chaque ouverture ; le site est effacé après 24 h, à la révocation, au
    changement d'agent ou au retrait de l'habilitation ;
  - les documents « à la demande » d'un site sensible ne sont pas proposés.
- **Journal** : chaque consultation d'un site sensible est mise en file chiffrée, puis remontée au
  journal du SIS après la synchronisation suivante (`POST /sync/access-events`, idempotent).
- **Limite connue** : qui détient à la fois la base et le secret de l'installation (stockage sécurisé
  Android) peut essayer le million de codes possibles ; la durée de 24 h borne l'exposition.

## 7 quater. Sécurité du terminal (SEC-05, ADR-029)

- **Clé du terminal** : ECDSA P-256 du Keystore Android (StrongBox si présent), jamais extractible.
  Une tablette enrôlée avant la 0.5.0 (clé Ed25519 logicielle) passe au Keystore à sa première
  synchronisation, par une rotation signée par l'ancienne clé ; une réponse perdue est reprise au
  passage suivant. Une clé du Keystore perdue (réinitialisation) purge la tablette, à réenrôler.
- **Plugin local** `packages/etare_platform` (Kotlin, `MethodChannel` `fr.etare.platform`) : clé du
  Keystore, horloge monotone (temps depuis le démarrage, veille comprise, et nombre de démarrages),
  espace libre, `FLAG_SECURE`. Sans implémentation (iOS, tests), l'application garde ses replis :
  clé logicielle, horloge de l'appareil bornée, pas de protection d'écran. Les tests remplacent
  `platformServicesProvider` (`test/support/fake_platform.dart`).
- **Politique du SIS** reçue avec le catalogue (`sync_state.terminal_policy`, schéma local v9) :
  inactivité (5 min par défaut), verrouillage en quittant l'application (immédiat par défaut ; voile
  pendant un délai), captures interdites par défaut (`FLAG_SECURE`), reconnexion par mot de passe
  (30 jours), consultation hors ligne (7 jours).
- **Heure de confiance** (`TrustedClock`, table `trusted_time`) : repère « heure du serveur + horloge
  monotone » posé à chaque catalogue ; sans redémarrage, l'horloge réglable n'est pas lue ; après un
  redémarrage, jamais sous la plus haute heure constatée. Elle sert à l'autorisation de consultation,
  aux sites sensibles et à la durée de session.
- **Révocation** : données, fonds, identité, clés du Keystore, session, code et secret de
  l'installation effacés ; base locale rechiffrée avec une nouvelle clé ; motif montré à la connexion.
- **Tablette partagée** : le code et le secret de l'installation de l'agent précédent sont effacés ;
  l'agent suivant ne voit rien, carte comprise, avant sa propre synchronisation.

## 7 ter. Carte hors ligne (CAR-01 à CAR-03, ADR-024)

- **Fonds de carte** :
  - un fichier PMTiles par secteur de la tablette, avec son style et ses pictogrammes, listé par le
    catalogue signé ;
  - manifeste signé par la clé des publications ; parties de 32 Mo vérifiées une à une puis ajoutées au
    fichier, reprise après coupure, fichier entier revérifié ;
  - stockés hors de la base chiffrée (`files/basemaps/`, donnée publique) ; index dans la table
    `installed_basemaps` (schéma local v7) ;
  - au-delà de 50 Mo, un fond attend une tâche Android sur réseau non limité (Wi-Fi) ; budget de 2 Go ;
  - l'ancienne version reste affichée jusqu'au remplacement ; un secteur qui n'est plus reçu perd son
    fond ; tout est effacé à la révocation, rien au changement d'agent.
- **Carte** (`maplibre_gl`, MapLibre Native) :
  - accessible depuis l'accueil (icône carte) et depuis la fiche d'un site (« Situer sur la carte ») ;
  - un secteur à la fois, avec un sélecteur quand la tablette en a plusieurs ;
  - sites installés (position lue dans les données publiées), points extérieurs du site visé, fiche
    ouverte d'un toucher ;
  - libellés en Noto Sans : glyphes PBF de `assets/map/glyphs/` (licence OFL 1.1, `OFL.txt`) copiés
    une fois dans `files/map-glyphs/`. Le moteur ne lit que des fichiers locaux ;
  - avertissements « fond non disponible ici », « détail non disponible ici », « aucun fond » et
    « aucune donnée opérationnelle » ; sans fond, les sites restent placés sur un aplat ;
  - attribution et date du fond affichées, distinctes de celles des ETARE ;
  - « Me situer » demande la localisation au premier usage (`permission_handler` 12, compatible avec le
    SDK de compilation 36) ; la position reste sur la tablette.
- **Tests de widgets** : la vue native n'existe pas sous `flutter test` ; `opsMapBuilderProvider` est
  remplacé par une doublure (`test/features/map/map_screen_test.dart`).

## 8. Hors ligne : enrôlement et synchronisation (ADR-015, ADR-016)

1. L'administrateur du SIS déclare la tablette (web, onglet « Terminaux ») et
   remet le code à usage unique.
2. Connecté, l'agent saisit le code : la tablette génère sa clé dans le
   Keystore Android (ECDSA P-256, Ed25519 logicielle sans Keystore), en prouve
   la détention, et n'en garde que l'alias (section 7 quater).
3. À l'ouverture de l'accueil, au retour dans l'application (dernière
   tentative de plus de 15 min), à la demande, et toutes les heures en
   arrière-plan sur Android (ADR-018), la tablette demande son catalogue
   signé, ne télécharge que les fichiers d'empreinte nouvelle, vérifie
   signatures, empreintes et tailles, puis active le nouveau jeu en une
   transaction et accuse réception. En arrière-plan : réseau disponible,
   batterie et stockage non faibles ; au-delà de 50 Mo, la suite attend le
   Wi-Fi ; une seule synchronisation à la fois (bail dans la base, schéma
   v5), confiée à l'application si elle est ouverte.
4. La consultation locale est autorisée 7 jours à l'utilisateur du dernier
   catalogue ; la fraîcheur (à jour, en retard, erreur) est toujours
   affichée.
5. Révocation : au premier contact, données, état et identité de la tablette
   sont effacés, signalements non transmis compris (leur nombre est affiché).
6. Version minimale (SYN-02) : le catalogue signé peut exiger une version de
   l'application (`MOBILE_MIN_APP_VERSION` côté API). Une application plus
   ancienne, ou qui reçoit un catalogue ou un paquet d'un format plus récent,
   n'installe rien de nouveau : les ETARE installés restent consultables, les
   sites retirés le sont quand même, l'accueil et « Compte et tablette »
   invitent à la mise à jour (schéma local v4, `required_app_version`).
   `AppInfo.version` doit suivre la version de `pubspec.yaml` (test).
7. Jeu de clés (SEC-04, ADR-027, depuis la 0.4.0) :
   - avant chaque catalogue, la tablette lit le jeu de clés signé par la
     clé racine embarquée, et refuse un numéro plus ancien que le sien ou un
     jeu différent sous le même numéro ;
   - elle ne fait ensuite confiance qu'aux clés du jeu. Une clé `retired`
     vaut encore pour ce qu'elle a signé, jamais pour un catalogue ; une
     clé `revoked` ne vaut plus rien ;
   - le jeu est conservé (table `trusted_keyset`, schéma local v8) et
     revérifié à chaque lecture ; il survit à la révocation, pour qu'un
     ancien jeu ne puisse pas revenir ;
   - après une révocation, une version installée est revérifiée avec sa
     signature renouvelée, sans retélécharger ses fichiers. Un fond de carte
     l'est aussi, et les sites sensibles ouverts sont refermés ;
   - le numéro du jeu part dans chaque accusé ;
   - un serveur sans jeu (404) laisse la tablette sur les clés de sa
     configuration.

## 8 ter. Documents et dossier ETARE en PDF (DOC-01)

Le PDF du dossier ETARE (depuis la synthèse du site) et les documents
installés sont lus dans l'application avec `pdfrx` (MIT, moteur PDFium) :
PDFium lit les pages au besoin, morceau par morceau, dans la base chiffrée
(CAP-02) ; le fichier n'est jamais copié en clair sur la tablette. Zoom au geste, pages
précédente et suivante, message explicite si le PDF est illisible.

Documents « à la demande » (DOC-02) : listés avec les documents essentiels,
avec leur taille et leur état (« à télécharger », « sur la tablette »,
progression). L'agent les télécharge explicitement depuis l'écran du
document : requête signée par le terminal, fichier vérifié contre la taille
et l'empreinte du manifeste signé, puis enregistré dans la base chiffrée. Il
y reste tant que la version installée le référence (une nouvelle version qui
change le document l'efface ; il faut alors le retélécharger), jusqu'au
retrait par l'agent (« Retirer de la tablette ») ou à la purge du terminal.
Sans réseau, l'écran dit exactement que le document manque et qu'il faudra
du réseau pour l'obtenir. Les documents « jamais » restent au back-office.

## 8 quater. Gros fichiers (CAP-02, ADR-016)

- **Téléchargement par morceaux** (`FileFetcher`) : chaque morceau de 1 Mio
  est rangé dans la base chiffrée dès qu'il est complet, l'empreinte est
  calculée au fil de l'eau ; après une coupure, la suite est demandée
  (`Range`) et seul le morceau en cours est perdu. Un fichier n'est visible
  qu'une fois complet et vérifié.
- **Lecture** : PDF ouverts par PDFium avec des rappels de lecture
  (`ChunkedSource`, 4 morceaux au plus en mémoire) ; plans décodés à 4 096 px
  au plus, photos en plein écran à 2 560 px (`bounded_image.dart`) ;
  contenus libérés à la fermeture des écrans.
- **Espace libre** (`StorageGuard`, `platformServicesProvider`) : vérifié
  avant chaque version, document à la demande, site sensible et fond de
  carte (place demandée + 10 % + 64 Mo). Sans place : « Stockage de la
  tablette insuffisant… », accusé `STORAGE_INSUFFICIENT` ; disque plein en
  cours d'écriture : « Stockage de la tablette plein… », accusé
  `STORAGE_FULL`, la reprise repart du dernier morceau.
- Le bilan des fonds de carte (installés, en attente du Wi-Fi, non installés
  et pourquoi) s'affiche après une synchronisation.
- Mesures : `docs/volumetrie/cap-02.md`.

## 8 bis. Signalements terrain (OPS-04, ADR-017)

1. Depuis la synthèse d'un site, la fiche d'un point, d'un risque ou d'une
   zone, ou par un appui long sur le plan, l'agent signale un écart :
   catégorie, importance, description, jusqu'à 5 photos (appareil photo du
   système ou galerie, compressées à la prise).
2. Le signalement et ses photos sont enregistrés dans la base chiffrée, même
   sans réseau ; la copie temporaire de la photo est supprimée aussitôt lue.
3. La file est transmise après chaque synchronisation et à la demande
   (« Mes signalements ») : corps reconstruit à l'identique (un accusé perdu
   ne crée pas de doublon), photos déposées par URL signée, puis contrôle
   demandé. Une fois transmis, les photos quittent la tablette.
4. L'agent suit « en attente d'envoi », « reçu », puis « traité » avec le
   motif de la Prévision et, le cas échéant, la version publiée qui corrige.
5. Les signalements sont liés à leur auteur : invisibles des autres
   utilisateurs de la tablette, conservés à la déconnexion (avertissement si
   des envois sont en attente) et transmis à sa prochaine connexion.

## 9. Volontairement NON fait au Sprint 0

- ~~Fonctions OPS (risques, accès, plans, eau, coupures, contacts)~~ :
  livrées au Sprint 4 (lecture locale ; signalement terrain à venir).
- ~~Synchronisation hors ligne et stockage des publications~~ : livrés au
  Sprint 4 (sections 6 et 8).
- ~~Cartographie et géolocalisation~~ : carte hors ligne et position à la demande livrées au Sprint 11
  (section 7 ter). La caméra sert aux photos des signalements, par l’application appareil photo du
  système, sans permission.
- Client API généré depuis l'OpenAPI (client manuel provisoire).
- ~~Verrouillage applicatif~~ : code personnel livré au Sprint 10 (section 7 bis), politique du SIS au
  Sprint 13 (section 7 quater) ; épinglage de certificats et détection root/jailbreak non retenus
  après analyse (ADR-029, à revoir avec SEC-06).
- Signature release (la variante release est signée avec la clé de debug),
  icône et nom définitifs, thème sombre.
- À la déconnexion, les jetons sont effacés ; le cache chiffré, le SIS sélectionné
  et les signalements non transmis (liés à leur auteur) sont conservés. Les écrans
  OPS exigent une autorisation locale valide liée à l'utilisateur connecté. La
  révocation du terminal déclenche la purge au prochain contact, file des
  signalements comprise (ADR-016, ADR-017). Ces règles restent à valider avec le
  SIS (DEC-04).
- iOS : dossier conservé et identifiant aligné (`fr.etare.ops`) mais non
  compilé ni testé (pas de macOS) ; une exception ATS sera nécessaire pour
  viser la pile locale en HTTP depuis le simulateur.
- Internationalisation : textes français en dur (application monolingue).
