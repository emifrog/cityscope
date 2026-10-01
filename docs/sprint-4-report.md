# Sprint 4 — rapport de livraison

Validation locale du **1er octobre 2026**, sur Windows et sur émulateur Android (API 36), puis CI GitHub
sur `main` (branche unique). Quatre lots livrés et poussés : distribution signée et terminaux
(`f7f6437`), synchronisation hors ligne de la tablette (`785e47f`), écrans OPS hors ligne (`fe8ee47`),
photos attachées aux objets (`da8f46a`). Aucun déploiement ; aucune donnée réelle.

## Réalisé

### Lot A — distribution signée et terminaux (OFF-01, OFF-04, ADMIN-02)

- Deux clés Ed25519 : la **clé de publication**, détenue par le seul worker, signe le manifeste canonique
  à la fabrication ; la **clé de catalogue**, détenue par la seule API, signe le catalogue propre à
  chaque terminal. Chaque texte signé commence par une ligne de contexte (manifeste, catalogue, requête,
  enrôlement) : une signature ne vaut que pour son usage.
- Onglet « Terminaux » de l’administration (second facteur) : déclaration d’une tablette, code
  d’enrôlement à usage unique (60 bits, 24 h, conservé haché), renouvellement du code, inventaire
  (version d’application, dernier utilisateur, dernière synchronisation, sites installés, état « à jour »,
  « en retard », « erreur », « révoqué ») et révocation.
- Enrôlement par un agent connecté : la tablette génère sa clé et prouve la détenir ; chaque requête de
  synchronisation porte ensuite le jeton de l’utilisateur **et** la signature du terminal (méthode,
  chemin, heure à ± 5 min, empreinte du corps).
- Catalogue signé : liste complète des versions publiées, signées et lisibles par l’utilisateur,
  génération croissante par SIS, autorisation de consultation locale de 7 jours liée à l’utilisateur.
  Paquet tel que fabriqué (manifeste signé et fichier de données) ; fichiers téléchargés par empreinte
  via des URL signées de 5 minutes, audités ; reçus d’installation.
- Permission `offline:download` accordée aux profils de terrain et du back-office (cahier des charges
  §3.1). Les sites sensibles ne sont pas distribués.

### Lot B — synchronisation sur la tablette (OFF-01 à 04, OPS-05)

- Vérification complète avant toute installation : signatures du catalogue et des manifestes avec les
  seules clés publiques de la configuration, empreinte et taille de chaque fichier, chemins sûrs.
- Fichiers stockés **dans la base SQLCipher** (par empreinte), préparés à part puis activés en une seule
  transaction : un site en échec garde sa version précédente, une coupure reprend sans retélécharger ce
  qui est déjà là ; seuls les fichiers d’empreinte nouvelle sont transférés (ADR-004 arbitré).
- Fraîcheur toujours visible (« à jour » moins de 24 h, « en retard », « erreur », « jamais ») ; l’heure de
  référence ne recule jamais sous la dernière heure serveur connue.
- Révocation, terminal inconnu ou preuve invalide : purge des données, de l’état et de l’identité de la
  tablette ; un refus de droits met fin à l’autorisation locale.

### Lot C — écrans OPS hors ligne (OPS-01 à 03)

- Accueil : recherche locale (nom, adresse, commune, n° ETARE, accents ignorés) et fraîcheur.
- Synthèse d’un site : identité, version publiée et date, risques critiques et points hors service
  d’emblée, puis six entrées (risques, accès, plans, eau, coupures, contacts), secours et documents ;
  un risque critique est atteint en trois interactions.
- Plans tactiles : fond validé, zoom et déplacement, calques (risques, eau, accès, énergie, secours,
  annotations, zones), toucher d’un élément pour sa fiche, ouverture centrée sur un élément.
- Fiches des points, risques et zones avec les champs du catalogue publiés avec le contenu ; documents
  image consultables ; écran « Compte » (SIS, état de la tablette, déconnexion).

### Lot D — photos attachées aux objets (PLAN-05)

- Back-office : section « Photos » dans l’édition d’un objet, sur la carte comme sur le plan ; dépôt par
  la chaîne contrôlée (quarantaine, contrôle par le worker), vignettes, légende, retrait (archivage).
- Une photo en contrôle ou refusée bloque la soumission (« Photos contrôlées ») ; les photos contrôlées
  entrent dans l’instantané ETARE et dans le paquet hors ligne (fichiers obligatoires).
- Tablette : vignettes dans la fiche du point, plein écran avec zoom et légende, sans réseau.

## Structure

Mêmes couches qu’aux sprints précédents. Nouveaux modules : `domain/distribution` (textes signés, codes
d’enrôlement, états des terminaux), `contracts/sync` ; `application/distribution`,
`application/uploads` (chaîne de dépôt commune aux documents, plans et photos) ; adaptateurs
`crypto/ed25519`, `postgres/device-repository` ; web `administration/devices-admin.tsx`,
`sites/[id]/object-photos.tsx`. Mobile : `features/sync` (identité du terminal, API signée, service de
synchronisation, enrôlement), `features/ops` (lecture de la version publiée, synthèse, listes, plans,
fiches), `data/local/daos/offline_dao.dart` (schéma Drift v2). Dépendances ajoutées : `cryptography`
2.9 et `crypto` 3.0 (mobile, BSD/Apache) ; Ed25519 côté serveur par `node:crypto` (aucune dépendance).

## Base de données

| Migration                                 | Objet                                                                                                    |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `20261004000100_offline_distribution.sql` | manifeste signé, terminaux, génération du catalogue par SIS, état des terminaux, fonctions `sync_*`      |
| `20261004000200_object_photos.sql`        | photos des objets : image contrôlée du même site, rattachement immuable, archivage définitif, RLS, audit |

## Sécurité

- Séparation des clés : une compromission de l’API ne permet pas de forger un contenu publié ; la
  tablette ne fait confiance qu’aux clés publiques de sa configuration, chacune liée à son usage.
- Un identifiant de terminal seul n’authentifie rien : preuve de possession à l’enrôlement, signature
  de chaque requête, horodatage borné ; PostgreSQL revérifie la permission, le SIS et l’état du terminal.
- Révocation effective à la requête suivante ; la tablette purge ses données au premier contact.
- Données hors ligne entièrement dans la base chiffrée (aucun fichier en clair sur la tablette) ;
  consultation locale bornée à 7 jours et liée à l’utilisateur du dernier catalogue.
- Photos : images seulement, du même site, contrôlées avant toute diffusion ; isolation multi-SIS
  retestée sur les nouveaux endpoints (terminaux, synchronisation, photos).

## Corrections faites en cours de sprint

- Formulaires d’authentification du web en `method="post"` : soumis avant l’hydratation, ils plaçaient
  l’identifiant et le mot de passe dans l’URL (test ajouté).
- Dépendance circulaire Riverpod sur la tablette (intercepteur lisant le SIS actif pendant `GET /me`),
  latente depuis le Sprint 0, révélée sur émulateur.
- Autorisation du catalogue liée au sujet du jeton (et non à l’identifiant interne), relevée par le
  test de bout en bout contre la pile locale.
- Pool PostgreSQL : la perte d’une connexion inactive (redémarrage ou bascule de la base) faisait tomber
  l’API ou le worker ; elle est désormais journalisée et sans effet (test ajouté).
- Message de purge de la tablette selon sa cause réelle (révocation ou terminal inconnu).

## Tests

| Suite                                                         | Résultat                                       |
| ------------------------------------------------------------- | ---------------------------------------------- |
| Unitaires et composants (`vitest`)                            | 248 tests, 44 fichiers                         |
| Base de données (pgTAP)                                       | 259 tests, 16 fichiers                         |
| Intégration (Auth → API → RLS)                                | 74 tests, 15 fichiers                          |
| Flutter (`flutter test`)                                      | 106 tests, 1 ignoré (bout en bout sur demande) |
| CI GitHub (TypeScript et build, base et intégration, Flutter) | lots A, B, C et D                              |

L’intégration couvre la chaîne complète : déclaration d’un terminal (second facteur), enrôlement avec
preuve, catalogue et manifeste vérifiés avec les clés publiques, fichiers téléchargés et vérifiés par
empreinte (PDF et photo), reçus, requêtes rejouées ou d’un autre SIS refusées, révocation ; photos
déposées, contrôlées, bloquantes avant contrôle, légendées et archivées. Un test Flutter optionnel
(`local_stack_sync_test.dart`) synchronise la tablette contre la pile locale.

Parcours vérifiés sur émulateur Android contre la pile locale : connexion, enrôlement avec le code,
synchronisation signée, recherche, synthèse, plans et fiches, photo du TGBT en plein écran, démarrage à
froid en mode avion, purge après suppression du terminal puis réenrôlement. Dans le navigateur :
terminaux de l’administration, section « Photos » de l’édition d’un objet.

## Décisions prises

- ADR-015 : distribution hors ligne (deux clés, textes signés avec contexte, enrôlement, requêtes
  signées, catalogue complet par génération, autorisation de 7 jours, fichiers par empreinte).
- ADR-016 : stockage hors ligne de la tablette (fichiers dans la base chiffrée, activation en une
  transaction, échecs localisés, reprise, fraîcheur, purge).
- ADR-004 : point ouvert arbitré — différentiel par empreinte de fichier (architecture §11).
- ADR-009 complété : photos des objets sur la chaîne de dépôt contrôlé.

## Écarts

- **OPS-04 (signalement terrain, P0)** : reporté, comme annoncé au lancement du sprint.
- Sites sensibles exclus de la distribution, faute de politique définie ; secteurs non appliqués.
- PDF non lus dans l’application (fichier installé et vérifié, message d’attente) ; documents image
  consultables.
- Synchronisation à l’ouverture de l’accueil et à la demande, pas en tâche de fond.
- Pas de carte sur la tablette : position GPS en texte (droits hors ligne IGN non vérifiés, ADR-006).
- Photos absentes du PDF ETARE.
- Essais sur émulateur seulement : tablette physique, réseau dégradé réel et volumétrie à éprouver ;
  iOS non compilé.

## Dette technique

- Pas de miniatures calculées : le web affiche les photos par URL signée (un téléchargement audité par
  vignette), la tablette les décode à taille réduite.
- Limitation de débit (codes d’enrôlement), clés de signature dans un KMS, verrouillage applicatif de la
  tablette : à traiter avant le pilote.
- Localement, les tests pgTAP supposent la base du seed : après une démonstration (publication,
  enrôlement) ou les tests d’intégration, relancer `pnpm db:reset`.
- Toujours à traiter avant le pilote : antivirus, purge des dépôts abandonnés et des fichiers orphelins,
  second facteur exigé par l’API pour les comptes enrôlés, CSP.

## Prochaine étape

Sur nouvelle instruction, démarrer le **Sprint 5**. Proposition : signalement terrain depuis la tablette
(OPS-04, avec file d’envoi hors ligne), lecture des PDF dans l’application, synchronisation en tâche de
fond, puis portail exploitant (PORTAL-01 à 03) et politique des sites sensibles.
