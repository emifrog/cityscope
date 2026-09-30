# Sprint 0 — rapport de livraison

Validation locale du **30 septembre 2026**, sur Windows. Le socle est opérationnel localement.
La définition de Done reste à confirmer sur GitHub pour l’exécution distante de la CI ; aucune
publication ni aucun déploiement n’ont été effectués. Le Sprint 1 n’a pas été commencé.

## Réalisé

- Monorepo pnpm, TypeScript strict, frontières de modules contrôlées par ESLint, formatage et tests.
- Web Next.js 16 / React 19 : connexion Supabase, navigation, SIS actif, tableau de bord, liste des
  sites et fiche site. Identité graphique provisoire centralisée. Les autres modules sont annoncés
  comme à venir.
- API REST explicite : santé, utilisateur courant, liste et détail des sites ; validation Zod,
  contrat OpenAPI généré, erreurs structurées, authentification JWT et autorisations côté serveur.
- Worker TypeScript : file PostgreSQL, réservation avec bail, heartbeat, reprises, arrêt propre,
  traitement de démonstration `system.noop`.
- Mobile Flutter : architecture en couches, configuration, connexion, session, routage, écran
  d’accueil, client API, stockage sécurisé, Drift/SQLCipher. APK Android de développement compilé.
- Ports pour le stockage documentaire et la cartographie ; adaptateurs Supabase Storage et IGN.
- GitHub Actions pour TypeScript, base de données et Flutter, sans secret de production.
- README, guides d’architecture, développement, base, sécurité et huit ADR.

## Structure

| Répertoire                                      | Responsabilité                                      |
| ----------------------------------------------- | --------------------------------------------------- |
| `apps/web`, `apps/mobile`                       | interfaces web et OPS                               |
| `services/api`, `services/worker`               | HTTP métier et traitements asynchrones              |
| `packages/domain`, `packages/application`       | règles métier, cas d’usage et ports                 |
| `packages/adapters`                             | PostgreSQL, JWT, stockage, IGN, logs                |
| `packages/contracts`, `schemas`, `config`, `ui` | contrats, validation, configuration, composants     |
| `supabase`                                      | migrations, seed fictif, configuration et tests SQL |
| `tests/integration`, `.github/workflows`        | validation de l’intégration et CI                   |
| `infra`, `docs`, `scripts`                      | conteneurisation, documentation et outils locaux    |

## Base de données

**Dix migrations**, rejouées avec succès depuis une base vierge dans une stack locale temporaire.
PostgreSQL 17/PostGIS, schéma privé `app`, 29 tables couvrant identités et RBAC, référentiel
géographique, plans et objets, documents, ETARE, révisions, approbations, publications, audit et jobs.
Voir [database.md](database.md) pour les correspondances avec le modèle de données de référence.

Le seed contient uniquement des données fictives : SDIS DEMO 06, SDIS DEMO 83, comptes de rôles
différents, EHPAD Les Oliviers, bâtiments, révisions et publication de démonstration. La stack
temporaire de rejeu a été supprimée après validation ; la stack de développement reste disponible.

## Sécurité

- Isolation multi-SIS par `tenant_id`, clés étrangères composites, RLS et permissions applicatives.
- Schéma métier absent de la Data API Supabase ; rôles SQL dédiés sans privilège de contournement RLS.
- RBAC extensible, portées tenant/site, absence d’accès métier implicite pour SUPER_ADMIN.
- Validation/publication privilégiées soumises au second facteur. SIS_ADMIN ne publie pas sans
  habilitation validateur ; auteur, soumetteur et contributeurs ne peuvent pas approuver leur révision.
- Attribution des contributions maintenue par la base, sans possibilité de réécriture par l’API.
- Publication et métadonnées diffusées protégées ; OPS n’accède qu’au statut `published`.
  Les références à une publication ne peuvent pas pointer vers un autre site.
- Audit en ajout seul ; bucket privé fermé aux clients ; abstraction d’URL signées côté serveur.
- Cookies de session conservés sur les redirections, réponses privées non mises en cache, cache web
  purgé au changement d’identité. Attente du worker annulable sans accumulation d’écouteurs.
- Variables locales, clé de signature JWT et fichiers de diagnostic sensibles ignorés par Git.

Ces contrôles constituent le socle ; les limites avant pilote sont détaillées dans
[security.md](security.md), notamment l’enrôlement MFA, la limitation de débit et l’antivirus.

## Tests

| Commande / contrôle                                                                   | Résultat local                                                                      |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `pnpm check`                                                                          | format, ESLint, TypeScript, **91 tests**, contrat OpenAPI cohérent                  |
| `pnpm build`                                                                          | compilation de production web et worker réussie                                     |
| `pnpm test:db`                                                                        | **97 assertions SQL** réussies, 8 fichiers                                          |
| `pnpm test:integration`                                                               | **12 tests** Auth → API → RLS, RBAC et file de jobs réussis                         |
| `supabase start` sur une stack temporaire vierge, puis `supabase test db`             | 10 migrations + seed appliqués, 97 assertions réussies                              |
| `pnpm exec supabase db lint --local --schema app --level warning --fail-on warning`   | aucune erreur                                                                       |
| `pnpm exec supabase db advisors --local --type security --level warn --fail-on error` | aucune alerte remontée                                                              |
| `flutter analyze`                                                                     | aucune anomalie                                                                     |
| `flutter test`                                                                        | **66 tests** réussis, dont chiffrement SQLCipher                                    |
| `dart format --output=none --set-exit-if-changed lib test`                            | 64 fichiers, aucun changement                                                       |
| `dart run build_runner build`                                                         | génération réussie, fichier Drift principal inchangé                                |
| `flutter build apk --debug`                                                           | APK produit dans `apps/mobile/build/app/outputs/flutter-apk/app-debug.apk`          |
| Navigateur intégré                                                                    | connexion du rédacteur 06, dashboard, deux sites visibles, fiche EHPAD Les Oliviers |

Les tests d’intégration vérifient explicitement qu’un utilisateur du 06 reçoit un refus pour le SIS 83
et ne peut pas lire un site du 83. Les tests SQL couvrent aussi l’absence de contexte, les rôles,
la séparation des tâches, les publications retirées, l’audit et les contraintes de rattachement.

Pour le build Android local, `ANDROID_HOME` a été corrigé dans le processus afin de viser le SDK
plutôt qu’Android Studio. Voir [development.md](development.md). L’APK sans configuration de connexion
est un artefact de compilation ; fournir les `--dart-define` documentés pour l’utiliser avec la stack.

## Décisions prises

- Décisions existantes conservées : **Next.js 16** et séparation des droits administrateur/validateur,
  enregistrées comme validées par le porteur du projet dans ADR-001 et ADR-008.
- Monolithe modulaire ; API indépendante de Next hébergée par ses route handlers au MVP.
- Paquets `application` et `adapters` ajoutés pour isoler le domaine ; pas de Turborepo à ce stade.
- PostgreSQL reste la source de vérité ; Auth et Storage passent par des adaptateurs remplaçables.
- IGN reste le fournisseur de référence ; aucune cartographie complète ni pack hors ligne développé.
- Les corrections de sécurité SQL sont des migrations additionnelles, sans réécriture des migrations
  déjà appliquées.

## Écarts

- **CI distante non exécutée** : workflow fourni et commandes vérifiées localement ; un premier run
  GitHub reste nécessaire pour confirmer les runners Linux. Aucun push n’a été fait pour le provoquer.
- Android compilé et testé sur l’hôte ; parcours sur émulateur/appareil et compilation iOS non vérifiés.
- Dockerfiles fournis ; images et déploiement de production non validés. Terraform reste un point
  d’extension dans l’attente du choix d’hébergement.
- Enrôlement MFA dans l’interface à développer avant ouverture des futures actions privilégiées.

## Dette technique

- Client Dart/DTO provisoires écrits à la main : les remplacer par une génération depuis OpenAPI.
- Signatures de publication, protocole de synchronisation et effacement des caches métier mobiles
  à concevoir avec les sprints correspondants ; aucune donnée opérationnelle n’est synchronisée ici.
- Signature Android release, mentions des bibliothèques natives et validation iOS avant distribution.
- Durcissement d’exploitation et sauvegarde/restauration à valider avant le pilote, selon la DSI/RSSI.

L’éditeur ETARE, les PDF, les paquets OPS, le portail exploitant, les signalements et la cartographie
complète sont volontairement hors Sprint 0.

## Prochaine étape

Sur nouvelle instruction, démarrer le **Sprint 1 : référentiel sites et bâtiments**. Première tranche :
contrats `POST /sites` et `PATCH /sites/{id}`, permissions d’écriture, validation des adresses et
géométries, audit, contrôle de concurrence, formulaires web, puis tests d’isolation et de droits sur
les deux SIS fictifs. Le workflow de publication et la synchronisation restent des tranches distinctes.
