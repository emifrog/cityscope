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
  `device:manage`) exigent `aal2` (TOTP, Supabase Auth). Paramètre SIS `mfa_required_for_privileged`
  (défaut : vrai). Enrôlement et retrait dans « Mon compte » ; un compte enrôlé passe par l’étape de code
  à chaque connexion (proxy web). `MFA_REQUIRED` n’est répondu qu’aux personnes dont les rôles
  accorderaient la permission avec le second facteur ; les autres reçoivent `FORBIDDEN` (ADR-010).
- **Administration des membres** (ADR-010) : invitations, rôles et suspensions par fonctions
  `SECURITY DEFINER` qui revérifient `member:manage` en `aal2` ; ni auto-attribution ni auto-retrait,
  jamais `SUPER_ADMIN` ni `EXPLOITANT` à l’échelle du SIS, au moins un administrateur actif conservé,
  concurrence optimiste, historique des rôles révoqués. Le lien d’invitation n’est vérifié qu’au clic.

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
interdit ; inscriptions désactivées, TOTP activé et gabarit d’invitation reporté à la main (le
`config.toml` ne s’y applique pas) ;
mots de passe des rôles générés aléatoirement par `pnpm integration roles` et transmis en empreinte
SCRAM ; URL d’administration jamais écrite sur disque ; configuration dans `.env.integration`, ignoré par
Git. Les tests automatisés et `pnpm setup:local` refusent de viser ce projet.

## Clés Supabase

| Clé                   | Où                           | Justification                                                                |
| --------------------- | ---------------------------- | ---------------------------------------------------------------------------- |
| publishable           | navigateur, mobile           | publique par conception ; ne donne accès à aucune table métier               |
| secret / service_role | API et worker, côté serveur  | signature des URL de stockage, contrôle des fichiers ; jamais `NEXT_PUBLIC_` |
| clé de signature JWT  | `supabase/signing_keys.json` | locale, générée, ignorée par Git                                             |

## Stockage

Bucket `etare-assets` privé, **sans policy** pour `anon`/`authenticated` : aucun client n’accède
directement aux objets. L’API autorise l’objet exact en base (RLS sur `asset`) puis émet une URL signée de
≤ 300 s (`SupabaseObjectStorage`). Clés d’objets `tenants/{tenant}/assets/{asset}/{version}` ; contenu
d’un asset immuable (empreinte SHA-256, taille, type).

Dépôts (ADR-009) : le fichier est envoyé par URL signée en `quarantine/`, sans écrasement possible, puis
vérifié par le worker (taille, SHA-256, type réel lu dans le contenu, antivirus) avant d’être copié vers
sa clé définitive. Le verdict n’est modifiable que par le worker et il est définitif. Un fichier non
vérifié ou refusé n’est jamais servi (409) ; chaque téléchargement est tracé (`asset.download`) et passe
par une URL de 60 s. Le web refuse dès le navigateur un contenu dont le type réel n’est pas admis. Les
journaux ne contiennent ni nom de fichier ni URL signée, seulement des identifiants.

## API et web

- Pas de CORS : l’API n’est appelée que par le web (même origine) et l’application mobile.
- Carte : le navigateur charge les tuiles et les polices directement sur `data.geopf.fr` (IGN), qui voit
  donc l’adresse réseau et l’emprise consultée, jamais les données du SIS (servies par l’API). Flux
  à valider par la DSI ; un proxy limité reste possible (architecture §14).
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

- Pas encore de CSP stricte (nonces Next.js) ni de limitation de débit (reverse proxy).
- Antivirus non branché : le port `MalwareScanner` existe, le verdict indique `antivirus: not_scanned`.
- Purge des dépôts abandonnés (`pending` jamais envoyés) et des objets orphelins de quarantaine à écrire.
- Accès aux journaux d’audit refusés (403) non encore tracés dans `audit_event`.
- Second facteur exigé par le web mais pas encore par l’API pour les permissions ordinaires d’un compte
  enrôlé ; pas de codes de secours ni de réinitialisation du mot de passe en libre-service.
- Révocation des sessions à la suspension (la base refuse déjà chaque requête), SSO OIDC/SAML : non
  développés.
- Autorisation hors ligne signée, révocation de terminaux, chiffrement des fichiers mobiles : Sprint 3+.
- Chaînage d’empreintes / export externe du journal d’audit : à décider.
