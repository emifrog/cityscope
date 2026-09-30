# Base de données

PostgreSQL 17 + PostGIS, via Supabase en local et au MVP. Le schéma métier `app` est **privé** : il n’est
pas exposé par la Data API Supabase (`supabase/config.toml` → `api.schemas`), aucun droit n’est accordé à
`anon`, `authenticated` ni `service_role`. Seuls `etare_api` et `etare_worker` y accèdent, sous RLS.

## Migrations

| Fichier                                           | Contenu                                                                                                                                                                            |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `…0100_foundation.sql`                            | extensions (schéma `extensions`), schéma `app`, rôles applicatifs, accesseurs de contexte, triggers génériques                                                                     |
| `…0200_tenancy_and_rbac.sql`                      | `tenant`, `user_account`, `membership`, `role`, `permission`, `role_binding`, `platform_admin`, `has_permission`, `begin_request`, `my_memberships`                                |
| `…0300_audit.sql`                                 | `audit_event` (ajout seul), trigger d’audit générique, `record_audit_event`                                                                                                        |
| `…0400_site_referential.sql`                      | `address`, `site`, `building`, `level`, `asset`, `plan`, `plan_revision`, `zone`                                                                                                   |
| `…0500_operational_objects_and_documents.sql`     | catalogues `object_type` / `risk_type` (+ données initiales du modèle §12), `operational_object`, `risk_occurrence`, `document`, `document_version`                                |
| `…0600_etare_publication.sql`                     | `etare`, `etare_revision`, `etare_revision_contributor`, `approval`, `publication` + gardes                                                                                        |
| `…0700_jobs.sql`                                  | file de tâches `job` et fonctions `enqueue/claim/heartbeat/complete/fail`                                                                                                          |
| `…0800_storage_supabase.sql`                      | seule migration spécifique Supabase : bucket privé `etare-assets` (gardée)                                                                                                         |
| `20260930084922_publication_access_hardening.sql` | lecture OPS limitée aux publications actives, références au même site, métadonnées publiées immuables                                                                              |
| `20260930085355_revision_authorship.sql`          | attribution des contributions par trigger, contrôle de l’auteur et du soumetteur, modification d’un brouillon réservée aux rédacteurs                                              |
| `20260930120000_role_timeouts.sql`                | délais `statement` / `idle in transaction` / `lock` portés par les rôles applicatifs (indépendants du pooler)                                                                      |
| `20261001000100_referential_editing.sql`          | Sprint 1 : `site_edit` (auteurs des données de travail), contributeurs collectés à la soumission, `site_classification`, `contact`, `external_identifier`, index de recherche      |
| `20261001000200_document_uploads.sql`             | Sprint 1 : clé de quarantaine et verdict de contrôle des `asset`, verdict réservé au worker et définitif, fonctions `worker_*_asset_verification`                                  |
| `20261001000300_member_administration.sql`        | Sprint 1 : `admin_add_member`, `admin_update_member` (anti-escalade, dernier administrateur), `holds_with_second_factor`, unicité des seules liaisons de rôle actives              |
| `20261002000100_operational_object_geometry.sql`  | Sprint 2 : objet toujours placé (carte ou plan), géométrie conforme au type (point, ligne, surface), propriétés typées des types clés (PEI, réserve, portail, voie engins…)        |
| `20261003000100_plan_placement_and_risks.sql`     | Sprint 3 : placement sur plan (fond courant, dans l’image, niveau du plan, zone déduite), portée zone ⊂ niveau ⊂ bâtiment, champs et libellé des risques, codes nationaux réservés |

## Correspondance avec les documents de cadrage

| Prompt Sprint 0   | Modèle de données (doc 02)              | Implémentation                                                                     |
| ----------------- | --------------------------------------- | ---------------------------------------------------------------------------------- |
| Tenant / SIS      | `sis_tenant`                            | `tenant` (« organization » désigne les exploitants)                                |
| User / Profile    | `user_account`                          | `user_account` (lié à l’IdP par `auth_subject`)                                    |
| Membership, Role  | `role`, `user_role`                     | `membership` + `role` + `permission` + `role_binding` (portée tenant/secteur/site) |
| Site, Building    | `site`, `building`, `address`           | idem                                                                               |
| Floor             | `level`                                 | `level`                                                                            |
| Zone              | `zone`                                  | `zone` (géométrie locale + WGS 84 optionnelle)                                     |
| OperationalObject | `object_type`, `operational_object`     | idem                                                                               |
| Risk              | `risk_type`, `risk_occurrence`          | idem                                                                               |
| Document          | `document`, `document_version`, `asset` | idem                                                                               |
| Etare             | `etare`                                 | `etare` (un dossier actif par site)                                                |
| EtareVersion      | `etare_version` / `approval`            | `etare_revision` (candidat figé, empreinte) + `approval`                           |
| Publication       | `published_snapshot`, `etare_version`   | `publication` (charge utile, manifeste, numéro par site)                           |
| AuditEvent        | `audit_event`                           | `audit_event`                                                                      |

Ajoutés au Sprint 1 : `site_classification` (classifications datées, historique par l’audit), `contact`
(audience explicite, interne par défaut), `external_identifier` (clés SIG/SGO/DECI, uniques par système
dans le SIS), `site_edit` (auteurs des modifications de chaque site).

Pas encore créés : `organization`, `sector`, `scenario`, `contribution`, `field_report`, `device`,
synchronisation, `access_event`, intégrations.

## Règles structurantes

- **UUID** partout (`gen_random_uuid()`), horodatages `timestamptz` UTC.
- **`tenant_id NOT NULL`** sur toute donnée d’un SIS, non modifiable (trigger).
- **Clés étrangères composites** `(tenant_id, …)` et `(tenant_id, site_id, …)` : une ligne ne peut
  référencer un parent d’un autre SIS ni d’un autre site (ex. un objet sur le niveau d’un autre site).
- **Pas de suppression physique** : aucun `DELETE` accordé, aucun `ON DELETE CASCADE` ; archivage par statut.
- **`row_version` + `updated_at`** maintenus par trigger (concurrence optimiste `If-Match` à venir).
- **`created_by`** renseigné depuis le contexte de requête.

## Géométrie

- Extérieur : `geometry(…, 4326)`, GeoJSON en longitude/latitude (site : point + emprise ; bâtiment :
  emprise ; objets, risques et zones : géométrie optionnelle). Index GiST.
- Intérieur : **coordonnées locales** (`geometry` SRID 0) liées à une `plan_revision` précise ; unité
  `pixel`, `normalized` ou `metre` (mètres seulement si le plan est calibré). Origine en haut à gauche,
  x vers la droite, y vers le bas. Le GPS n’est jamais utilisé pour positionner un équipement intérieur.
- Remplacer un plan crée une nouvelle `plan_revision` (le fond d’une révision est immuable) : numéro
  suivant, `is_current` basculé dans la même transaction (index unique partiel : une seule révision
  courante par plan). Le fond est un `asset` image contrôlé comme un document (ADR-009) ; un PDF est
  rendu en image dans le navigateur avant dépôt. Positions stockées en pixels du fond (ADR-011).

## Publication immuable

```text
données de travail ──submit──► etare_revision (snapshot + SHA-256 figés)
      ──approval (validateur distinct, même empreinte)──► révision approuvée
      ──publication (queued → building → ready → published)──► paquet OPS (à venir)
```

Garanties SQL (`tg_etare_revision_guard`, `tg_approval_guard`, `tg_publication_guard`) :

- une révision soumise ne change plus ; toute transition est contrôlée et soumise aux permissions ;
- une décision est en ajout seul, liée à l’empreinte ; l’auteur, le soumetteur ou un contributeur ne
  peut pas approuver (`SELF_APPROVAL_FORBIDDEN`), même s’il cumule les rôles ;
- les contributions sont enregistrées automatiquement par PostgreSQL à chaque écriture de brouillon ;
  l’API ne peut pas réattribuer cet historique ni soumettre au nom d’un autre utilisateur ;
- une publication construite ne change plus (`PUBLICATION_IMMUTABLE`), n’est jamais supprimée ; son
  numéro est strictement croissant par site ; une seule est active par site ; un build obsolète ne peut
  pas remplacer une publication plus récente (`OBSOLETE_PUBLICATION`) ;
- `site.active_publication_id` suit automatiquement la publication active.
- les références à une publication restent dans le même site ; une publication diffusée conserve
  aussi son auteur et sa date, même après remplacement ou retrait ;
- un profil OPS ne voit que les publications au statut `published`, jamais les brouillons,
  les paquets en construction ni les publications retirées. La consultation des états intermédiaires
  est réservée aux profils disposant aussi de `etare:read`.

## Auteurs des données de travail et séparation des tâches

Chaque écriture d’une donnée de travail (site, bâtiment, niveau, zone, plan, objet, risque, document,
contact, classification, identifiant externe) enregistre son auteur dans `app.site_edit`, par trigger
PostgreSQL : l’API ne peut ni écrire ni effacer cette table. Les mises à jour purement techniques (pointeur
de publication active) ne comptent pas. À la soumission d’une révision, tous les auteurs de modifications
postérieures à la dernière révision approuvée deviennent contributeurs de cette révision : aucun d’eux ne
peut l’approuver (test `60_referential_editing`).

## Concurrence optimiste

Les modifications (`PATCH`) exigent l’en-tête `If-Match` avec la `row_version` lue (réponse 428 sinon).
L’adaptateur verrouille la ligne (`SELECT … FOR UPDATE`, sous RLS), compare la version et répond 412 si
quelqu’un a modifié la fiche entre-temps : jamais d’écrasement silencieux. Les réponses portent un `ETag`.

## Fichiers et verdict de contrôle

Un `asset` naît `pending` avec sa `quarantine_key` (préfixée par son SIS, `CHECK`). Seul le worker rend
le verdict, par `app.worker_complete_asset_verification()` (`SECURITY DEFINER`, réservée à
`etare_worker`) : `clean` ou `rejected`, avec `scan_detail` et `verified_at`, et la clé de quarantaine
effacée. Le verdict est définitif (trigger, propriétaire compris). `etare_api` ne peut modifier que le nom,
la classification, l’autorisation hors ligne et la miniature (privilèges par colonne). Voir ADR-009 et le
test `70_document_uploads`.

## Points opérationnels

`app.operational_object` porte une position sur la carte (`geom`, WGS 84) et/ou sur un plan
(`local_geom`) ; l’une des deux est obligatoire et leur type géométrique suit celui du type d’objet
(trigger `operational_object_geometry_kind`). Les propriétés propres au type (débit d’un PEI, largeur
d’une voie engins…) sont décrites dans `object_type.properties_schema` par un sous-ensemble de JSON
Schema (`type`, `title`, `unit`, `oneOf`, bornes, longueur, format date, `required`) et validées par
l’application (`packages/domain/src/objects.ts`) : seules les propriétés déclarées sont acceptées.
Les distances au point du site se calculent en `geography` (mètres). Voir le test
`90_operational_objects`.

## Éléments des plans et risques

Le trigger `placement` (`zone`, `operational_object`, `risk_occurrence`) applique les règles de
l’ADR-012 : une position sur plan reste dans le fond de sa révision et n’est posée ou déplacée que sur la
révision courante ; le niveau et le bâtiment viennent du plan, la zone d’un objet ou d’un risque est la plus
petite zone active qui le contient ; zone, niveau et bâtiment doivent concorder (`placement_scope`). Les
risques (point ou surface) portent un libellé et les champs propres à leur type
(`risk_type.properties_schema`). Un type propre au SIS (`catalog:manage`) ne peut pas reprendre un code
national (`catalog_code_guard`). Voir le test `100_plan_placement`.

## Habilitations des membres

Les tables d’identité restent en lecture seule pour `etare_api` (RLS : un membre voit sa propre
adhésion, un détenteur de `member:manage` voit celles de son SIS). Les écritures passent par
`app.admin_add_member()` et `app.admin_update_member()` (`SECURITY DEFINER`) qui revérifient
`member:manage` (donc `aal2`) et refusent l’auto-modification (`ETSLF`), les rôles non attribuables à
l’échelle du SIS (`22023`), la perte du dernier administrateur actif (`ETADM`) et une version périmée
(`ET412`). Un rôle retiré est révoqué (`revoked_at`) : seules les liaisons actives sont uniques, ce qui
permet de le réattribuer en gardant l’historique. Voir ADR-010 et le test `80_member_administration`.

## Audit

`app.audit_event` : SIS, acteur, type d’acteur, action (`table.operation`), entité, avant/après,
résultat, motif, origine (web/mobile/api/worker/db), trace. Alimenté par un trigger générique sur toutes
les tables métier et par `app.record_audit_event()`. Aucun rôle applicatif ne peut y écrire directement ;
`UPDATE`, `DELETE` et `TRUNCATE` sont refusés à tous, propriétaire compris. Les colonnes volumineuses
(`payload`, `manifest`, `snapshot`) sont masquées.

## Tests

`supabase/tests/database/*.test.sql` (pgTAP, `pnpm test:db`) : invariants structurels, isolation
multi-SIS, RBAC/MFA/séparation des tâches, immutabilité des publications, audit, file de tâches,
édition du référentiel, verdict des fichiers, habilitations, placement sur les plans et catalogue des risques. Les tests d’intégration ajoutent des données à la base
locale : les assertions portent sur l’isolation, pas sur des listes exactes.
