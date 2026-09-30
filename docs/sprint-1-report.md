# Sprint 1 — rapport de livraison

Validation locale du **30 septembre 2026**, sur Windows, puis CI GitHub sur `main` (branche unique).
Trois lots livrés et poussés : référentiel modifiable (`0bd52ee`), documents et fichiers contrôlés
(`091129e`), double authentification et administration des membres (`2eb0909`). Aucun déploiement ;
aucune donnée réelle. Le Sprint 2 n’a pas été commencé.

## Réalisé

### Lot A — référentiel des sites modifiable

- Création et modification des sites (adresse, point WGS 84, statut, sensibilité), bâtiments et
  niveaux, classifications datées (ERP, IGH, ICPE…), contacts avec audience explicite (intervenants,
  interne SIS, exploitant), identifiants externes.
- Recherche par texte, type, statut et commune ; recherche depuis l’en-tête.
- Concurrence optimiste : `If-Match` obligatoire sur les `PATCH` (428), 412 si la version est
  périmée, `ETag` dans les réponses.
- Auteurs des données de travail tracés par PostgreSQL : ils deviennent contributeurs de la révision
  soumise et ne peuvent donc pas la valider.

### Lot B — documents et fichiers contrôlés

- Documents de site versionnés (FDS, notice, consigne, plan, photo) avec politique hors ligne et
  dates de validité ; une nouvelle version n’écrase jamais la précédente.
- Dépôt en quarantaine par URL signée après déclaration (taille, SHA-256, type réel calculés dans le
  navigateur) ; contrôle par le worker (taille, empreinte, type réel lu dans le contenu, port
  antivirus), promotion ou refus motivé.
- Téléchargement par URL de 60 s après autorisation, refusé tant que le fichier n’est pas contrôlé,
  tracé dans l’audit.
- Onglet Documents : dépôt, suivi du contrôle, versions précédentes, ouverture sécurisée.

### Lot C — double authentification et administration des membres

- TOTP : enrôlement et retrait dans « Mon compte », étape de code à la connexion, rappel pour les
  rôles sensibles sans second facteur.
- Écran Administration : invitation par e-mail ou rattachement d’un compte existant, rôles,
  suspension et réactivation.
- Activation de l’invitation au clic, puis choix d’un mot de passe conforme à la politique.

## Structure

Aucune nouvelle brique : les trois lots suivent les couches existantes (contrats → cas d’usage →
adaptateurs → API → web) et les règles d’import ESLint. Nouveaux modules : `contracts/documents`,
`contracts/members`, `application/documents`, `application/asset-verification`,
`application/members`, adaptateurs `document-repository`, `member-repository`,
`asset-verification-store`, `identity-provisioner`, handler worker `asset.verify`. Mobile inchangé.

## Base de données

Migrations additionnelles, sans réécriture des précédentes :

| Migration                                  | Objet                                                                   |
| ------------------------------------------ | ----------------------------------------------------------------------- |
| `20260930120000_role_timeouts.sql`         | délais `statement` / `idle` / `lock` portés par les rôles applicatifs   |
| `20261001000100_referential_editing.sql`   | auteurs (`site_edit`), classifications, contacts, identifiants externes |
| `20261001000200_document_uploads.sql`      | quarantaine, verdict réservé au worker et définitif                     |
| `20261001000300_member_administration.sql` | fonctions d’habilitation anti-escalade, `holds_with_second_factor`      |

Le schéma `app` passe l’analyse `supabase db lint` sans avertissement.

## Sécurité

- Isolation multi-SIS inchangée et retestée sur chaque nouvelle table et chaque nouvel endpoint
  (404 pour une ressource d’un autre SIS).
- Fichiers : jamais servis avant contrôle, type réel vérifié côté navigateur et côté worker, clé de
  quarantaine liée au SIS, verdict non modifiable par l’API (privilèges par colonne).
- Clé secrète Supabase utilisée côté serveur uniquement (signature d’URL, contrôle des fichiers,
  invitations).
- Habilitations modifiées uniquement par fonctions de base : second facteur exigé, ni
  auto-attribution ni auto-retrait, jamais `SUPER_ADMIN` ni `EXPLOITANT` à l’échelle du SIS, au moins
  un administrateur actif, suspension effective à la requête suivante.
- `MFA_REQUIRED` n’est répondu qu’aux personnes dont les rôles accorderaient la permission ; les
  autres reçoivent `FORBIDDEN`.

## Tests

| Suite                              | Résultat               |
| ---------------------------------- | ---------------------- |
| Unitaires et composants (`vitest`) | 153 tests, 24 fichiers |
| Base de données (pgTAP)            | 146 tests, 11 fichiers |
| Intégration (Auth → API → RLS)     | 29 tests, 6 fichiers   |
| Build web de production            | OK                     |
| CI GitHub (3 jobs)                 | lots A, B et C au vert |

Parcours vérifiés dans le navigateur sur la pile locale : édition du référentiel, dépôt de
documents (fichier conforme contrôlé, exécutable déguisé refusé dans le navigateur, nouvelle
version), enrôlement TOTP, étape de code (code faux puis juste), invitation reçue dans Mailpit,
activation, retrait du facteur. Le test d’intégration des membres utilise un vrai TOTP et l’e-mail
réellement envoyé.

## Décisions prises

- ADR-009 : dépôt contrôlé en quarantaine, verdict du worker définitif.
- ADR-010 : administration des membres par fonctions de base ; double authentification TOTP.
- `EXPLOITANT` n’est attribuable qu’à des sites (portail exploitant), jamais à tout un SIS.
- Lien d’invitation vérifié au clic, pour résister aux analyseurs de liens des messageries.
- Les tests pgTAP vérifient l’isolation plutôt que des listes exactes, les tests d’intégration
  ajoutant des données à la base locale.
- Mailpit conservé dans la CI pour tester l’invitation de bout en bout.

## Écarts

- **Antivirus non branché** : le port existe et chaque verdict indique `antivirus: not_scanned` ; le
  choix du moteur (ClamAV auto-hébergé ou service) reste à faire.
- Le second facteur des comptes enrôlés est exigé par le web mais pas encore par l’API pour les
  permissions ordinaires (les permissions sensibles l’exigent déjà côté API et base).
- Administration limitée aux membres : terminaux, catalogues et paramètres du SIS à venir ;
  rattachement des exploitants à leurs sites avec le portail exploitant.
- Mobile : aucune évolution ce sprint (consultation du référentiel et des documents hors ligne avec
  les paquets OPS).
- Vérification navigateur : le sélecteur de fichiers système ne se pilote pas dans le navigateur
  intégré (fichiers injectés dans le champ) et l’ouverture en nouvel onglet n’y est pas observable
  (contenu de l’URL signée vérifié à la place).

## Dette technique

- Purge des dépôts abandonnés (déclarés mais jamais envoyés) et des objets orphelins de quarantaine.
- Codes de secours, réinitialisation du mot de passe en libre-service, révocation des sessions à la
  suspension.
- État de l’invitation (acceptée ou non) et du second facteur non affichés dans la liste des membres.
- En développement, l’API est instanciée une fois par processus Next : redémarrer `pnpm dev` après
  une modification de `services/api`.
- Toujours à traiter avant le pilote : CSP stricte, limitation de débit, client Dart généré depuis
  OpenAPI.

## Prochaine étape

Sur nouvelle instruction, démarrer le **Sprint 2 : cartographie IGN**. Première tranche : carte des
sites du SIS (MapLibre, fonds IGN Plan et ortho), positionnement du site sur la carte, recherche
d’adresse par le géocodeur IGN, emprise des bâtiments. Choisir en parallèle le moteur antivirus pour
lever le principal écart du lot B.
