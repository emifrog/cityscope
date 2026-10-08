# Développement local

## Prérequis

| Outil          | Version            | Remarque                                                          |
| -------------- | ------------------ | ----------------------------------------------------------------- |
| Node.js        | 22 (≥ 22.12)       | `.nvmrc`                                                          |
| pnpm           | 11.19              | `corepack enable` ou `npm i -g pnpm@11.19.0`                      |
| Docker Desktop | récent             | doit être **démarré** avant `pnpm db:start`                       |
| Supabase CLI   | fournie par pnpm   | `pnpm exec supabase …` (version fixée dans `package.json`)        |
| Flutter        | 3.47.5 (Dart 3.13) | mobile uniquement ; SDK hors du dépôt, sur le `PATH`              |
| Android SDK    | récent             | `ANDROID_HOME` doit pointer vers le SDK (pas vers Android Studio) |

## Première installation

```bash
pnpm install
pnpm db:start      # génère la clé JWT locale (ES256) puis démarre Supabase ; migrations + seed appliqués
pnpm setup:local   # écrit .env.local, apps/web/.env.local et apps/mobile/dart_defines.local.json (jamais committés)
pnpm seed:assets   # dépose les fichiers de démonstration (plan du seed) dans le stockage local
pnpm dev           # http://127.0.0.1:3000
```

`pnpm setup:local` génère aussi, une fois pour toutes, les deux clés locales de distribution hors ligne
(ADR-015) : `PUBLICATION_SIGNING_KEY` (worker) et `CATALOG_SIGNING_KEY` (API). Elles sont conservées
d’une exécution à l’autre et leurs clés publiques sont écrites dans la configuration du mobile
(`TRUSTED_SIGNING_KEYS`). Les supprimer de `.env.local` oblige à réenrôler les terminaux de test.

Version minimale de l’application OPS (SYN-02, facultative) : `MOBILE_MIN_APP_VERSION=x.y.z` dans
`.env.local` l’annonce dans les catalogues signés ; une tablette plus ancienne garde ses données et
demande une mise à jour. Utile pour éprouver ce parcours sur l’émulateur.

Antivirus (facultatif en local, obligatoire en préproduction et production) : un démon ClamAV contrôle
chaque fichier déposé. Pour l’activer en local, lancer `docker run -d --name etare-clamav -p 3311:3310
clamav/clamav:stable`, puis ajouter `ANTIVIRUS_URL=tcp://127.0.0.1:3311` à `.env.local` avant
`pnpm dev:worker`. Le test d’intégration `antivirus.test.ts` ne s’exécute que si `ANTIVIRUS_URL` est
défini (la CI l’active avec un conteneur de service).

Services locaux : API Supabase `http://127.0.0.1:54321`, PostgreSQL `127.0.0.1:54322`, Studio
`http://127.0.0.1:54323`, e-mails de test (Mailpit) `http://127.0.0.1:54324` (SMTP `127.0.0.1:54325`).

Notifications du portail exploitant (ADR-020) : `pnpm setup:local` écrit `SMTP_URL` et `APP_BASE_URL`
dans `.env.local` ; le worker envoie alors invitations, questions et décisions dans Mailpit. Sans ces
variables, les notifications échouent visiblement (Administration → Notifications) et restent rejouables.

## Comptes de démonstration

Toutes les données du seed sont **fictives** (`supabase/seed.sql`). Mot de passe commun indiqué en tête
du fichier. Comptes utiles :

| Compte                                | Rôle(s)                                | Ce qu’il doit voir                             |
| ------------------------------------- | -------------------------------------- | ---------------------------------------------- |
| `redacteur06@demo.etare.test`         | PREVISION_EDITOR @ SDIS DEMO 06        | les 2 sites du 06, dont EHPAD Les Oliviers     |
| `validateur06@demo.etare.test`        | PREVISION_VALIDATOR @ 06               | idem ; validation soumise au 2e facteur        |
| `admin.sis06@demo.etare.test`         | SIS_ADMIN @ 06                         | idem + audit du 06 ; ne publie pas             |
| `ops06@demo.etare.test`               | OPS_USER @ 06                          | aucune donnée de travail (publications seules) |
| `exploitant.oliviers@demo.etare.test` | EXPLOITANT limité à EHPAD Les Oliviers | portail exploitant seul (second facteur exigé) |
| `lecteur06@demo.etare.test`           | READER @ 06                            | lecture seule                                  |
| `redacteur83@demo.etare.test`         | PREVISION_EDITOR @ SDIS DEMO 83        | uniquement les sites du 83                     |
| `multi.sis@demo.etare.test`           | READER @ 06 + PREVISION_EDITOR @ 83    | sélecteur de SIS dans l’en-tête                |
| `plateforme@demo.etare.test`          | SUPER_ADMIN (plateforme)               | aucun SIS, aucune donnée métier                |

L’inscription libre est désactivée (produit sur invitation). Pour essayer l’administration avec
`admin.sis06` : activer la double authentification dans « Mon compte » (application TOTP), puis
Administration → « Inviter une personne » ; l’e-mail d’invitation arrive dans Mailpit
(`http://127.0.0.1:54324`). Retirer ensuite le facteur pour revenir à l’état du seed.
Un changement de `supabase/config.toml` ou de `supabase/templates/` demande `pnpm db:stop && pnpm db:start`.

## Commandes courantes

```bash
pnpm check              # tout ce que la CI vérifie côté TypeScript
pnpm test:db            # tests pgTAP (supabase/tests/database)
pnpm test:integration   # nécessite db:start + setup:local
pnpm db:reset           # rejoue migrations + seed puis redépose les fichiers de démonstration
pnpm seed:assets        # fichiers de démonstration seuls (supabase/seed-assets/, stockage local uniquement)
pnpm dev:worker         # worker (lit .env.local) : nécessaire pour que les fichiers déposés soient contrôlés
pnpm --filter @etare/api start   # API seule sur :3001 (démonstration d’extraction)
pnpm cartography:check  # catalogue des fonds IGN comparé aux services Géoplateforme (réseau requis)
pnpm bench:volume       # banc de volumétrie de 10 000 sites, pile locale seule (docs/volumetrie/cap-01.md)
pnpm keys               # racine et jeu de clés de signature (docs/exploitation/cles-de-signature.md)
bash infra/backup/exercice.sh --effacer-la-pile-locale   # sauvegarde, effacement, restauration, contrôle (EXP-02)
```

En développement, l’API est instanciée une seule fois par processus Next (pool de connexions partagé
entre rechargements) : après une modification de `services/api` ou des adaptateurs, redémarrer
`pnpm dev`. Sans le worker, un document déposé reste « Contrôle en cours ».

## Base de données

- Une nouvelle migration : `pnpm exec supabase migration new <nom>` puis éditer le fichier SQL.
  `supabase/migrations/` est la **seule** histoire du schéma.
- Toute table métier : `tenant_id NOT NULL`, clés étrangères composites, RLS activée, triggers
  `install_tenant_table_triggers` + `install_audit_trigger`, `GRANT` explicites, et
  `revoke all on all routines in schema app from public;` en fin de migration.
- Ajouter les tests pgTAP correspondants ; `00_structure.test.sql` échoue si une table n’a pas de RLS,
  si une fonction est exécutable par PUBLIC ou si une cascade de suppression apparaît.

## Mobile

```bash
cd apps/mobile
flutter pub get
flutter analyze
flutter test
flutter build apk --debug
flutter run --dart-define=AUTH_PUBLISHABLE_KEY=<clé publishable locale>
```

`flutter run` et `flutter build` construisent la variante `prod` (`default-flavor`) ;
`--flavor staging` construit la préproduction, installable à côté. Une release se construit avec
`pnpm mobile:release` et une clé de signature hors dépôt
([livraison-mobile.md](exploitation/livraison-mobile.md)).

L’émulateur Android joint la machine hôte via `10.0.2.2` (valeurs par défaut de `API_BASE_URL` et
`AUTH_URL`). Voir `apps/mobile/README.md`.

Sous Windows, si `ANDROID_HOME` pointe vers Android Studio au lieu du SDK, corriger la variable
dans le terminal courant avant le build (adapter le chemin si le SDK est installé ailleurs) :

```powershell
$env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android/Sdk'
flutter build apk --debug
```

L’APK est créé dans `apps/mobile/build/app/outputs/flutter-apk/app-prod-debug.apk`. Sans les paramètres
`--dart-define` de connexion, il compile mais affiche l’écran de configuration manquante au démarrage.

## Environnement d’intégration partagé

Projet Supabase hébergé, commun à l’équipe, pour tester l’application hors du poste de développement.
Le développement quotidien, les tests automatisés et la CI restent sur la stack locale.

Règles :

- **données fictives uniquement** tant que la région et le mode d’hébergement ne sont pas validés avec
  le SIS (architecture §33) ;
- **le seed ne s’exécute jamais sur ce projet** (il pose des mots de passe publics) : jamais
  `supabase db push --include-seed`, jamais `supabase db reset --linked` ;
- configuration dans `.env.integration` (ignoré par Git, modèle : `.env.integration.example`) ;
  `.env.local` reste réservé à la stack locale ;
- les tests d’intégration automatisés refusent de viser ce projet (garde-fou dans `tests/integration`).

### 1. Réglages du projet (tableau de bord Supabase, une fois)

Le `supabase/config.toml` ne s’applique qu’en local : reporter ces réglages à la main.

- Authentication → Sign In / Providers : **désactiver les inscriptions** (« Allow new users to sign
  up »), garder le fournisseur e-mail actif, mots de passe ≥ 12 caractères avec lettres minuscules,
  majuscules, chiffres et symboles.
- Authentication → Multi-Factor : activer **TOTP**.
- Authentication → URL Configuration : Site URL `http://127.0.0.1:3000` (tant que l’intégration est
  utilisée depuis un poste de développement).
- JWT Keys : clés **asymétriques** (ES256 ; c’est déjà le cas).
- Data API : schémas exposés `public` et `graphql_public` seulement ; **ne jamais exposer `app`**.

### 2. Appliquer les migrations (sans le seed)

```bash
pnpm exec supabase login
pnpm exec supabase link --project-ref <project-ref>
pnpm exec supabase db push --linked --dry-run
pnpm db:push:integration
```

### 3. Mots de passe des rôles applicatifs

Récupérer l’URL « Session pooler » (bouton **Connect** du tableau de bord, utilisateur
`postgres.<project-ref>`) et le certificat CA du projet (Database → Settings → SSL), rangé **hors du
dépôt**. Définir l’URL d’administration **dans le terminal uniquement** (jamais dans un fichier), puis :

```bash
export INTEGRATION_ADMIN_DATABASE_URL='postgresql://postgres.<project-ref>:<mot-de-passe>@<hôte-pooler>:5432/postgres?sslmode=verify-full&sslrootcert=<chemin>/prod-ca-2021.crt'
pnpm integration roles
```

En PowerShell : `$env:INTEGRATION_ADMIN_DATABASE_URL = '…'`. La commande génère des mots de passe
aléatoires pour `etare_api` et `etare_worker`, les envoie sous forme d’empreinte SCRAM (le mot de passe
en clair ne quitte pas le poste), vérifie la connexion et écrit `DATABASE_URL` / `WORKER_DATABASE_URL`
dans `.env.integration`. Rien n’est affiché. Relancer la commande fait tourner les mots de passe.
Fermer le terminal ensuite.

### 4. SIS et comptes de test

Créer les comptes (adresses fictives ou de l’équipe) dans Authentication → Users (« Add user » ou
« Invite »), puis les rattacher :

```bash
pnpm integration tenant --slug sdis-integration-06 --name "SDIS INTÉGRATION 06"
pnpm integration grant --email prenom.nom@exemple.fr --tenant sdis-integration-06 --role PREVISION_EDITOR
pnpm integration grant --email autre@exemple.fr --tenant sdis-integration-06 --role EXPLOITANT --site <uuid-du-site>
pnpm integration members
```

Rôles possibles : `SIS_ADMIN`, `PREVISION_EDITOR`, `PREVISION_VALIDATOR`, `OPS_USER`, `EXPLOITANT`,
`READER` (`SUPER_ADMIN` n’est jamais lié à un SIS). Cet outil sert à créer le **premier**
administrateur d’un SIS ; ensuite, l’écran Administration invite les membres et gère leurs rôles
(double authentification exigée).

Pour les invitations et les documents, dans le tableau de bord du projet :

- Authentication → URL Configuration : **Site URL** = adresse de l’application web (le lien
  d’invitation pointe vers `<Site URL>/auth/confirm`) ;
- Authentication → Emails → **Invite user** : reprendre le sujet et le corps de
  `supabase/templates/invite.html` ;
- Authentication → Multi-Factor : TOTP activé ;
- ajouter la clé secrète (Project Settings → API Keys) à `.env.integration` sous `SUPABASE_SECRET_KEY`
  (serveur uniquement, jamais préfixée `NEXT_PUBLIC_`).

### 5. Vérifier et utiliser

```bash
pnpm integration check     # schéma, migrations, rôles, absence de données de démo, .env.integration
pnpm dev:integration       # web + API locaux contre le projet d’intégration
```

`pnpm integration check` échoue si des données du seed local sont présentes : dans ce cas, relancer
`pnpm integration roles` (les mots de passe publics ne valent plus rien) et supprimer les comptes
`@demo.etare.test` depuis le tableau de bord.

## Dépannage

| Symptôme                                                  | Cause / solution                                                                   |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `db:start` échoue sur la connexion Docker                 | Docker Desktop n’est pas démarré.                                                  |
| « Configuration manquante » sur le web                    | lancer `pnpm setup:local` après `pnpm db:start`.                                   |
| « Email logins are disabled »                             | `[auth.email].enable_signup` doit rester `true` (il active le fournisseur e-mail). |
| `DATABASE_URL must use the dedicated etare_api login`     | l’application refuse volontairement `postgres` et les rôles de service.            |
| Flutter : « dubious ownership » (git)                     | SDK installé par un autre compte Windows : utiliser un SDK à vous, hors du dépôt.  |
| `pnpm install` : « Aborted removal of modules directory » | relancer avec `--config.confirmModulesPurge=false`.                                |
