# Architecture

Référence : dossier d’architecture technique v1.0 (`docs/reference/05_…`). Ce document décrit ce qui est
**réellement implémenté** et les frontières à respecter.

## Vue d’ensemble

```text
 Navigateur (back-office)          Tablette OPS (Flutter, hors ligne)
        │  HTTPS, Bearer JWT              │  HTTPS, Bearer JWT + signature du terminal
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
géocodage (`GET /geocoding/search`, `GET /geocoding/reverse`, géocodeur IGN appelé par le serveur) ;
points opérationnels (`GET /object-types`, `GET/POST /sites/{id}/objects`, `PATCH /objects/{id}`) et
détails de carte (`GET /map/features?bbox=…` : emprises des bâtiments et points d’une zone de 0,2° au
plus, affichés à partir du zoom 15) ; plans (`GET/POST /sites/{id}/plans`, `PATCH /plans/{id}`,
`POST /plans/{id}/revisions` : fond déposé comme un document, image seulement, voir ADR-011) ; zones
(`GET/POST /sites/{id}/zones`, `PATCH /zones/{id}`) ; risques (`GET /risk-types`, `POST /risk-types`,
`PATCH /risk-types/{id}` pour le catalogue du SIS, `GET/POST /sites/{id}/risks`, `PATCH /risks/{id}`) ;
les objets acceptent aussi une position sur plan (`plan_position`), voir ADR-012 ; workflow ETARE
(`GET /etare` : dossiers du SIS ; `GET /sites/{id}/etare`, `GET /sites/{id}/etare/preview` : contrôles
et aperçu ; `POST /sites/{id}/etare/revisions` ; `POST /etare-revisions/{id}/submit` ;
`GET /validations` ; `GET /etare-revisions/{id}` ; `POST /etare-revisions/{id}/decision` : validation
ou correction motivée, second facteur ; `POST /etare-revisions/{id}/publication` : relance après échec ;
`GET /publications/{id}/pdf` : PDF de la version publiée, URL signée de 60 s), voir ADR-013 et ADR-014.
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
  copiés depuis le paquet installé vers `public/maplibre/` (`scripts/copy-browser-workers.mjs`, avant `dev`
  et `build`), le bundler ne pouvant pas les résoudre. Le style est construit depuis le catalogue
  serveur (`src/components/map/map-style.ts`), les couleurs depuis les jetons du thème. Création de la
  carte partagée (`use-map.ts`) ; onglet « Localisation » de la fiche site : point de référence
  (déplacement, adresse la plus proche proposée), emprises du site et des bâtiments tracées avec
  Terra Draw ; recherche d’adresse (`address-search.tsx`, motif combobox accessible au clavier).
  Points opérationnels : couches par catégorie (`object-layers.ts`, calques activables), tracé par type
  (point, ligne, surface) avec `drawing.ts`, formulaire généré depuis le schéma des propriétés du type.
- Plans (onglet « Plans » de la fiche site, ADR-011) : même moteur MapLibre dans un repère local
  synthétique (`src/components/plan/local-frame.ts`, 1 pixel du plan = 1e-5°), sans fond cartographique.
  Un PDF est rendu page par page dans le navigateur avec pdf.js (`src/lib/plan-image.ts`, worker copié
  vers `public/pdfjs/` par le même script) ; seul le PNG obtenu est déposé. Espace de travail du plan
  (`plan-workspace.tsx`) : calques, ajout d’objets, de zones et de risques (Terra Draw), suppression,
  annulation de la dernière action, liste des éléments à replacer après un changement de fond et liste
  accessible au clavier des éléments du fond affiché ; pictogrammes de risques dessinés à la volée.
- Administration : onglets selon les permissions (Membres, Terminaux, Catalogue des risques du SIS).
- Photos des objets (PLAN-05) : section « Photos » de l’édition d’un objet, sur la carte comme sur le
  plan (`object-photos.tsx`) : dépôt contrôlé, vignettes par URL signée, légende, retrait.
- ETARE (ADR-013) : onglet « ETARE » de la fiche site (version publiée, révision en cours, contrôles avant
  validation, aperçu fidèle rendu depuis l’instantané par `components/etare/etare-document.tsx`,
  soumission, historique), page « ETARE » (dossiers du SIS), « Validations » (file et écran de contrôle :
  modifications depuis la version publiée, contributeurs, empreinte, décision motivée).
- Thème remplaçable : jetons dans `packages/ui/src/styles/globals.css`, nom/logo dans `src/config/brand.ts`.

## Worker (services/worker)

Boucle de réservation (`app.claim_jobs`, `FOR UPDATE SKIP LOCKED`), bail avec heartbeat, reprise
exponentielle avec aléa, erreurs permanentes → état `dead`, arrêt propre sur SIGTERM. Les handlers
valident leur payload avant tout effet et doivent être idempotents (livraison « au moins une fois »).
Handlers : `system.noop`, `publication.build` (fabrication d’une publication à partir de la révision
figée : charge utile, manifeste signé par la clé de publication Ed25519 (ADR-015), empreintes, PDF ETARE dessiné avec `pdf-lib` et déposé sous une clé
adressée par son empreinte, activation — ADR-013, ADR-014 ; chaque écriture est protégée par le jeton de
fencing du bail, et le handler s’arrête dès que le runner signale la perte du bail) et `asset.verify` (contrôle des
fichiers déposés, ADR-009), enregistré dès que `SUPABASE_URL` et `SUPABASE_SECRET_KEY` sont fournis. PDF, paquets hors ligne, miniatures, imports,
notifications et empreintes s’ajouteront comme handlers. Voir ADR-007.

## Distribution hors ligne

Voir ADR-015. Deux clés Ed25519 : la clé de publication (worker) signe chaque manifeste à la
fabrication, la clé de catalogue (API) signe le catalogue propre à chaque terminal. Les routes
`/sync/*` exigent le jeton de l’utilisateur et la signature du terminal (`X-Device-*`), vérifiée par
l’API puis par PostgreSQL (fonctions `sync_*`, permission `offline:download`). Les fichiers sont
adressés par empreinte et servis par URL signées de 5 minutes ; seuls les fichiers d’empreinte
nouvelle sont transférés.

## Mobile (apps/mobile)

Flutter en couches (`presentation / application / domain / data`), go_router, Riverpod, dio, Drift
sur SQLite **chiffrée (SQLCipher)**, stockage sécurisé des jetons, de la clé de base et de la graine du
terminal. Les versions publiées installées (données, plans, photos, documents, PDF) sont stockées dans
la base chiffrée et activées en une transaction (ADR-016). Écrans OPS lus sans réseau : recherche
locale, synthèse, listes par entrée, plans tactiles avec calques, fiches et photos. Détails dans
`apps/mobile/README.md`.

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
