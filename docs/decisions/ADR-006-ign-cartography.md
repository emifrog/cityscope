# ADR-006 — IGN comme référence cartographique, moteur de rendu indépendant

- Statut : acceptée (abstraction seulement) — Sprint 0, 27/09/2026
- Sources : prompt §4 ; architecture technique §13, §14, §15

## Contexte

Le fournisseur de données, le service de diffusion, le format hors ligne et le moteur de rendu sont
quatre choix distincts. Mapbox est exclu comme fournisseur principal.

## Décision

- **IGN / Géoplateforme** fournit les fonds (Plan IGN, orthophotos, tuiles vectorielles) ; la provenance
  et l’attribution sont conservées.
- **MapLibre** (GL JS sur le web ; MapLibre Native via Flutter à qualifier, `flutter_map` en repli) est
  le moteur de rendu.
- Port `CartographyCatalog` + adaptateur `IgnCartographyCatalog` : les écrans reçoivent les sources
  (URL, zooms, attribution, droits) au lieu d’URL codées en dur.
- Droits de conditionnement hors ligne et d’export PDF marqués **« non vérifiés »** tant qu’une fiche de
  droits par produit n’est pas validée ; pas de moissonnage massif du WMTS public.
- Les données opérationnelles du SIS restent dans PostGIS et ne sont jamais envoyées à l’IGN.

## Conséquences

- Paramètres (couches, TileMatrixSet, zooms) à vérifier contre GetCapabilities / `metadata.json` lors du
  prototype cartographique.
- Paquets cartographiques hors ligne (PMTiles/MBTiles) préparés côté serveur, versionnés et vérifiés.

## Critère de réexamen

Échec du prototype carte en mode avion sur la tablette cible, ou conditions de licence IGN incompatibles
avec la redistribution aux SIS clients.
