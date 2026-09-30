# ADR-002 — PostgreSQL + PostGIS, source de vérité

- Statut : acceptée — Sprint 0, 27/09/2026
- Sources : modèle de données §1, §11, §14 ; architecture technique §07, §08

## Contexte

Les données sont relationnelles (sites, bâtiments, niveaux, objets), géographiques (points, emprises,
accès) et soumises à des règles d’intégrité fortes (isolation par SIS, versions immuables).

## Décision

- PostgreSQL 17 + PostGIS (extensions dans le schéma `extensions`) est la **seule** source de vérité ;
  `supabase/migrations/` est la seule histoire du schéma.
- Schéma métier privé `app`, UUID partout, `timestamptz` UTC.
- Géométries extérieures en EPSG:4326 (GeoJSON lon/lat à l’API) ; mesures en mètres via `geography` ou
  une projection adaptée (EPSG:2154 en métropole, pas outre-mer).
- Positions intérieures en **géométrie locale SRID 0** liée à une `plan_revision` (pixel, normalisé,
  mètre si calibré), plutôt qu’en JSON : index GiST et fonctions spatiales restent disponibles.
- Règles d’intégrité en SQL (clés composites, contraintes, triggers) en plus du code applicatif.

## Alternatives écartées

- Coordonnées intérieures en `jsonb` (modèle de données) : pas d’indexation ni de validation spatiale.
- Conversion GPS des objets intérieurs : imprécis, interdit par l’architecture §08.

## Conséquences

- Toute nouvelle table doit suivre les conventions de `docs/database.md` (RLS, clés composites, audit).
- Les fichiers binaires ne sont jamais stockés en base (métadonnées + SHA-256 seulement).

## Critère de réexamen

Volumétrie mesurée au pilote (10 000 sites, centaines de milliers d’objets) : partitionnement de l’audit,
tuiles vectorielles métier générées depuis PostGIS.
