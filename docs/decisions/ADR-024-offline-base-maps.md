# ADR-024 — Fonds de carte hors ligne de la tablette (DEC-02)

- Statut : acceptée — décision du porteur, 03/10/2026 ; droits à confirmer par le référent SIG avant le
  pilote
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

## Critère de réexamen

Fiche de droits défavorable au stockage ou à la redistribution ; prototype en mode avion non concluant
sur la tablette de référence ; volume par secteur incompatible avec le stockage ou la synchronisation ;
demande d'un SIS pour les orthophotos ou le SCAN 25 (contrat et licence propres).
