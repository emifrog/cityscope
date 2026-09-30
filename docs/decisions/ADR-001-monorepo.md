# ADR-001 — Monorepo et monolithe modulaire

- Statut : acceptée — Sprint 0, 27/09/2026
- Sources : prompt Sprint 0 §3, §9, §10 ; architecture technique §02, §27

## Contexte

Le produit comprend un back-office web, une application OPS Flutter, une API, des traitements
asynchrones et un schéma de base unique. L’équipe est réduite (3 à 4 personnes) ; les microservices
ajouteraient de l’exploitation sans bénéfice au MVP.

## Décision

- Un seul dépôt. Espace de travail **pnpm** pour TypeScript (`apps/web`, `services/*`, `packages/*`) ;
  Flutter dans `apps/mobile` avec ses propres outils ; deux lockfiles versionnés.
- **Monolithe modulaire** : domaine, cas d’usage, adaptateurs et contrats séparés en paquets, avec des
  règles de dépendance vérifiées par ESLint.
- L’API est un paquet indépendant du framework (`services/api`, Hono sur la Fetch API), **servi au MVP
  par un route handler Next.js** ; `services/api/src/server.ts` permet de l’extraire en processus dédié.
- Le worker est un processus séparé (`services/worker`).
- Pas de Turborepo pour l’instant : `pnpm -r` suffit.
- **Next.js 16** au lieu de Next.js 15 indiqué dans le prompt (décision du porteur du projet, 27/09/2026).

## Alternatives écartées

- API Express/Fastify séparée dès le MVP : double déploiement sans besoin mesuré.
- Route handlers Next.js contenant la logique : couplage au framework, extraction coûteuse.
- Turborepo/Nx : cache utile plus tard, dépendance superflue aujourd’hui.

## Conséquences

- Les paquets partagés exposent leur source TypeScript (`transpilePackages` côté Next, bundle `tsup`
  côté worker).
- Le web n’accède aux données que par HTTP (`lib/api-client.ts`), comme l’application mobile.

## Critère de réexamen

Temps de CI > 10 min (→ Turborepo), charge ou exigences d’exploitation de l’API distinctes du web
(→ extraction de `services/api`).
