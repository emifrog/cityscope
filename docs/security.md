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
  `device:manage`, `portal:invite`) exigent `aal2` (TOTP, Supabase Auth). Enrôlement et retrait dans
  « Mon compte » ; un compte enrôlé passe par l’étape de code à chaque connexion. `MFA_REQUIRED` n’est
  répondu qu’aux personnes dont les rôles accorderaient la permission avec le second facteur ; les
  autres reçoivent `FORBIDDEN` (ADR-010).
- **Second facteur imposé par la base** (ADR-022) : un compte enrôlé est refusé sans son code pour toute
  requête. Exceptions : son profil ; les requêtes signées d'une tablette enrôlée du SIS, dont la clé tient
  lieu de facteur de possession et qui sont limitées à la synchronisation ; l'enrôlement par code à usage
  unique. Politique du SIS (`privileged` par défaut, `all`, `none`), modifiable avec le second facteur
  et tracée : en `all`, un membre sans second facteur doit en activer un avant toute action.
- **Récupération** (ADR-022) : dix codes de secours à usage unique, conservés hachés et montrés une fois ;
  en utiliser un retire le facteur, ferme les autres sessions, impose un nouveau facteur avant tout accès
  et alerte la personne par e-mail. L'administration du SIS peut réinitialiser le second facteur d'un
  membre, ni le sien ni celui d'une personne membre d'un autre SIS, avec les mêmes effets et une trace.
  Mot de passe oublié par lien e-mail vérifié au clic ; le code d'un compte protégé reste demandé.
- **Sessions** (ADR-022) : le jeton d'une session fermée (déconnexion, révocation, suspension) est refusé
  dès la requête suivante. Chacun ferme ses autres sessions ; une suspension ferme toutes celles du
  membre. L'administration voit l'invitation en attente, la dernière connexion et le second facteur.
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
  il ne télécharge que les documents que le SIS a partagés et publiés (URL courte, accès tracé). Ses
  propositions ne modifient jamais les données : la Prévision les instruit, les reporte dans une révision
  validée par un tiers ; une valeur changée entre-temps exige une résolution motivée ; ses fichiers suivent la
  chaîne contrôlée et ne font pas de lui un auteur du dossier.
- **Cycle de vie** (ADR-021) : retrait d'une version en vigueur réservé aux validateurs avec second facteur
  et motivé ; archivage refusé tant qu'une version est en vigueur ou qu'une décision est en attente ; rien
  ne démarre sur un site archivé ; tout reste audité. Les tablettes reçoivent la raison d'un retrait dans le
  catalogue signé.
- **Notifications** (ADR-020) : écrites avec leur événement, envoyées par le worker ; contenu minimal (ni
  échanges, ni motif, ni code, ni document) et liens sans secret, qui ouvrent le portail après connexion.
  Une panne d'envoi ne bloque rien : elle est tracée et rejouable par l'administration du SIS.
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

Cycle des fichiers (ADR-009, complément du Sprint 9) :

- Les versions réduites des images (320 et 1 280 px) sont calculées par le worker après le verdict,
  sans métadonnées ni position GPS, et servies avec la même autorisation et la même trace que
  l’original.
- Une maintenance horaire retire la quarantaine des dépôts rejetés ou abandonnés et les PDF des
  tentatives de fabrication perdantes. La base désigne seule ces candidats, jamais un fichier conservé ;
  le stockage refuse de supprimer un asset vérifié ou une version réduite. Chaque retrait est audité.

## API et web

- Pas de CORS, explicitement (ADR-023) : une requête de navigateur d’une autre origine, ou de pré-vol,
  est refusée (403) et tracée ; l’API n’est appelée que par le web (même origine) et l’application
  mobile. Origines supplémentaires possibles par `ALLOWED_ORIGINS`.
- **Limitation de débit** (ADR-023) : compteurs PostgreSQL partagés par les instances, écrits hors de
  la transaction de la requête (une tentative refusée compte). Plafonds : requêtes par personne,
  enrôlements, codes de secours, invitations, dépôts, géocodage, jetons refusés par adresse ; 429 avec
  `Retry-After`. L’adresse n’est retenue que derrière un proxy de confiance (`TRUSTED_PROXY_HOPS`).
  La connexion relève des plafonds du fournisseur d’identité.
- **Refus tracés** (ADR-023) : second facteur, permission, terminal, session fermée, origine, code
  d’enrôlement ou de secours refusé, première limite atteinte : `audit_event` avec le résultat
  `denied`, dans sa propre transaction ; le SIS n’est noté que si la personne en est membre.
- Carte : le navigateur charge les tuiles et les polices directement sur `data.geopf.fr` (IGN), qui voit
  donc l’adresse réseau et l’emprise consultée, jamais les données du SIS (servies par l’API). Flux
  à valider par la DSI ; un proxy limité reste possible (architecture §14).
- Géocodage : les adresses saisies partent vers le géocodeur IGN **depuis le serveur** (l’adresse réseau
  des agents n’est pas exposée), jamais journalisées ; seuls les membres ayant `site:read` y accèdent,
  les paramètres sont validés avant tout appel.
- Pas d’authentification par cookie sur l’API (jeton Bearer) : pas de CSRF possible.
- `Cache-Control: no-store` sur toutes les réponses métier ; `trace_id` sur chaque réponse.
- En-têtes : `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP ;
  HSTS en HTTPS. **CSP des pages avec nonce** par requête (scripts de l’application seulement, workers
  carte et PDF de l’application, images et appels limités à l’application, Supabase et l’IGN, aucun
  cadre ni plugin) ; réponses de l’API en `default-src 'none'` et `Cross-Origin-Resource-Policy:
same-origin` (ADR-023).
- Redirection après connexion limitée aux chemins internes (pas d’open redirect).
- Les réponses du proxy d’authentification, redirections comprises, sont privées et non mises en
  cache ; les cookies renouvelés ou effacés sont conservés sur la réponse finale.
- Le cache des requêtes est vidé à tout changement d’identité, y compris une déconnexion dans un
  autre onglet ou l’expiration d’une session. Un ancien chargement de session ne peut pas rétablir
  une identité après un événement d’authentification plus récent.
- Journaux JSON avec masquage des clés sensibles (jetons, mots de passe, URL signées).
- Supervision (EXP-03, ADR-028) :
  - `GET /api/v1/metrics` n'existe qu'avec `METRICS_TOKEN` (32 caractères au moins), comparé en
    temps constant ; un refus est tracé au journal (`security.metrics_refused`) ;
  - les métriques sont des agrégats aux étiquettes bornées (routes, types de travaux, SIS, statuts) :
    jamais un site, une personne ni un identifiant ;
  - le tableau du SIS exige `audit:read`, et ses chiffres restent dans le SIS (fonction
    `SECURITY DEFINER` filtrée par le SIS actif).

## Terminaux et distribution hors ligne

Voir ADR-015.

- Deux clés Ed25519 serveur : la clé de **publication** n’existe que dans le worker et signe les
  manifestes à la fabrication ; la clé de **catalogue** n’existe que dans l’API et signe les catalogues.
  Une compromission de l’API ne permet pas de forger un contenu publié.
- **Clés dans un coffre** (SEC-04, ADR-027) :
  - en préproduction et en production, chaque clé vient d’un fichier de secret monté par l’hébergeur,
    ou reste dans le moteur Transit d’OpenBao ou de Vault, qui signe sans jamais la livrer ;
  - la variable d’environnement est refusée au démarrage hors développement et essais ;
  - chaque processus a son jeton, limité à sa clé (`infra/openbao/`) : le jeton de l’API ne peut ni
    signer avec la clé des publications, ni exporter, ni faire tourner une clé.
- **Jeu de clés signé par une racine hors ligne** (ADR-027) :
  - les tablettes vérifient un jeu de clés numéroté (actives, retirées, révoquées) avec la racine
    embarquée, avant leur catalogue ;
  - rotation et révocation passent sans nouvelle version de l’application ;
  - un processus ne signe qu’avec une clé active du jeu ;
  - après une rotation, le worker re-signe les contenus en vigueur, seulement si l’empreinte stockée et
    une signature d’origine se vérifient. L’original reste immuable, et chaque re-signature est tracée ;
  - procédures de rotation et de compromission : `docs/exploitation/cles-de-signature.md`.
- Les terminaux ne font confiance qu’aux clés de leur jeu, chacune liée à son usage. Les clés
  compilées dans l’application ne servent qu’au premier contact.
- Ce qui est signé commence par une ligne de contexte : une signature faite pour un usage (manifeste,
  catalogue, requête, enrôlement) n’est valable pour aucun autre.
- Enrôlement : code à usage unique de 60 bits, valable 24 h, conservé haché, délivré par un administrateur
  avec second facteur ; la tablette génère sa clé et prouve la détenir. Un identifiant de terminal seul
  n’authentifie rien.
- Chaque requête de synchronisation porte le jeton de l’utilisateur **et** la signature du terminal sur la
  méthode, le chemin, l’heure (± 5 min) et le corps ; PostgreSQL revérifie `offline:download`, le SIS et
  l’état du terminal. Un terminal révoqué est refusé à la requête suivante (`DEVICE_REVOKED`).
- Fichiers : URL signées de 5 minutes, seulement pour des empreintes présentes dans le manifeste d’une
  version distribuable ; téléchargements audités.
- Périmètres (PER-01, ADR-025) : le catalogue signé ne contient que l’intersection des secteurs de la
  tablette et du périmètre de la personne ; un site qui en sort est retiré au contact suivant, avec son
  motif.
- Sites sensibles (PER-02, ADR-025) :
  - la sensibilité retenue est la plus restrictive de la version publiée et du site au moment présent :
    un site rendu sensible cesse aussitôt d’être distribué ;
  - un site « restreint » n’est jamais installé en masse. Il est proposé à la demande, site par site, aux
    seules personnes titulaires d’une habilitation nominative et datée (douze mois au plus), dans leur
    périmètre et celui de la tablette ; la tablette le garde 24 h ;
  - un site « élevé » ne va jamais sur une tablette ;
  - le PDF d’un site sensible est réservé à ses rôles du back-office et, pour un site restreint, aux
    personnes habilitées ;
  - consultations, exports et ouvertures sur tablette sont tracés dans `access_event` (journal en ajout
    seul, lisible avec `audit:read`), y compris les consultations hors ligne remontées au contact suivant ;
  - au back-office, l’accès suit les rôles (choix du porteur du 5 octobre 2026) et chaque consultation est
    tracée.
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
- Fonds de carte (ADR-024) :
  - aucune préparation, donc aucune requête vers le producteur, sans droits hors ligne validés pour la
    source (fiche de droits) ; le fond d'essai synthétique est refusé en production ;
  - le manifeste de chaque fond est signé par la clé des publications ; la tablette vérifie la signature,
    l'empreinte annoncée par le catalogue signé, chaque partie et le fichier entier ;
  - donnée publique : distribuée selon les secteurs de la tablette, sans journal ; aucune zone de détail
    autour d'un site restreint ou élevé, qui le désignerait ;
  - le fond n'est servi qu'aux tablettes de son secteur, par des URL signées de 5 minutes.
- Le catalogue accorde une consultation locale de 7 jours à l’utilisateur ; une horloge de tablette
  manipulée peut prolonger cette durée hors réseau (limite décrite par l’architecture §19).

## Mobile

Jetons et clé de base dans le stockage sécurisé Android (Keystore), base SQLite chiffrée SQLCipher dès le
Sprint 0, sauvegardes Android désactivées, permission `INTERNET` (et, depuis le Sprint 11, localisation à
la demande), HTTP en clair uniquement en debug vers l’émulateur. Voir `apps/mobile/README.md`.

Depuis le Sprint 10 (ADR-025) :

- **Code personnel** de chaque agent (6 chiffres) : exigé au démarrage et après 15 minutes d’inactivité ;
  cinq erreurs déconnectent l’agent.
- **Sites restreints ouverts à la demande** : chiffrés une seconde fois par une clé dérivée de ce code
  (PBKDF2, secret de l’installation, AES-256-GCM), et gardés 24 h au plus.
- **Changement d’agent** : le code et les sites sensibles du précédent sont effacés ; ses consultations
  restent à remonter au journal.

Depuis le Sprint 11 (ADR-024) :

- **Fonds de carte** : stockés hors de la base chiffrée (donnée publique, `files/basemaps/`), effacés à
  la révocation ; le moteur de carte ne lit que des fichiers locaux, sans aucun appel à un serveur.
- **Localisation** : permission demandée au premier « Me situer » (`ACCESS_FINE_LOCATION`,
  `ACCESS_COARSE_LOCATION`) ; la position est affichée par le moteur de carte et n'est jamais transmise ;
  un refus laisse la carte utilisable.

## Secrets et Git

`.env`, `.env.*` (sauf `.env.example`), `supabase/signing_keys.json`, keystores Android et
`key.properties` sont ignorés. La CI n’utilise aucun secret : elle génère des clés de distribution
jetables et une racine de développement (`pnpm setup:local`), et éprouve le moteur Transit avec un
OpenBao de développement. Dans les environnements partagés, les clés de signature viennent d’un fichier
de secret ou du moteur Transit (`*_SIGNING_KEY_FILE`, `*_SIGNING_TRANSIT_KEY`), jamais du dépôt ni de
l’environnement. La racine des jeux de clés reste hors ligne (`pnpm keys`, cérémonie à deux).

## Limites connues (à traiter avant le pilote)

- Clés de signature :
  - le KMS d’un fournisseur reste à choisir avec l’hébergement (DEC-03) ; OpenBao Transit ou un fichier
    de secret couvrent le pilote ;
  - la première cérémonie (racine, racine de secours, procès-verbal) est à tenir avec le RSSI avant la
    préproduction ;
  - la compromission de la racine sans racine de secours embarquée exige une nouvelle version de
    l’application.
- Antivirus : ClamAV (clamd) obligatoire hors développement ; la fraîcheur des signatures, la
  supervision du démon et le choix éventuel d’un service managé restent à organiser avec l’exploitation.
- SSO OIDC/SAML non développé ; plafonds de connexion du fournisseur d’identité à reporter sur le projet
  hébergé ; pas de rapport des violations CSP (`report-to`).
- Durée maximale et inactivité des sessions (`[auth.sessions]`) à régler sur le projet hébergé avec la
  DSI, sans couper la synchronisation en arrière-plan des tablettes.
- Tablette : code personnel livré (Sprint 10), mais un code à six chiffres reste exposé à un essai
  exhaustif par qui détient à la fois la base et le secret de l’installation ; ni attestation
  d’intégrité du terminal, ni rotation de la clé de la base locale ; changement d’agent hors ligne
  impossible (connexion en ligne requise).
- Chaînage d’empreintes / export externe du journal d’audit : à décider.
