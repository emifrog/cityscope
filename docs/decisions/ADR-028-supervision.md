# ADR-028 — Supervision : métriques au format Prometheus, trace W3C, alertes et tableau du SIS

- Statut : acceptée — Sprint 12, 05/10/2026
- Sources : roadmap R4, EXP-03 (« métriques de jobs en échec, délai de publication, erreurs de sync,
  espace/volumes, disponibilité et fraîcheur métier ; alertes, corrélation et procédures de
  diagnostic ») ; architecture technique §29 (observabilité et objectifs de service), §24 (file de
  travaux), §26 (hébergement) ; choix du porteur du 5 octobre 2026

## Contexte

Avant ce sprint, la plateforme n'avait :

- qu'une sonde de santé, toujours en HTTP 200 ;
- des journaux JSON qui ne traçaient que les échecs, sans durée ;
- un identifiant de trace qui s'arrêtait à la porte du worker ;
- aucune métrique, aucune alerte et aucune procédure.

Un travail mort n'était visible qu'en base. Un antivirus indisponible ne laissait qu'un code
générique (`HANDLER_ERROR`). Le délai de publication ne séparait pas l'attente du calcul, et
seul le dernier reçu de chaque tablette était gardé.

L'hébergement (DEC-03) n'est pas décidé : ni collecteur OpenTelemetry, ni outil de supervision
imposé.

## Décision

Choix du porteur du 5 octobre 2026 : métriques au format Prometheus, trace W3C, OpenTelemetry plus tard.

1. **Un point de métriques**, `GET /api/v1/metrics`, au format texte Prometheus, sans nouvelle
   dépendance :
   - il est protégé par un jeton `METRICS_TOKEN` (32 caractères au moins), comparé en temps
     constant ; sans jeton configuré, le point n'existe pas (404), et un refus est tracé au journal ;
   - il sert les métriques du processus (requêtes et latence par modèle de route, pool SQL, version)
     et les chiffres de la plateforme, lus en base à chaque collecte par `app.platform_metrics()`,
     agrégats seulement ;
   - une base injoignable met `etare_platform_metrics_up` à 0 sans faire échouer la collecte ;
   - les étiquettes restent bornées : route, type de travail, SIS, statut, action de refus. Jamais
     un site, une personne ni un identifiant (§29).
2. **Le worker n'expose rien** :
   - il bat dans `app.worker_heartbeat` toutes les 30 secondes (version, types pris en charge,
     arrêt propre), et l'API compte les workers vivants ;
   - les durées des travaux se lisent dans la file elle-même : `started_at` à chaque prise,
     `first_started_at` à la première. L'attente se sépare ainsi du calcul (§29).
3. **Trace W3C, de bout en bout.**
   - L'API suit le `traceparent` reçu ou en crée un, et renvoie `traceparent` et `x-trace-id`.
     L'identifiant (128 bits, gardé en UUID) figure dans :
     - les journaux de l'API (`request completed`, avec la durée, et `request failed`) ;
     - l'audit ;
     - les travaux mis en file (`job.correlation_id`) ;
     - les journaux du worker pour ces travaux (`trace_id`, durée, code d'échec).
   - Un échec passager garde son code quand l'erreur en porte un (`ANTIVIRUS_UNAVAILABLE`,
     `ECONNREFUSED`, `SERVICE_UNAVAILABLE`…). Un travail mort est journalisé en erreur.
   - Un collecteur OpenTelemetry pourra reprendre ces identifiants sans changement de format.
4. **Historique des reçus** (`app.device_sync_event`, 90 jours) : taux de synchronisations en erreur
   et contenus refusés par les tablettes (empreinte, signature, rejeu), le « taux de hashes
   invalides » du §29.
5. **Purge horaire** (`maintenance.database`) :
   - travaux réussis après 30 jours, morts après 90 jours ;
   - reçus après 90 jours, battements de cœur après 7 jours ;
   - fenêtres de limitation de débit après un jour (elles n'étaient purgées qu'avec le stockage
     configuré).
6. **Règles d'alerte versionnées** (`infra/monitoring/prometheus/alerts.yml`) :
   - chaque alerte porte une gravité, un service, un responsable (`exploitation` ou `sis`), un
     impact et le lien de sa procédure (`docs/exploitation/supervision.md`) ;
   - les seuils suivent les objectifs du pilote (§29) : latence p95 de 500 ms, publication p95 de
     5 minutes, fraîcheur du parc de 95 % sous 24 heures, synchronisations sans erreur à 99 % ;
   - un test vérifie que chaque métrique citée existe et que chaque procédure est écrite.
7. **Sonde de disponibilité** : `GET /api/v1/health` répond 503 quand l'API ne lit plus sa base,
   pour une sonde extérieure (disponibilité mensuelle, §29).
8. **Tableau du SIS** (Administration › Supervision, `audit:read`, `app.tenant_supervision()`) :
   - le « tableau métier » du §29 : publications en vigueur, bloquées ou en échec, délai de
     publication ; terminaux à jour, en retard ou en erreur, et détenant une version retirée ;
     synchronisations de la semaine ; signalements à traiter ; fichiers refusés ; notifications et
     fonds de carte en échec ;
   - chaque point d'attention renvoie à l'onglet où agir.

## Conséquences

- Configuration :
  - `METRICS_TOKEN` (facultatif ; sans lui, pas de métriques) ;
  - `LOG_LEVEL` (`info` par défaut) ;
  - `APP_VERSION` (journaux, métriques, battement de cœur).
- Une ligne de journal par réponse réussie (`request completed`) : le volume des journaux augmente,
  à régler par `LOG_LEVEL=warn` si le collecteur l'exige.
- Les agrégats sont recalculés à chaque collecte. Leur coût sur 10 000 sites est mesuré par CAP-01 ;
  la collecte se fait toutes les minutes.
- Pas encore :
  - d'export OpenTelemetry ni de suivi d'erreurs (Sentry), à décider avec l'hébergement ;
  - de sonde extérieure, à installer chez l'hébergeur.

## Critère de réexamen

Décision d'hébergement (collecteur, outil de supervision imposé), coût mesuré des agrégats (CAP-01),
ou premier incident réel (procédures à corriger d'après le retour d'expérience).
