# ADR-017 — Signalements terrain (OPS-04)

- Statut : acceptée — Sprint 5, 1er octobre 2026
- Sources : cahier des charges OPS-04 ; modèle de données §8 (`field_report`, `field_report_asset`,
  `sync_outbox`) ; architecture technique §11 (remontée des signalements, résolution des conflits) et
  §19 ; maquette, écran 09 ; décisions du porteur du 1er octobre 2026 (roadmap, R0)

## Contexte

Un intervenant doit pouvoir signaler, sans réseau, un écart entre la version publiée qu’il consulte et
la réalité (accès condamné, point d’eau hors service…), avec une photo. Le signalement est une
**proposition** pour le service Prévision : il ne modifie jamais une publication. La transmission doit
résister aux coupures : un accusé perdu ne doit pas créer deux signalements. Les documents de cadrage
décrivent l’issue de trois façons (maquette : accepter, rejeter ou créer une visite ; modèle : `new`,
`triaged`, `resolved`, `rejected` ; architecture : « en attente », « reçu », « traité »).

## Décision

1. **Origine : un terminal enrôlé.** Un signalement est transmis par une requête signée par le terminal
   (ADR-015), avec le jeton de l’agent, qui doit détenir `offline:download` et `field_report:create`
   (profil OPS). Il référence la **publication consultée** (signée, du même site) et, s’il y a lieu,
   l’élément visé (point, risque ou zone) et un point sur un plan de **cette version** : PostgreSQL vérifie
   qu’ils y figurent. La position GPS n’est pas collectée (nouvelle permission Android, DEC-04).
2. **Idempotence.** Le terminal attribue un identifiant (`client_report_id`) à la création, hors ligne.
   Le serveur enregistre une seule fois par (SIS, terminal, identifiant) ; l’accusé contient l’identifiant
   serveur et l’empreinte SHA-256 du contenu accepté. Un renvoi identique (accusé perdu) rend le même
   signalement ; un autre contenu sous le même identifiant est refusé (409).
3. **Photos.** Cinq au plus, images PNG, JPEG ou WebP de 15 Mo au plus, sur la chaîne de dépôt contrôlé
   (ADR-009) : l’accusé contient les URL de dépôt des photos encore attendues, le terminal les envoie
   puis demande leur contrôle (`POST /sync/reports/{id}/uploaded`, idempotent). Un second envoi du même
   fichier est refusé par le stockage : le terminal le tient pour reçu. Une photo de signalement n’est
   pas une donnée de travail : son expéditeur ne devient pas contributeur de la révision suivante.
4. **Instruction.** La Prévision (`field_report:review` : rédacteur, validateur, administrateur du SIS)
   voit les signalements de ses sites avec la version consultée et la version publiée actuelle, prend en
   charge (`triaged`), affecte à un membre du SIS, **intègre explicitement** le signalement à la révision
   en brouillon qui porte la correction, puis décide : `resolved` ou `rejected`, toujours motivé, définitif.
   Une visite de vérification est une décision motivée, sans module dédié. Le constat lui-même n’est
   jamais modifié ni supprimé (déclencheur, propriétaire compris) ; tout est audité.
5. **Retour à l’agent.** `GET /sync/reports` rend l’issue des signalements de l’agent depuis ce terminal
   (90 jours) : état, motif, révision qui intègre la correction et numéro de sa publication une fois
   publiée. L’application affiche « en attente » (non transmis), « reçu » (`new`, `triaged`) puis
   « traité » (`resolved`, `rejected`) — une décision documentée, pas nécessairement une correction
   publiée.
6. **File locale.** Sur la tablette, les signalements et leurs photos sont conservés dans la base
   chiffrée jusqu’à l’accusé du serveur, liés à leur auteur : après une déconnexion, ils restent
   invisibles des autres utilisateurs et sont transmis au retour de leur auteur. À la **révocation** du
   terminal, ils sont purgés avec le reste ; l’agent voit auparavant le nombre de signalements en
   attente. Ce choix de sécurité prime sur la conservation jusqu’à l’accusé de l’architecture §11 (DEC-04).

## Conséquences

- Nouvelle permission `field_report:review` ; tables `field_report` et `field_report_photo` ; fonctions
  `sync_submit_report`, `sync_report_photos`, `sync_report_uploaded`, `sync_reports` réservées aux
  terminaux ; instruction sous RLS (colonnes d’instruction seules modifiables par l’API).
- La notification de la Prévision se limite au compteur « à traiter » et à la liste : aucun canal de
  notification n’existe encore (R2, POR-05).
- Un signalement visant une version remplacée reste recevable : la Prévision compare avec la version
  actuelle avant de décider ; rien n’est fusionné automatiquement.
- Le stockage des fichiers des signalements suit la politique des autres fichiers ; leur durée de
  conservation reste à décider (DEC-07).

## Critère de réexamen

Signalements créés hors terminal (web, portail exploitant), géolocalisation, rapprochement automatique
de signalements ou notification en temps réel des équipes Prévision.
