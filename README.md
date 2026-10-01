# etare-platform

Plateforme SaaS de gestion de la connaissance opérationnelle des bâtiments et sites à risques des SIS :
création, validation, publication immuable et consultation hors ligne des plans ETARE numériques.

> Nom commercial et logo à définir : identité provisoire dans `apps/web/src/config/brand.ts`,
> `packages/ui/src/styles/globals.css` et `apps/mobile/lib/src/core/theme/brand.dart`.

**État : Sprint 4 livré.** Le back-office couvre la préparation d’un ETARE : référentiel des sites,
carte IGN, plans de niveaux, objets (avec photos), zones et risques, contrôle avant validation,
validation par un validateur indépendant avec double authentification, publication immuable et PDF.
Les versions publiées sont distribuées, signées, aux tablettes enrôlées par l’administration du SIS
et consultées **sans réseau** dans l’application OPS (recherche, synthèse, plans tactiles, fiches).
**Restent à venir** : signalement terrain, portail exploitant, politique des sites sensibles.
La CI GitHub (TypeScript et build, base et intégration, Flutter) s’exécute à chaque push sur `main`.
Voir le [suivi des exigences](docs/suivi-exigences.md), le
[bilan d’alignement](docs/bilan-alignement-2026-09-30.md) et les rapports des Sprints
[0](docs/sprint-0-report.md), [1](docs/sprint-1-report.md), [2](docs/sprint-2-report.md),
[3](docs/sprint-3-report.md) et [4](docs/sprint-4-report.md).

## Démarrage rapide

Prérequis : Node.js 22 (≥ 22.12), pnpm 11 (`corepack enable` ou `npm i -g pnpm@11`), Docker Desktop
démarré, et pour le mobile Flutter 3.47 + Android SDK.

```bash
pnpm install
pnpm db:start        # Supabase local : PostgreSQL/PostGIS, Auth, Storage + migrations + données fictives
pnpm setup:local     # génère .env.local et apps/web/.env.local depuis la stack locale
pnpm dev             # web + API sur http://127.0.0.1:3000
```

Connectez-vous avec un compte fictif du seed (mot de passe commun indiqué en tête de
[`supabase/seed.sql`](supabase/seed.sql)), par exemple `redacteur06@demo.etare.test` : il appartient au
**SDIS DEMO 06**, voit **EHPAD Les Oliviers** et ne voit rien du **SDIS DEMO 83**.

Détails, dépannage, mobile et worker : [`docs/development.md`](docs/development.md).

## Commandes

| Commande                          | Rôle                                                                    |
| --------------------------------- | ----------------------------------------------------------------------- |
| `pnpm check`                      | format, lint, typecheck, tests unitaires, dérive du contrat OpenAPI     |
| `pnpm test`                       | tests unitaires (Vitest, sans réseau ni base)                           |
| `pnpm test:db`                    | tests SQL pgTAP : RLS, isolation, audit, immutabilité, file de tâches   |
| `pnpm test:integration`           | Auth → API → RLS de bout en bout, file de tâches (stack locale requise) |
| `pnpm db:reset`                   | rejoue toutes les migrations et le seed, redépose les fichiers de démo  |
| `pnpm build`                      | build de production du web et du worker                                 |
| `pnpm dev:worker`                 | worker asynchrone en mode développement                                 |
| `pnpm dev:integration`            | web + API locaux contre l’environnement d’intégration partagé           |
| `pnpm integration check`          | vérifie l’environnement d’intégration (voir `docs/development.md`)      |
| `pnpm contracts:generate`         | régénère `packages/contracts/openapi.json`                              |
| `flutter analyze && flutter test` | dans `apps/mobile`                                                      |

## Arborescence

```text
apps/web            Next.js 16 : back-office SIS + hébergement de l’API (/api/v1)
apps/mobile         Flutter : application OPS hors ligne (Android d’abord)
services/api        API HTTP (Hono, Fetch API) : auth, SIS actif, validation, erreurs
services/worker     traitements asynchrones (file PostgreSQL)
packages/domain     règles métier pures (rôles, workflow, séparation des tâches)
packages/application cas d’usage et ports
packages/adapters   PostgreSQL, JWT, stockage, IGN, PDF, journalisation
packages/contracts  contrats d’API (Zod) + OpenAPI généré
packages/schemas    briques Zod partagées (GeoJSON, coordonnées locales...)
packages/config     environnement, tsconfig de base
packages/ui         composants et jetons de thème
supabase/           config, migrations (source unique du schéma), seed fictif, tests pgTAP
infra/              images Docker, Terraform (à venir)
tests/integration   tests d’intégration
docs/               architecture, développement, base, sécurité, ADR
```

## Documentation

- [Architecture](docs/architecture.md) · [Développement](docs/development.md) ·
  [Base de données](docs/database.md) · [Sécurité](docs/security.md)
- [Décisions d’architecture (ADR)](docs/decisions/)
- [Suivi des exigences](docs/suivi-exigences.md) · [Bilan d’alignement du 30/09/2026](docs/bilan-alignement-2026-09-30.md)
- Rapports de sprint : [0](docs/sprint-0-report.md) · [1](docs/sprint-1-report.md) ·
  [2](docs/sprint-2-report.md) · [3](docs/sprint-3-report.md) · [4](docs/sprint-4-report.md)
- Documents de cadrage : [`docs/reference/`](docs/reference/)

## Sécurité en bref

Isolation multi-SIS défendue à quatre niveaux (modèle, contraintes SQL, RLS, règles applicatives), schéma
métier privé non exposé, rôles SQL dédiés sans `BYPASSRLS`, journal d’audit en ajout seul, publications
immuables, aucune clé secrète dans Git. Voir [`docs/security.md`](docs/security.md).
