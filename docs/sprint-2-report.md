# Sprint 2 — rapport de livraison

Validation locale du **30 septembre 2026**, sur Windows, puis CI GitHub sur `main` (branche unique).
Trois lots livrés et poussés : carte des sites (`d5c1547`), géocodage et emprises (`5556c96`), points
opérationnels (`7f8e641`), plus un correctif de chargement de la carte (`07f7bd1`). Aucun déploiement ;
aucune donnée réelle. Le Sprint 3 n’a pas été commencé.

## Réalisé

### Lot A — carte des sites (MAP-01)

- Catalogue cartographique servi par l’API (`GET /map/sources`) : Plan IGN et photographies
  aériennes, zooms, attribution, licence, droits, polices des libellés. Paramètres vérifiés contre la
  Géoplateforme ; `pnpm cartography:check` refait ce contrôle.
- Page Carte : MapLibre GL JS, regroupement des sites, légende (ETARE publié, site connu, vérifié
  depuis moins de 12 mois), filtres partagés avec la liste, fiche résumée, bascule plan / photos.
- `GET /map/sites` : sites positionnés en GeoJSON, limités à l’emprise visible au besoin, avec
  l’emprise de tous les résultats et le nombre de sites sans position.
- « Marquer comme vérifié » sur la fiche site.

### Lot B — géocodage et emprises

- Recherche d’adresse et adresse la plus proche via le géocodeur IGN (Base Adresse Nationale),
  appelé par le serveur.
- Onglet Localisation de la fiche site : point de référence à déplacer (clic ou glisser, adresse la
  plus proche proposée), emprises du site et des bâtiments tracées et modifiées sur la carte.
- Formulaire site : la recherche d’adresse remplit voie, code postal, commune, code INSEE et point.

### Lot C — points opérationnels (MAP-02)

- Accès, points d’eau, voies engins, aires EPA, coupures… placés en point, ligne ou surface selon leur
  type, avec leurs propriétés typées (débit et pression d’un PEI, capacité d’une réserve, largeur d’une
  voie engins…), leur criticité, leur état et leurs consignes ; distance au point du site.
- Page Carte : bâtiments et points à partir du zoom de la rue, calques par catégorie, fiche du point ;
  point d’eau en service le plus proche sur la fiche résumée d’un site (écran 02 de la maquette).

## Structure

Mêmes couches qu’aux sprints précédents. Nouveaux modules : `contracts/map`, `contracts/geocoding`,
`contracts/objects`, `domain/objects` (propriétés typées), `application/map`, `application/geocoding`,
`application/objects`, adaptateurs `cartography/ign-geocoder` et `postgres/operational-object-repository`,
composants web `components/map/*` (carte partagée, style, couches, tracé) et `address-search`.
Dépendances ajoutées au web : `maplibre-gl` 6.11 (BSD-3), `terra-draw` 1.35 et son adaptateur MapLibre
(MIT). Le worker MapLibre est servi depuis la même origine (copié du paquet installé).

## Base de données

| Migration                                        | Objet                                                               |
| ------------------------------------------------ | ------------------------------------------------------------------- |
| `20261002000100_operational_object_geometry.sql` | objet toujours placé, géométrie conforme au type, propriétés typées |

Les colonnes géométriques existaient depuis le Sprint 0 ; les emprises sont stockées en MultiPolygon
WGS 84, les distances calculées en `geography`. Le schéma `app` passe `supabase db lint` sans
avertissement.

## Sécurité

- L’IGN ne reçoit aucune donnée du SIS : les sites, emprises et points viennent de l’API, sous RLS.
- Tuiles et polices : appel direct du navigateur à `data.geopf.fr` (adresse réseau et emprise
  consultée visibles par l’IGN) — flux à valider par la DSI (architecture §14).
- Géocodage par le serveur : l’adresse réseau des agents n’est pas exposée, le texte recherché n’est
  jamais journalisé, accès réservé aux membres ayant `site:read`.
- Détails de carte limités à une zone de 0,2° et à 2 000 éléments par couche ; propriétés d’objets
  limitées aux champs déclarés par le type.
- Isolation multi-SIS retestée sur chaque nouvel endpoint (carte, détails, objets, emprises).

## Tests

| Suite                              | Résultat               |
| ---------------------------------- | ---------------------- |
| Unitaires et composants (`vitest`) | 183 tests, 31 fichiers |
| Base de données (pgTAP)            | 153 tests, 12 fichiers |
| Intégration (Auth → API → RLS)     | 44 tests, 9 fichiers   |
| Build web de production            | OK                     |
| CI GitHub (3 jobs)                 | lots A, B et C au vert |

Parcours vérifiés dans le navigateur sur la pile locale avec les vrais services IGN : carte et
regroupements, fiche résumée, bascule plan / photos, filtre, fond indisponible simulé (les sites
restent affichés), recherche d’adresse au clavier, adresse la plus proche, tracé d’une emprise
(stockée valide et auditée), formulaire site rempli par l’adresse, placement d’un PEI avec validation
des propriétés, ouverture d’un point par clic, mise hors service, détails et calques sur la carte.

## Décisions prises

- ADR-006 complété : TileMatrixSet `PM_0_19` (et non `PM`), catalogue servi par l’API, polices IGN,
  géocodage par le serveur, tracé avec Terra Draw, Polygon ou MultiPolygon acceptés.
- Propriétés des objets décrites par un sous-ensemble de JSON Schema et validées sans dépendance ;
  seules les propriétés déclarées sont acceptées.
- Détails (bâtiments, points) affichés à partir du zoom 15 ; les sites restent regroupés en dessous.
- Couleurs par catégorie d’objet fixées dans le code (la couleur n’est jamais le seul repère).
- La carte n’attend plus les tuiles du fond pour afficher les données du SIS.

## Écarts

- **Pictogrammes** : les points sont des pastilles colorées avec libellé ; les symboles par type
  (sprite) restent à dessiner.
- MAP-03 (import GeoJSON/CSV) et MAP-04 (mesure de distance), priorité P1 : non réalisés.
- Objets intérieurs sur plans (PLAN-01 à 06) : lus et comptés, mais leur placement attend l’éditeur de
  plans.
- Mobile : aucune carte ce sprint ; les paquets cartographiques hors ligne et MapLibre Native restent
  à qualifier (architecture §15).
- La table `map_source` (fiche de droits par produit, renseignée par le responsable SIG) n’est pas
  créée : le catalogue reste une configuration serveur versionnée.
- Bouton « Voir en OPS » de la maquette : attend l’application OPS.
- Le tracé à la souris n’a pas de test automatisé de bout en bout (vérifié à la main dans le
  navigateur).

## Dette technique

- Mesurer la carte avec un jeu réaliste (plusieurs milliers de sites et de points) ; tuiles
  vectorielles métier si le GeoJSON ne suffit plus (architecture §14).
- Une future CSP devra autoriser `data.geopf.fr` (tuiles, polices) et le worker servi localement.
- Appels directs du navigateur à la Géoplateforme à confirmer par la DSI, ou proxy limité.
- Toujours à traiter avant le pilote : antivirus, limitation de débit, purge des dépôts abandonnés,
  second facteur exigé par l’API pour les comptes enrôlés.

## Prochaine étape

Sur nouvelle instruction, démarrer le **Sprint 3 : plans et révisions ETARE**. Première tranche :
import d’un plan (PDF ou image) comme fond par niveau, visionneuse en coordonnées locales, placement
des objets intérieurs et des risques sur le plan, puis écrans de soumission et de validation d’une
révision (« ETARE » et « Validations ») jusqu’à la publication.
