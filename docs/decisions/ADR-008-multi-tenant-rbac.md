# ADR-008 — Isolation multi-SIS et RBAC

- Statut : acceptée — Sprint 0, 27/09/2026
- Sources : prompt §6, §7, §16 ; cahier des charges §3 ; architecture technique §17, §18

## Contexte

Un utilisateur du SIS A ne doit jamais accéder aux données du SIS B. Les documents divergeaient : le
modèle de données admet un rattachement au SIS « par héritage », l’architecture exige `tenant_id` partout ;
la matrice du cahier des charges laisse l’administrateur publier, l’architecture l’interdit sans rôle
validateur ; le prompt nomme `SUPER_ADMIN`, l’architecture refuse tout accès métier permanent à
l’administrateur plateforme. Arbitrage du porteur du projet : suivre l’architecture (27/09/2026).

## Décision

- Entité `tenant` (un SIS). `tenant_id NOT NULL` sur toute donnée d’un SIS, clés étrangères composites,
  `tenant_id` non modifiable.
- Contexte de requête posé par `app.begin_request()` (SECURITY DEFINER) : revérifie compte et adhésion
  en base, puis `set_config(..., true)` local à la transaction ; policies RLS fondées sur ce contexte et
  sur `app.has_permission(permission, site)`.
- RBAC extensible : `permission` fines, `role` (système ou propre à un SIS), `role_binding` avec portée
  `tenant` / `sector` / `site`, expiration, révocation.
- Rôles système : `SUPER_ADMIN` (plateforme, aucune permission métier, non liable à un SIS),
  `SIS_ADMIN` (ne valide ni ne publie), `PREVISION_EDITOR`, `PREVISION_VALIDATOR`, `OPS_USER`
  (publications seulement), `EXPLOITANT` (portail et contributions, portée site), `READER`.
- Séparation des tâches par rôle **et** par révision (ADR-005).
- Permissions privilégiées soumises au second facteur (`aal2`), paramétrable par SIS.
- La base est l’autorité ; `packages/domain` en est le miroir (test de parité en intégration).

## Conséquences

- Chaque table ajoutée doit déclarer ses policies (procédure `install_site_scoped_policies`) et ses tests.
- La portée `sector` nécessitera la table `sector` et une extension de `has_permission`.

## Critère de réexamen

Partage inter-SIS contrôlé (V1.5) : droits de partage explicites, jamais par suppression du filtre SIS.
