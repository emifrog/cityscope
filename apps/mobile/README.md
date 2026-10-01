# Application OPS (Flutter)

Application mobile **opérationnelle** de la plateforme ETARE numérique :
consultation terrain des plans ETARE par les sapeurs-pompiers (SIS/SDIS).
Android en priorité, structure compatible iOS.

> Sprint 4 : enrôlement de la tablette, synchronisation signée et
> installation hors ligne chiffrée des ETARE publiés (ADR-015, ADR-016).

Nom commercial non arrêté : le produit s'appelle provisoirement « Produit
ETARE » et l'identifiant d'application `fr.etare.ops` est **provisoire**.

---

## 1. Prérequis

| Outil | Version | Remarque |
|---|---|---|
| Flutter | 3.47.x stable (Dart 3.13) | `flutter --version` |
| JDK | 17+ | le JBR d'Android Studio convient |
| Android SDK | plateforme/Build-Tools récents, licences acceptées | `flutter doctor` |
| Émulateur Android | API 24+ | `minSdk` = 24 |

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
| `TRUSTED_SIGNING_KEYS` | *(vide)* | clés publiques serveur approuvées : `publication:<id>:<base64>;catalog:<id>:<base64>` (obligatoires hors `dev` ; sans elles, pas de synchronisation) |

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
flutter build apk --debug       # APK de développement
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
- **Identité visuelle** : tout est dans `lib/src/core/theme/brand.dart`
  (nom, pictogramme, couleurs). Le libellé Android
  (`android/app/src/main/res/values/strings.xml`) et iOS
  (`ios/Runner/Info.plist`, `CFBundleDisplayName`) sont à aligner en même
  temps.
- **UX terrain** : cibles tactiles ≥ 48 dp (boutons principaux 56 dp),
  textes agrandis, contrastes élevés ; texte blanc sur orange réservé au
  texte gras ≥ 18 sp.

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
  (ADR-016). Migrations pas à pas dans `app_database.dart`, instantanés v1
  et v2 dans `drift_schemas/`, test de migration avec données dans
  `test/drift/`.
- **Licences** : SQLCipher Community Edition (licence de type BSD, mention
  requise dans la documentation distribuée) et OpenSSL sur Android — à
  intégrer à l'écran « À propos » / aux mentions légales avant diffusion.
  Les binaires peuvent être servis depuis un dépôt interne via
  `hooks.user_defines.sqlite3.url_pattern`.

## 7. Sécurité par défaut

- Permission Android unique : `INTERNET`.
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

## 8. Hors ligne : enrôlement et synchronisation (ADR-015, ADR-016)

1. L'administrateur du SIS déclare la tablette (web, onglet « Terminaux ») et
   remet le code à usage unique.
2. Connecté, l'agent saisit le code : la tablette génère sa clé Ed25519, en
   prouve la détention, et garde sa graine dans le Keystore.
3. À chaque ouverture de l'accueil (et à la demande), la tablette demande
   son catalogue signé, ne télécharge que les fichiers d'empreinte nouvelle,
   vérifie signatures, empreintes et tailles, puis active le nouveau jeu en
   une transaction et accuse réception.
4. La consultation locale est autorisée 7 jours à l'utilisateur du dernier
   catalogue ; la fraîcheur (à jour, en retard, erreur) est toujours
   affichée.
5. Révocation : au premier contact, données, état et identité de la tablette
   sont effacés.

## 9. Volontairement NON fait au Sprint 0

- ~~Fonctions OPS (risques, accès, plans, eau, coupures, contacts)~~ :
  livrées au Sprint 4 (lecture locale ; signalement terrain à venir).
- ~~Synchronisation hors ligne et stockage des publications~~ : livrés au
  Sprint 4 (sections 6 et 8).
- Cartographie, géolocalisation, caméra.
- Client API généré depuis l'OpenAPI (client manuel provisoire).
- Verrouillage applicatif (PIN/biométrie), épinglage de certificats,
  détection root/jailbreak.
- Signature release (la variante release est signée avec la clé de debug),
  icône et nom définitifs, thème sombre.
- Politique d'effacement des données locales à la déconnexion (à définir
  avec la synchronisation ; le SIS sélectionné est conservé dans
  `local_meta`, les jetons sont effacés).
- iOS : dossier conservé et identifiant aligné (`fr.etare.ops`) mais non
  compilé ni testé (pas de macOS) ; une exception ATS sera nécessaire pour
  viser la pile locale en HTTP depuis le simulateur.
- Internationalisation : textes français en dur (application monolingue).
