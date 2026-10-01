# ADR-020 — Notifications du portail exploitant

- Statut : acceptée — Sprint 7, 01/10/2026
- Sources : roadmap R2, POR-05 (« invitation, demande de précision, décision ; envoi rejouable, liens à
  durée limitée et suivi d’erreur ; le workflow doit rester utilisable si la notification échoue ») ;
  ADR-007 (file de travaux PostgreSQL) ; ADR-019 (portail exploitant)

## Contexte

L’exploitant ne se connecte pas tous les jours : il doit apprendre qu’il est invité, que le SIS lui pose
une question ou qu’une décision est prise. Un e-mail sort du périmètre maîtrisé (boîtes partagées,
transferts) ; le serveur d’envoi peut être indisponible ; ni l’un ni l’autre ne doit bloquer le travail du
SIS ni exposer des données du dossier.

## Décision

1. **Boîte d’envoi transactionnelle.** Chaque notification (`app.notification`) est écrite **dans la
   transaction de l’événement**, avec son travail `notification.send` : une question posée
   (`info_requested`) ou une décision (acceptée, en partie, refusée) par un déclencheur sur la proposition ;
   une invitation par l’API, seulement pour un compte existant (un nouveau compte reçoit l’e-mail de
   création de compte de Supabase Auth). Une invitation n’est notifiée qu’une fois.
2. **Envoi par le worker.** Le gestionnaire lit, par une fonction réservée au worker et filtrée par le SIS
   du travail, le strict nécessaire (adresse, nom, SIS, sites ou titre de la proposition), rédige l’e-mail
   en français (texte et HTML échappé) et l’envoie en SMTP (`SMTP_URL`, `MAIL_FROM` ; Mailpit en local).
   Chaque tentative est enregistrée (nombre, dernière erreur) ; une erreur passagère est retentée par la
   file (ADR-007), un travail abandonné laisse la notification **en échec**. Une invitation déjà acceptée,
   révoquée ou expirée n’est pas envoyée. Une notification envoyée n’est jamais renvoyée par erreur
   (idempotence).
3. **Contenu minimal.** Ni le texte des échanges, ni le motif d’une décision, ni code, ni document : l’e-mail
   dit qu’il y a quelque chose et renvoie au portail. **Le lien ne porte aucun secret** : il ouvre le portail
   après connexion (et second facteur si le SIS l’exige) ; sa « durée de vie » est celle de l’accès de
   l’exploitant. Seule l’invitation a une échéance, rappelée dans l’e-mail.
4. **Suivi et rejeu.** L’administration du SIS (`member:manage`) voit les notifications (en attente,
   envoyée, en échec, cause) et peut en **renvoyer** une, en échec ou perdue. Sans serveur d’envoi
   configuré, les notifications échouent visiblement (« serveur d’envoi non configuré ») et restent
   rejouables.
5. **Le workflow ne dépend pas de l’e-mail.** Tout ce qu’annonce une notification est sur le portail
   (invitations à accepter, questions, décisions) et sur les écrans du SIS.

## Conséquences

- Nouvelle table `app.notification` et fonctions `notify_portal_invitation`, `admin_retry_notification`
  (API), `worker_notification`, `worker_record_notification` (worker) ; dépendance `nodemailer` dans les
  adaptateurs.
- Le worker a besoin de `SMTP_URL` et `APP_BASE_URL` (liens) ; sans eux, il démarre et le signale.
- Le port SMTP de Mailpit (54325) est ouvert dans `supabase/config.toml` pour le développement et la CI.

## Critère de réexamen

Notifications des équipes du SIS (nouvelle proposition, signalement urgent), préférences de
notification par personne, autres canaux (SMS, notification mobile), ou fournisseur d’envoi transactionnel
avec suivi de délivrabilité.
