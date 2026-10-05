# ADR-027 — Clés de signature : coffre, jeu de clés signé par une racine, rotation et révocation

- Statut : acceptée — Sprint 12, 05/10/2026
- Sources : roadmap R4, SEC-04 (« stockage dans un gestionnaire de secrets ou KMS, séparation des clés
  API/worker, rotation testée avec chevauchement des clés publiques, procédure de compromission ») ;
  architecture technique §09 (« la clé privée reste dans un gestionnaire de secrets ou un KMS
  compatible ; les clés publiques approuvées sont distribuées avec une procédure de rotation ») et §26
  (secrets injectés depuis un coffre, rotation) ; ADR-015 ; choix du porteur du 5 octobre 2026
- Complète l'ADR-015 (points 1 et conséquences sur les clés)

## Contexte

Depuis le Sprint 4, deux clés Ed25519 signent ce que reçoivent les tablettes : la clé de publication
(worker) et la clé de catalogue (API). Leurs clés privées étaient lues dans des variables
d'environnement, et les tablettes ne faisaient confiance qu'aux clés publiques compilées dans
l'application.

Une rotation exigeait donc une nouvelle version de l'application sur tout le parc avant de changer la
clé du serveur. Une clé compromise restait acceptée par chaque tablette non mise à jour. La
distribution de l'application (MDM ou installation manuelle) n'est pas décidée (DEC-01), ni
l'hébergement (DEC-03).

## Décision

Choix du porteur du 5 octobre 2026 : un fichier de secret ou OpenBao Transit pour les clés, une clé
racine et un jeu de clés signé pour la rotation.

1. **Trois sources de clé par processus, une seule à la fois.**
   - `*_SIGNING_KEY` : la clé elle-même dans l'environnement, réservée au développement et aux essais.
     Elle est refusée au démarrage en préproduction et en production.
   - `*_SIGNING_KEY_FILE` : un fichier de secret monté par l'hébergeur (secrets Docker ou Kubernetes,
     agent d'un coffre), en PEM ou en base64. Ce choix convient à tout hébergeur.
   - `*_SIGNING_TRANSIT_KEY` : la signature est déléguée au moteur Transit d'OpenBao ou de Vault. La
     clé n'est pas exportable et ne quitte jamais le coffre. Le processus lit son jeton dans un fichier
     tenu par l'agent du coffre, et n'accède au coffre qu'en https hors développement. Chaque signature
     est revérifiée localement avant d'être servie.

   Le choix d'un KMS de fournisseur reste lié à l'hébergement (DEC-03). Un autre KMS se branchera
   derrière le même port de signature.

2. **Séparation API et worker, vérifiée.**
   - Chaque processus n'a que sa clé, et un jeton Transit limité à elle (`infra/openbao/*.hcl`).
   - Le jeton de l'API ne peut ni signer avec la clé des publications, ni exporter, ni faire tourner
     une clé ; c'est vérifié sur OpenBao.
   - Une même clé publique ne peut pas servir deux usages dans le jeu de clés.
3. **Clé racine hors ligne, jeu de clés signé.**
   - Seule la partie publique de la racine est embarquée dans l'application, avec une seconde clé de
     secours possible. La racine ne sert qu'à signer des jeux de clés, lors d'une cérémonie
     (`pnpm keys`), et ne va jamais sur un serveur.
   - Le jeu de clés liste les clés de publication et de catalogue avec leur statut. Il porte un numéro
     croissant et est signé avec le contexte `etare.keyset.v1`.
4. **Statuts.**
   - `active` : la clé signe, et elle est reconnue.
   - `retired` : la clé ne signe plus. Ce qu'elle a signé auparavant reste reconnu pour les contenus
     immuables (publications, fonds de carte), mais jamais pour un catalogue, signé à chaque contact.
   - `revoked` : rien de ce que la clé a signé n'est reconnu.
   - Un processus refuse de démarrer avec une clé qui n'est pas `active` dans le jeu configuré.
   - Avec Transit, la version qui signe est la plus récente que le jeu annonce comme active. Une
     version créée par une rotation ne signe donc qu'une fois annoncée.
5. **Distribution.**
   - `GET /sync/keyset` est une requête signée par la tablette, faite avant le catalogue. Il répond 404
     quand aucun jeu n'est configuré.
   - Le serveur vérifie au démarrage la signature racine du jeu (`DISTRIBUTION_ROOT_KEYS`).
   - La tablette vérifie le jeu avec sa racine et refuse un numéro plus ancien que le sien. Elle ne
     fait ensuite confiance qu'aux clés du jeu, et non plus aux clés compilées, qui ne servent qu'au
     premier contact (lot B).
   - La tablette déclare son numéro de jeu dans ses reçus. L'administration voit les tablettes en
     retard sur la dernière rotation.
6. **Re-signature.**
   - La signature faite à la fabrication reste immuable. Après une rotation, le travail
     `signatures.renew` (une fois par heure et par clé) re-signe avec la clé active les contenus en
     vigueur : publications publiées et fonds prêts.
   - Les re-signatures s'ajoutent à l'original (`publication_signature`, `basemap_pack_signature`) et
     chacune est tracée au journal du SIS.
   - Le worker ne re-signe que ce dont il peut répondre : le manifeste stocké doit correspondre à son
     empreinte, et l'une de ses signatures doit être vérifiée par une clé connue du jeu, même révoquée.
     Il ne re-signe jamais un manifeste qu'on lui transmettrait.
   - L'API sert la signature la plus récente d'une clé active, à défaut d'une clé retirée. S'il n'y en
     a aucune (clé révoquée, re-signature pas encore faite), elle répond 503 et la tablette garde ce
     qu'elle détient.
7. **Chevauchement.** La tablette lit le jeu avant le catalogue et les manifestes. Le chevauchement
   tient donc dans un seul contact : la nouvelle clé est reconnue avant d'être utilisée, et l'ancienne
   reste reconnue tant que le jeu la garde `retired`. On ne la retire du jeu (ou ne la révoque) qu'une
   fois la re-signature finie.

## Conséquences

- Configuration exigée en préproduction et en production :
  - les deux clés par fichier ou par Transit ;
  - `DISTRIBUTION_KEYSET_FILE` (ou `DISTRIBUTION_KEYSET`) et `DISTRIBUTION_ROOT_KEYS`.

  Localement, `pnpm setup:local` crée une racine de développement et un jeu de clés, tous deux
  conservés d'un passage à l'autre.

- Les procédures sont dans `docs/exploitation/cles-de-signature.md` : cérémonie initiale, rotation
  planifiée, compromission d'une clé de publication, de catalogue ou de la racine, et sauvegarde.
- Une application antérieure à la 0.4.0 ignore le jeu de clés. Avant la première rotation réelle, il
  faut exiger la 0.4.0 (`MOBILE_MIN_APP_VERSION`).
- La compromission de la racine reste traitée par une nouvelle version de l'application, ou par la
  racine de secours si elle a été embarquée.
- Une publication dont aucune signature n'est vérifiable par une clé connue n'est jamais re-signée.
  Elle est signalée, et il faut la republier.
- Pas de KMS de fournisseur tant que l'hébergement n'est pas décidé. La CI et le développement
  éprouvent le moteur Transit avec OpenBao en mode développement.

## Critère de réexamen

Décision d'hébergement (DEC-03, KMS du fournisseur), mode de distribution de l'application (DEC-01,
rotation de la racine), ou une compromission réelle (retour d'expérience).
