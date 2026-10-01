# Bilan du dépôt et alignement avec le projet

**Date : 30 septembre 2026. Commit examiné : `dfd24f9fa4a60fed95ef6d5d0c3b25059c7c7daf`.**

> Rapport historique du Sprint 3. Les corrections A à D ont été intégrées dans `dd976d0` et le Sprint 4
> a livré la consultation OPS hors ligne. Pour l’état courant, consulter le
> [bilan du 1er octobre](bilan-depot-2026-10-01.md) et la [roadmap](roadmap-developpement.md).

## Avis

**Le projet reste aligné sur son positionnement et son architecture.** Le back-office couvre désormais
une grande partie de la préparation d’un ETARE : référentiel, carte IGN, plans, objets et risques,
validation SIS, publication et PDF. Aucun glissement vers la SITAC, la GMAO, la facturation exploitant,
l’IA ou une intégration NexSIS complète n’a été relevé dans le périmètre examiné.

**Le MVP opérationnel reste incomplet.** L’application mobile est encore le squelette du Sprint 0,
sans données ETARE installées ni consultation en mode avion. Le portail exploitant et les signalements
sont à venir. Le cahier des charges exige pourtant la chaîne complète : créer, valider, publier,
synchroniser, consulter hors ligne puis remonter une correction.

**Une stabilisation du circuit de publication doit précéder la distribution mobile.** Deux scénarios
anormaux ont été reproduits avec le cas d’usage réel et des dépendances simulées, et un risque de
cohérence transactionnelle a été identifié dans le code et la configuration locale.

## Méthode et limites

- Lecture du code et des migrations, contrats API, rapports des Sprints 0 à 3, ADR et documentation.
- Comparaison avec les cinq documents de référence ci-dessous ; vérification visuelle des pages
  consacrées aux exigences OPS/offline et aux garanties de publication.
- Contrôles locaux relancés : `pnpm check`, `pnpm test:db`, lint du schéma SQL.
- Lecture de la CI GitHub du **même commit** : les trois jobs réussissent.
- Simulation ciblée de la concurrence et des erreurs de fabrication avec le code de production,
  stockage et état de publication en mémoire. Aucun fichier de publication réel n’est altéré.
- Les tests d’intégration et Flutter n’ont pas été relancés localement pour ce bilan : leur succès
  est confirmé par le run CI. Aucun environnement partagé n’a été modifié.
- Pas de nouvelle recette visuelle complète, de test sur tablette, de test de charge ni de pentest.
  Ce bilan ne constitue pas une homologation de sécurité ou une recette métier exhaustive.

Le dépôt était propre au début de la revue. Ce rapport ne corrige pas le code fonctionnel.

## État constaté

| Élément                     | Preuve actuelle                                                                           |
| --------------------------- | ----------------------------------------------------------------------------------------- |
| Livraison                   | Sprints 1, 2 et 3 présents dans les commits et le code                                    |
| Contrôles TypeScript locaux | format, lint, types, **211 tests dans 38 fichiers**, OpenAPI à jour : succès              |
| Tests SQL locaux            | **184 assertions dans 14 fichiers** : succès                                              |
| Schéma local                | **18 migrations appliquées**, `db lint` sans erreur                                       |
| CI GitHub                   | TypeScript avec build, migrations/RLS/intégration, Flutter : trois jobs réussis           |
| Intégration et Flutter      | rapports de livraison : 58 et 66 tests ; suites du commit courant vertes en CI            |
| Données de démonstration    | deux SIS fictifs, garde-fous de tests contre l’environnement partagé                      |
| Mobile                      | Drift/SQLCipher et authentification ; tables locales `LocalMeta` et `SyncState` seulement |

Run consulté : [CI du commit dfd24f9](https://github.com/emifrog/cityscope/actions/runs/36764872911).
La CI verte prouve le succès des scénarios existants ; les scénarios de concurrence décrits ci-dessous
ne sont pas couverts par ces tests.

## Alignement fonctionnel

« Présent » signifie trouvé dans le code avec des tests associés, pas réceptionné par un SIS pilote.

| Domaine / exigences                                                 | État                  | Écart ou suite nécessaire                                                                                  |
| ------------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------- |
| Sites, bâtiments, niveaux, classifications, contacts — SITE-01 à 04 | Présent               | Recette utilisateur et données représentatives à conduire                                                  |
| Documents et photos de site — SITE-05                               | Présent avec réserve  | Quarantaine, versionnement, type/taille/hash ; antivirus non raccordé                                      |
| Recherche — SITE-06                                                 | Partiel               | Texte, commune, type et statut ; filtre par risque absent, délai de 2 s non mesuré sur jeu pilote          |
| Carte IGN — MAP-01/02                                               | Présent               | MapLibre, sites regroupés, emprises, points ; volumétrie et usage tablette à éprouver                      |
| Imports et mesures — MAP-03/04                                      | À venir               | Exigences P1/MVP+ ; pas un motif de bloquer le socle P0                                                    |
| Plans — PLAN-01/02/03/04/06                                         | Présent avec réserve  | Fonds versionnés, positions locales, objets, calques, annulation ; défaut PDF WebP à corriger              |
| Photos attachées aux objets — PLAN-05                               | Absent                | **P0** : prévoir une tranche explicite, distincte des photos de site                                       |
| Catalogue et localisation des risques — RISK-01/02                  | Présent / partiel     | Catalogue SIS et placement sur plan ; dessin des risques extérieurs absent de l’UI                         |
| Matières dangereuses/FDS structurées — RISK-03                      | À venir               | P1/MVP+ ; un document classé FDS ne remplace pas cette fonction                                            |
| Assemblage et PDF — ETARE-01/02                                     | Présent avec réserves | Corrections de publication ci-dessous ; sections fixes, caractères limités dans le PDF                     |
| Modèle par SIS et scénarios — ETARE-03/04                           | À venir               | P1/MVP+ ; confirmer ce que recouvre « sections configurables » de l’exigence P0 ETARE-01                   |
| Validation et audit — WF-01/02/04                                   | Présent avec réserves | Contrôle des transitions, séparation des tâches, audit ; archivage du dossier absent de l’UI               |
| Comparaison — WF-03                                                 | Partiel               | Ajouts/retraits/modifications par élément ; pas de détail par champ                                        |
| Consultation OPS — OPS-01/02/03/05                                  | À venir               | Pas de synthèse opérationnelle, plans ou recherche ETARE dans le stockage mobile                           |
| Signalement terrain — OPS-04                                        | À venir               | Écran web annoncé Sprint 5 ; pas de file locale de signalements                                            |
| Paquets et synchronisation — OFF-01/02                              | À venir               | Manifeste haché préparé, mais pas de signature, distribution, installation atomique ni différentiel mobile |
| Chiffrement — OFF-03                                                | Socle seulement       | Base SQLCipher présente ; chiffrement des futurs fichiers et cycle de clés à compléter                     |
| Terminaux — OFF-04, ADMIN-02                                        | À venir               | Enrôlement, inventaire, révocation et purge au prochain contact                                            |
| Exploitants — PORTAL-01/02/03                                       | À venir               | Invitation de membres SIS existante, mais pas de portail contributif ni d’invitation exploitant par site   |
| Administration — ADMIN-01                                           | Partiel               | Rôles, membres et TOTP ; secteurs et politiques de sensibilité non opérationnels                           |
| Catalogues et exports — ADMIN-03/04                                 | Partiel               | Catalogue de risques et PDF ; catalogue d’objets configurable et exports génériques à compléter            |

Deux ambiguïtés du cahier des charges méritent une trace explicite dans le backlog : sections
configurables en ETARE-01/P0 versus modèle par SIS en ETARE-03/P1 ; import/export CSV inclus dans le
périmètre général mais rangé en P1 dans la table d’exigences. Elles ne doivent pas être considérées
implicitement comme résolues par la seule rédaction d’un rapport de sprint.

## Alignement architectural

| Principe                                  | Conclusion                                                                                       |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Monolithe modulaire                       | Respecté : web/API, domaine, application, adaptateurs et worker séparés logiquement              |
| PostgreSQL/PostGIS source de vérité       | Respecté ; les clients passent par l’API, pas par les tables Supabase                            |
| Portabilité Supabase                      | Conservée par les ports d’identité, de stockage et de persistance                                |
| Multi-SIS                                 | Défendu par contexte transactionnel, RLS, clés composites et règles applicatives ; tests au vert |
| Autorité SIS et validation distincte      | Implémentées ; auteur, soumetteur et contributeurs exclus de l’approbation                       |
| Travail séparé de la publication          | Présent ; cohérence à la capture et immutabilité des fichiers à corriger                         |
| IGN comme fournisseur, moteur indépendant | Respecté avec MapLibre ; droits de packs offline et flux réseau DSI restent à qualifier          |
| Offline-first                             | Préparé structurellement, pas encore démontré sur la chaîne opérationnelle                       |
| SaaS configurable par SIS                 | Orientation conservée, pas de fork client constaté ; personnalisation encore partielle           |

Les décisions Next.js 16 et droits SIS_ADMIN/validateur sont documentées dans ADR-001 et ADR-008
comme arbitrages du porteur du projet. Elles ne sont donc pas comptées comme des dérives non autorisées.
La file PostgreSQL est cohérente avec le monolithe ; la demande de publication et le job sont inscrits
dans la même transaction. Le mécanisme général d’événements/webhooks reste à construire.

## Corrections prioritaires

Les priorités P1/P2 ci-dessous qualifient la revue technique, pas les étiquettes P0/P1 du cahier des charges.

### A — P1 : un PDF publié peut être écrasé par une tentative devenue obsolète

**Constat reproduit.** `generateEtarePdf` écrit toujours à la même clé avec `upsert: true`
(`packages/application/src/publication-build.ts`, ligne 274). Le démarrage SQL reprend aussi une
publication déjà `building` (`20261003000200_etare_workflow.sql`, ligne 62). Le handler n’utilise pas
le signal de perte de bail (`services/worker/src/handlers.ts`, ligne 128).

Scénario : A commence et ralentit ; son bail expire ; B reprend, fabrique et publie ; A termine ensuite
et remplace le PDF. La finalisation SQL de A est refusée car la publication est déjà publiée, mais
l’écriture dans Storage a déjà eu lieu. Le manifeste conserve l’empreinte du PDF de B.

La simulation du cas d’usage réel donne `status: published`, résultat tardif `already_built`,
**`storedPdfMatchesManifest: false`**. Cela contredit directement l’architecture §09 : aucune
réécriture applicative d’une publication ou de ses fichiers.

**Correction attendue :** objets de sortie immuables, adressés par empreinte ou tentative, activation
atomique de la référence gagnante, contrôle du propriétaire/génération du bail. Un simple contrôle
d’état avant l’upload laisse une course possible. Ajouter un test de tentative tardive après reprise.

### B — P1 : la soumission ne garantit pas un instantané cohérent entre tables

**Constat par lecture du code et mesure de configuration, sans reproduction complète du parcours concurrent.**
`PostgresSessionFactory` ouvre un simple `BEGIN` (`session.ts`, ligne 52). Le niveau mesuré sur la base
locale est `read committed`, sans surcharge sur `etare_api`. `workingData` lit le site puis plusieurs
tables séparément (`application/etare.ts`, ligne 45). Le verrou/version de révision n’intervient qu’à
l’enregistrement final (`postgres/etare-repository.ts`, ligne 210).

Une modification validée entre ces lectures peut mélanger deux états du référentiel dans le contenu
figé. Le SHA-256 protège ensuite ce mélange, sans en garantir la cohérence métier. Les auteurs collectés
doivent également correspondre aux données effectivement figées.

**Correction attendue :** un instantané transactionnel stable pour la soumission et la collecte des
contributeurs, avec gestion des conflits/reprises ; ou une lecture atomique et une stratégie de
verrouillage cohérente de toutes les écritures concernées. Tester notamment un remplacement de fond
concurrent au déplacement d’un objet. Le comportement de `READ COMMITTED` est confirmé par la
[documentation PostgreSQL](https://www.postgresql.org/docs/17/transaction-iso.html#XACT-READ-COMMITTED).

### C — P2 : fin des reprises sans passage de la publication en échec

**Constat reproduit au niveau du cas d’usage, complété par lecture du runner et de la file SQL.**
Seule une `PermanentJobError` appelle `store.fail` (`publication-build.ts`, ligne 307). Après une panne
Storage répétée, la file passe le job à `dead` au maximum des tentatives, sans synchroniser l’état de
la publication (`runner.ts`, ligne 72 ; migration jobs, ligne 152).

La simulation de cinq erreurs transitoires laisse **`status: building`** et aucun appel de mise en
échec. L’API de relance n’accepte pourtant qu’une publication `failed` : le dossier reste bloqué.

**Correction attendue :** propager l’échec définitif de la file au domaine, y compris un dernier bail
expiré, puis permettre une reprise auditée. Tester aussi qu’une ancienne tentative ne marque pas en
échec une publication déjà terminée par une autre.

### D — P2 : les plans WebP acceptés disparaissent du PDF opérationnel

**Constat explicite dans le code et déjà annoncé dans le rapport Sprint 3.** Les imports acceptent
WebP (`contracts/plans.ts`, ligne 49), mais seuls PNG/JPEG sont chargés pour le PDF
(`publication-build.ts`, ligne 222). `drawPlan` retourne avant de dessiner le fond **et les objets/risques**
si l’image n’est pas disponible (`adapters/pdf/etare-pdf.ts`, ligne 294).

Le PDF peut donc porter la mention « publié » tout en omettant un plan utilisable dans l’application.
**Correction attendue :** conversion contrôlée en PNG/JPEG, support complet, ou refus explicite de
publication tant que le rendu obligatoire ne peut pas être fabriqué. Tester le contenu visuel du PDF.

La reproduction locale de A et C est conservée dans `tmp/audit-publication-race.ts` (fichier de
diagnostic ignoré par Git) : `pnpm exec tsx tmp/audit-publication-race.ts`. Elle n’est pas un test
Storage réel ni une modification des suites du produit.

## Réserves avant pilote

- **Antivirus : écart avéré au cahier des charges §7.** Le worker utilise toujours
  `antivirusNotConfigured` (`services/worker/src/main.ts`, ligne 42). `not_scanned` conduit tout de
  même à `scan_status = clean`. Les contrôles de format, taille et empreinte ne sont pas un antivirus.
  Raccorder un moteur et traiter indisponibilité, reprise et quarantaine sans admission silencieuse.
- **Sites sensibles :** classification stockée, mais politique d’accès renforcée, journalisation des
  consultations et restrictions de distribution à compléter avant diffusion de données sensibles.
- **MFA :** opérations privilégiées protégées ; les appels API ordinaires d’un compte enrôlé peuvent
  encore utiliser `aal1`, même si le web impose la deuxième étape. Limite déjà documentée.
- **Résilience et exploitation :** limitation de débit, CSP, nettoyage des objets abandonnés,
  sauvegardes/restauration/PRA, supervision et homologation avec le SIS pilote restent ouverts.
- **Volumétrie :** pas de preuve des objectifs sur 10 000 sites et plusieurs centaines de milliers
  d’objets. La liste des dossiers ETARE est plafonnée silencieusement à 1 000
  (`postgres/etare-repository.ts`, ligne 98) : prévoir pagination et compteurs exacts.
- **Cohérence spatiale :** déplacement/archivage d’une zone sans recalcul des rattachements des
  objets, limite déjà reconnue ; à traiter avant recette terrain.
- **Tests :** la CI ne remplace pas les essais tablette/redémarrage/mode avion, coupure pendant
  téléchargement, reprise, charge et restauration exigés par les documents.

## Trajectoire recommandée

Le décalage principal est **le report du risque offline**. L’architecture §32 demandait dès le prototype
un site représentatif avec plans, pictogrammes et fond IGN sur tablette, ouvert après redémarrage sans
réseau. Le chiffrement existe, mais cette preuve n’a pas encore été fournie. Le nombre de sprints et
la quantité de tests ne permettent pas d’en déduire un pourcentage fiable de réalisation du MVP.

1. **Stabiliser les publications** : corrections A à D, tests de concurrence, panne et reprise,
   synchronisation des états job/publication, antivirus avant documents réels.
2. **Faire du Sprint 4 une preuve de bout en bout sur une tablette cible** : un site et ses fichiers,
   signature Ed25519, vérification des références/tailles/empreintes, installation atomique,
   consultation après redémarrage en mode avion ; coupure au milieu de la mise à jour avec ancienne
   version toujours utilisable. Inclure un fond IGN dont les droits offline sont qualifiés.
3. **Compléter les P0** : photos d’objets, recherche par risque, terminal/révocation, affichage âge et
   synchronisation, signalement offline, invitation exploitant et contribution sans publication directe.
4. **Recette pilote** : 20 à 50 sites représentatifs selon le cadrage, essais métiers chronométrés,
   charge, restauration et revue sécurité ; lever les réserves avant usage opérationnel.

Les enrichissements P1 (modèles avancés, comparaison détaillée, imports élaborés) peuvent attendre
la preuve de la chaîne terrain, sous réserve des ambiguïtés fonctionnelles signalées plus haut.

## Documentation à remettre à niveau

- `README.md` annonce encore « Sprint 0 » et « aucune fonctionnalité métier complète », et dit que
  la CI GitHub reste à confirmer. Ces trois informations sont périmées.
- Les rapports de sprint sont des photographies historiques utiles, mais aucun tableau courant ne
  rattache systématiquement toutes les exigences P0/P1 à leur état, leurs tests et leurs réserves.
- Conserver ce tableau de suivi dans le dépôt et mettre à jour le README vers le Sprint 3 ; garder
  les rapports historiques datés plutôt que modifier rétroactivement leurs résultats.

## Références comparées

- [Cahier des charges MVP](reference/01_Cahier_des_charges_MVP_ETARE_numerique.pdf) : §1, §5 à 7, §10 à 12.
- [Modèle de données](reference/02_Modele_de_donnees_ETARE_numerique.pdf) : référentiel, publications,
  contributions, terminaux, synchronisation et audit.
- [Modèle économique](reference/03_Modele_economique_ETARE_numerique.pdf) : SIS payeur, portail exploitant
  contributif, absence de fork par client, validation par un pilote.
- [Maquette](reference/04_Maquette_produit_ETARE_numerique.pdf) : parcours Prévision, carte, plans,
  aperçu/validation, OPS et contributions.
- [Architecture technique](reference/05_Architecture_technique_ETARE_numerique_IGN.pdf) : §09 à 15,
  §17 à 20, §28 et §32.
- Rapports Sprints 1 à 3, ADR-001/008/009/010/011/012/013/014, code et migrations au commit indiqué.
