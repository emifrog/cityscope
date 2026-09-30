# Sécurité

Principe : **secure by default**. Toute exception doit être justifiée ici.

## Isolation multi-SIS — quatre niveaux

1. **Modèle** : toute donnée d’un SIS porte `tenant_id NOT NULL` ; un utilisateur peut appartenir à
   plusieurs SIS mais chaque requête a un SIS actif unique.
2. **Contraintes SQL** : clés étrangères composites incluant `tenant_id` (et `site_id`), `tenant_id`
   non réaffectable (trigger), clés de stockage préfixées par le SIS (`CHECK`).
3. **RLS** : activée sur **toutes** les tables du schéma `app` (vérifié par test). Les policies lisent le
   contexte posé par `app.begin_request()` ; en l’absence de contexte, rien n’est visible.
4. **Application** : l’API exige le SIS actif, les cas d’usage vérifient les permissions, les requêtes
   filtrent aussi explicitement sur le SIS, les réponses sont validées contre le contrat.

Un identifiant de SIS envoyé par un client n’est **jamais** une autorisation : `begin_request` revérifie
l’adhésion active en base (réponse 403 sinon). Un site d’un autre SIS répond 404 (les identifiants ne
révèlent rien). Tests : `supabase/tests/database/10_tenant_isolation.test.sql`,
`tests/integration/vertical-slice.test.ts`.

## Identités, rôles et permissions

- Authentification : Supabase Auth (MVP), jetons **ES256** vérifiés par l’API via JWKS (signature,
  émetteur, audience, expiration, rôle `authenticated`, sessions anonymes refusées, HS256 refusé).
- Le produit ne dépend pas de `auth.users` : `user_account` est relié par `(auth_provider, auth_subject)`.
- Inscription libre désactivée ; mots de passe ≥ 12 caractères avec classes de caractères.
- RBAC extensible : rôles = ensembles de permissions (`app.permission`), liaisons avec portée
  `tenant` / `site` (et `sector` à venir), expiration et révocation.
- `SUPER_ADMIN` (plateforme) n’a **aucune permission métier** et ne peut pas être lié à un SIS ; un
  accès support exceptionnel, temporaire et journalisé sera un mécanisme distinct (non développé).
- `SIS_ADMIN` administre mais **ne valide ni ne publie** sans le rôle validateur.
- **Séparation des tâches** : `PREVISION_EDITOR ≠ PREVISION_VALIDATOR`, et en base le validateur ne
  peut pas être l’auteur, le soumetteur ni un contributeur de la révision (même en cumulant les rôles).
- **MFA** : les permissions privilégiées (`etare:approve`, `publication:publish`, `member:manage`,
  `device:manage`) exigent `aal2` (TOTP activé dans Supabase Auth). Paramètre SIS
  `mfa_required_for_privileged` (défaut : vrai). L’enrôlement TOTP dans l’interface reste à faire.

## Accès à la base

- `etare_api` / `etare_worker` : ni propriétaires, ni superutilisateurs, ni `BYPASSRLS`, aucun
  `DELETE`/`TRUNCATE`. L’application **refuse de démarrer** avec un autre identifiant
  (`assertDedicatedDatabaseRole`).
- Contexte de requête local à la transaction (`set_config(..., true)`) : il disparaît au commit, même
  derrière un pool de connexions.
- Fonctions `SECURITY DEFINER` rares, `search_path` fixé, `EXECUTE` retiré à PUBLIC et accordé
  explicitement (vérifié par test).
- Les identifiants de connexion locaux de `supabase/seed.sql` ne valent que pour la stack locale ; en
  environnement partagé, les mots de passe sont posés hors migrations et injectés depuis un coffre.
- Délais côté serveur portés par les rôles (`statement_timeout`, `idle_in_transaction_session_timeout`,
  `lock_timeout`) : ils s’appliquent quel que soit le pooler de connexions.

## Environnement d’intégration

Projet Supabase hébergé partagé (procédure : `docs/development.md`). Données fictives uniquement ; seed
interdit ; inscriptions désactivées et TOTP activé à la main (le `config.toml` ne s’y applique pas) ;
mots de passe des rôles générés aléatoirement par `pnpm integration roles` et transmis en empreinte
SCRAM ; URL d’administration jamais écrite sur disque ; configuration dans `.env.integration`, ignoré par
Git. Les tests automatisés et `pnpm setup:local` refusent de viser ce projet.

## Clés Supabase

| Clé                   | Où                              | Justification                                                  |
| --------------------- | ------------------------------- | -------------------------------------------------------------- |
| publishable           | navigateur, mobile              | publique par conception ; ne donne accès à aucune table métier |
| secret / service_role | **jamais utilisée au Sprint 0** | prévue uniquement pour la passerelle de stockage côté serveur  |
| clé de signature JWT  | `supabase/signing_keys.json`    | locale, générée, ignorée par Git                               |

## Stockage

Bucket `etare-assets` privé, **sans policy** pour `anon`/`authenticated` : aucun client n’accède
directement aux objets. L’API autorise l’objet exact en base (RLS sur `asset`) puis émet une URL signée de
≤ 300 s (`SupabaseObjectStorage`). Clés d’objets `tenants/{tenant}/assets/{asset}/{version}` ; dépôts en
`quarantine/` d’abord ; contenu d’un asset immuable (empreinte SHA-256, taille, type). Antivirus et
contrôle du type réel : worker, Sprint 1+.

## API et web

- Pas de CORS : l’API n’est appelée que par le web (même origine) et l’application mobile.
- Pas d’authentification par cookie sur l’API (jeton Bearer) : pas de CSRF possible.
- `Cache-Control: no-store` sur toutes les réponses métier ; `trace_id` sur chaque réponse.
- En-têtes : `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP.
- Redirection après connexion limitée aux chemins internes (pas d’open redirect).
- Les réponses du proxy d’authentification, redirections comprises, sont privées et non mises en
  cache ; les cookies renouvelés ou effacés sont conservés sur la réponse finale.
- Le cache des requêtes est vidé à tout changement d’identité, y compris une déconnexion dans un
  autre onglet ou l’expiration d’une session. Un ancien chargement de session ne peut pas rétablir
  une identité après un événement d’authentification plus récent.
- Journaux JSON avec masquage des clés sensibles (jetons, mots de passe, URL signées).

## Mobile

Jetons et clé de base dans le stockage sécurisé Android (Keystore), base SQLite chiffrée SQLCipher dès le
Sprint 0, sauvegardes Android désactivées, permission `INTERNET` seule, HTTP en clair uniquement en debug
vers l’émulateur. Voir `apps/mobile/README.md`.

## Secrets et Git

`.env`, `.env.*` (sauf `.env.example`), `supabase/signing_keys.json`, keystores Android et
`key.properties` sont ignorés. La CI n’utilise aucun secret.

## Limites connues (à traiter avant le pilote)

- Pas encore de CSP stricte (nonces Next.js), de limitation de débit (reverse proxy), ni d’antivirus.
- Accès aux journaux d’audit refusés (403) non encore tracés dans `audit_event`.
- Enrôlement TOTP, révocation de sessions, SSO OIDC/SAML : non développés.
- Autorisation hors ligne signée, révocation de terminaux, chiffrement des fichiers mobiles : Sprint 3+.
- Chaînage d’empreintes / export externe du journal d’audit : à décider.
