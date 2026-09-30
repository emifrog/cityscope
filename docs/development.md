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
pnpm setup:local   # écrit .env.local et apps/web/.env.local (jamais committés)
pnpm dev           # http://127.0.0.1:3000
```

Services locaux : API Supabase `http://127.0.0.1:54321`, PostgreSQL `127.0.0.1:54322`, Studio
`http://127.0.0.1:54323`, e-mails de test (Mailpit) `http://127.0.0.1:54324`.

## Comptes de démonstration

Toutes les données du seed sont **fictives** (`supabase/seed.sql`). Mot de passe commun indiqué en tête
du fichier. Comptes utiles :

| Compte                                | Rôle(s)                                | Ce qu’il doit voir                             |
| ------------------------------------- | -------------------------------------- | ---------------------------------------------- |
| `redacteur06@demo.etare.test`         | PREVISION_EDITOR @ SDIS DEMO 06        | les 2 sites du 06, dont EHPAD Les Oliviers     |
| `validateur06@demo.etare.test`        | PREVISION_VALIDATOR @ 06               | idem ; validation soumise au 2e facteur        |
| `admin.sis06@demo.etare.test`         | SIS_ADMIN @ 06                         | idem + audit du 06 ; ne publie pas             |
| `ops06@demo.etare.test`               | OPS_USER @ 06                          | aucune donnée de travail (publications seules) |
| `exploitant.oliviers@demo.etare.test` | EXPLOITANT limité à EHPAD Les Oliviers | aucune donnée de travail (portail à venir)     |
| `lecteur06@demo.etare.test`           | READER @ 06                            | lecture seule                                  |
| `redacteur83@demo.etare.test`         | PREVISION_EDITOR @ SDIS DEMO 83        | uniquement les sites du 83                     |
| `multi.sis@demo.etare.test`           | READER @ 06 + PREVISION_EDITOR @ 83    | sélecteur de SIS dans l’en-tête                |
| `plateforme@demo.etare.test`          | SUPER_ADMIN (plateforme)               | aucun SIS, aucune donnée métier                |

L’inscription libre est désactivée (produit sur invitation).

## Commandes courantes

```bash
pnpm check              # tout ce que la CI vérifie côté TypeScript
pnpm test:db            # tests pgTAP (supabase/tests/database)
pnpm test:integration   # nécessite db:start + setup:local
pnpm db:reset           # rejoue migrations + seed (données locales perdues)
pnpm dev:worker         # worker (lit .env.local)
pnpm --filter @etare/api start   # API seule sur :3001 (démonstration d’extraction)
```

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

L’émulateur Android joint la machine hôte via `10.0.2.2` (valeurs par défaut de `API_BASE_URL` et
`AUTH_URL`). Voir `apps/mobile/README.md`.

Sous Windows, si `ANDROID_HOME` pointe vers Android Studio au lieu du SDK, corriger la variable
dans le terminal courant avant le build (adapter le chemin si le SDK est installé ailleurs) :

```powershell
$env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android/Sdk'
flutter build apk --debug
```

L’APK est créé dans `apps/mobile/build/app/outputs/flutter-apk/app-debug.apk`. Sans les paramètres
`--dart-define` de connexion, il compile mais affiche l’écran de configuration manquante au démarrage.

## Dépannage

| Symptôme                                                  | Cause / solution                                                                   |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `db:start` échoue sur la connexion Docker                 | Docker Desktop n’est pas démarré.                                                  |
| « Configuration manquante » sur le web                    | lancer `pnpm setup:local` après `pnpm db:start`.                                   |
| « Email logins are disabled »                             | `[auth.email].enable_signup` doit rester `true` (il active le fournisseur e-mail). |
| `DATABASE_URL must use the dedicated etare_api login`     | l’application refuse volontairement `postgres` et les rôles de service.            |
| Flutter : « dubious ownership » (git)                     | SDK installé par un autre compte Windows : utiliser un SDK à vous, hors du dépôt.  |
| `pnpm install` : « Aborted removal of modules directory » | relancer avec `--config.confirmModulesPurge=false`.                                |
