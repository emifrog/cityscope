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
- **Exploitants** (ADR-019) : invités sur des sites précis par l'administration du SIS ou la Prévision
  (`portal:invite`, second facteur), invitation à usage unique, limitée dans le temps et révocable ;
  jamais de rôle `EXPLOITANT` à l'échelle du SIS (refus en base) ; aucune lecture des données de
  travail. Second facteur des exploitants exigé par défaut, réglable par l'administration du SIS
  (`portal_mfa_required`, contrôlé dans `has_permission`). L'exploitant ne lit que la version publiée, par une
  liste blanche construite en base (ni codes d'accès, ni risques, ni points d'eau, ni images des plans) ;
  il ne télécharge que les documents que le SIS a partagés et publiés (URL courte, accès tracé).
- **Catalogue des risques** (ADR-012) : `catalog:manage` (administrateur du SIS) ajoute ou retire des
  types propres au SIS ; le catalogue national reste en lecture seule (RLS, refus explicite) et ses codes
  sont réservés. Les champs sont déclarés par une liste typée, jamais par un schéma libre.
- **Workflow ETARE** (ADR-013) : décision et publication exigent le second facteur ; le validateur ne peut
  être ni l’auteur, ni le soumetteur, ni un contributeur ; il décide sur l’empreinte exacte relue. Le
  worker fabrique la publication par des fonctions réservées à `etare_worker`, filtrées par SIS, à partir
  du seul contenu figé. Le PDF (ADR-014) se télécharge par URL signée de 60 s, accès tracé.
- **Fichiers publiés immuables** (correctifs du 30/09/2026) : PDF déposé sous une clé adressée par son
  empreinte, jamais écrasé ; une tentative de fabrication dont le bail a expiré ne peut plus rien publier,
  faire échouer ni acquitter (jeton de fencing vérifié en base) ; l’instantané soumis correspond à un seul
  état validé de la base (`REPEATABLE READ`).

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
vérifié par le worker (taille, SHA-256, type réel lu dans le contenu, antivirus ClamAV) avant d’être copié vers
sa clé définitive. Le verdict n’est modifiable que par le worker et il est définitif. Un fichier non
vérifié ou refusé n’est jamais servi (409) ; chaque téléchargement est tracé (`asset.download`) et passe
par une URL de 60 s. Le web refuse dès le navigateur un contenu dont le type réel n’est pas admis. Les
journaux ne contiennent ni nom de fichier ni URL signée, seulement des identifiants.

## API et web

- Pas de CORS : l’API n’est appelée que par le web (même origine) et l’application mobile.
- Carte : le navigateur charge les tuiles et les polices directement sur `data.geopf.fr` (IGN), qui voit
  donc l’adresse réseau et l’emprise consultée, jamais les données du SIS (servies par l’API). Flux
  à valider par la DSI ; un proxy limité reste possible (architecture §14).
- Géocodage : les adresses saisies partent vers le géocodeur IGN **depuis le serveur** (l’adresse réseau
  des agents n’est pas exposée), jamais journalisées ; seuls les membres ayant `site:read` y accèdent,
  les paramètres sont validés avant tout appel.
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

## Terminaux et distribution hors ligne

Voir ADR-015.

- Deux clés Ed25519 serveur : la clé de **publication** n’existe que dans le worker et signe les
  manifestes à la fabrication ; la clé de **catalogue** n’existe que dans l’API et signe les catalogues.
  Une compromission de l’API ne permet pas de forger un contenu publié. Les terminaux ne font confiance
  qu’aux clés publiques de leur configuration, chacune liée à son usage.
- Ce qui est signé commence par une ligne de contexte : une signature faite pour un usage (manifeste,
  catalogue, requête, enrôlement) n’est valable pour aucun autre.
- Enrôlement : code à usage unique de 60 bits, valable 24 h, conservé haché, délivré par un administrateur
  avec second facteur ; la tablette génère sa clé et prouve la détenir. Un identifiant de terminal seul
  n’authentifie rien.
- Chaque requête de synchronisation porte le jeton de l’utilisateur **et** la signature du terminal sur la
  méthode, le chemin, l’heure (± 5 min) et le corps ; PostgreSQL revérifie `offline:download`, le SIS et
  l’état du terminal. Un terminal révoqué est refusé à la requête suivante (`DEVICE_REVOKED`).
- Fichiers : URL signées de 5 minutes, seulement pour des empreintes présentes dans le manifeste d’une
  version distribuable ; téléchargements audités. Les sites sensibles ne sont pas distribués.
- Signalements terrain (ADR-017) : transmis par requête signée du terminal, reçus une seule fois par
  identifiant (empreinte du contenu accepté), élément et position vérifiés dans la version consultée ;
  photos par la chaîne contrôlée et l’antivirus ; constat immuable, instruction réservée à
  `field_report:review`. Sur la tablette, la file chiffrée est liée à son auteur et purgée à la
  révocation. Une photo de signalement n’inscrit pas l’agent parmi les auteurs des données de travail.
- Documents « à la demande » (DOC-02) : téléchargés par requête signée du terminal (auditée), vérifiés
  contre la taille et l’empreinte du manifeste signé de la version installée, rangés dans la base
  chiffrée ; jamais un fichier obligatoire retiré par l’agent.
- Synchronisation en arrière-plan (ADR-018) : mêmes vérifications que la synchronisation manuelle ; un
  seul moteur à la fois (bail atomique) ; la session stockée est reprise plutôt qu’un jeton de
  rafraîchissement rejoué ; aucune donnée en clair hors de la base chiffrée et du stockage sécurisé.
- Version minimale d’application (SYN-02) : portée par le catalogue signé, non falsifiable en transit ;
  la version déclarée par le terminal n’est qu’une information d’administration.
- Le catalogue accorde une consultation locale de 7 jours à l’utilisateur ; une horloge de tablette
  manipulée peut prolonger cette durée hors réseau (limite décrite par l’architecture §19).

## Mobile

Jetons et clé de base dans le stockage sécurisé Android (Keystore), base SQLite chiffrée SQLCipher dès le
Sprint 0, sauvegardes Android désactivées, permission `INTERNET` seule, HTTP en clair uniquement en debug
vers l’émulateur. Voir `apps/mobile/README.md`.

## Secrets et Git

`.env`, `.env.*` (sauf `.env.example`), `supabase/signing_keys.json`, keystores Android et
`key.properties` sont ignorés. La CI n’utilise aucun secret : elle génère des clés de distribution
jetables (`pnpm setup:local`). Les clés de signature des environnements partagés
(`PUBLICATION_SIGNING_KEY`, `CATALOG_SIGNING_KEY`) viennent d’un coffre au démarrage, jamais du dépôt.

## Limites connues (à traiter avant le pilote)

- Pas encore de CSP stricte (nonces Next.js) ni de limitation de débit (reverse proxy), y compris sur
  les codes d’enrôlement des terminaux.
- Clés de signature lues dans l’environnement : gestionnaire de secrets ou KMS à brancher avant la
  production.
- Antivirus : ClamAV (clamd) obligatoire hors développement ; la fraîcheur des signatures, la
  supervision du démon et le choix éventuel d’un service managé restent à organiser avec l’exploitation.
- Purge des dépôts abandonnés (`pending` jamais envoyés) et des objets orphelins de quarantaine à écrire.
- Accès aux journaux d’audit refusés (403) non encore tracés dans `audit_event`.
- Second facteur exigé par le web mais pas encore par l’API pour les permissions ordinaires d’un compte
  enrôlé ; pas de codes de secours ni de réinitialisation du mot de passe en libre-service.
- Révocation des sessions à la suspension (la base refuse déjà chaque requête), SSO OIDC/SAML : non
  développés.
- Tablette : ni verrouillage applicatif propre (PIN, biométrie), ni attestation d’intégrité du
  terminal, ni rotation de la clé de la base locale.
- Chaînage d’empreintes / export externe du journal d’audit : à décider.
