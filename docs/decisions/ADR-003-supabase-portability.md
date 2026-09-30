# ADR-003 — Supabase au MVP, derrière des adaptateurs

- Statut : acceptée — Sprint 0, 27/09/2026
- Sources : prompt §3 ; architecture technique §04, §16, §17, §18, §26

## Contexte

Supabase accélère le pilote (PostgreSQL managé, Auth, Storage) mais le SIS peut exiger un autre
hébergement (instance dédiée, auto-hébergement, S3). Il faut éviter la dépendance aux fonctions
propriétaires.

## Décision

- Utilisés : PostgreSQL, **Auth** (identités, sessions, TOTP), **Storage** (bucket privé).
- Non utilisés : Data API (PostgREST) pour les données métier, Realtime, Edge Functions.
- Le schéma `app` n’est pas exposé ; les accès passent par l’API produit avec un rôle SQL dédié.
- `user_account` est relié à l’IdP par `(auth_provider, auth_subject)`, **sans clé étrangère vers
  `auth.users`**.
- Jetons **asymétriques (ES256)**, y compris en local (`supabase/signing_keys.json` généré) : l’API ne
  détient aucun secret partagé et vérifie via JWKS, comme avec un fournisseur OIDC.
- Stockage derrière le port `ObjectStorage` ; l’autorisation est faite en base avant d’émettre une URL
  signée, ce qui reste valable avec S3.
- Une seule migration spécifique Supabase (bucket), gardée pour s’appliquer aussi sur un PostgreSQL nu.

## Alternatives écartées

- Accès direct du front aux tables via la Data API et RLS `auth.uid()` : second chemin d’accès à
  auditer, couplage fort, logique métier dispersée.
- Clé `service_role` dans l’API pour « simplifier » : contournement de RLS, interdit.

## Conséquences

- Remplacer Auth ou Storage reste une migration réelle (comptes, fichiers, tests), mais sans toucher au
  modèle ni aux règles.
- Les sauvegardes PostgreSQL n’incluent pas les fichiers Storage : plan de sauvegarde objet à prévoir.

## Critère de réexamen

Exigences d’hébergement du SIS pilote (région, souveraineté, SSO) connues avant l’import de données réelles.
