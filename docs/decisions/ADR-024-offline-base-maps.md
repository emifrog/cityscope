# ADR-024 — Fonds de carte hors ligne de la tablette (DEC-02)

- Statut : acceptée — décision du porteur, 03/10/2026, mise en œuvre au Sprint 11 (05/10/2026) ; droits à
  confirmer par le référent SIG avant le pilote
- Sources : roadmap R0 (DEC-02) et R3 (CAR-01 à CAR-03) ; cahier des charges §2.1 (cartographie
  départementale), §4.4 (carte locale en mode avion), §6.1 ; architecture §12 (budget de 2 Go de fonds),
  §13 (une fiche de droits par produit), §14, §15 (fonds hors ligne), §19 ; ADR-006 (cartographie IGN),
  ADR-016 (stockage local), ADR-018 (synchronisation en arrière-plan) ; ADR-025 (secteurs)

## Contexte

La tablette n'a aucune carte : seuls les plans d'intérieur et les fiches sont consultables hors ligne. Le
catalogue cartographique annonce la Licence Ouverte Etalab 2.0 pour les fonds IGN, mais leurs droits hors
ligne restent « non vérifiés » et aucune fiche de droits n'est rangée.

L'architecture impose quatre règles :

- une fiche de droits par produit avant le pilote ;
- aucune moisson du WMTS public ;
- un fond hors ligne qui embarque tout ce qu'il affiche (tuiles, style, polices, pictogrammes) ;
- un volume mesuré plutôt qu'un département entier au détail maximal.

## Décision

1. **Produit : Plan IGN vectoriel** (PLAN.IGN, Licence Ouverte Etalab 2.0), obtenu par un canal
   autorisé (produit téléchargeable ou flux convenu), jamais en moissonnant le WMTS ou le TMS public.
   - Orthophotos exclues du pilote ; SCAN 25 non retenu.
   - Tout autre fond serait une décision visible, avec sa propre fiche de droits.
2. **Un fichier par secteur** (secteurs de l'ADR-025), préparé par le serveur au format PMTiles :
   - vue générale jusqu'au zoom 14 sur le secteur et une marge ;
   - détail jusqu'au zoom 18 autour des sites distribués ;
   - style, glyphes, polices et pictogrammes embarqués : une carte qui appelle encore un serveur n'est pas
     hors ligne.

   Le volume est mesuré par secteur, dans le budget de 2 Go de l'architecture.

3. **Lecture locale par MapLibre** dans l'application Flutter, après qualification sur la tablette de
   référence (démarrage à froid en mode avion, tous les zooms, libellés affichés, aucune connexion
   sortante). Le cache opportuniste du moteur ne compte jamais comme couverture.
4. **Distribution distincte des publications ETARE** :
   - le fond est versionné, avec taille, progression, empreinte vérifiée, reprise et nettoyage de
     l'ancienne version ;
   - le téléchargement se fait en Wi-Fi seulement (au-delà de 50 Mo, ADR-018) ;
   - le renouvellement est **semestriel** ;
   - la date du fond et celle de l'ETARE restent distinctes à l'écran.
5. **Stockage** : le fond IGN, donnée publique, peut être stocké hors de la base chiffrée, dans un
   fichier lu par plage. Les données opérationnelles (sites, objets, plans) restent dans la base chiffrée
   (ADR-016).
6. **Attribution « © IGN – Plan IGN »** visible sur la carte de la tablette, dans le PDF et dans le
   paquet. Hors couverture, la tablette distingue « fond non disponible ici » de « aucune donnée
   opérationnelle », et propose les fiches et les plans.
7. **Preuve** : la fiche de droits du produit (stockage, redistribution aux SIS clients, attribution,
   emprise, zooms, renouvellement) est rédigée et validée par le référent SIG, et rangée avec le dossier
   SIG. Le catalogue ne passe `offlinePackaging` à `approved` qu'après cette validation.

## Conséquences

- CAR-01 (prototype), CAR-02 (carte locale) et CAR-03 (distribution des fonds) sont débloqués. Le
  prototype doit être éprouvé sur la tablette physique, pas seulement sur l'émulateur.
- Nouveaux objets serveur à concevoir : source cartographique (produit, licence, date, droits) et lot de
  fonds par secteur (couverture, zooms, empreintes, version de style), ainsi qu'un travail de
  préparation dédié du worker.
- Le stockage en BLOB entièrement lu en mémoire (ADR-016) ne convient pas à un fichier de centaines de
  Mo : un stockage par fichier lu par plage est introduit pour le fond.
- La position de l'agent sur la carte suit l'ADR-025 (affichée, jamais transmise).

## Constat du 5 octobre 2026 : pas de fichier vectoriel téléchargeable

La FAQ de l'IGN sur le Plan IGN vectoriel (conférence du 11 février 2021) indique que la mise en cache
des tuiles est autorisée, mais que leur téléchargement en fichier (par exemple MBTiles) n'est pas proposé.
La version téléchargeable du Plan IGN est un produit raster, calculé une fois par an. Le seul canal pour le
produit retenu est donc le flux de tuiles exploité dans un cadre convenu avec l'IGN : c'est le « flux
convenu » du point 1. Choix du porteur du 5 octobre : construire toute la chaîne maintenant, verrouillée
tant que la fiche de droits n'est pas validée.

## Mise en œuvre de CAR-01 à CAR-03 (Sprint 11, 5 octobre 2026)

- **Sources** (`BASEMAP_SOURCE`, lu par l'API et le worker) :
  - `synthetic` : fond d'essai généré par la plateforme (avenues, rues, bâti, plans d'eau, mention
    « aucune donnée IGN »). Défaut en développement et en essai, refusé en production. Il prouve la chaîne
    sans aucune donnée réelle ;
  - `ign-plan-vector` : Plan IGN par le flux convenu, avec un débit borné et l'identification de
    l'exploitant (`BASEMAP_CONTACT`). Ses droits hors ligne restent `unverified` dans le catalogue
    cartographique : aucune préparation, donc aucune requête vers l'IGN, tant que la fiche de droits
    ([modèle](../sig/fiche-droits-plan-ign.md)) n'est pas validée ;
  - `none` : pas de fond. C'est le défaut en préproduction et en production.
- **Couverture d'un secteur** :
  - vue générale jusqu'au zoom 14 sur l'emprise des sites localisés du secteur, plus 5 km de marge ;
  - détail jusqu'au zoom 18 dans un rayon de 500 m autour des sites diffusés (version signée en
    vigueur, sensibilité normale) ;
  - un site restreint ou élevé ne marque jamais de zone de détail, qui le désignerait ;
  - au-delà de 250 000 tuiles ou de 1 Go, la préparation est refusée : il faut découper le secteur.
- **Préparation** (worker, choix du porteur du 5 octobre) :
  - automatique : premier fond, sites du secteur modifiés, changement de source, renouvellement
    semestriel ; planification toutes les 15 minutes ; un échec sur la même couverture attend un jour ;
  - l'administration peut forcer une préparation (Administration › Fonds de carte, `device:manage`) ;
  - seuls les secteurs reçus par au moins une tablette sont préparés ;
  - fichier PMTiles v3 écrit par la plateforme, relu par la bibliothèque de référence dans les tests ;
    tuiles compressées et dédupliquées ; écriture dans un fichier temporaire du worker ;
  - transfert en parties de 32 Mo (sous la limite du stockage, reprise par partie) ;
  - le style et les pictogrammes accompagnent le fichier. Le style IGN est rendu local : une seule source,
    les polices remplacées par celles de l'application ;
  - manifeste signé par la clé des publications (contexte `etare.basemap.v1`).
  - Un emplacement du worker ne prend qu'une préparation à la fois : les publications ne sont jamais
    bloquées par un long fond.
- **Distribution** :
  - le catalogue signé liste les fonds en vigueur pour les secteurs de la tablette (tous les secteurs
    pour une tablette « tout le SIS ») ;
  - un fond est une donnée publique, rattachée à la tablette, et non à l'agent. Il n'est pas tracé au
    journal ;
  - l'ancienne version reste servie une semaine (transferts en cours), puis ses fichiers sont effacés.
- **Tablette** :
  - le fichier est stocké hors de la base chiffrée (`files/basemaps/`), partie par partie avec une
    vérification à chaque partie, repris après une coupure, puis revérifié entier avant installation ;
  - au-delà de 50 Mo, le fond attend une tâche Android sur réseau non limité (Wi-Fi) ;
  - budget de 2 Go ;
  - l'ancienne version d'un secteur reste affichée jusqu'à l'installation de la nouvelle ;
  - un secteur qui n'est plus reçu perd son fond. Tout est effacé à la révocation, rien au changement
    d'agent.
- **Carte locale** (MapLibre Native 13.5 par `maplibre_gl` 0.27, lecture `pmtiles://file://`) :
  - un secteur à la fois (choix du porteur du 5 octobre), avec un sélecteur quand la tablette en a
    plusieurs. Le fond du site visé est choisi d'office ;
  - libellés en Noto Sans (glyphes PBF, licence OFL 1.1, choix du porteur du 5 octobre) embarqués dans
    l'application et copiés en local : aucun appel à un serveur ;
  - sites installés et points extérieurs du site visé, fiche ouverte d'un toucher ;
  - « fond non disponible ici », « détail non disponible ici », « aucun fond sur cette tablette » et
    « aucune donnée opérationnelle » sont distingués ; sans fond, les sites restent placés sur un aplat ;
  - attribution et date du fond affichées, distinctes de celles des ETARE ;
  - position de l'agent : demandée au premier « Me situer », affichée par le moteur de carte, jamais
    transmise ; un refus laisse la carte utilisable.
- **Qualification** : sur l'émulateur Android, avec le fond d'essai, le démarrage à froid en mode avion
  a été vérifié, ainsi que l'affichage des zooms 12 et 16, les libellés, la sortie de couverture, le
  refus de localisation et le remplacement de version. Restent à faire : la tablette de référence, et
  un fond IGN réel une fois la fiche validée (volume réel par secteur).

## Critère de réexamen

Fiche de droits défavorable au stockage ou à la redistribution ; prototype en mode avion non concluant
sur la tablette de référence ; volume par secteur incompatible avec le stockage ou la synchronisation ;
demande d'un SIS pour les orthophotos ou le SCAN 25 (contrat et licence propres).
