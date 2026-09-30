# ADR-013 — Révision, validation et fabrication des publications

- Statut : acceptée — Sprint 3, 30/09/2026
- Sources : prompt §5 ; exigences WF-01, WF-02, ETARE-01 ; architecture technique §09 (séquence de
  fabrication) et §10 (contrat du paquet) ; maquette écrans 05 et 06 ; complète ADR-005

## Contexte

ADR-005 pose les machines à états et les garanties SQL (instantané figé, décision liée à l’empreinte,
séparation des tâches, publication immuable). Il restait à définir ce qui est figé, comment l’empreinte est
calculée, ce que le validateur contrôle et comment le worker fabrique la publication sans relire les données
de travail.

## Décision

1. **Instantané canonique** (`EtareSnapshot`, `schema_version` 1) assemblé par l’API à partir des données
   de travail lues sous RLS : site, classements, bâtiments et niveaux actifs, contacts destinés aux
   intervenants (`visibility = ops`), plans actifs avec leur fond courant contrôlé, zones, objets et risques
   actifs avec leur position exacte (révision du fond + pixels), documents dont la dernière version est
   contrôlée, et **l’extrait du catalogue utilisé** (types, libellés des champs) : la publication se lit sans
   le catalogue vivant. Tri déterministe (ordre d’affichage puis identifiant).
2. **Empreinte** : SHA-256 du JSON canonique (clés triées, sans espace, `packages/domain/src/canonical.ts`,
   dans l’esprit de RFC 8785). Le même calcul sert au manifeste. L’empreinte est calculée par l’API à la
   soumission et vérifiée par le worker avant toute fabrication.
3. **Contrôles avant soumission** (ETARE-01) : point du site, fonds de plans contrôlés, éléments restés
   sur un fond remplacé, documents contrôlés = **bloquants** ; numéro ETARE, plans de niveaux manquants,
   contacts non vérifiés depuis un an, absence de point d’eau = **à vérifier** (lus par le validateur).
4. **Une révision ouverte à la fois** par dossier (brouillon ou soumise) ; une demande de correction est
   motivée et clôt la révision ; le rédacteur en ouvre une nouvelle.
5. **Décision** (`etare:approve`, second facteur) : sur l’empreinte exacte relue (412 sinon), refusée à
   l’auteur, au soumetteur et aux contributeurs (vérifiée par l’API puis par PostgreSQL). « Valider et
   publier » crée la demande de publication et le travail `publication.build` dans la même transaction
   (`publication:publish`, second facteur).
6. **Fabrication par le worker** à partir de la révision figée uniquement (fonctions `worker_*_publication`,
   `SECURITY DEFINER`, réservées à `etare_worker`, filtrées par SIS) : charge utile (`data/site.json` =
   métadonnées de publication + instantané), manifeste (fichiers par empreinte et taille : données, fonds
   de plans, documents « toujours » requis et « à la demande » facultatifs), empreinte du manifeste, puis
   activation : la version précédente passe `superseded`, une fabrication devenue obsolète ne remplace
   jamais une version plus récente, un échec laisse la version précédente active et peut être relancé.
7. **Comparaison** (base de WF-03) : ajouts, suppressions et modifications par identifiant stable entre
   l’instantané soumis et celui de la version publiée de base.
8. Les noms des membres affichés dans le workflow passent par `app.member_name()` (membres du SIS courant,
   jamais leur adresse) : les tables d’identité restent fermées.

## Complément — corrections du 30/09/2026 (revue technique)

La revue du 30/09/2026 (`docs/bilan-alignement-2026-09-30.md`) a reproduit trois défauts, corrigés
comme suit (migration `20261003000400_publication_build_consistency.sql`) :

- **Instantané cohérent** : l’aperçu et la soumission lisent toutes les tables dans une seule transaction
  `REPEATABLE READ` : un seul état validé de la base, y compris pour la collecte des contributeurs (le
  déclencheur lit `site_edit` dans le même instantané). Une modification validée pendant la lecture est
  exclue du contenu figé et son auteur n’en devient pas contributeur ; elle ira dans la révision suivante.
  Un conflit de sérialisation est rejoué jusqu’à trois fois puis rendu en `CONFLICT`.
- **Fencing de la fabrication** : `worker_start/complete/fail_publication` reçoivent l’identifiant du
  travail et son numéro de tentative, revérifiés sous verrou de la ligne du travail (bail valide, clé
  d’idempotence canonique, publication du même SIS). Une tentative dont le bail a expiré, ou remplacée
  par une plus récente, ne peut ni publier ni faire échouer la publication ; le handler s’arrête aussi
  dès que le runner signale la perte du bail. Les anciennes signatures sans jeton sont supprimées.
- **Fichiers de sortie immuables** : le PDF est déposé sous une clé adressée par son empreinte
  (`…/publications/{publication}/etare-{sha256}.pdf`), sans écrasement possible ; un dépôt identique déjà
  présent est accepté après vérification de l’empreinte. La référence gagnante
  (`publication.pdf_storage_key`) est enregistrée dans la même transaction que le manifeste, et la base
  refuse une clé qui ne correspond pas au SIS, à la publication et à l’empreinte du PDF listé.
- **Échec définitif** : un travail passé `dead` (erreur permanente, tentatives épuisées, dernier bail
  expiré) fait passer la publication `failed` ; la version active reste en place. La relance
  (`POST /etare-revisions/{id}/publication`) crée une nouvelle publication et l’événement d’audit
  `publication.retry` (publication précédente, code d’échec).

## Conséquences

- La signature Ed25519 du manifeste, le paquet hors ligne et la diffusion aux terminaux viennent avec le
  sprint des paquets OPS ; le manifeste est déjà canonique et haché.
- Les sections de l’aperçu suivent l’ordre de la maquette ; leur paramétrage par SIS relève d’ETARE-03
  (MVP+).
- La publication de démonstration du seed a un instantané simplifié antérieur : la première révision
  soumise au format canonique n’a pas de comparaison.
