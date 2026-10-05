# FireScape

**La connaissance opérationnelle du bâtiment.** Plateforme SaaS de gestion de la connaissance
opérationnelle des bâtiments et sites à risques des SIS : création, validation, publication immuable et
consultation hors ligne des plans ETARE numériques. Dépôt technique `etare-platform`.

> Identité (nom, logos, couleurs) : [`assets/brand/`](assets/brand/README.md) ; déclinaisons web et
> mobile générées par `pnpm brand:assets`.

**État : Sprint 11 livré.** Le back-office couvre la préparation d’un ETARE : référentiel des sites,
carte IGN, plans de niveaux, objets (avec photos), zones et risques, contrôle avant validation,
validation par un validateur indépendant avec double authentification, publication immuable et PDF.
Les versions publiées sont distribuées, signées, aux tablettes enrôlées par l’administration du SIS
et consultées **sans réseau** dans l’application OPS (recherche, synthèse, plans tactiles, fiches,
PDF). Les intervenants signalent hors ligne les écarts constatés, avec photo ; la Prévision les
instruit jusqu’à la version corrigée. Les fichiers déposés passent par l’antivirus ClamAV. La tablette
se synchronise aussi en arrière-plan, télécharge à la demande les documents non essentiels et invite à
la mise à jour quand la version de l’application est trop ancienne. Les exploitants, invités sur leurs
sites, consultent sur un portail dédié une liste blanche de la version publiée et proposent des mises à
jour, instruites par la Prévision avant toute publication ; ils sont prévenus par e-mail. La recherche filtre
par risque, les risques extérieurs se placent sur la carte, les zones restent cohérentes et un dossier peut
être retiré puis archivé, la tablette en affichant la raison. Côté sécurité, la base impose le second facteur
à tout compte qui en a un (la tablette s’identifie par sa clé), les sessions se ferment à distance, des codes
de secours remplacent un téléphone perdu, l’API limite les débits et trace les refus, les pages ont une CSP
stricte et les fichiers ont des miniatures et une purge planifiée.
Le SIS règle les sections de son ETARE (annexe photos dans le PDF). Il découpe son territoire en secteurs,
auxquels il affecte ses tablettes et ses membres. Il habilite nominativement les agents aux sites sensibles :
sur la tablette, ces sites s'ouvrent à la demande, avec un code personnel, et chaque consultation est tracée.
La tablette a une carte hors ligne : un fond par secteur, préparé par la plateforme et téléchargé en Wi-Fi,
avec les sites installés et la position de l'agent à sa demande. Le Plan IGN y entrera une fois sa fiche de
droits validée ; d'ici là, un fond d'essai synthétique sert aux essais.
**Restent à venir** : fond IGN réel, tablette de référence et qualification du pilote.
La CI GitHub (TypeScript et build, base et intégration, Flutter) s’exécute à chaque push sur `main`.
Voir la **[roadmap complète du développement](docs/roadmap-developpement.md)**,
le [bilan actuel du dépôt](docs/bilan-depot-2026-10-01.md), le
[suivi des exigences](docs/suivi-exigences.md) et les rapports des Sprints
[0](docs/sprint-0-report.md), [1](docs/sprint-1-report.md), [2](docs/sprint-2-report.md),
[3](docs/sprint-3-report.md), [4](docs/sprint-4-report.md), [5](docs/sprint-5-report.md),
[6](docs/sprint-6-report.md), [7](docs/sprint-7-report.md), [8](docs/sprint-8-report.md), [9](docs/sprint-9-report.md),
[10](docs/sprint-10-report.md) et [11](docs/sprint-11-report.md).

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
| `pnpm brand:assets`               | régénère logos et icônes (web, Android, iOS) depuis `assets/brand/`     |
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
assets/brand        originaux du logo FireScape (déclinaisons : pnpm brand:assets)
infra/              images Docker, Terraform (à venir)
tests/integration   tests d’intégration
docs/               architecture, développement, base, sécurité, ADR
```

## Documentation

- [Architecture](docs/architecture.md) · [Développement](docs/development.md) ·
  [Base de données](docs/database.md) · [Sécurité](docs/security.md)
- [Décisions d’architecture (ADR)](docs/decisions/)
- [Roadmap complète](docs/roadmap-developpement.md) · [Bilan du dépôt au 01/10/2026](docs/bilan-depot-2026-10-01.md)
- [Suivi des exigences](docs/suivi-exigences.md) · [Bilan historique du 30/09/2026](docs/bilan-alignement-2026-09-30.md)
- Rapports de sprint : [0](docs/sprint-0-report.md) · [1](docs/sprint-1-report.md) ·
  [2](docs/sprint-2-report.md) · [3](docs/sprint-3-report.md) · [4](docs/sprint-4-report.md) · [5](docs/sprint-5-report.md) · [6](docs/sprint-6-report.md) · [7](docs/sprint-7-report.md) · [8](docs/sprint-8-report.md) · [9](docs/sprint-9-report.md) · [10](docs/sprint-10-report.md) · [11](docs/sprint-11-report.md)
- Documents de cadrage : [`docs/reference/`](docs/reference/)

## Sécurité en bref

Isolation multi-SIS défendue à quatre niveaux (modèle, contraintes SQL, RLS, règles applicatives), schéma
métier privé non exposé, rôles SQL dédiés sans `BYPASSRLS`, journal d’audit en ajout seul, publications
immuables, aucune clé secrète dans Git. Voir [`docs/security.md`](docs/security.md).
