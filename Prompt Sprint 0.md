\# Projet ETARE numérique — Sprint 0 / Fondation technique

Tu es chargé de démarrer le développement d'une plateforme SaaS métier destinée aux SIS/SDIS français pour la création, la validation, la publication et la consultation opérationnelle de plans ETARE numériques.

Le nom commercial du produit n'est pas encore défini. Utilise provisoirement le nom interne :

`etare-platform`

\## 1. Sources de vérité

Avant toute modification de code, analyse intégralement les documents de cadrage disponibles dans le projet :

1. Cahier des charges MVP
1. Modèle de données
1. Modèle économique
1. Maquette produit
1. Architecture technique

Ces documents constituent la source de vérité fonctionnelle et technique.

En cas de contradiction :

- privilégie le cahier des charges pour le périmètre fonctionnel ;
- privilégie le modèle de données pour les entités métier ;
- privilégie l'architecture technique pour les choix d'infrastructure ;
- signale explicitement les incohérences avant de prendre une décision structurante.

Ne développe aucune fonctionnalité hors périmètre MVP simplement parce qu'elle pourrait être utile.

\---

\# 2. Objectif de cette mission

Cette première mission correspond uniquement au \*\*Sprint 0 — Fondation technique\*\*.

L'objectif n'est PAS de développer toute l'application.

À la fin du Sprint 0, nous devons disposer d'un socle :

- compilable ;
- testable ;
- documenté ;
- sécurisé par défaut ;
- prêt à accueillir les fonctionnalités métier du Sprint 1 ;
- utilisable localement par un développeur ;
- compatible avec une future CI/CD ;
- sans dette architecturale évidente.

\---

\# 3. Architecture validée

L'architecture générale suivante est considérée comme validée.

\## Front-end web

Utiliser :

- Next.js 15
- React 19
- TypeScript
- Tailwind CSS v4
- shadcn/ui
- Zod
- React Hook Form
- TanStack Query lorsque pertinent

Le web couvrira ultérieurement :

- back-office Prévision ;
- administration SIS ;
- création et édition d'ETARE ;
- workflow de validation ;
- portail exploitant.

\---

\## Application opérationnelle

Prévoir une application :

- Flutter ;
- Android en priorité ;
- architecture compatible iOS si nécessaire ultérieurement ;
- SQLite local ;
- Drift pour l'accès aux données ;
- conception offline-first.

Ne développe pas encore les fonctionnalités métier OPS complètes pendant ce Sprint 0.

Créer uniquement le squelette propre de l'application.

\---

\## Backend et données

Utiliser :

- PostgreSQL ;
- PostGIS ;
- Supabase pour le MVP ;
- Supabase Auth ;
- Row Level Security ;
- Supabase Storage dans un premier temps ;
- stockage conçu pour pouvoir migrer vers un système S3 compatible.

La base PostgreSQL/PostGIS doit rester la véritable source de vérité.

Éviter une dépendance excessive aux fonctions propriétaires Supabase.

\---

\## Architecture applicative

Le projet doit rester un \*\*monolithe modulaire\*\* au MVP.

Ne pas créer de microservices inutiles.

Prévoir néanmoins une séparation logique entre :

- application web ;
- application mobile ;
- contrats API ;
- domaine métier ;
- base de données ;
- workers asynchrones ;
- infrastructure.

\---

\# 4. Cartographie

Décision importante :

\*\*IGN / Géoplateforme constitue la source cartographique de référence.\*\*

Ne pas utiliser Mapbox comme fournisseur cartographique principal.

Faire clairement la différence entre :

- fournisseur de données cartographiques : IGN ;
- moteur de rendu : technologie indépendante compatible avec les services IGN.

MapLibre peut être utilisé comme moteur de rendu si cela reste pertinent techniquement.

Prévoir à terme :

- services IGN WMTS/WMS ou autres services adaptés ;
- PostGIS pour les données métier géographiques ;
- cartographie offline ;
- packs cartographiques par territoire/CIS ;
- support futur PMTiles/MBTiles ou mécanisme équivalent selon les conditions d'utilisation des données IGN.

Pendant le Sprint 0, créer uniquement l'abstraction nécessaire. Ne développer pas encore le module cartographique complet.

\---

\# 5. Principe architectural fondamental

Le cœur du produit repose sur le cycle suivant :

DONNÉES DE TRAVAIL

→ VALIDATION SIS

→ VERSION PUBLIÉE IMMUABLE

→ PACKAGE OPÉRATIONNEL

→ SYNCHRONISATION OFFLINE

→ APPLICATION OPS

Une version publiée ne doit jamais être modifiée directement.

Toute modification ultérieure doit produire une nouvelle version.

Les données en cours d'édition doivent être séparées des données opérationnelles publiées.

Ce principe doit influencer dès maintenant le modèle de données.

\---

\# 6. Multi-tenant / Multi-SIS

Le produit doit être multi-SIS dès l'origine.

Créer une entité de type :

`tenant`

ou

`organization`

représentant notamment :

- SDIS 06 ;
- SDIS 83 ;
- autres SIS futurs.

Chaque donnée métier concernée doit appartenir explicitement à un tenant.

La séparation des données doit être défendue à plusieurs niveaux :

1. modèle de données ;
1. contraintes SQL ;
1. RLS PostgreSQL/Supabase ;
1. règles applicatives.

Un utilisateur du SIS A ne doit jamais pouvoir accéder aux données du SIS B.

\---

\# 7. Rôles initiaux

Prévoir au minimum les rôles suivants :

- SUPER\_ADMIN
- SIS\_ADMIN
- PREVISION\_EDITOR
- PREVISION\_VALIDATOR
- OPS\_USER
- EXPLOITANT
- READER

Principe obligatoire :

`PREVISION\_EDITOR != PREVISION\_VALIDATOR`

Un utilisateur peut préparer une modification sans disposer du droit de la publier.

Ne crée pas un système de permissions totalement rigide si une structure RBAC extensible peut être mise en place proprement.

\---

\# 8. Audit

Prévoir dès le début un journal d'audit.

Il devra ultérieurement pouvoir enregistrer notamment :

- utilisateur ;
- tenant ;
- date ;
- action ;
- entité ;
- identifiant de l'entité ;
- ancienne valeur lorsque pertinent ;
- nouvelle valeur ;
- origine de l'action ;
- métadonnées techniques utiles.

Le journal doit être conçu comme append-only.

Une application métier ne doit pas pouvoir modifier silencieusement l'historique.

\---

\# 9. Arborescence cible

Créer une structure cohérente proche de :

\```text

etare-platform/

├── apps/

│   ├── web/

│   └── mobile/

│

├── services/

│   ├── api/

│   └── worker/

│

├── packages/

│   ├── contracts/

│   ├── domain/

│   ├── schemas/

│   ├── config/

│   └── ui/

│

├── supabase/

│   ├── migrations/

│   ├── seed.sql

│   └── config.toml

│

├── infra/

│   ├── docker/

│   └── terraform/

│

├── docs/

│

├── scripts/

│

├── .github/

│   └── workflows/

│

├── README.md

├── .env.example

└── ...

\```

Tu peux adapter cette arborescence si tu as une raison technique solide.

Explique tout changement important.

\---

\# 10. Monorepo

Pour la partie TypeScript :

- pnpm ;
- workspace pnpm ;
- Turborepo si pertinent.

Éviter les dépendances inutiles.

L'application Flutter peut vivre dans le même dépôt même si elle n'est pas gérée par pnpm.

\---

\# 11. Domaine métier minimal du Sprint 0

Ne crée pas encore tout le modèle fonctionnel.

Mais prépare correctement les fondations des principales entités :

- Tenant / SIS
- User/Profile
- Membership
- Role
- Site
- Building
- Floor
- Zone
- OperationalObject
- Risk
- Document
- Etare
- EtareVersion
- Publication
- AuditEvent

Les noms définitifs peuvent être adaptés en anglais dans le code.

Utiliser des UUID.

Prévoir les champs généraux utiles :

- id
- tenant\_id lorsque pertinent
- created\_at
- updated\_at
- created\_by lorsque pertinent
- status lorsque pertinent

Ne duplique pas systématiquement ces champs si cela n'a aucun sens métier.

\---

\# 12. Géométrie

Activer PostGIS.

Préparer les types nécessaires pour :

- localisation d'un site ;
- emprise d'un bâtiment ;
- accès ;
- objets géographiques extérieurs ;
- PEI futurs.

Pour les objets présents sur un plan intérieur, ne pas utiliser obligatoirement latitude/longitude.

Prévoir un système local au plan/niveau avec coordonnées X/Y ou géométrie locale.

L'objectif futur est de pouvoir représenter :

- un SSI ;
- un TGBT ;
- une chaufferie ;
- une coupure gaz ;
- un stockage dangereux ;
- une zone ;
- un cheminement ;

sur un plan intérieur.

\---

\# 13. API

Ne pas exposer directement toutes les tables Supabase au front comme architecture métier principale.

Préparer une couche API explicite.

Prévoir :

- REST ;
- contrats documentés ;
- OpenAPI ;
- validation Zod côté TypeScript ;
- types partageables.

À terme, des routes pourront ressembler à :

\```text

GET    /sites

GET    /sites/:id

POST   /sites

PATCH  /sites/:id

GET    /sites/:id/operational-view

POST   /etare/:id/submit

POST   /etare/:id/validate

POST   /etare/:id/publish

GET    /publications/:id

POST   /field-reports

GET    /sync/manifest

GET    /sync/package

\```

Ne développe pendant le Sprint 0 que ce qui est nécessaire pour prouver correctement l'architecture.

\---

\# 14. Workers

Préparer un worker TypeScript séparé pour les futures tâches asynchrones :

- génération PDF ;
- génération des packages offline ;
- miniatures ;
- imports ;
- conversion de documents ;
- traitement IA ;
- notifications ;
- calculs de checksum.

Il n'est pas nécessaire d'implémenter tous ces traitements maintenant.

Créer seulement une fondation propre et testable.

\---

\# 15. Stockage documentaire

Les fichiers binaires ne doivent pas être stockés directement dans PostgreSQL.

Prévoir une abstraction de stockage.

Premier provider :

Supabase Storage.

Architecture future :

S3 compatible.

Les fichiers concerneront notamment :

- plans ;
- photos ;
- FDS ;
- documents ;
- PDF ETARE ;
- pièces jointes ;
- packages offline.

\---

\# 16. Sécurité

Le principe est :

\*\*secure by default\*\*.

Mettre en place dès le Sprint 0 :

- séparation multi-tenant ;
- RLS ;
- validation des entrées ;
- variables d'environnement ;
- aucune clé secrète dans Git ;
- contrôle des accès ;
- permissions minimales ;
- structure pour MFA ;
- journalisation ;
- règles de stockage ;
- politiques Supabase explicites.

Ne jamais contourner RLS simplement pour faciliter le développement.

Toute utilisation d'une clé `service\_role` doit être limitée au serveur et justifiée.

\---

\# 17. Application Flutter

Créer le squelette Flutter avec une architecture maintenable.

Prévoir les couches :

\```text

presentation

application

domain

data

\```

ou une architecture équivalente.

Préparer :

- routing ;
- thème ;
- gestion de configuration ;
- client API ;
- base SQLite/Drift ;
- repository pattern lorsque pertinent ;
- stockage sécurisé pour les secrets/tokens ;
- écran de connexion minimal ;
- écran d'accueil temporaire.

La base locale devra pouvoir être chiffrée ou rendue chiffrable avant le pilote.

Ne développe pas encore toute la synchronisation.

\---

\# 18. Web

Créer au minimum :

- layout général ;
- système de navigation ;
- page de connexion ;
- page d'accueil/dashboard temporaire ;
- structure des routes ;
- providers ;
- gestion d'erreurs ;
- variables d'environnement ;
- composants UI de base.

Respecter la maquette et le positionnement visuel du projet sans chercher à reproduire tous les écrans dès maintenant.

Préparer le thème pour qu'il soit facilement remplaçable lorsque le nom et le logo définitifs seront disponibles.

\---

\# 19. Qualité du code

Configurer :

- TypeScript strict ;
- ESLint ;
- Prettier ;
- analyse statique ;
- tests unitaires ;
- tests d'intégration pour les composants critiques ;
- conventions de commits si pertinent ;
- hooks pre-commit uniquement s'ils apportent réellement de la valeur.

Pour Flutter :

- flutter analyze ;
- tests ;
- règles de lint adaptées.

\---

\# 20. CI

Créer une première GitHub Action qui vérifie au minimum :

Pour TypeScript :

- installation ;
- lint ;
- typecheck ;
- tests ;
- build.

Pour Flutter :

- analyse ;
- tests.

La CI ne doit pas nécessiter de secrets de production.

\---

\# 21. Environnement local

L'environnement local doit être documenté.

Un nouveau développeur doit pouvoir comprendre comment démarrer le projet depuis le README.

Prévoir :

\```text

pnpm install

supabase start

pnpm dev

\```

ou une procédure équivalente simple.

Créer un `.env.example`.

Ne jamais committer de `.env` réel.

\---

\# 22. Seed de développement

Créer des données fictives permettant de tester le multi-tenant.

Exemple :

Tenant 1 :

`SDIS DEMO 06`

Tenant 2 :

`SDIS DEMO 83`

Créer quelques utilisateurs/roles fictifs si cela est possible proprement dans le système de développement.

Ajouter au moins un site fictif au tenant 06 :

`EHPAD Les Oliviers`

Ces données sont exclusivement destinées au développement.

Aucune donnée opérationnelle réelle ne doit être incluse.

\---

\# 23. Premier test vertical attendu

À la fin du Sprint 0, fournir si raisonnablement possible une démonstration minimale :

Utilisateur connecté

→ appartient au `SDIS DEMO 06`

→ voit un dashboard

→ peut récupérer la liste des sites de son tenant

→ voit `EHPAD Les Oliviers`

→ ne peut pas accéder aux données du `SDIS DEMO 83`.

Ce scénario constitue le premier contrôle du multi-tenant.

\---

\# 24. Documentation

Créer ou mettre à jour :

`README.md`

et :

\```text

docs/

architecture.md

development.md

database.md

security.md

decisions/

\```

Utiliser des ADR (Architecture Decision Records) pour les décisions structurantes.

Créer par exemple :

\```text

ADR-001-monorepo.md

ADR-002-postgresql-postgis.md

ADR-003-supabase-portability.md

ADR-004-offline-first.md

ADR-005-immutable-publications.md

ADR-006-ign-cartography.md

\```

\---

\# 25. Ce qu'il ne faut PAS développer maintenant

Ne pas implémenter intégralement :

- éditeur graphique ETARE ;
- génération PDF complète ;
- moteur de synchronisation offline ;
- portail exploitant complet ;
- workflow terrain complet ;
- intégration NexSIS ;
- RRF ;
- IA ;
- import DWG ;
- DECI complète ;
- SITAC ;
- gestion opérationnelle d'intervention ;
- Intterra-like ;
- modules réglementaires type DUERP/amiante/GMAO.

Ces fonctionnalités appartiennent aux sprints suivants.

\---

\# 26. Méthode de travail demandée

Commence par :

1. inspecter le dépôt existant ;
1. lire tous les documents projet disponibles ;
1. identifier ce qui existe déjà ;
1. comparer avec cette architecture ;
1. produire un plan d'implémentation court ;
1. puis réaliser les modifications directement.

Ne te contente pas de me proposer du code.

Exécute les changements dans le dépôt.

Après chaque groupe important de modifications :

- lance les tests pertinents ;
- lance le typecheck ;
- lance les linters ;
- corrige les erreurs avant de continuer.

Ne masque pas une erreur avec des casts `any`, des `eslint-disable` ou des hacks sauf justification explicite.

\---

\# 27. Gestion des ambiguïtés

Si une décision mineure est nécessaire et ne remet pas en cause l'architecture, prends la décision la plus simple et documente-la.

Ne bloque pas le développement pour un détail cosmétique.

En revanche, ne prends pas seul une décision susceptible de modifier fortement :

- le modèle de sécurité ;
- le modèle multi-tenant ;
- le modèle de publication ;
- le modèle offline ;
- la stack principale ;
- l'architecture du domaine.

Dans ce cas, documente clairement le point dans le rapport final.

\---

\# 28. Définition de Done du Sprint 0

Le Sprint 0 est terminé lorsque :

- le monorepo fonctionne ;
- le web compile ;
- Flutter compile ;
- Supabase local démarre ;
- PostgreSQL/PostGIS est configuré ;
- les premières migrations fonctionnent ;
- les tenants sont isolés ;
- RLS est active ;
- les rôles fondamentaux existent ;
- l'audit possède sa structure initiale ;
- l'API dispose d'un squelette propre ;
- le worker dispose d'un squelette propre ;
- les contrats sont partagés ;
- la CI fonctionne ;
- les tests de base passent ;
- les seeds de développement fonctionnent ;
- le README permet une installation locale ;
- aucune clé secrète n'est committée ;
- les décisions architecturales importantes sont documentées.

\---

\# 29. Rapport final

Lorsque le travail est terminé, fournis un rapport synthétique avec :

\## Réalisé

Liste des éléments effectivement implémentés.

\## Structure

Résumé de l'arborescence créée.

\## Base de données

Migrations et modèles créés.

\## Sécurité

RLS, RBAC et isolation multi-tenant mises en œuvre.

\## Tests

Commandes exécutées et résultat.

\## Décisions prises

Décisions architecturales prises pendant l'implémentation.

\## Écarts

Éléments du Sprint 0 non terminés ou nécessitant une intervention.

\## Dette technique

Toute dette volontairement introduite.

\## Prochaine étape

Proposition précise pour le Sprint 1.

Ne commence pas le Sprint 1 sans nouvelle instruction.
