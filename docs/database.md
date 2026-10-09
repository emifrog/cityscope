# Base de données

PostgreSQL 17 + PostGIS, via Supabase en local et au MVP. Le schéma métier `app` est **privé** : il n’est
pas exposé par la Data API Supabase (`supabase/config.toml` → `api.schemas`), aucun droit n’est accordé à
`anon`, `authenticated` ni `service_role`. Seuls `etare_api` et `etare_worker` y accèdent, sous RLS.

## Migrations

| Fichier                                            | Contenu                                                                                                                                                                                                                                                                                                                             |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `…0100_foundation.sql`                             | extensions (schéma `extensions`), schéma `app`, rôles applicatifs, accesseurs de contexte, triggers génériques                                                                                                                                                                                                                      |
| `…0200_tenancy_and_rbac.sql`                       | `tenant`, `user_account`, `membership`, `role`, `permission`, `role_binding`, `platform_admin`, `has_permission`, `begin_request`, `my_memberships`                                                                                                                                                                                 |
| `…0300_audit.sql`                                  | `audit_event` (ajout seul), trigger d’audit générique, `record_audit_event`                                                                                                                                                                                                                                                         |
| `…0400_site_referential.sql`                       | `address`, `site`, `building`, `level`, `asset`, `plan`, `plan_revision`, `zone`                                                                                                                                                                                                                                                    |
| `…0500_operational_objects_and_documents.sql`      | catalogues `object_type` / `risk_type` (+ données initiales du modèle §12), `operational_object`, `risk_occurrence`, `document`, `document_version`                                                                                                                                                                                 |
| `…0600_etare_publication.sql`                      | `etare`, `etare_revision`, `etare_revision_contributor`, `approval`, `publication` + gardes                                                                                                                                                                                                                                         |
| `…0700_jobs.sql`                                   | file de tâches `job` et fonctions `enqueue/claim/heartbeat/complete/fail`                                                                                                                                                                                                                                                           |
| `…0800_storage_supabase.sql`                       | seule migration spécifique Supabase : bucket privé `etare-assets` (gardée)                                                                                                                                                                                                                                                          |
| `20260930084922_publication_access_hardening.sql`  | lecture OPS limitée aux publications actives, références au même site, métadonnées publiées immuables                                                                                                                                                                                                                               |
| `20260930085355_revision_authorship.sql`           | attribution des contributions par trigger, contrôle de l’auteur et du soumetteur, modification d’un brouillon réservée aux rédacteurs                                                                                                                                                                                               |
| `20260930120000_role_timeouts.sql`                 | délais `statement` / `idle in transaction` / `lock` portés par les rôles applicatifs (indépendants du pooler)                                                                                                                                                                                                                       |
| `20261001000100_referential_editing.sql`           | Sprint 1 : `site_edit` (auteurs des données de travail), contributeurs collectés à la soumission, `site_classification`, `contact`, `external_identifier`, index de recherche                                                                                                                                                       |
| `20261001000200_document_uploads.sql`              | Sprint 1 : clé de quarantaine et verdict de contrôle des `asset`, verdict réservé au worker et définitif, fonctions `worker_*_asset_verification`                                                                                                                                                                                   |
| `20261001000300_member_administration.sql`         | Sprint 1 : `admin_add_member`, `admin_update_member` (anti-escalade, dernier administrateur), `holds_with_second_factor`, unicité des seules liaisons de rôle actives                                                                                                                                                               |
| `20261002000100_operational_object_geometry.sql`   | Sprint 2 : objet toujours placé (carte ou plan), géométrie conforme au type (point, ligne, surface), propriétés typées des types clés (PEI, réserve, portail, voie engins…)                                                                                                                                                         |
| `20261003000100_plan_placement_and_risks.sql`      | Sprint 3 : placement sur plan (fond courant, dans l’image, niveau du plan, zone déduite), portée zone ⊂ niveau ⊂ bâtiment, champs et libellé des risques, codes nationaux réservés                                                                                                                                                  |
| `20261003000200_etare_workflow.sql`                | Sprint 3 : `member_name` (noms des membres du SIS pour le workflow), fabrication des publications par le worker (`worker_start/complete/fail_publication`)                                                                                                                                                                          |
| `20261003000400_publication_build_consistency.sql` | Correctifs du 30/09/2026 : fencing de la fabrication par le bail du travail (`lock_publication_job`), PDF immuable (`publication.pdf_storage_key`), baux expirés sans effet, échec définitif d’un travail propagé à la publication                                                                                                  |
| `20261003000300_publication_pdf.sql`               | Sprint 3 : `worker_publication_assets` (clés de stockage des fonds de plans contrôlés d’une publication, pour le PDF)                                                                                                                                                                                                               |
| `20261004000100_offline_distribution.sql`          | Sprint 4 : manifeste signé (`publication.manifest_signature`), terminaux (`device`), génération du catalogue par SIS, état et publications des terminaux, fonctions `admin_*_device`, `enroll_device`, `sync_*`                                                                                                                     |
| `20261005000100_field_reports.sql`                 | Sprint 5 : signalements terrain (`field_report`, `field_report_photo`), permission `field_report:review`, fonctions `sync_*report*` des terminaux, photos de signalement exclues des auteurs des données de travail                                                                                                                 |
| `20261004000200_object_photos.sql`                 | Sprint 4 : photos des objets (`object_photo`) : image contrôlée du même site, rattachement immuable, archivage définitif, jamais supprimée                                                                                                                                                                                          |
| `20261014000100_etare_layout.sql`                  | Sprint 10 : sections masquées par le SIS (`etare_layout_settings`, `update_etare_layout_settings`, `catalog:manage`, audité), figées dans l’instantané soumis                                                                                                                                                                       |
| `20261014000300_sensitive_sites.sql`               | Sprint 10 : sensibilité effective, habilitation nominative datée (`sensitive_habilitation`), journal `access_event` (ajout seul), ouverture à la demande des sites restreints (`on_demand`), sites élevés jamais distribués                                                                                                         |
| `20261014000200_sectors.sql`                       | Sprint 10 : `sector`, `sector_commune`, `sector_site`, portée « secteur » de `has_permission`, `holds_permission_on_part`, affectation des terminaux (`device.scope`, `device_sector`), catalogue à l’intersection et retraits « périmètre »                                                                                        |
| `20261021000100_basemaps.sql`                      | Sprint 11 : fonds de carte par secteur (`basemap_pack`, `device_basemap`), couverture (`basemap_coverage`), planification et préparation par le worker (`worker_*_basemap*`), distribution aux terminaux (`sync_basemap*`)                                                                                                          |
| `20261021000200_worker_slots.sql`                  | Sprint 11 : `claim_jobs` exclut les types de travaux qu’un worker mène déjà (une préparation de fond à la fois)                                                                                                                                                                                                                     |
| `20261021000300_basemap_signed_detail.sql`         | Sprint 11 : zones de détail des fonds limitées aux sites de version signée (réellement diffusés)                                                                                                                                                                                                                                    |
| `20261113000100_exports.sql`                       | Sprint 14 (ADMIN-04, ADR-033) : permission `export:manage` (second facteur), `export_run` (demande, parties, objets écrits), fonctions `request_export`, `export_runs`, `export_part` (audité), côté worker lecture des tables par liste blanche et pages (`worker_export_rows`), fichiers, clôture par le travail, purge à 7 jours |
| `20261112000100_hazardous_substances.sql`          | Sprint 14 (RISK-03, ADR-032) : `hazardous_substance` (produit, classes CLP, n° ONU, quantité, localisation, FDS = document du site classé `fds`), portée site, audit, édition comptée dans la révision                                                                                                                              |
| `20261111000100_backups.sql`                       | EXP-02 (ADR-031) : rôle `etare_backup` (lecture globale, `BYPASSRLS` pour `pg_dump`), journal `backup_run`, âge de la dernière sauvegarde dans `platform_metrics`                                                                                                                                                                   |
| `20261104000100_terminal_security.sql`             | Sprint 13 (SEC-05) : algorithme de la clé du terminal (`ed25519`, `ecdsa-p256` du Keystore), rotation signée par le terminal (`sync_rotate_device_key`, auditée), politique des tablettes du SIS (`terminal_policy`, `update_terminal_policy`, `sync_terminal_policy`)                                                              |
| `20261028000300_perimeter_sets.sql`                | Sprint 12 (CAP-01) : périmètres évalués une fois par instruction (`permitted_site_ids`, `sector_site_ids`, `device_site_ids`, 65 politiques réécrites), recherche par les index trigrammes (`site_ids_matching`), `current_permissions` en une requête, `has_permission` en PL/pgSQL                                                |
| `20261028000200_supervision.sql`                   | Sprint 12 : chronologie des travaux (`started_at`, `first_started_at`), `worker_heartbeat`, historique des reçus (`device_sync_event`), purge `maintenance.database`, `platform_metrics`, `tenant_supervision`                                                                                                                      |
| `20261028000100_signature_rotation.sql`            | Sprint 12 : re-signatures après une rotation de clé (`publication_signature`, `basemap_pack_signature`), travail `signatures.renew`, `sync_renewed_signatures`, jeu de clés déclaré par les terminaux (`device_sync_state.keyset_sequence`)                                                                                         |

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

Ajoutés au Sprint 10 : `sector` (groupes de sites par commune et site par site, plutôt qu’une géométrie),
`device_sector` (affectation des terminaux, à la place de `sync_subscription`).

`access_event` est créé au Sprint 10 (journal des sites sensibles), avec `sensitive_habilitation`.

Pas encore créés : `organization`, `scenario`, intégrations.

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
      ──publication (queued → building → ready → published)──► paquet signé ──► terminaux (ADR-015)
```

Le contenu figé est l’instantané canonique de l’ADR-013 ; son SHA-256 (JSON canonique) est calculé par l’API
à la soumission, dans une transaction `REPEATABLE READ` (un seul état de la base pour toutes les tables
lues et pour les contributeurs collectés). Le worker fabrique la publication par
`worker_start_publication` (queued → building, filtré par SIS), `worker_complete_publication` (charge
utile, manifeste, empreinte et clé du PDF immuable, puis activation : la version précédente est remplacée,
un build obsolète est classé `superseded`) et `worker_fail_publication` (la version active reste en place).
Chacune revérifie, sous verrou de la ligne du travail, l’identifiant du travail, son numéro de tentative et
la validité du bail (`lock_publication_job`) : une tentative périmée n’a aucun effet. Le déclencheur
`job_publication_terminal_failure` fait passer `failed` une publication dont le travail est `dead`. Voir
les tests `50_jobs` et `110_publication_build`.

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

## Cycle de vie d'un dossier

Voir ADR-021. Retrait de la version en vigueur sous RLS (`publication:publish`, second facteur) avec un
motif ; le trigger `publication_withdrawal` enregistre `withdrawn_at` et `withdrawn_by`. Archivage d'un
site (`site:write`, `archive_reason` obligatoire) : le trigger `site_archive` le refuse tant qu'une version
est en vigueur (`SITE_PUBLISHED`), qu'une publication est en fabrication (`SITE_PUBLICATION_PENDING`) ou
qu'une révision attend une décision (`SITE_REVISION_SUBMITTED`), et enregistre qui et quand ;
`site_archive_effects` clôt les brouillons et archive le dossier (réactivé à la restauration) ;
`archived_site_frozen` refuse toute révision ou publication sur un site archivé. `sync_catalog` ajoute les
raisons des disparitions (`withdrawals`) pour les sites que le terminal détient. Voir le test
`200_lifecycle`.

## Distribution hors ligne

Voir ADR-015. Le worker écrit la signature Ed25519 du manifeste avec le résultat de la fabrication
(`worker_complete_publication`) ; elle ne change plus ensuite (`tg_publication_signature_guard`). Une
publication est **distribuable** à un terminal si elle est publiée, signée, d’un site non sensible, dans
le périmètre du terminal et lisible par l’utilisateur (`distributable_publication(publication, terminal)`,
Sprint 10).

- `device` : terminal d’un SIS, `pending` (code d’enrôlement haché, échéance) → `active` (clé publique,
  plateforme, enrôleur) → `revoked` (date, auteur, motif). Jamais supprimé ; enrôlement et révocation
  définitifs (`tg_device_guard`) ; nom unique parmi les terminaux non révoqués ; clé publique unique.
  Créations et changements audités, sans le hash du code.
- `distribution_generation` : compteur par SIS, avancé par `tg_publication_distribution_generation`
  chaque fois qu’une version entre en publication ou en sort.
- `device_sync_state` (dernier contact, version d’application, génération annoncée, dernier reçu) et
  `device_publication` (versions actives sur le terminal, une par site) : écrits par les fonctions de
  synchronisation seulement, non audités ligne à ligne (ils changent à chaque contact).
- L’administration lit ces tables sous RLS (`device:manage`, second facteur) et les modifie par
  `admin_create_device`, `admin_renew_device_code`, `admin_revoke_device` (version attendue).
- Les terminaux passent par `enroll_device` (code valide du SIS courant, une seule fois), `sync_device`
  (statut et clé, pour que l’API vérifie la preuve), `sync_catalog` (génération et liste lues dans une
  seule instruction), `sync_package`, `sync_package_files` (clés de stockage par empreinte, parmi les
  fichiers du manifeste et les fichiers contrôlés référencés par la charge utile) et `sync_receipt`.
  Toutes exigent `offline:download` et un terminal enrôlé, non révoqué, du SIS courant. Voir le test
  `120_offline_distribution`.

### Rotation des clés de signature (Sprint 12, ADR-027)

- La signature faite à la fabrication reste immuable. Après une rotation, le worker ajoute des
  re-signatures : `publication_signature` et `basemap_pack_signature`, une par contenu et par clé.
  - Elles sont écrites par `worker_record_signature`, seulement pour un contenu en vigueur : version
    publiée, fond prêt.
  - Chaque re-signature est tracée au journal du SIS (`publication.resigned`, `basemap.resigned`).
- `worker_signature_candidates(clé, limite, exclus)` liste les contenus en vigueur que la clé n'a pas
  signés, avec leurs signatures. Le worker vérifie l'empreinte et une signature d'origine avant de
  signer ; ce qu'il n'a pas pu vérifier est exclu pour le reste du passage.
- `worker_schedule_signature_renewal` met en file un travail `signatures.renew` par clé et par heure.
- `sync_renewed_signatures(terminal, type, contenu)` rend aux terminaux du SIS les re-signatures,
  de la plus ancienne à la plus récente. L'API choisit celle à servir selon le jeu de clés.
- `sync_receipt` reçoit le numéro du jeu de clés du terminal (`device_sync_state.keyset_sequence`,
  absent avant l'application 0.4.0).
- Les deux tables ne sont lisibles par aucun rôle applicatif. Voir le test `290_signature_rotation`.

## Supervision (Sprint 12, ADR-028)

- `job.started_at` (prise de la tentative en cours) et `job.first_started_at` (première prise),
  posés par `claim_jobs` : l'attente en file et le calcul se mesurent séparément.
- `worker_heartbeat` : un battement par worker toutes les 30 secondes (`worker_beat`), avec sa
  version et ses types de travaux ; l'arrêt propre est noté.
- `device_sync_event` : chaque reçu de terminal, gardé 90 jours. `sync_receipt` l'alimente avec
  `device_sync_state`.
- `worker_purge_history` (travail `maintenance.database`, une fois par heure) :
  - travaux réussis après 30 jours, morts après 90 jours ;
  - reçus après 90 jours, battements de cœur après 7 jours ;
  - fenêtres de limitation de débit après un jour.
- `platform_metrics()` (rôle `etare_api`, point de métriques de l'exploitant) : agrégats de la
  plateforme, par type de travail et par SIS, sans aucune ligne ni identifiant.
- `tenant_supervision()` : tableau du SIS courant, `audit:read`.
- Ces tables ne sont lisibles par aucun rôle applicatif. Voir le test `300_supervision`.

## Signalements terrain

Voir ADR-017. `app.field_report` conserve le constat d’un agent sur la version publiée qu’il consultait
(`publication_id`, élément et point sur plan vérifiés dans l’instantané de cette version), reçu une seule
fois par (SIS, terminal, `client_report_id`) avec l’empreinte du contenu accepté (`content_hash`). Le
trigger `field_report_guard` rend le constat immuable et non supprimable, fait avancer l’instruction
(`new` → `triaged` → `resolved` ou `rejected`, décision motivée et définitive), n’affecte qu’à un
membre actif du SIS et ne relie qu’à une révision en brouillon du même site. L’API ne peut modifier que
les colonnes d’instruction, sous RLS (`field_report:review`) ; l’agent voit ses propres signalements.
Les terminaux passent par `sync_submit_report`, `sync_report_photos`, `sync_report_uploaded` et
`sync_reports` (terminal enrôlé, `offline:download`, `field_report:create`). Les photos
(`field_report_photo`) sont des `asset` de la chaîne contrôlée. Voir le test `140_field_reports`.

## Accès des exploitants

Voir ADR-019. `app.portal_invitation` (et ses sites, `portal_invitation_site`) invite une personne sur
des sites du SIS : acceptable jusqu'à `expires_at` (30 jours au plus), une seule fois, révocable, avec
une fin d'accès facultative (`access_until`). Le trigger `portal_invitation_guard` interdit toute
modification de la personne, des dates et des sites, toute suppression, et rend la révocation définitive.
`portal_invite` (inviteurs, `portal:invite` en `aal2`), `my_portal_invitations` et
`portal_accept_invitation` (invité, sans SIS actif), `portal_revoke_invitation` et
`portal_access_state` sont des fonctions `SECURITY DEFINER`. L'acceptation crée l'adhésion si besoin et
une liaison `EXPLOITANT` par site ; `exploitant_binding_scope` refuse toute liaison `EXPLOITANT` à
l'échelle du SIS. Les permissions `portal_mfa` exigent `aal2` si le paramètre du SIS
`portal_mfa_required` (défaut : vrai) l'impose. Voir le test `150_exploitant_access`.

La consultation (POR-02) lit la **version publiée** : `portal_sites`, `portal_site` (liste blanche
construite champ par champ dans la charge utile) et `portal_document_file` (fichier d'un document
`portal_visible` de la publication active, vérifié par identifiant et empreinte), filtrées site par site
par `has_permission('portal:read', site)`. `document.portal_visible` est saisi sur les données de travail
et figé dans l'instantané. Voir le test `160_portal_consultation`.

Les propositions (POR-03/04) : `app.contribution` (cible, opération, valeur vue dans la version publiée
`base_value` copiée par `portal_submit_contribution`, valeur proposée, instruction), `contribution_message`
(en ajout seul) et `contribution_attachment` (fichiers de la chaîne contrôlée, exclus de `site_edit`). Le
trigger `contribution_guard` fige la proposition, fait avancer l'instruction (`submitted` → `in_review` ↔
`info_requested` → `accepted`, `partially_accepted`, `rejected`, ou `withdrawn` par l'auteur), exige une
révision en brouillon pour accepter et une résolution motivée en cas de conflit
(`contribution_in_conflict` : valeur de travail actuelle, `contribution_working_value`, différente de la
valeur vue). La Prévision instruit sous RLS (`contribution:review`, colonnes d'instruction seules) ;
l'exploitant passe par les fonctions `portal_*contribution*`. Voir le test `170_exploitant_contributions`.

## Notifications

Voir ADR-020. `app.notification` est écrite dans la transaction de l'événement avec son travail
`notification.send` : question posée ou décision sur une proposition (trigger `contribution_notify`),
invitation d'un compte existant (`notify_portal_invitation`, une fois). Le worker lit le strict nécessaire
(`worker_notification`, filtrée par le SIS du travail) et enregistre chaque tentative
(`worker_record_notification`) ; un travail abandonné passe la notification en échec
(`job_notification_terminal_failure`). L'administration du SIS la lit sous RLS (`member:manage`) et la
renvoie (`admin_retry_notification`). Voir le test `180_notifications`.

## Auteurs des données de travail et séparation des tâches

Chaque écriture d’une donnée de travail (site, bâtiment, niveau, zone, plan, objet, risque, document,
contact, classification, identifiant externe) enregistre son auteur dans `app.site_edit`, par trigger
PostgreSQL : l’API ne peut ni écrire ni effacer cette table. Les mises à jour purement techniques (pointeur
de publication active) ne comptent pas. À la soumission d’une révision, tous les auteurs de modifications
postérieures à la dernière révision approuvée deviennent contributeurs de cette révision : aucun d’eux ne
peut l’approuver (test `60_referential_editing`). Une photo jointe à un signalement terrain n’est pas une
donnée de travail : son dépôt n’inscrit pas l’agent parmi les auteurs (test `140_field_reports`).

## Concurrence optimiste

Les modifications (`PATCH`) exigent l’en-tête `If-Match` avec la `row_version` lue (réponse 428 sinon).
L’adaptateur verrouille la ligne (`SELECT … FOR UPDATE`, sous RLS), compare la version et répond 412 si
quelqu’un a modifié la fiche entre-temps : jamais d’écrasement silencieux. Les réponses portent un `ETag`.

## Fichiers et verdict de contrôle

Un `asset` naît `pending` avec sa `quarantine_key` (préfixée par son SIS, `CHECK`). Seul le worker rend
le verdict, par `app.worker_complete_asset_verification()` (`SECURITY DEFINER`, réservée à
`etare_worker`) : `clean` ou `rejected`, avec `scan_detail` et `verified_at`, et la clé de quarantaine
effacée. Le verdict est définitif (trigger, propriétaire compris). `etare_api` ne peut modifier que le nom,
la classification et l’autorisation hors ligne (privilèges par colonne). Voir ADR-009 et le test
`70_document_uploads`.

Cycle des fichiers (Sprint 9) :

- Une image déclarée `clean` planifie `asset.thumbnail` (trigger). Le worker enregistre `thumbnail_key`
  et `preview_key` (`worker_record_asset_variants`, réservées à une image `clean`).
- Un `asset.verify` mort rejette l’asset (`VERIFICATION_FAILED`).
- `publication_output` note chaque PDF écrit par une fabrication.
- La maintenance (`worker_schedule_maintenance`, `worker_quarantine_to_release`,
  `worker_release_quarantine`, `worker_publication_outputs_to_purge`,
  `worker_mark_publication_output_removed`) n’a pour candidats que des objets qu’aucune ligne ne
  conserve, et audite chaque retrait.

Voir le test `240_file_lifecycle`.

## Points opérationnels

`app.operational_object` porte une position sur la carte (`geom`, WGS 84) et/ou sur un plan
(`local_geom`) ; l’une des deux est obligatoire et leur type géométrique suit celui du type d’objet
(trigger `operational_object_geometry_kind`). Les propriétés propres au type (débit d’un PEI, largeur
d’une voie engins…) sont décrites dans `object_type.properties_schema` par un sous-ensemble de JSON
Schema (`type`, `title`, `unit`, `oneOf`, bornes, longueur, format date, `required`) et validées par
l’application (`packages/domain/src/objects.ts`) : seules les propriétés déclarées sont acceptées.
Les distances au point du site se calculent en `geography` (mètres). Voir le test
`90_operational_objects`.

Une photo d’objet (`app.object_photo`, PLAN-05) relie un `asset` à un objet du même site. Le trigger
`object_photo_guard` exige une image (PNG, JPEG, WebP) déposée pour ce site, garde le rattachement à
l’objet et au fichier, rend l’archivage définitif et interdit la suppression ; un fichier n’illustre
qu’une photo. La photo suit la chaîne de dépôt contrôlé (ADR-009) : seules les photos actives au verdict
`clean` entrent dans l’instantané ETARE, et une photo en contrôle ou refusée bloque la soumission
(contrôle « Photos contrôlées »). Voir le test `130_object_photos`.

## Éléments des plans et risques

Le trigger `placement` (`zone`, `operational_object`, `risk_occurrence`) applique les règles de
l’ADR-012 : une position sur plan reste dans le fond de sa révision et n’est posée ou déplacée que sur la
révision courante ; le niveau et le bâtiment viennent du plan, la zone d’un objet ou d’un risque est la plus
petite zone active qui le contient ; zone, niveau et bâtiment doivent concorder (`placement_scope`). Les
risques (point ou surface) portent un libellé et les champs propres à leur type
(`risk_type.properties_schema`). Un type propre au SIS (`catalog:manage`) ne peut pas reprendre un code
national (`catalog_code_guard`). Voir le test `100_plan_placement`.

Cohérence des zones (MET-03) : `zone_for_position` donne la plus petite zone active d'un fond couvrant une
position ; le trigger `zone_reattach` (création, déplacement, archivage ou réactivation d'une zone)
rattache de nouveau les objets et risques placés sur ce fond et retire une zone archivée aux risques sans
position. Un élément placé tire toujours sa zone de sa position. Un risque peut aussi être situé sur la carte
(`risk_occurrence.geom`, point ou polygone, MET-02). Voir le test `190_zone_consistency`.

## Secteurs et périmètres

Voir ADR-025 (DEC-04) et le test `260_sectors`.

- **Secteur** (`sector`) : groupe nommé de sites d’un SIS, actif ou archivé, nom unique parmi les secteurs
  actifs. Il contient :
  - les sites de ses communes (`sector_commune`, code INSEE de l’adresse, sites futurs compris) ;
  - les sites ajoutés un à un (`sector_site`).

  `site_in_sector` répond pour un site et un secteur actif.

- **Membres** : une liaison de rôle de portée `sector` vaut pour les sites du secteur dans
  `has_permission`. Une adhésion partage un seul périmètre entre ses rôles :
  - `admin_set_member_perimeter` le fixe ;
  - `admin_update_member` le conserve quand les rôles changent (`rebind_member` garde les liaisons
    inchangées, révoque les autres, crée les manquantes) ;
  - l’administration du SIS n’est jamais limitée (`ETSCP`) ;
  - `holds_permission_on_part` laisse passer l’API, et la RLS ne montre que la part du SIS.
- **Terminaux** :
  - `device.scope` vaut `tenant` (tout le SIS, explicitement) ou `sectors` (`device_sector`) ;
  - `admin_set_device_perimeter` le change ;
  - `device_covers_site` répond pour un site.
- **Catalogue** (`sync_catalog`) :
  - il contient l’intersection du périmètre du terminal et de celui de la personne ;
  - un site détenu qui en sort est annoncé `perimeter`, avec le motif « Hors des secteurs de cette
    tablette », « Hors de votre périmètre » ou site devenu sensible.
- **Génération** : toute composition ou affectation fait avancer la génération du catalogue
  (`touch_distribution_generation`).
- **Archivage** : un secteur encore affecté à des membres ou des terminaux n’est pas archivé (`ETSCU`).
- **Audit** : compositions et périmètres sont audités (`sector.composition`, `member.perimeter`,
  `device.perimeter`).

## Sites sensibles

Voir ADR-025 (DEC-04) et le test `270_sensitive_sites`.

- **Sensibilité effective** (`effective_sensitivity`) : la plus restrictive de la version publiée et du
  site au moment présent. Changer la sensibilité d’un site fait avancer la génération du catalogue.
- **Habilitation** (`sensitive_habilitation`) :
  - nominative, pour tout le SIS ou par secteur, datée de douze mois au plus (`ETHAB`) ;
  - révocable, auditée ;
  - fixée par `admin_set_sensitive_access` (`member:manage`) ;
  - `holds_sensitive_access` répond pour la personne courante et un site.
- **Distribution** :
  - `distributable_publication` sert un site normal, ou un site restreint à une personne habilitée,
    jamais un site élevé ;
  - `sync_catalog` sépare `publications` (installées en masse) et `on_demand` (sites restreints
    proposés à la demande).
- **Journal** (`access_event`) :
  - ajout seul, lisible avec `audit:read` ;
  - `record_site_access` n’écrit que pour un site sensible : consultations du web comptées une fois par
    cinq minutes, événements des tablettes une fois par identifiant, horloge de tablette bornée ;
  - `access_journal` le lit pour l’administration.
- **Export** : `publication_export_allowed` réserve le PDF d’un site sensible à ses rôles du back-office,
  ou aux personnes habilitées pour un site restreint.

## Fonds de carte

Voir ADR-024 (DEC-02) et le test `280_basemaps`.

- **`basemap_pack`** : un fond par secteur et par version.
  - États : `queued` → `building` → `ready`, puis `superseded` à la version suivante, ou `failed`
    avec un code et un motif.
  - Un seul fond en vigueur et une seule préparation à la fois par secteur (index uniques partiels).
  - Le manifeste est signé par la clé des publications (worker). Les parties de chaque fichier sont
    rangées avec leur clé de stockage.
  - Tous les objets écrits sont enregistrés avant l'écriture, pour le nettoyage d'une préparation
    interrompue.
- **Couverture** (`basemap_coverage`) :
  - emprise des sites localisés du secteur (vue générale) ;
  - points de détail : sites de version signée en vigueur et de sensibilité normale ;
  - une signature qui change quand l'un ou l'autre change.
- **Planification** (`worker_plan_basemaps`, travail `basemap.plan` par quart d'heure) :
  - secteurs reçus par au moins une tablette, pour un premier fond, des sites modifiés, une nouvelle
    source ou le renouvellement semestriel ;
  - une préparation dont le travail est mort passe en échec, un échec sur la même couverture attend un
    jour ;
  - `request_basemap_build` (`device:manage`, audité) prépare un secteur à la demande.
- **Distribution** :
  - `sync_basemaps` liste les fonds en vigueur des secteurs de la tablette (tous pour « tout le SIS ») ;
  - `sync_basemap` et `sync_basemap_files` servent le manifeste et les clés des parties ;
  - `sync_basemap_receipt` tient `device_basemap`, ce que chaque tablette détient.
- **Nettoyage** : les fichiers d'une version remplacée sont effacés après une semaine, ceux d'une
  préparation échouée aussitôt (`worker_basemap_objects_to_remove`).
- Les tables ne sont lisibles par aucun rôle applicatif : tout passe par les fonctions ci-dessus.

## Habilitations des membres

Les tables d’identité restent en lecture seule pour `etare_api` (RLS : un membre voit sa propre
adhésion, un détenteur de `member:manage` voit celles de son SIS). Les écritures passent par
`app.admin_add_member()` et `app.admin_update_member()` (`SECURITY DEFINER`) qui revérifient
`member:manage` (donc `aal2`) et refusent l’auto-modification (`ETSLF`), les rôles non attribuables à
l’échelle du SIS (`22023`), la perte du dernier administrateur actif (`ETADM`) et une version périmée
(`ET412`). Un rôle retiré est révoqué (`revoked_at`) : seules les liaisons actives sont uniques, ce qui
permet de le réattribuer en gardant l’historique. Voir ADR-010 et le test `80_member_administration`.

## Second facteur et sessions

`app.begin_request` reçoit aussi la session du jeton, le terminal d'une requête signée et le motif
(`profile`, `enrollment`). Le jeton d'une session fermée est refusé (`ETSES`). Un compte qui a un second
facteur vérifié est refusé sans code (`ETMFA`) ; quand la politique du SIS est `all`
(`tenant.settings.mfa_required_for_all`), il en va de même pour un membre sans second facteur (`ETMFE`).
Les exploitants restent hors de cette règle. Exceptions : le profil, une tablette active du SIS et
l'enrôlement. La portée de la requête (`app.factor_scope`) restreint alors `has_permission` aux
permissions de synchronisation, à `offline:download`, ou à rien.

Les fonctions `app.idp_*` sont les seules à lire le schéma `auth` : facteurs, sessions, dernière
connexion, fermeture de sessions. Elles sont gardées pour un PostgreSQL nu. Une suspension
(`admin_update_member`) ferme toutes les sessions de la personne. `security_settings` et
`update_security_settings` lisent et modifient la politique ; une modification exige `aal2` et est
tracée. Voir ADR-022 et le test `210_second_factor`.

Récupération : `app.recovery_code` (empreintes SHA-256 du compte et du code, jamais lisibles par
l'API, jamais supprimées : utilisées ou annulées). Fonctions : `regenerate_recovery_codes` (second
facteur en cours d'usage), `use_recovery_code` (motif `recovery`, `ETRCV` si invalide) et
`admin_reset_second_factor` (refusée pour soi-même `ETSLF` ou pour un membre d'un autre SIS
`ETXTN`). Toutes passent par `remove_second_factor` : facteurs retirés, codes annulés, sessions
fermées, `user_account.second_factor_reenrollment`, que `begin_request` lève à la première requête
`aal2` (refus `ETMFR` d'ici là). Voir le test `220_account_recovery`.

## Audit

`app.audit_event` : SIS, acteur, type d’acteur, action (`table.operation`), entité, avant/après,
résultat, motif, origine (web/mobile/api/worker/db), trace. Alimenté par un trigger générique sur toutes
les tables métier et par `app.record_audit_event()`. Aucun rôle applicatif ne peut y écrire directement ;
`UPDATE`, `DELETE` et `TRUNCATE` sont refusés à tous, propriétaire compris. Les colonnes volumineuses
(`payload`, `manifest`, `snapshot`) sont masquées.

## Tests

`supabase/tests/database/*.test.sql` (pgTAP, `pnpm test:db`) : invariants structurels, isolation
multi-SIS, RBAC/MFA/séparation des tâches, immutabilité des publications, audit, file de tâches,
édition du référentiel, verdict des fichiers, habilitations, placement sur les plans et catalogue des
risques, distribution hors ligne et photos des objets. Les tests d’intégration ajoutent des données à la
base locale : les assertions portent sur l’isolation, pas sur des listes exactes. Les tests pgTAP
supposent la base du seed : relancer `pnpm db:reset` après une démonstration (publication, enrôlement).
