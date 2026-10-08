# Infrastructure as code

Volontairement vide au Sprint 0 : la région et le mode d’hébergement (Supabase managé, instance dédiée,
auto-hébergement) restent une décision à arrêter avec la DSI et le RSSI du SIS pilote avant tout import de
données réelles (architecture technique, §26 et §33).

Dès cette décision prise, ce dossier décrira : environnements distincts (intégration, préproduction,
production), réseau, stockage objet et sauvegardes séparées, coffre de secrets, conteneurs `web` et `worker`
(`infra/docker/`) et supervision. Aucune ressource ne doit être créée à la main sans y être reportée.

Préproduction (EXP-01, 8 octobre 2026) : un VPS unique, préparé et déployé par des scripts versionnés
dans [`infra/preprod/`](../preprod/README.md) (Docker Compose, Supabase managé). La production attend la
décision d'hébergement (DEC-03).
