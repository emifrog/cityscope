# ADR-007 — File de tâches dans PostgreSQL

- Statut : acceptée — Sprint 0, 27/09/2026
- Sources : prompt §14 ; architecture technique §02, §04, §24

## Contexte

PDF, paquets hors ligne, miniatures, imports, antivirus, notifications et empreintes doivent s’exécuter
hors requête HTTP, de façon fiable et rejouable. L’architecture exclut Redis au MVP.

## Décision

- Table `app.job` et fonctions `enqueue_job`, `claim_jobs` (`FOR UPDATE SKIP LOCKED`),
  `heartbeat_job`, `complete_job`, `fail_job`, réservées au rôle `etare_worker` (sauf `enqueue`).
- **L’insertion du job dans la même transaction que la modification métier tient lieu d’outbox
  transactionnelle** : pas de table `outbox_event` séparée tant qu’aucun envoi externe n’existe.
- Exécution « au moins une fois » : bail + heartbeat, reprise des baux expirés, délai exponentiel avec
  aléa, état `dead` après épuisement ou erreur permanente ; handlers idempotents et payload validé.
- Implémentation maison plutôt qu’une bibliothèque (pg-boss, graphile-worker) qui apporterait sa propre
  histoire de migrations, contraire à « un seul répertoire de migrations ».

## Conséquences

- Webhooks sortants (site publié, signalement créé…) : ajouter alors une table `outbox_event` relayée.
- Limites de concurrence par SIS et files séparées pour les conversions non fiables : à ajouter avec les
  premiers traitements lourds.

## Critère de réexamen

Âge de file ou débit mesurés incompatibles avec PostgreSQL, ou besoin de planification avancée.

## Complément — 30/09/2026 (revue technique)

- **Un bail expiré ne vaut plus rien** : `heartbeat_job`, `complete_job` et `fail_job` exigent un bail
  encore valide (`lease_expires_at > clock_timestamp()`) ; un worker en retard ne peut ni prolonger, ni
  acquitter, ni faire échouer un travail qui doit être repris. Le runner consigne un acquittement ignoré.
- **Le numéro de tentative (`attempts`, incrémenté à chaque prise de bail) sert de jeton de
  fencing** aux traitements qui écrivent un état métier : l’identifiant du travail et ce numéro sont
  revérifiés, sous verrou de la ligne du travail, dans la transaction de l’écriture (voir ADR-013).
- **Un échec définitif remonte au domaine** : un déclencheur sur le passage à `dead` (erreur permanente,
  tentatives épuisées ou dernier bail expiré) met à jour l’objet métier concerné. Premier usage : une
  publication encore `queued`/`building` passe `failed` avec le code d’erreur du travail.
