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

Endpoints : `GET /health`, `GET /me` ; sites (`GET/POST /sites` avec recherche `q`, `site_type`,
`status`, `city` et pagination par curseur opaque ; `GET/PATCH /sites/{id}`) ; bâtiments et niveaux
(`GET/POST /sites/{id}/buildings`, `PATCH /buildings/{id}`, `POST /buildings/{id}/levels`,
`PATCH /levels/{id}`) ; classifications, contacts et identifiants externes (`/sites/{id}/…`,
`PATCH /classifications/{id}`, `PATCH /contacts/{id}`) ; documents et fichiers
(`GET/POST /sites/{id}/documents`, `PATCH /documents/{id}`, `POST /documents/{id}/versions`,
`POST /assets/{id}/uploaded`, `GET /assets/{id}/download`, voir ADR-009) ; membres du SIS
(`GET/POST /members`, `PATCH /members/{id}`, voir ADR-010) ; carte (`GET /map/sources` : catalogue
des fonds ; `GET /map/sites` : sites positionnés en GeoJSON, filtres de la liste, `bbox`
ouest,sud,est,nord, emprise de tous les résultats et nombre de sites sans position ; voir ADR-006) ;
géocodage (`GET /geocoding/search`, `GET /geocoding/reverse`, géocodeur IGN appelé par le serveur).
Les emprises du site et des bâtiments (`footprint`, Polygon ou MultiPolygon) passent par
`PATCH /sites/{id}`, `POST /sites/{id}/buildings` et `PATCH /buildings/{id}`.
Les `PATCH` exigent
`If-Match` (412 si la version est périmée), les corps JSON sont limités à 64 Kio : les fichiers ne
passent jamais par l’API mais par des URL signées.

## Web (apps/web)

Next.js 16 (App Router, Turbopack), React 19, Tailwind CSS v4, composants de style shadcn/ui
(`packages/ui`), React Hook Form + Zod, TanStack Query.

- `src/proxy.ts` (ex-middleware) rafraîchit la session Supabase, renvoie vers `/login`, et vers
  `/verification` un compte dont le second facteur n’a pas encore été saisi ; ce n’est qu’un confort de
  navigation, l’autorisation est faite par l’API.
- Providers : session (Supabase Auth navigateur), SIS actif (issu de `/me`), cache de requêtes dont les
  clés commencent par `['tenant', tenantId]` : changer de SIS ou se déconnecter purge le cache.
- Routes : `/login`, `/verification` (second facteur), `/auth/confirm` (activation d’une invitation),
  `/` (tableau de bord), `/sites`, `/sites/[id]` (onglets dont Documents), `/compte` (habilitations,
  double authentification), `/administration` (membres), `/carte`, et les modules à venir (`/etare`,
  `/validations`, `/signalements`, `/contributions`).
- Carte : MapLibre GL JS chargé à la demande côté navigateur ; son worker et le module qu’il importe sont
  copiés depuis le paquet installé vers `public/maplibre/` (`scripts/copy-map-worker.mjs`, avant `dev`
  et `build`), le bundler ne pouvant pas les résoudre. Le style est construit depuis le catalogue
  serveur (`src/components/map/map-style.ts`), les couleurs depuis les jetons du thème. Création de la
  carte partagée (`use-map.ts`) ; onglet « Localisation » de la fiche site : point de référence
  (déplacement, adresse la plus proche proposée), emprises du site et des bâtiments tracées avec
  Terra Draw ; recherche d’adresse (`address-search.tsx`, motif combobox accessible au clavier).
- Thème remplaçable : jetons dans `packages/ui/src/styles/globals.css`, nom/logo dans `src/config/brand.ts`.

## Worker (services/worker)

Boucle de réservation (`app.claim_jobs`, `FOR UPDATE SKIP LOCKED`), bail avec heartbeat, reprise
exponentielle avec aléa, erreurs permanentes → état `dead`, arrêt propre sur SIGTERM. Les handlers
valident leur payload avant tout effet et doivent être idempotents (livraison « au moins une fois »).
Handlers : `system.noop` et `asset.verify` (contrôle des fichiers déposés, ADR-009), enregistré dès que
`SUPABASE_URL` et `SUPABASE_SECRET_KEY` sont fournis. PDF, paquets hors ligne, miniatures, imports,
notifications et empreintes s’ajouteront comme handlers. Voir ADR-007.

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
