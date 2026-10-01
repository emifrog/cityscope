# Sprint 7 — rapport de livraison

Validation locale du **1er octobre 2026**, sur Windows, dans le navigateur et contre la pile locale
(Supabase, Mailpit), puis CI GitHub sur `main` (branche unique). Six commits : cadrage et tablette de
référence (`38d4946`), accès des exploitants (`114250c`), consultation (`28b8e77`), propositions et
instruction (`a6292cb`), notifications (`1238901`), correction des tests et mise en page (`ee1be43`).
Aucun déploiement ; aucune donnée réelle.

Périmètre retenu (roadmap) : R2 portail exploitant, POR-01 à POR-05 ; tablette de référence consignée
(DEC-01, en partie). Décisions du porteur du 1er octobre : invitations par l’administration du SIS et la
Prévision, avec second facteur ; second facteur des exploitants réglable par SIS, exigé par défaut ;
liste blanche minimale de la version publiée ; pas d’émulateur Android 11 (attente de la tablette).

## Réalisé

### Lot 0 — tablette de référence (DEC-01, en partie)

- Alldocube iPlay 40H sous Android 11 consignée comme tablette de référence (roadmap, `apps/mobile`).
  Restent à arbitrer : fréquence de synchronisation, budget de données, durée hors ligne.

### Lot A — accès des exploitants (POR-01)

- Invitation d’une personne sur **un à cinquante sites** du SIS par l’administration du SIS ou la
  Prévision (`portal:invite`, second facteur) : valable 1 à 30 jours (7 par défaut), **une seule fois**,
  révocable, avec une fin d’accès facultative (fin de journée à Paris).
- Une adresse inconnue reçoit l’e-mail de création de compte (gabarit « Invitation à FireScape ») ; une
  adresse connue reçoit une notification (lot D).
- Acceptation par l’invité depuis son portail : adhésion au SIS et un rôle `EXPLOITANT` **par site** ;
  tout rôle `EXPLOITANT` à l’échelle du SIS est refusé par la base.
- Second facteur des exploitants **exigé par défaut**, réglable par l’administration du SIS (onglet
  « Paramètres ») ; le portail propose son activation.
- Écran « Exploitants » (inviter, suivre, révoquer) ; portail séparé du back-office (`/portail`), vers
  lequel un compte sans rôle de back-office est redirigé.

### Lot B — consultation (POR-02)

- L’exploitant lit la **version publiée** de ses sites, jamais les données de travail, au travers d’une
  liste blanche construite champ par champ en base : identité, adresse, classements, contacts des
  intervenants, liste des plans (titre, type, bâtiment, niveau, numéro du fond, **sans image**) et
  documents partagés. Jamais les codes d’accès, les risques, les points d’eau, les zones, les photos.
- Case « Visible par l’exploitant » sur les documents de travail : drapeau **figé dans l’instantané**, effectif
  à la publication suivante ; téléchargement par URL courte après contrôle de l’appartenance du fichier
  à la version publiée (identifiant et empreinte), accès tracé.
- Un site sans version publiée (ou retirée) reste listé, sans contenu.

### Lot C — propositions et instruction (POR-03, POR-04)

- L’exploitant propose une mise à jour : nom ou adresse du site, contact (ajout, modification, retrait),
  plan ou document (nouveau, à mettre à jour, obsolète), autre information (stockage, travaux…), avec
  jusqu’à cinq fichiers de la chaîne contrôlée. La valeur qu’il voyait dans la version publiée est
  **figée par la base** ; un élément absent de cette version ne peut pas être visé.
- Ni la proposition ni ses fichiers ne modifient les données de travail, ni ne font de l’exploitant un
  auteur du dossier.
- Écran « Contributions » : prise en charge, échanges (« précision demandée », réponse de l’exploitant),
  report dans une **révision en brouillon**, décision motivée et définitive (acceptée, en partie,
  refusée) ; retrait par l’exploitant ; compteur au tableau de bord ; contributions intégrées affichées
  sur l’écran de validation.
- **Conflit explicite** : valeurs publiée, proposée et de travail côte à côte ; accepter une proposition
  dont la valeur a changé entre-temps exige une **résolution motivée**, contrôlée en base.
- L’exploitant suit sa proposition jusqu’à la version publiée (« intégrée à la révision n° …, publiée en
  version n° … »).

### Lot D — notifications (POR-05)

- Boîte d’envoi **transactionnelle** : invitation d’un compte existant, question posée et décision sont
  écrites avec leur événement et leur travail ; le workflow ne dépend jamais de l’e-mail.
- Envoi par le worker en SMTP (Mailpit en local) : e-mails en français, contenu minimal (ni échanges, ni
  motif, ni code, ni document), liens sans secret vers le portail ; chaque tentative et son erreur sont
  tracées ; une invitation close n’est pas envoyée.
- Administration → « Notifications » : en attente, envoyée, en échec (cause), **renvoi** à la demande.

## Structure

Nouveaux modules : `packages/domain/src/{portal,contributions}.ts`,
`packages/contracts/src/{portal,contributions,notifications}.ts`,
`packages/application/src/{portal-access,portal-consultation,contributions,notifications}.ts`,
`packages/adapters/src/postgres/{portal,contribution,notification}-repository.ts`,
`packages/adapters/src/mail/smtp.ts`, gestionnaire `notification.send` du worker. Web : `/exploitants`,
`/contributions`, onglets « Notifications » et « Paramètres » de l’administration, portail `(portal)`.
Dépendance ajoutée : `nodemailer` (MIT) dans les adaptateurs.

## Base de données

Quatre migrations : accès des exploitants (`portal_invitation`, réglage `portal_mfa_required` contrôlé
dans `has_permission`), consultation (`document.portal_visible`, fonctions `portal_*`), propositions
(`contribution`, `contribution_message`, `contribution_attachment`, conflit et instruction), notifications
(`notification`, déclencheurs et fonctions du worker). Port SMTP de Mailpit ouvert (`supabase/config.toml`).

## Sécurité

- Exploitant limité à des sites, jamais au SIS entier (refus en base) ; second facteur par défaut ;
  invitation à usage unique, limitée dans le temps, révocable avec effet immédiat.
- Aucune lecture des données de travail : fonctions dédiées, liste blanche construite en base, site non
  ouvert ou document non partagé « introuvable » (pas de fuite d’existence).
- Propositions sans écriture directe : report par la Prévision, validation par un tiers (ADR-013) ;
  conflit résolu explicitement ; fichiers contrôlés (antivirus) et exclus de la paternité du dossier.
- Notifications sans donnée du dossier ni secret dans les liens.

## Tests

| Suite                              | Résultat                                                |
| ---------------------------------- | ------------------------------------------------------- |
| Unitaires et composants (`vitest`) | 291 tests, 52 fichiers                                  |
| Base de données (pgTAP)            | 392 tests, 21 fichiers (dont 150 à 180 pour le portail) |
| Intégration (Auth → API → RLS)     | 96 tests, 21 fichiers, dont Mailpit et ClamAV en CI     |
| Flutter (`flutter test`)           | inchangé (aucune modification mobile)                   |
| CI GitHub (3 jobs)                 | au vert ; voir l’écart sur le lot D ci-dessous          |

L’intégration couvre le parcours complet : invitation par la Prévision (second facteur exigé), e-mail
de création de compte, acceptation unique, accès conditionné au second facteur, révocation immédiate ;
consultation d’un site publié pour le test (document partagé téléchargé, document interne, point d’eau
et contact interne jamais renvoyés) ; proposition avec photo contrôlée, question et réponse, conflit
avec les données de travail, report en brouillon, acceptation motivée, publication par un validateur
distinct et suivi par l’exploitant ; notifications reçues dans Mailpit, panne d’envoi visible, renvoi.

Vérifié dans le navigateur contre la pile locale : connexion de l’exploitant de démonstration avec
second facteur et redirection vers le portail ; liste de ses sites ; fiche de l’EHPAD (identité,
classement, contacts, plans sans image) ; proposition d’un nouveau numéro pour le PC sécurité avec les
valeurs publiées pré-remplies ; côté Prévision, liste « Contributions » et détail comparant valeurs
publiée, proposée et de travail.

## Décisions prises

- ADR-019 : portail exploitant (accès, consultation, propositions et conflit).
- ADR-020 : notifications du portail (boîte d’envoi transactionnelle, contenu minimal, rejeu).

## Écarts

- **CI du lot D** (`1238901`) en échec : le test des propositions attendait la fabrication d’une
  publication alors que la file contenait d’abord des travaux de notification (en local, le worker de
  développement les absorbait). Corrigé par `ee1be43` : les tests vident la file de leur worker.
- Le report d’une proposition acceptée dans les données de travail reste **manuel** (écrans habituels) ;
  application automatique des contacts à envisager selon les retours pilotes.
- Contacts à visibilité « exploitant » (`operator`) non encore exposés : le portail montre les contacts
  destinés aux intervenants, tels que publiés.
- Pas de notification des équipes du SIS (nouvelle proposition) : compteur et liste seulement.
- Tablette physique toujours attendue ; aucun essai mobile ce sprint.

## Dette technique

- Les workers de test réclament tous les types de travaux : un worker sans gestionnaire fait échouer
  les travaux d’un autre type (sans effet en production, un seul worker les gère tous).
- Pas de limitation de débit sur les invitations ni sur les propositions (hors plafond de vingt
  propositions en cours par site et par exploitant).
- Toujours à traiter avant le pilote : limitation de débit, CSP, purge des dépôts abandonnés, KMS pour
  les clés de signature, fournisseur d’envoi et délivrabilité des e-mails.

## Prochaine étape

Sur nouvelle instruction : R3 (recherche par risque, risques extérieurs, cycle de vie des dossiers,
secteurs et sites sensibles, carte terrain) et premiers essais sur la tablette Alldocube iPlay 40H ;
recette du portail avec un exploitant pilote.
