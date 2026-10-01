# Bilan du dépôt — 1er octobre 2026

**Référence examinée : `6d8170d11393b72be59ceb6cdd6cbf0747f91ee0` — rapport de livraison du Sprint 4.**
Le dépôt était propre au début de cette revue. Ce bilan et la
[roadmap de développement](roadmap-developpement.md) décrivent le code actuel, ses preuves et les travaux restants.
Le [bilan du 30 septembre](bilan-alignement-2026-09-30.md) reste une photographie du Sprint 3.

## Conclusion

**Le projet reste raccord au cadrage, et le Sprint 4 a comblé une partie majeure de l’écart offline.**
Le back-office prépare et publie les ETARE ; une tablette enrôlée reçoit les versions signées,
les vérifie, les conserve dans une base chiffrée et permet de consulter sites, plans, objets et photos
sans réseau. Les quatre défauts de publication du précédent bilan ont été corrigés dans `dd976d0`.

**Le MVP n’est pas terminé et la préparation à un pilote opérationnel reste à achever.**
La boucle de signalement terrain, le portail exploitant et plusieurs éléments du périmètre P0 manquent.
Les PDF sont installés sur la tablette mais ne peuvent pas encore y être lus. La carte de contexte
hors ligne est absente. La validation sur tablette physique, la charge, l’antivirus et la préparation
de l’exploitation restent déterminants.

Le bon jalon actuel est donc : **version de démonstration intégrée jusqu’à la consultation OPS hors ligne**.
Il ne faut ni la présenter comme un simple socle technique, ni comme un MVP réceptionné.

## Vérifications effectuées

| Contrôle                                            | Résultat                                                                  | Origine de la preuve                                                              |
| --------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `pnpm check`                                        | Réussi : format, lint, types, **248 tests / 44 fichiers**, OpenAPI à jour | Relancé localement pour ce bilan                                                  |
| `flutter analyze`                                   | Aucune anomalie                                                           | Relancé localement pour ce bilan                                                  |
| `flutter test`                                      | **106 réussis, 1 ignoré**                                                 | Relancé localement ; le test ignoré exige la pile locale explicitement            |
| Migrations et lint SQL                              | Rejeu depuis une base neuve réussi, aucune erreur de schéma               | CI du commit examiné                                                              |
| pgTAP                                               | **259 assertions / 16 fichiers**                                          | Journal CI du commit examiné                                                      |
| Intégration Auth/API/base/Storage/worker            | **74 tests / 15 fichiers**                                                | Journal CI du commit examiné                                                      |
| Build web et worker                                 | Réussi                                                                    | CI du commit examiné                                                              |
| Parcours Android en mode avion et après redémarrage | Réussis sur émulateur, selon le rapport de livraison                      | [Rapport Sprint 4](sprint-4-report.md), non rejoués visuellement pendant ce bilan |

[CI vérifiée du commit `6d8170d`](https://github.com/emifrog/cityscope/actions/runs/36842645946) :
les trois jobs TypeScript, base/intégration et Flutter sont réussis. Le dépôt contient **21 migrations**
et **16 ADR**. Les nombres de tests ne mesurent pas un pourcentage d’achèvement fonctionnel.

La revue rapproche code, tests, contrats, migrations, ADR et cinq documents de référence.
Les tests SQL et d’intégration n’ont pas été rejoués localement pour ce bilan ; leur preuve vient de
la CI du même commit. Aucun reset de la base de démonstration, déploiement, essai sur tablette physique,
test de charge ou test d’intrusion n’a été effectué ici.

## Ce qui est effectivement livré

| Ensemble                  | Fonctionnement présent                                                                                           | Limite à conserver dans le bilan                                                                  |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Socle                     | Monorepo, API versionnée, PostgreSQL/PostGIS, Auth, isolation multi-SIS, rôles, audit, CI                        | Exploitation de production à qualifier                                                            |
| Référentiel               | Sites, bâtiments, niveaux, classifications, contacts, identifiants, documents versionnés                         | Recherche par risque et antivirus manquants                                                       |
| Cartographie web          | IGN, recherche d’adresse, regroupement des sites, emprises, objets géographiques                                 | Aucun fond cartographique sur la tablette                                                         |
| Plans et objets           | PDF converti en image, fonds versionnés, points/lignes/surfaces, calques, zones, risques, photos d’objets        | Cohérence à la modification d’une zone à compléter ; risques extérieurs non dessinables dans l’UI |
| Validation et publication | Aperçu, snapshot cohérent, séparation des tâches, MFA, historique, PDF, reprise après échec                      | Archivage/retrait non exposés comme parcours métier complet ; sections fixes                      |
| Distribution              | Signatures Ed25519 séparées, catalogue, terminaux enrôlés, fichiers par empreinte, reçus, révocation             | Périmètre actuel : SIS, sans secteurs ; sites sensibles exclus                                    |
| Mobile OPS                | SQLCipher, installation atomique, reprise, recherche locale, synthèse, plans tactiles, fiches, photos, fraîcheur | PDF sans lecteur, pas de signalement ni de carte, synchronisation à l’accueil ou manuelle         |

Preuves détaillées : [suivi des exigences](suivi-exigences.md),
[ADR-015](decisions/ADR-015-offline-distribution.md),
[ADR-016](decisions/ADR-016-mobile-offline-store.md),
[tests de distribution](../tests/integration/offline-distribution.test.ts) et
[parcours OPS](../apps/mobile/test/features/ops/ops_flow_test.dart).

## Écarts à traiter, par priorité de livraison

### 1. Fermer les parcours MVP

- **Signalement terrain — OPS-04/P0 : absent.** L’écran web reste une annonce de Sprint 5.
  Il manque la saisie mobile hors ligne, la photo, la file d’envoi persistante et le traitement par la
  Prévision jusqu’à une nouvelle publication. La définition de fin du MVP dépend de cette boucle.
- **Portail exploitant — PORTAL-01 à 03/P0 : absent.** Les invitations de membres SIS ne constituent
  pas une invitation limitée à un site. Il faut une consultation explicitement filtrée, des propositions
  séparées de la donnée opérationnelle et leur instruction par le SIS.
- **Documents opérationnels : lecture PDF manquante sur tablette.**
  [L’écran actuel](../apps/mobile/lib/src/features/ops/presentation/document_screen.dart) affiche un
  message d’attente malgré le fichier installé et vérifié. Les documents « à la demande » n’ont pas
  encore de parcours de téléchargement mobile.
- **Carte et périmètres hors ligne : incomplets.** Pas de fond IGN sur tablette ni d’affectation par
  secteurs/listes de sites. Les droits IGN restent à qualifier avant d’implémenter et distribuer des packs.
- **Compléments P0 :** filtre par risque, localisation des risques extérieurs, archivage des dossiers,
  règles des sites sensibles et périmètres géographiques. Le sens minimal de « sections configurables »
  doit être arbitré sans assimiler d’office ETARE-01/P0 à tout ETARE-03/P1.

### 2. Lever les réserves de sécurité et de fiabilité

- Le worker utilise toujours `antivirusNotConfigured` : un verdict `not_scanned` n’est pas un contrôle
  antivirus. Prévoir moteur, quarantaine, erreurs temporaires et refus des fichiers infectés.
  Sources : [worker](../services/worker/src/main.ts), [contrôle des fichiers](../packages/application/src/asset-verification.ts).
- MFA encore partielle côté API pour les comptes enrôlés ; limitation de débit, CSP, récupération de
  compte et révocation des sessions à compléter. Voir [sécurité](security.md).
- Autorisation locale de sept jours à valider avec le SIS ; limites de révocation et d’horloge hors
  réseau à assumer explicitement. Prévoir verrouillage applicatif, gestion des clés et tests de rotation.
- Pas de contrôle d’espace libre avant synchronisation ; fichiers chargés entièrement en mémoire.
  À éprouver sur gros paquets, disque presque plein et documents volumineux avant de figer cette
  stratégie. Ces limites figurent dans l’ADR-016.
- La [liste des dossiers ETARE](../packages/adapters/src/postgres/etare-repository.ts) reste plafonnée
  à 1 000 sans pagination. Il manque les mesures sur 10 000 sites et plusieurs centaines de milliers d’objets.
- Purge des dépôts abandonnés, quarantaine et PDF de tentatives perdantes à développer ; ne jamais
  supprimer un fichier encore référencé par une publication conservée.

### 3. Préparer une livraison exploitable

- Hébergement/région, séparation préproduction/production, secrets, sauvegardes, restauration
  conjointe base/objets, supervision et procédures d’incident à qualifier avec la DSI.
- Version Android à signer avec une clé de distribution ; mentions des dépendances, identité
  définitive et mécanisme de mise à jour à préparer. iOS est présent dans le dépôt mais non compilé ni validé.
- Recette sur tablette physique, réseau dégradé, redémarrage, interruption, perte/révocation,
  ergonomie terrain et charge. Un succès sur émulateur ne vaut pas réception par le SIS.
- Pilote de 20 à 50 sites, 3 à 6 prévisionnistes et 10 à 20 utilisateurs OPS, selon le cadrage.
  Les objectifs métier et les seuils de passage figurent dans la roadmap.

## Alignement avec le projet de référence

Les invariants restent présents : autorité de publication SIS, contribution distincte du publié,
données structurées comme source de vérité, publication immuable, mode OPS local, traçabilité,
isolation multi-SIS, monolithe modulaire et adaptateurs autour de Supabase/IGN.
Les fonctionnalités restent dans la connaissance opérationnelle ; aucune extension vers la SITAC,
la conformité réglementaire généraliste ou la facturation exploitant n’a été constatée dans les modules examinés.

Le différentiel par empreinte de fichier est un arbitrage explicite de l’ADR-015.
Les droits SIS_ADMIN/validateur suivent l’ADR-008. Ces choix documentés ne sont pas des oublis à corriger
automatiquement d’après la matrice initiale. En revanche, la carte offline et la qualification sur matériel
réel restent en retard sur la preuve demandée dès le prototype par l’architecture §32.

La base technique est solide au regard des vérifications disponibles. **La priorité est maintenant
la complétude des parcours et leur qualification**, avant les enrichissements MVP+.
La [roadmap](roadmap-developpement.md) affecte les 44 exigences à un état et à un lot, ajoute les
travaux transverses et distingue les décisions externes des tâches réalisables dans le dépôt.

## Sources

- [Cahier des charges MVP](reference/01_Cahier_des_charges_MVP_ETARE_numerique.pdf) : §2, §5 à 12.
- [Modèle de données](reference/02_Modele_de_donnees_ETARE_numerique.pdf) : entités et relations métier.
- [Modèle économique](reference/03_Modele_economique_ETARE_numerique.pdf) : pilote SIS et absence de fork client.
- [Maquette produit](reference/04_Maquette_produit_ETARE_numerique.pdf) : parcours Prévision, OPS et exploitant.
- [Architecture technique](reference/05_Architecture_technique_ETARE_numerique_IGN.pdf) : §09 à 20, §28 à 33.
- Rapports [Sprint 3](sprint-3-report.md), [Sprint 4](sprint-4-report.md), ADR et code du commit indiqué.

Les documents de référence décrivent la cible ; les anciens prompts et propositions de sprint sont du
contexte historique. Ils ne constituent pas une instruction de démarrer automatiquement les lots futurs.
