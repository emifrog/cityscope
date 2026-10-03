# Sprint 9 — rapport de livraison

Validation locale du **3 octobre 2026** sur Windows : navigateur, pile locale, puis build de production
sur un port dédié pour éprouver la CSP stricte. CI GitHub sur `main` (branche unique). Cinq commits :
second facteur et sessions (`2113540`), récupération (`f57417d`), protection réseau (`1fbd1f0`), cycle
des fichiers (`566ac20`), puis ce rapport. Aucun déploiement ; aucune donnée réelle.

Périmètre retenu (roadmap) : R4 sans arbitrage — SEC-02, SEC-03, CAP-03. Décisions du porteur du
3 octobre :

- second facteur imposé partout aux comptes enrôlés, la tablette s'identifiant par sa clé, avec un
  réglage du SIS ;
- récupération par codes de secours et par l'administration ;
- compteurs de débit dans PostgreSQL ;
- miniatures pour le back-office seulement.

## Réalisé

### Lot A — second facteur et sessions (SEC-02)

- **Second facteur imposé par la base** à tout compte enrôlé, pour toute requête : `MFA_REQUIRED` sans
  code. Trois exceptions, à portée restreinte par la base elle-même :
  - le profil (`GET /me`), sans aucune permission ;
  - une requête signée d'une **tablette enrôlée du SIS**, dont la clé tient lieu de facteur de
    possession, limitée aux permissions de synchronisation ;
  - l'enrôlement par code à usage unique.

  L'API refuse de valider une requête de terminal dont la signature n'a pas été vérifiée.

- **Politique du SIS** (Administration › Paramètres), modifiable seulement avec le second facteur en
  cours d'usage et tracée : actions sensibles (par défaut), tout accès au back-office (écran bloquant
  tant que le membre n'a pas activé le sien), ou jamais (déconseillé).
- **Sessions** : la base refuse le jeton d'une session fermée dès la requête suivante, et le web
  déconnecte alors localement. « Mon compte » liste les sessions (appareil, dernière activité, adresse)
  et permet d'en fermer une ou toutes les autres ; une **suspension ferme toutes les sessions** du membre.
- **Liste des membres** : invitation en attente, dernière connexion, second facteur.

### Lot B — récupération (SEC-02)

- **Dix codes de secours** à usage unique (50 bits chacun), montrés une fois, conservés hachés. En
  utiliser un retire le facteur perdu, ferme les autres sessions, impose un nouveau facteur avant tout
  accès et alerte la personne par e-mail.
- **Réinitialisation par l'administration du SIS**, identité vérifiée hors ligne : mêmes effets,
  membre prévenu, opération tracée. Refusée pour soi-même et pour une personne aussi membre d'un autre
  SIS (le compte est commun).
- **Mot de passe oublié** en libre-service : lien vérifié au clic seulement ; le code d'un compte
  protégé est demandé avant le nouveau mot de passe, car le fournisseur d'identité l'exige.

### Lot C — protection réseau (SEC-03)

- **Limitation de débit** par compteurs PostgreSQL partagés, écrits hors de la transaction de la
  requête : une tentative refusée compte toujours. Réponse 429 avec `Retry-After`. Plafonds par
  défaut :

  | Objet            | Plafond                                   |
  | ---------------- | ----------------------------------------- |
  | Requêtes         | 600 par minute et par personne            |
  | Enrôlements      | 10 par heure par personne, 30 par adresse |
  | Codes de secours | 5 par quart d'heure                       |
  | Invitations      | 30 par heure                              |
  | Dépôts           | 120 par heure                             |
  | Géocodage        | 60 par minute                             |
  | Jetons refusés   | 120 par minute et par adresse             |

- **CSP des pages avec nonce** par requête :
  - scripts de l'application seulement ;
  - workers de la carte et du lecteur PDF servis par l'application ;
  - images et appels limités à l'application, Supabase et l'IGN, cette liste étant vérifiée contre le
    catalogue cartographique ;
  - ni cadre, ni plugin.

  Côté API : `default-src 'none'` et `Cross-Origin-Resource-Policy: same-origin`. HSTS en HTTPS.

- **Pas de CORS, explicitement** : requêtes d'une autre origine et pré-vols refusés et tracés.
- **Refus sensibles tracés** dans `audit_event` (`denied`) : second facteur, permission, terminal,
  session fermée, origine, code d'enrôlement ou de secours, première limite atteinte. Le SIS n'est noté
  que si la personne en est membre.

### Lot D — cycle des fichiers (CAP-03)

- **Versions réduites** (320 et 1 280 px, WebP) calculées par le worker après le verdict : orientation
  appliquée, métadonnées et position GPS retirées, décodage borné. Le back-office les affiche dans les
  listes et n'ouvre l'image 1 280 px qu'à la demande. Le paquet tablette et le PDF gardent les
  originaux.
- **Vérification fiable** : une vérification abandonnée par la file rejette son asset ; une tentative
  interrompue après la copie est reprise grâce à l'empreinte.
- **Maintenance horaire** (un seul travail par heure quel que soit le nombre de workers) :
  - retrait de la quarantaine des dépôts rejetés, ou abandonnés depuis 24 h ;
  - retrait des PDF des fabrications perdantes ;
  - purge des fenêtres de débit.

  La base désigne seule les candidats, jamais un fichier conservé, et le stockage refuse de supprimer
  un asset vérifié ou une version réduite. Chaque retrait est audité ; un élément en erreur est repris
  au passage suivant.

## Base de données

Quatre migrations :

- `begin_request` étendu (session, terminal, motif), portée de la requête dans `has_permission`,
  politique du SIS, sessions, et sept sondes `app.idp_*` vers le fournisseur d'identité, écrites en
  PL/pgSQL avec un garde pour un PostgreSQL nu (ADR-003) ;
- codes de secours, réinitialisation, réactivation obligatoire, deux nouvelles notifications ;
- compteurs de débit (table UNLOGGED) et traces des refus ;
- versions réduites, rejet sur tâche morte, `publication_output`, fonctions de maintenance.

## Sécurité

- Un mot de passe seul ne suffit plus pour aucune requête d'un compte enrôlé ; sur la tablette, la
  possession du terminal enrôlé tient lieu de second facteur.
- Supabase Auth ferme les autres sessions quand un facteur est activé, et le refus des sessions
  fermées rend cette fermeture effective tout de suite. Le web l'a montré pendant la validation :
  un navigateur ouvert a été déconnecté dès qu'un test a enrôlé un facteur sur le même compte.

## Tests

| Suite                              | Résultat                                                                     |
| ---------------------------------- | ---------------------------------------------------------------------------- |
| Unitaires et composants (`vitest`) | 331 tests, 57 fichiers                                                       |
| Base de données (pgTAP)            | 509 tests, 27 fichiers (dont 210, 220, 230 et 240 pour ce sprint)            |
| Intégration (Auth → API → RLS)     | 125 tests, 28 fichiers (dont second facteur, récupération, réseau, fichiers) |
| Flutter (`flutter test`)           | 165 tests, 1 ignoré (bout en bout sur demande)                               |
| CI GitHub (3 jobs)                 | au vert sur chaque commit du sprint (lots A à D)                             |

L'intégration couvre :

- le refus sans code et l'exception du profil ;
- l'enrôlement et la synchronisation d'une tablette par un compte enrôlé, et le refus d'une signature
  forgée ;
- la politique `all` ;
- la fermeture d'une session ou des autres, et la suspension qui ferme les sessions ;
- les codes de secours, la réinitialisation (refusée pour un membre d'un autre SIS) et le mot de passe
  oublié par Mailpit ;
- les limites réelles et leurs traces d'audit ;
- les versions réduites produites par sharp ;
- la purge des dépôts abandonnés et des PDF perdants, sans toucher au PDF conservé.

Cinq tests d'intégration existants ont été adaptés : ils réutilisaient sans code le jeton d'un compte
enrôlé un peu plus tôt, ce que la règle refuse désormais.

Vérifié dans le navigateur, sur la pile locale :

- « Mon compte » : sessions, fermeture des autres ; activation du second facteur, génération des dix
  codes, connexion par code de secours puis écran bloquant ;
- liste des membres avec l'état d'accès ;
- politique `all` et écran bloquant d'un rédacteur sans second facteur ;
- page « mot de passe oublié » ;
- CSP de développement et de production : aucune violation sur la connexion, la carte (worker
  MapLibre chargé) et la fiche d'un site ; l'IGN et Supabase autorisés, un hôte quelconque bloqué.

## Décisions prises

- ADR-022 : second facteur imposé par la base, sessions révocables, récupération.
- ADR-023 : limitation de débit, CSP, origines et traces des refus.
- ADR-009 (cycle des fichiers), ADR-003 (sondes du fournisseur d'identité) et ADR-010 complétés.

## Écarts

- **Projet hébergé** : vérifier que le rôle propriétaire des migrations lit `auth.sessions`,
  `auth.mfa_factors` et `auth.users` et peut y supprimer des sessions et des facteurs. Reporter le
  gabarit « mot de passe oublié », les plafonds `[auth.rate_limit]` et la durée des sessions
  (`[auth.sessions]`, sans couper la synchronisation des tablettes).
- **Adresse du client** connue seulement derrière un proxy de confiance déclaré : à régler avec
  l'hébergement (DEC-03).
- **Miniatures** non vues dans le navigateur, faute de worker de développement lancé ; elles sont
  vérifiées de bout en bout par l'intégration (fichier WebP de 320 px servi par l'API).
- **Second facteur sur la tablette** : non demandé, la clé du terminal en tient lieu. Une tablette
  partagée exigeant l'identification forte de chaque agent relève de SEC-05.
- Tablette physique toujours attendue.

## Dette technique

- Une écriture de plus par requête authentifiée (compteur), à mesurer avec la volumétrie (CAP-01).
- Rendu dynamique de toutes les pages, imposé par le nonce de la CSP ; pas de rapport des violations
  (`report-to`).
- Toujours à traiter avant le pilote : clés de signature dans un gestionnaire de secrets (SEC-04),
  terminal (SEC-05), sauvegardes et restauration, supervision, livraison Android.

## Prochaine étape

Suite de R4 : SEC-04 (secrets et rotation des clés de signature) et CAP-01 (volumétrie de 10 000 sites,
dont le coût du compteur de débit et du rendu dynamique), avec EXP-03 (supervision des travaux en échec,
de la maintenance et des refus). En parallèle, les décisions DEC-02, DEC-04 et DEC-05 restent attendues
pour terminer R3, et le premier essai sur la tablette de référence dès sa livraison.
