# ADR-011 — Visionneuse de plans dans un repère local synthétique

- Statut : acceptée — Sprint 3, 30/09/2026
- Sources : prompt §12 (système local au plan/niveau) ; exigences PLAN-01, PLAN-02, PLAN-06 ;
  architecture technique §08 (référentiel intérieur, migrations de plan)

## Contexte

Un plan de niveau est une image (scan, export DAO, page de PDF) sans géoréférencement : les objets
intérieurs (moyens de secours, organes de coupure, zones, risques) y sont placés en **coordonnées
locales** liées à une révision précise du fond (`plan_revision`), jamais en WGS 84. Il faut une
visionneuse zoomable (souris, clavier, tactile), capable d’afficher des couches métier et de servir au
dessin des objets (lot B), sur le web puis dans l’application mobile hors ligne.

Les fonds sont souvent fournis en PDF, de plusieurs pages. Le fichier publié et consulté hors ligne doit
être celui que le SIS a validé, identique pour tous les supports.

## Décision

1. **MapLibre GL dans un repère synthétique** : le fond est une source `image` placée près de (0, 0).
   Un pixel du plan vaut 1e-5 degré : `lng = x × 1e-5`, `lat = −y × 1e-5` (origine en haut à gauche,
   y vers le bas). Sur 0,12° (12 000 px), la projection Web Mercator y est linéaire à mieux que 1e-7 :
   aucune déformation visible. Le style du plan ne charge aucun fond cartographique ; il reprend
   seulement les polices du catalogue (ADR-006) pour les étiquettes.
2. **Les positions sont stockées en pixels du plan** (`local_unit = pixel`, géométrie SRID 0) ; les
   degrés n’existent qu’à l’écran (`components/plan/local-frame.ts`, arrondi au dixième de pixel au
   retour). Ils ne désignent jamais un lieu réel et ne sortent pas du navigateur.
3. **Même moteur que la carte** : `useMapLibre` accepte un style propre, sans échelle métrique, avec une
   emprise limitée au plan (marge de 75 %) et un zoom jusqu’à 24. Couches, dessin (terra-draw) et
   accessibilité sont partagés avec la cartographie (Sprint 2).
4. **PDF rendu en image dans le navigateur** (pdf.js, Apache-2.0, worker servi par l’application) :
   l’utilisateur choisit la page ; elle est rendue en PNG à 200 dpi, 6 000 px au plus par côté. Seul le
   PNG est déposé, contrôlé (ADR-009), validé et publié ; le serveur refuse un PDF comme fond de plan.
   Une image est admise jusqu’à 12 000 px par côté (`MAX_PLAN_SIDE_PX`).
5. **Le fond d’une révision est immuable** : le remplacer crée une nouvelle `plan_revision` (numéro
   suivant, `is_current`), l’ancienne reste consultable. Les objets placés sur une révision remplacée
   devront être repositionnés et vérifiés (lot B).
6. Un plan n’est **pas calibré** tant qu’aucune mesure ne relie ses pixels à des mètres : la visionneuse
   l’affiche et ne propose aucune mesure.

## Conséquences

- Pas de tuilage : un fond de 6 000 × 4 000 px est chargé en une texture. Suffisant pour les plans de
  niveau courants ; un tuilage (ou des fonds plus lourds) serait à étudier avec le mobile hors ligne.
- Le rendu d’un PDF dépend du navigateur de l’agent (polices intégrées au PDF sinon substituées) : la
  prévisualisation montre exactement l’image qui sera déposée, validée et publiée.
- La calibration (deux points et une distance, ou un géoréférencement) viendra avec les mesures ; elle
  ajoutera une unité `metre` sans changer les positions déjà stockées en pixels.
- Alternatives écartées : visionneuse d’image dédiée (OpenSeadragon, Leaflet `CRS.Simple`) — second
  moteur à maintenir et à embarquer hors ligne ; rendu des PDF côté serveur — dépendance native dans le
  worker et fichier validé différent de ce que l’agent a vu.
