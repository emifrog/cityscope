# ADR-025 — Périmètres, sites sensibles et consultation hors ligne (DEC-04)

- Statut : acceptée — décision du porteur, 03/10/2026 ; durée hors ligne et politique des sites sensibles
  à confirmer par le RSSI et la direction opérationnelle avant la recette OPS
- Sources : roadmap R0 (DEC-04) et R3 (PER-01, PER-02, CAR-02) ; cahier des charges §2.1 (secteurs,
  paquets géographiques ou listes de sites), §4.4, §6.3 (sites sensibles), §7, ADMIN-01, OFF-01, OFF-04 ;
  modèle de données (secteur, portée des rôles, abonnement de synchronisation, `access_event`) ;
  architecture §11, §17, §19 (autorisation hors ligne, tablette partagée, horloge), §33 ; maquette écran 11
  (affectation des terminaux) ; ADR-008, ADR-015, ADR-016, ADR-017, ADR-022

## Contexte

Aujourd'hui :

- chaque tablette reçoit tout le SIS, dans la limite des droits de la dernière personne qui a
  synchronisé ;
- les sites sensibles (`restricted`, `high`) sont exclus de toute distribution ;
- le droit de consultation locale dure 7 jours, puis la tablette se verrouille sans rien effacer.

Les sources divergent sur trois points. Le modèle de données lie une tablette à une personne, alors que la
maquette affecte les tablettes à un CIS ou un groupement. Le cahier des charges détaille le traitement
d'un site sensible sur tablette. L'architecture laisse au RSSI et à la direction opérationnelle la durée
hors ligne et l'identification sur tablette partagée.

## Décision

1. **Secteurs = groupes nommés de sites** (CIS, groupement), administrés par le SIS ; un site peut
   appartenir à plusieurs secteurs.
   - **Chaque tablette est affectée** à un ou plusieurs secteurs, ou explicitement à tout le SIS ;
     c'est son profil de synchronisation, comme l'écran 11 de la maquette.
   - **Un membre peut être limité** à des secteurs (portée « secteur » de ses rôles, déjà prévue par le
     modèle) ou à des sites.
   - Le catalogue signé ne contient que l'intersection du périmètre de la tablette et de celui de la
     personne. Ce qui sort du périmètre est retiré au contact suivant, avec un motif lisible
     (« retiré de votre périmètre »).
2. **Sites sensibles**, selon leur niveau :
   - **Niveau « restreint »** :
     - distribué seulement aux membres titulaires d'une habilitation dédiée, attribuée nominativement ;
     - jamais en téléchargement de masse : ouvert à la demande, site par site ;
     - consultation locale limitée à **24 h** ;
     - **code demandé avant chaque ouverture**, qui protège aussi le déchiffrement local.
   - **Niveau « élevé »** : jamais sur tablette ; consultation en ligne seulement.
   - Toute consultation et tout export d'un site sensible sont tracés (consultation, export,
     téléchargement), y compris sur la tablette avec remontée au contact suivant.
   - L'exclusion actuelle reste en vigueur tant que cette politique n'est pas implémentée et testée.
3. **Consultation hors ligne : 7 jours**, renouvelés à chaque synchronisation. À l'expiration, la
   tablette se verrouille **sans rien effacer** jusqu'à la reconnexion. Un accès d'urgence n'est pas
   prévu ; s'il l'était, il serait limité, autorisé explicitement et journalisé.
4. **Tablette partagée** : connexion individuelle de chaque agent ; **verrouillage par code après
   15 minutes d'inactivité**. La purge à la révocation reste inchangée, file des signalements comprise
   après avertissement de l'agent (décision du 1er octobre 2026). Une horloge manipulée peut prolonger
   la consultation hors réseau : c'est une limite connue (architecture §19).
5. **Position de l'agent** : la permission de localisation est demandée à la première ouverture de la
   carte, et elle est refusable. La position est **affichée sur la carte locale, jamais transmise ni
   conservée**. Les signalements gardent la position sur le plan, sans GPS.

## Conséquences

- PER-01 (secteurs, affectation des tablettes et des membres, catalogue filtré) et PER-02 (sites
  sensibles) sont débloqués. Ils ajoutent :
  - une table des secteurs et de leurs sites ;
  - la portée « secteur » dans `has_permission` ;
  - l'affectation des terminaux ;
  - une habilitation « sites sensibles » ;
  - un journal des consultations ;
  - le code local et le verrouillage d'inactivité sur la tablette (une partie de SEC-05).
- L'administration des membres gagne la limitation par secteurs ou par sites, qui n'existait que pour
  les exploitants.
- Les fonds de carte sont découpés par secteur (ADR-024).
- La tablette demande une nouvelle permission Android (localisation), uniquement pour la carte.

## Mise en œuvre de PER-01 (Sprint 10, 5 octobre 2026)

- **Secteurs** : Administration › Secteurs (`member:manage`).
  - Composition par communes (code INSEE de l'adresse, sites futurs compris, choix du porteur du 5 octobre)
    et par sites ajoutés un à un.
  - Un compteur signale les sites hors de tout secteur.
  - Un secteur encore affecté n'est pas archivé.
- **Tablettes** : affectation explicite (tout le SIS ou secteurs) à la création et dans la liste des
  terminaux (colonne « Affectation » de l'écran 11).
- **Membres** :
  - périmètre (tout le SIS, secteurs, sites) partagé par tous leurs rôles, fixé dès l'invitation ou
    ensuite ;
  - l'administration du SIS reste entière ;
  - un membre limité ne crée pas de site (le site n'appartiendrait à aucun secteur) ;
  - la RLS lui montre sa part du SIS au back-office.
- **Catalogue signé** :
  - intersection du terminal et de la personne ;
  - un site sorti du périmètre est retiré au contact suivant avec le motif `perimeter` (« Retiré de votre
    périmètre ») ;
  - la tablette lit désormais un motif inconnu sans bloquer la synchronisation.
- **Déploiement** : relever `MOBILE_MIN_APP_VERSION`, car une application antérieure refuse un catalogue
  qui contient ce motif.

## Mise en œuvre de PER-02, côté serveur (Sprint 10, 5 octobre 2026)

- **Sensibilité effective** : la plus restrictive de la version publiée et du site au moment présent. Un
  site rendu sensible n'attend pas une nouvelle publication pour quitter les tablettes.
- **Habilitation** :
  - choix du porteur du 5 octobre : nominative, pour tout le SIS ou des secteurs, avec une date de fin
    obligatoire de douze mois au plus, renouvelable ;
  - Administration › Membres › Sites sensibles ;
  - elle est tenue dans une table dédiée, et non comme un rôle, pour rester hors des rôles et de leur
    périmètre.
- **Catalogue signé** :
  - il sépare les sites installés en masse (`publications`) des sites restreints proposés à la demande
    (`on_demand`) ;
  - le paquet d'un site restreint porte la fin de sa consultation locale (24 h) ;
  - un site élevé n'est jamais servi.
- **Back-office** : l'accès suit les rôles (choix du porteur du 5 octobre).
- **Journal** :
  - consultations du site, aperçu et révisions ETARE, exports (PDF, documents) et ouvertures sur tablette
    sont tracés ;
  - Administration › Journal des sites sensibles (`audit:read`) ;
  - les consultations hors ligne sont remontées par la tablette (`POST /sync/access-events`, idempotent).
- **PDF d'un site sensible** : réservé à ses rôles du back-office et, pour un site restreint, aux
  personnes habilitées.

## Critère de réexamen

Avis contraire du RSSI ou de la direction opérationnelle (durée, code, purge à l'expiration) ; tablettes
personnelles plutôt que partagées ; exigence d'identification forte de chaque agent à la prise de garde
(SEC-05) ; besoin d'un accès d'urgence aux sites sensibles hors réseau.
