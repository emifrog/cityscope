# Architecture

Référence : dossier d’architecture technique v1.0 (`docs/reference/05_…`). Ce document décrit ce qui est
**réellement implémenté** et les frontières à respecter.

## Vue d’ensemble

```text
 Navigateur (back-office)          Tablette OPS (Flutter, hors ligne)
        │  HTTPS, Bearer JWT              │  HTTPS, Bearer JWT (+ paquets signés, à venir)
        ▼                                 ▼
 ┌──────────────────────────── apps/web (Next.js 16) ────────────────────────────┐
 │  pages React (client)      /api/v1/*  → route handler mince → services/api    │
 └───────────────────────────────────────────────┬───────────────────────────────┘
                                                 │ rôle SQL etare_api (RLS)
 Supabase Auth (JWT ES256, JWKS) ◄── vérif ──────┤
                                                 ▼
                         PostgreSQL + PostGIS (schéma privé « app »)
                                                 ▲
                                                 │ rôle SQL etare_worker
                                  services/worker (file de tâches PostgreSQL)
 Supabase Storage (bucket privé) ◄── URL signées courtes, après autorisation en base
 IGN / Géoplateforme ◄── fonds cartographiques (abstraction CartographyCatalog)
```

- **Monolithe modulaire** : une seule base, un seul modèle, des processus séparés (web/API, worker).
- Le web et l’application OPS consomment **la même API métier** ; aucun client n’a d’accès direct aux
  tables ni de clé privilégiée.
- L’API est servie au MVP par un route handler Next.js (`apps/web/src/app/api/v1/[[...route]]/route.ts`)
  qui délègue à `services/api`. Ce paquet est indépendant de Next (Fetch API) : `services/api/src/server.ts`
  démontre son extraction dans un processus dédié sans dupliquer de règle.

## Couches TypeScript et règles de dépendance

| Paquet               | Contenu                                                                                 | Peut dépendre de                       |
| -------------------- | --------------------------------------------------------------------------------------- | -------------------------------------- |
| `@etare/domain`      | rôles, permissions, machines à états, séparation rédacteur/validateur, clés de stockage | rien (TypeScript pur)                  |
| `@etare/schemas`     | briques Zod (UUID, GeoJSON lon/lat, coordonnées locales)                                | domain, zod                            |
| `@etare/contracts`   | contrats d’API (requêtes, réponses, erreurs), OpenAPI                                   | domain, schemas, zod                   |
| `@etare/application` | cas d’usage et **ports** (SessionFactory, ObjectStorage, JobQueue, CartographyCatalog)  | domain, contracts                      |
| `@etare/adapters`    | PostgreSQL, vérification JWT, Supabase Storage, IGN, logs                               | application, domain, contracts, config |
| `@etare/api`         | routeur HTTP, contexte de requête, mapping d’erreurs                                    | tout sauf web                          |
| `apps/web`           | UI ; appelle l’API par HTTP (`lib/api-client.ts`)                                       | contracts, schemas, domain, ui, config |

Ces règles sont **vérifiées par ESLint** (`no-restricted-imports` dans `eslint.config.mjs`) : le domaine ne
peut importer ni Next, ni Supabase, ni `pg` ; le code client web ne peut pas importer les adaptateurs.

## Cycle d’une requête API

1. `services/api` vérifie le jeton (signature ES256 via JWKS, émetteur, audience, expiration, rôle
   `authenticated`, pas de session anonyme) → `Principal`.
2. L’en-tête `X-Tenant-Id` (SIS actif) est validé comme UUID ; ce n’est **qu’une indication**.
3. Le cas d’usage ouvre une session : une transaction dont la première instruction,
   `app.begin_request()`, revérifie en base le compte et l’adhésion au SIS, puis pose le contexte
   (utilisateur, SIS, niveau d’authentification, trace) **local à la transaction**.
4. Le cas d’usage vérifie la permission (erreur explicite), puis les requêtes s’exécutent sous RLS.
5. La réponse est validée contre le contrat avant envoi ; les erreurs suivent un format stable
   (`code`, `message`, `trace_id`, `fields`), sans détail interne ; `Cache-Control: no-store`.

## Contrats et OpenAPI

`packages/contracts/src/endpoints.ts` décrit chaque endpoint (méthode, chemin, auth, SIS requis,
paramètres, réponse). Le même objet sert : à la validation serveur, au client web typé, à la génération
de `openapi.json` (OpenAPI 3.1, servi aussi sur `/api/v1/openapi.json`). Un test vérifie que chaque
endpoint du contrat est routé ; la CI échoue si `openapi.json` n’est pas à jour.

Endpoints du Sprint 0 : `GET /health`, `GET /me`, `GET /sites` (pagination par curseur opaque),
`GET /sites/{id}`.

## Web (apps/web)

Next.js 16 (App Router, Turbopack), React 19, Tailwind CSS v4, composants de style shadcn/ui
(`packages/ui`), React Hook Form + Zod, TanStack Query.

- `src/proxy.ts` (ex-middleware) rafraîchit la session Supabase et renvoie vers `/login` ; ce n’est
  qu’un confort de navigation, l’autorisation est faite par l’API.
- Providers : session (Supabase Auth navigateur), SIS actif (issu de `/me`), cache de requêtes dont les
  clés commencent par `['tenant', tenantId]` : changer de SIS ou se déconnecter purge le cache.
- Routes : `/login`, `/` (tableau de bord), `/sites`, `/sites/[id]`, et les modules à venir
  (`/carte`, `/etare`, `/validations`, `/signalements`, `/contributions`, `/administration`).
- Thème remplaçable : jetons dans `packages/ui/src/styles/globals.css`, nom/logo dans `src/config/brand.ts`.

## Worker (services/worker)

Boucle de réservation (`app.claim_jobs`, `FOR UPDATE SKIP LOCKED`), bail avec heartbeat, reprise
exponentielle avec aléa, erreurs permanentes → état `dead`, arrêt propre sur SIGTERM. Les handlers
valident leur payload avant tout effet et doivent être idempotents (livraison « au moins une fois »).
Seul `system.noop` existe ; PDF, paquets hors ligne, miniatures, imports, antivirus, notifications et
empreintes s’ajouteront comme handlers. Voir ADR-007.

## Mobile (apps/mobile)

Squelette Flutter en couches (`presentation / application / domain / data`), go_router, Riverpod, dio,
Drift sur SQLite **chiffrée (SQLCipher)**, stockage sécurisé des jetons et de la clé de base. Détails dans
`apps/mobile/README.md`. La synchronisation hors ligne n’est pas encore développée (ADR-004).

## Cartographie

`CartographyCatalog` (application) + `IgnCartographyCatalog` (adaptateurs) décrivent les sources IGN
(Plan IGN raster WMTS, tuiles vectorielles, orthophotos) avec attribution et **droits hors ligne
« non vérifiés »**. Aucun écran ne code une URL de tuile en dur. Le module carte arrive au Sprint 2
(MapLibre GL JS). Voir ADR-006.

## Écarts assumés par rapport à l’arborescence du prompt

- `packages/application` et `packages/adapters` ajoutés (dossier d’architecture §27) pour séparer cas
  d’usage et infrastructure.
- `services/api` contient l’API complète mais n’est pas un serveur séparé au MVP (dossier §02).
- `tests/integration` à la racine ; les tests SQL vivent dans `supabase/tests`.
- Pas de Turborepo : `pnpm -r` suffit à ce stade (ADR-001).
- ADR dans `docs/decisions/` (demande du prompt) plutôt que `docs/adr/`.
