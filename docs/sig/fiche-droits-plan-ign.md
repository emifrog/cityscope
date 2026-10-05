# Fiche de droits — Plan IGN (tuiles vectorielles) hors ligne

Modèle à compléter et à faire valider par le référent SIG avant le pilote (ADR-024, point 7 ;
architecture §13 : une fiche de droits par produit). Tant que cette fiche n'est pas validée, la source
`ign-plan-vector` reste `unverified` dans le catalogue cartographique
(`packages/adapters/src/cartography/ign.ts`) : la plateforme ne prépare aucun fond, ne contacte pas l'IGN
et ne distribue rien.

## 1. Produit

| Rubrique                   | Valeur                                                                        |
| -------------------------- | ----------------------------------------------------------------------------- |
| Producteur                 | IGN (Géoplateforme)                                                           |
| Produit                    | Plan IGN, tuiles vectorielles (`PLAN.IGN`, style « standard »)                |
| Licence                    | Licence Ouverte Etalab 2.0                                                    |
| Canal d'obtention envisagé | Flux de tuiles convenu avec l'IGN (pas de fichier vectoriel téléchargeable)   |
| Pictogrammes et style      | Style « standard » et pictogrammes publiés par l'IGN, adaptés en local        |
| Polices                    | Noto Sans (OFL 1.1), embarquées dans l'application à la place des polices IGN |

Constat du 5 octobre 2026 : selon la FAQ de l'IGN sur le Plan IGN vectoriel (11 février 2021), la mise en
cache des tuiles est autorisée, mais leur téléchargement en fichier (MBTiles) n'est pas proposé. La version
téléchargeable du Plan IGN est un produit raster.

## 2. Usage prévu par FireScape

- Un fichier par secteur de SIS : vue générale jusqu'au zoom 14 sur les sites du secteur et 5 km de marge,
  détail jusqu'au zoom 18 à 500 m des sites diffusés (ETARE publiés).
- Préparé par la plateforme (exploitant de FireScape), stocké sur son stockage objet, distribué aux seules
  tablettes enrôlées des SIS clients, affiché hors ligne dans l'application OPS.
- Renouvellement semestriel, et à chaque évolution des sites du secteur.
- Débit des requêtes borné (`BASEMAP_REQUESTS_PER_SECOND`, 4 par défaut), exploitant identifié
  (`BASEMAP_CONTACT`) ; aucune requête depuis les tablettes.
- Attribution « © IGN – Plan IGN » visible sur la carte de la tablette, dans le manifeste du fond, et datée
  (date du fond distincte de celle des ETARE).

## 3. Points à confirmer (référent SIG, avec l'IGN si besoin)

| Question                                                                    | Réponse | Source / preuve |
| --------------------------------------------------------------------------- | ------- | --------------- |
| Le stockage des tuiles hors ligne sur la plateforme est-il admis ?          |         |                 |
| Leur redistribution aux SIS clients (fichier par secteur) est-elle admise ? |         |                 |
| Un accord ou une clé Géoservices dédiée est-il nécessaire pour ce volume ?  |         |                 |
| Débit maximal accepté par l'IGN pour la préparation                         |         |                 |
| Emprise et zooms (14 général, 18 détail) acceptés                           |         |                 |
| Réutilisation et adaptation du style « standard » et des pictogrammes       |         |                 |
| Mention d'attribution exacte (et année)                                     |         |                 |
| Périodicité de renouvellement attendue (semestrielle prévue)                |         |                 |
| Usage dans le PDF ETARE (export) : à traiter à part (`pdfExport`)           |         |                 |

## 4. Décision

| Rubrique                          | Valeur                        |
| --------------------------------- | ----------------------------- |
| Droits hors ligne                 | à valider / validés / refusés |
| Référence de la fiche (archivage) |                               |
| Validée par (référent SIG)        |                               |
| Date                              |                               |
| Réserves                          |                               |

## 5. Mise en service une fois la fiche validée

1. Dans `packages/adapters/src/cartography/ign.ts`, passer les droits `offlinePackaging` de la source
   `ign-plan-vector` à `approved` avec `reference` (référence de cette fiche), par une modification revue.
2. Configurer l'API et le worker : `BASEMAP_SOURCE=ign-plan-vector`, `BASEMAP_CONTACT`, et au besoin
   `BASEMAP_REQUESTS_PER_SECOND`.
3. Vérifier dans Administration › Fonds de carte que la source apparaît « Droits hors ligne validés »,
   préparer un secteur pilote et mesurer son volume réel (budget de 2 Go par tablette).
4. Qualifier sur la tablette de référence : démarrage à froid en mode avion, zooms 12 à 18, libellés,
   aucune connexion sortante.

En cas de refus : la source reste `unverified` (ou passe à `forbidden`), le fond d'essai reste
réservé aux essais, et l'ADR-024 est réexaminée (autre produit, fond raster, convention spécifique).
