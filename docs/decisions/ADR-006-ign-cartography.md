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

## Mise en œuvre (Sprint 2)

- Paramètres vérifiés le 30/09/2026 contre GetCapabilities : Plan IGN v2 et BD ORTHO annoncent le
  TileMatrixSet `PM_0_19` (et non `PM` supposé au Sprint 0), zooms 0 à 19, style `normal`.
  `pnpm cartography:check` refait ce contrôle (couches WMTS, métadonnées vectorielles, polices) ; il
  demande un accès réseau et ne fait pas partie de `pnpm check`.
- Le catalogue est servi par l’API (`GET /map/sources`) : URL, zooms, attribution, licence (Licence
  Ouverte 2.0), droits, polices des libellés (servies par l’IGN). Le web n’affiche que les fonds raster ;
  le style vectoriel viendra avec les paquets hors ligne.
- Les sites arrivent séparément de l’API (`GET /map/sites`, GeoJSON limité à l’emprise si besoin) :
  l’IGN ne reçoit jamais de donnée du SIS. Le navigateur appelle directement la Géoplateforme pour les
  tuiles : l’IGN voit l’adresse réseau et l’emprise consultée (flux à valider par la DSI, architecture
  §14).
- La panne d’un fond affiche « fond de carte indisponible » sans masquer les sites.
- Le catalogue reste une configuration serveur versionnée ; la table `map_source` renseignée par le
  responsable SIG (dates de contrôle, échéances de contrat) viendra avec les paquets hors ligne.
- **Géocodage** : géocodeur de la Géoplateforme (Base Adresse Nationale) appelé **par le serveur**
  (`GET /geocoding/search`, `GET /geocoding/reverse`), proxy limité au sens de l’architecture §14 :
  l’IGN reçoit l’adresse saisie mais pas l’adresse réseau de l’agent ; délai de 5 s, une reprise, 429
  signalé comme indisponibilité temporaire ; le texte recherché n’est jamais journalisé ; réservé aux
  membres ayant `site:read`. Attribution affichée avec les suggestions.
- **Tracé des emprises** : Terra Draw (MIT) sur MapLibre, polygones uniquement, auto-intersections
  refusées au tracé ; l’API accepte Polygon ou MultiPolygon (2 000 sommets au plus) et PostGIS garde le
  dernier mot (`st_isvalid`, message « contour invalide »). Stockage en MultiPolygon WGS 84.

## Conséquences

- Tout nouveau fond passe par le catalogue et par `pnpm cartography:check`.
- Paquets cartographiques hors ligne (PMTiles/MBTiles) préparés côté serveur, versionnés et vérifiés.

## Critère de réexamen

Échec du prototype carte en mode avion sur la tablette cible, ou conditions de licence IGN incompatibles
avec la redistribution aux SIS clients.
