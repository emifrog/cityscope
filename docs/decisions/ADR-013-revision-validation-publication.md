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

## Conséquences

- La signature Ed25519 du manifeste, le paquet hors ligne et la diffusion aux terminaux viennent avec le
  sprint des paquets OPS ; le manifeste est déjà canonique et haché.
- Les sections de l’aperçu suivent l’ordre de la maquette ; leur paramétrage par SIS relève d’ETARE-03
  (MVP+).
- La publication de démonstration du seed a un instantané simplifié antérieur : la première révision
  soumise au format canonique n’a pas de comparaison.
