# ADR-018 — Synchronisation en arrière-plan sur Android

- Statut : acceptée — Sprint 6, 01/10/2026
- Sources : roadmap SYN-01 ; architecture technique §11 (synchronisation descendante), §12 (« les
  transferts cellulaires lourds exigent une politique explicite »), §19 (renouvellement quotidien) ;
  complète ADR-015 et ADR-016

## Contexte

Jusqu'au Sprint 5, la tablette ne se synchronisait qu'à l'ouverture de l'accueil et à la demande. Une
tablette laissée dans un engin reste donc sur ses versions installées tant que personne ne l'ouvre, et
son autorisation de consultation (7 jours) n'est pas renouvelée. La synchronisation doit pouvoir avoir
lieu sans l'agent, sans vider la batterie, sans transférer de gros volumes sur le réseau mobile, et
sans que deux synchronisations ne se croisent.

## Décision

1. **WorkManager Android**, par le plugin `workmanager` (Flutter Community, MIT) : tâche périodique
   toutes les heures, premier passage 15 minutes après le lancement, sous contraintes **réseau
   disponible, batterie et stockage non faibles**, nouvelle tentative exponentielle à partir de
   10 minutes. iOS n'a pas de tâche de fond (DEC-01 : iOS au pilote ou reporté) : la synchronisation y
   reste à l'ouverture, au retour et à la demande.
2. **Budget sur réseau mobile.** Un passage périodique télécharge au plus 50 Mo de fichiers manquants :
   une version qui dépasserait ce budget est reportée, avec les suivantes, les précédentes étant
   installées. Le report est écrit dans l'état (message visible), accusé au serveur (`partial`,
   `DOWNLOAD_DEFERRED`) et confié à une **tâche unique en Wi-Fi** (réseau non facturé), sans limite. La
   synchronisation manuelle ou à l'ouverture n'a pas de budget : l'agent voit la progression.
3. **Un seul moteur synchronise.** Dans le processus, l'application ouverte se déclare
   (`IsolateNameServer`) et la tâche de fond lui confie la synchronisation : même session, même
   connexion à la base, affichage à jour. Sinon, la tâche ouvre elle-même la base chiffrée et la
   session stockée. En dernier rempart, un **bail** dans `sync_state` (schéma local v5) : pris par une
   instruction `UPDATE` atomique entre connexions, valable 2 minutes, renouvelé toutes les 30 secondes,
   rendu à la fin, repris s'il est échu (arrêt brutal). L'application qui trouve le bail pris affiche
   « synchronisation en arrière-plan en cours », attend sa fin, puis relit la base.
4. **Session partagée.** Avant de renouveler son jeton, l'application relit la session stockée : si la
   tâche de fond l'a déjà renouvelée, elle la reprend au lieu de rejouer un jeton de rafraîchissement
   déjà utilisé, que le serveur d'authentification traiterait comme un vol de session. Une session
   effacée par la tâche (expirée) déconnecte l'application.
5. **Reprise au retour.** À l'ouverture, et au retour dans l'application si la dernière tentative date
   de plus de 15 minutes ; les écrans relisent alors la base. La commande manuelle reste disponible.
6. **Pas de rafale.** La tâche ne renvoie jamais d'échec à WorkManager : la fraîcheur affichée reste la
   référence (OPS-05) et le passage suivant reprend. Les signalements en attente partent dans le même
   passage, avant la fin de la tâche.

## Conséquences

- Android peut retarder ou regrouper les passages (Doze, compartiments de veille) : aucune heure n'est
  garantie, d'où l'âge des données toujours affiché.
- Une tâche WorkManager dispose d'environ 10 minutes : une installation plus longue est interrompue et
  reprend au passage suivant, sans retélécharger les fichiers déjà vérifiés (ADR-016).
- Pas de service de premier plan ni de notification : la synchronisation est silencieuse.
- La tâche périodique est enregistrée une fois pour toutes (`keep`, nom versionné, anciens noms
  retirés) : la ré-enregistrer à chaque lancement (`update`) changeait la génération du travail, qui
  continuait alors sans tâche système dans un processus « en cache » gelé par Android 16 (constaté sur
  émulateur). Un arrêt demandé par l'utilisateur (« forcer l'arrêt ») peut produire le même gel par la
  replanification de WorkManager au démarrage ; le bail garantit qu'un moteur gelé puis réveillé
  n'active rien après qu'un autre a repris la main, et l'ouverture de l'application synchronise.
- Le plugin évolue vite (corrections pour Android 16 en août et septembre 2026) et écrit un marqueur
  sans donnée dans le répertoire temporaire de l'application : à surveiller à chaque mise à jour.
- La fréquence, le budget de 50 Mo et le recours au Wi-Fi sont des propositions à arbitrer avec le SIS
  et à mesurer sur la tablette de référence (DEC-01).

## Critère de réexamen

Tablette de référence et volumes mesurés, gestion de flotte (MDM) imposant ses propres règles, besoin
iOS au pilote.
