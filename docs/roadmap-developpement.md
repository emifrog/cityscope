# Roadmap complète de développement — ETARE numérique

**Mise à jour : 3 octobre 2026. Base : `566ac20` (Sprint 9 livré).**

Ce document est le plan de développement courant : **ce qui est implémenté, ce qui reste à construire,
dans quel ordre et avec quelle preuve de fin**. Il complète le
[bilan du dépôt](bilan-depot-2026-10-01.md) et le [suivi des exigences et tests](suivi-exigences.md).
Les rapports de sprint conservent l’historique ; cette roadmap doit évoluer après chaque livraison.

Le découpage futur est une **proposition de séquencement**, pas un engagement de dates ni un ordre
d’exécution automatique. Les rôles indiqués sont les responsables à désigner, pas des personnes déjà affectées.

## 1. Cible et point de départ

**Cible :** une plateforme SIS de connaissance opérationnelle structurée, validée et disponible hors
ligne. Le SIS garde l’autorité de publication ; les exploitants et les intervenants proposent des
corrections qui passent par la Prévision et une nouvelle validation.

**Aujourd’hui :** création → préparation des plans et objets → validation → publication/PDF →
distribution signée → installation chiffrée → consultation OPS hors ligne sont implémentées, ainsi que
la boucle terrain (signaler hors ligne → transmettre sans doublon → instruire → corriger le brouillon →
faire valider → republier → constater la correction sur tablette, Sprints 5 et 6), le lecteur PDF hors
ligne et le portail exploitant minimal (Sprint 7). Le tout est éprouvé sur émulateur et navigateur.

**Reste à construire :** compléter les parcours P0 (recherche par risque, risques extérieurs, cohérence
des zones, cycle de vie des dossiers, sections, secteurs et sites sensibles), la carte de contexte dans
l’application terrain, les prérequis de sécurité et d’exploitation (R4), puis la qualification sur la
tablette de référence et la recette (R5).

**Fin du MVP :** cette boucle doit fonctionner sur une tablette de référence en mode avion,
avec traçabilité, puis réussir une recette métier et technique. Le périmètre P0 du cahier des charges,
le portail exploitant et les réserves de sécurité doivent être couverts ou faire l’objet d’un arbitrage
explicite du porteur et du SIS. Un report accepté doit rester visible comme un écart, pas devenir « terminé ».

### Lecture des états

| État        | Sens                                                                               |
| ----------- | ---------------------------------------------------------------------------------- |
| Implémenté  | Code et tests présents ; recette pilote encore requise                             |
| Partiel     | Parcours utilisable, mais critère ou sous-fonction manquant                        |
| À faire     | Pas de parcours utilisable complet dans le dépôt                                   |
| À décider   | Choix métier, SIG, sécurité ou exploitation nécessaire avant de terminer le lot    |
| À qualifier | Implémentation présente, preuve sur matériel/données/environnement cible manquante |

Cette échelle est la seule utilisée : le [suivi des exigences](suivi-exigences.md) reprend le même état
pour chaque exigence et porte les preuves automatisées ; en cas d’écart, la matrice de la section 5 fait foi.

Les priorités **P0/P1** ci-dessous viennent du cahier des charges : P0 = MVP, P1 = MVP+.
Les lots transverses de sécurité et d’exploitation sont des conditions de livraison, même sans identifiant P0.
Un total de tests ou un nombre de sprints ne donne pas un pourcentage fiable d’avancement.

## 2. Développement déjà réalisé

| Livraison                   | Réalisé                                                                                                                                                                     | Preuve / limite                                                                 |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Sprint 0 — fondation        | Monorepo, web/API, worker, PostgreSQL/PostGIS, Auth, multi-SIS/RLS, rôles, audit, contrats OpenAPI, CI ; socle Flutter/SQLCipher                                            | [Rapport](sprint-0-report.md), ADR-001 à 008                                    |
| Sprint 1 — référentiel      | Sites, bâtiments/niveaux, classifications, contacts, identifiants, documents versionnés, quarantaine, contrôles type/taille/hash, membres et TOTP                           | [Rapport](sprint-1-report.md) ; antivirus encore absent                         |
| Sprint 2 — carte            | MapLibre/IGN, regroupement et filtres, géocodage, localisation, emprises, objets opérationnels géographiques et fiches typées                                               | [Rapport](sprint-2-report.md) ; import avancé et mesures à venir                |
| Sprint 3 — dossiers         | Fonds PDF/image versionnés, plans, objets/zones/risques, calques, catalogue de risques SIS ; aperçu, soumission, validation indépendante, publication et PDF                | [Rapport](sprint-3-report.md) ; modèle fixe                                     |
| Stabilisation du 30/09      | PDF immuable par empreinte, bail protégé contre les tentatives obsolètes, snapshot cohérent, propagation des échecs définitifs, relance auditée, WebP dans le PDF           | Commit `dd976d0`, tests de concurrence et panne, [suivi](suivi-exigences.md)    |
| Sprint 4 A — distribution   | Manifestes et catalogues signés Ed25519, deux clés séparées ; déclaration/enrôlement des terminaux, requêtes signées, inventaire, reçus et révocation                       | Commit `f7f6437`, [ADR-015](decisions/ADR-015-offline-distribution.md)          |
| Sprint 4 B — cache terrain  | Vérification signature/hash/taille, fichiers dans SQLCipher, activation atomique, différentiel par empreinte, reprise, autorisation locale et fraîcheur                     | Commit `785e47f`, [ADR-016](decisions/ADR-016-mobile-offline-store.md)          |
| Sprint 4 C — OPS            | Recherche locale, synthèse, risques critiques, accès/eau/coupures/contacts, plans tactiles, calques, fiches ; essai émulateur après redémarrage en mode avion               | Commit `fe8ee47`, [rapport](sprint-4-report.md) ; tablette physique à qualifier |
| Sprint 4 D — photos         | Photos et légendes sur objets, contrôle avant soumission, publication et paquet, lecture/zoom sans réseau                                                                   | Commit `da8f46a` ; miniatures serveur et photos dans le PDF à compléter         |
| Sprint 5 A — signalements   | Réception signée et idempotente, empreinte du contenu accepté, élément et point de plan vérifiés dans la version consultée, photos contrôlées                               | Commit `6d42c48`, [ADR-017](decisions/ADR-017-field-reports.md)                 |
| Sprint 5 B — instruction    | Liste et détail Prévision, comparaison avec la version actuelle, intégration au brouillon, décision motivée définitive, compteur                                            | Commit `d78f1a9`                                                                |
| Sprint 5 C — terrain        | Saisie hors ligne (site, fiche, plan), file chiffrée liée à l’auteur, envoi sans doublon, retour « reçu/traité » ; essai émulateur                                          | Commit `5773faf` ; tablette physique à qualifier                                |
| Sprint 5 D — PDF            | Lecteur PDF en mémoire (pdfrx), dossier ETARE et documents essentiels sans réseau                                                                                           | Commit `6c09cbd` ; documents à la demande à venir                               |
| Sprint 5 E — antivirus      | ClamAV (clamd) obligatoire hors développement, quarantaine conservée si indisponible, CI avec un vrai démon                                                                 | Commit `0233b86` ; signatures et supervision à exploiter                        |
| Sprint 6 A — version min.   | Version minimale dans le catalogue signé, terminaux à mettre à jour signalés ; tablette trop ancienne : rien de nouveau installé, retraits appliqués, invitation            | Commit `f38e433`, ADR-015 (complément)                                          |
| Sprint 6 B — documents      | Documents « à la demande » listés avec taille et état, téléchargement explicite signé et vérifié, conservation, retrait, messages exacts hors réseau                        | Commit `9f02f43`, ADR-016 (complément)                                          |
| Sprint 6 C — arrière-plan   | WorkManager horaire sous contraintes, budget 50 Mo puis Wi-Fi, bail entre moteurs, session partagée, reprise au retour ; essai émulateur                                    | Commit `c6745d7`, [ADR-018](decisions/ADR-018-background-sync.md)               |
| Sprint 7 A — accès          | Invitations d’exploitants par site (usage unique, échéance, révocation), rôle par site seulement, second facteur réglable par SIS et exigé par défaut, portail              | Commit `114250c`, [ADR-019](decisions/ADR-019-exploitant-portal.md)             |
| Sprint 7 B — consultation   | Liste blanche de la version publiée construite en base, documents « visibles exploitant » figés dans l’instantané, téléchargement contrôlé et tracé                         | Commit `28b8e77`                                                                |
| Sprint 7 C — propositions   | Propositions avec valeur publiée figée et pièces contrôlées, échanges, report en brouillon, décision motivée, conflit à résoudre explicitement, suivi exploitant            | Commit `a6292cb` ; report dans les données de travail manuel                    |
| Sprint 7 D — notifications  | Boîte d’envoi transactionnelle (invitation, question, décision), envoi SMTP par le worker, contenu minimal, échecs tracés et rejouables                                     | Commit `1238901`, [ADR-020](decisions/ADR-020-notifications.md)                 |
| Sprint 8 A — recherche      | Filtre par type de risque et gravité (liste et carte), commune sur la carte ; dossiers ETARE paginés avec compteurs exacts, fin du plafond de 1 000                         | Commit `a397d63`                                                                |
| Sprint 8 B — risques ext.   | Risques situés sur la carte (point ou zone) avec portée, couche de détail, instantané, aperçu, PDF ; alerte au-delà de 2 km ; signalés sur la tablette                      | Commit `9bc1f6a` ; carte tablette en R3 CAR-02                                  |
| Sprint 8 C — zones          | Rattachement recalculé quand une zone est tracée, déplacée, archivée ou réactivée ; position décisive ; référence à une zone inactive bloquante                             | Commit `71e0baf`, ADR-012 (complément)                                          |
| Sprint 8 D — cycle de vie   | Retrait motivé par un validateur (second facteur), archivage motivé après retrait, gel, restauration ; raisons dans le catalogue signé et sur la tablette                   | Commit `0704b49`, [ADR-021](decisions/ADR-021-dossier-lifecycle.md)             |
| Sprint 9 A — second facteur | Second facteur imposé par la base aux comptes enrôlés (tablette par sa clé), politique du SIS, sessions vérifiées et révocables, suspension qui les ferme, état des membres | Commit `2113540`, [ADR-022](decisions/ADR-022-second-factor-sessions.md)        |
| Sprint 9 B — récupération   | Dix codes de secours hachés, réinitialisation par l'administration (jamais un membre d'un autre SIS), réactivation obligatoire, alerte e-mail, mot de passe oublié          | Commit `f57417d`, ADR-022                                                       |
| Sprint 9 C — réseau         | Limitation de débit PostgreSQL hors transaction, CSP avec nonce, pas de CORS, HSTS, refus sensibles tracés dans l'audit                                                     | Commit `1fbd1f0`, [ADR-023](decisions/ADR-023-network-protection.md)            |
| Sprint 9 D — fichiers       | Miniatures WebP par le worker, rejet des vérifications abandonnées, maintenance horaire auditée (quarantaine, PDF perdants, fenêtres de débit)                              | Commit `566ac20`, ADR-009 (complément)                                          |

**État technique vérifié :** 331 tests TypeScript, 509 assertions SQL, 125 tests d’intégration (dont
l’antivirus contre un vrai ClamAV et les e-mails dans Mailpit en CI), 165 tests Flutter réussis et
1 test optionnel ignoré ; 33 migrations, 23 ADR (CI du commit `566ac20`, [rapport du Sprint 9](sprint-9-report.md)).
Origine de chaque vérification et limites : [bilan du 1er octobre](bilan-depot-2026-10-01.md).

## 3. Séquence proposée jusqu’au pilote

| Lot                                | Objectif et contenu                                                                                                                                                                                                   | Dépendances                                                 | Responsable à désigner                | Sortie attendue                                                            |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------- |
| R0 — décisions et matériel         | Tablette cible, produits/droits IGN, hébergement, secteurs, sites sensibles, durée offline, ambiguïtés de périmètre                                                                                                   | Référents SIS disponibles                                   | Porteur, Prévision/OPS, SIG, DSI/RSSI | Décisions tracées et protocole de recette                                  |
| R1 — boucle terrain (Sprints 5–6)  | **Réalisé** : signalement hors ligne avec photo, transmission/reprise, instruction Prévision, nouvelle publication ; lecteur PDF                                                                                      | Socle Sprint 4 ; sécurité des fichiers pour données réelles | Mobile + API/web + référent Prévision | Un écart créé sans réseau devient une correction publiée et resynchronisée |
| R2 — portail exploitant (Sprint 7) | **Réalisé** : invitation par site, consultation filtrée, propositions, documents, validation SIS, notifications                                                                                                       | Chaîne de contributions R1 ; antivirus R4                   | Web/API + référent Prévision          | Aucun accès transversal, aucune publication directe exploitant             |
| R3 — compléter le périmètre MVP    | Recherche par risque, risques extérieurs, archivage/retrait, sections minimales, secteurs/listes, politique sensible, carte offline                                                                                   | Arbitrages R0 ; R1/R2 selon parcours                        | Web/API/mobile + SIG/RSSI             | Tous les P0 ont une preuve ou un écart explicitement accepté               |
| R4 — sécuriser et exploiter        | **En cours** : antivirus, second facteur et sessions, limitation de débit, CSP, cycle des fichiers réalisés (Sprints 5 et 9) ; restent clés, terminal, charge, sauvegardes, supervision, déploiement, version Android | Sans arbitrage pour la plupart ; choix R0 (hébergement)     | API/mobile + exploitation + RSSI      | Préproduction et dossier de sécurité prêts pour recette                    |
| R5 — recette et pilote SIS         | Tablette physique, réseau dégradé, charge, intrusion, restauration, formation, pilote mesuré                                                                                                                          | R1–R4 et décisions bloquantes levées                        | Métier, SIG, DSI/RSSI, exploitation   | Procès-verbal de recette et décision d’ouverture                           |
| R6 — MVP+ / V1.5                   | Les neuf exigences P1, imports avancés, personnalisation, comparaison, rétention, exports                                                                                                                             | Retours du pilote ; mesure de valeur                        | Produit + équipe de développement     | Extensions génériques, sans fork par SIS                                   |
| R7 — industrialisation / V2–V3     | SSO étendu, MDM, connecteurs, RRF, assistance IA, partage contrôlé et écosystème                                                                                                                                      | MVP exploité, accords/qualifications disponibles            | Produit + partenaires SIS             | Lots autonomes justifiés par usage et capacité                             |

**Dès maintenant :** R1, R2, R3 hors carte (MET-01 à MET-05, PER-01, PER-02) et les lots SEC-01 à SEC-03 et
CAP-03 de R4 sont réalisés. La carte sur tablette (CAR-01 à CAR-03) attend la fiche de droits IGN et la
tablette de référence ; R4 se poursuit (secrets, volumétrie, supervision).
La qualification sur la tablette de référence (Alldocube iPlay 40H) commence dès sa livraison.

Les estimations de l’architecture §32 décrivent le projet initial avec une équipe de trois à quatre
personnes ; elles ne sont pas une estimation du reste à faire aujourd’hui. Chiffrer chaque lot après
arbitrage des critères, du matériel, de l’équipe et des dépendances externes. Aucune date de livraison
n’est engagée par ce document.

## 4. Backlog détaillé des prochains lots

### R0 — décisions nécessaires

- [ ] **DEC-01 — Matériel :** nommer la tablette Android de référence, ses limites RAM/disque, la version
      Android et le mode de distribution ; décider si iOS est nécessaire au pilote ou reporté.
      **Tablette retenue le 1er octobre 2026 :** Alldocube iPlay 40H, Android 11 (API 30), écran 10,4"
      2000 × 1200, 4G double SIM, GPS ; 8 Go de RAM et 128 Go de stockage selon la fiche publique, à
      confirmer sur le modèle livré. Restent ouverts : mode de distribution (MDM ou installation
      manuelle), iOS au pilote, règles de synchronisation (fréquence, budget de 50 Mo, Wi-Fi) et gestion
      de l'énergie du constructeur, qui peut retarder les tâches de fond (ADR-018).
- [x] **DEC-02 — IGN :** qualifier par produit les droits de stockage/redistribution offline, attributions,
      emprises, niveaux de zoom, volume et renouvellement ; conserver la preuve avec le dossier SIG.
      **Décidé le 3 octobre 2026 ([ADR-024](decisions/ADR-024-offline-base-maps.md))** : Plan IGN vectoriel
      (Licence Ouverte Etalab 2.0) par secteur, zoom 14 en général et 18 autour des sites, renouvellement
      semestriel, orthophotos exclues ; fiche de droits à valider par le référent SIG avant le pilote.
- [ ] **DEC-03 — Hébergement :** région, responsabilités d’exploitation, séparation des environnements,
      sauvegardes et accès support ; décisions DSI/RSSI avant données réelles.
- [x] **DEC-04 — Accès :** secteurs, listes de sites, utilisateurs/terminaux partagés, sites sensibles,
      durée de consultation offline et comportement à expiration. La valeur actuelle de sept jours est une
      proposition, pas une garantie de révocation immédiate sans réseau.
      **Décidé le 3 octobre 2026 ([ADR-025](decisions/ADR-025-perimeters-sensitive-sites.md))** : secteurs
      en groupes de sites affectés aux tablettes et aux membres ; sites « restreints » sur tablette à la
      demande (24 h, code), « élevés » en ligne seulement, consultations tracées ; 7 jours puis verrouillage
      sans effacement ; code après 15 min d'inactivité ; position affichée, jamais transmise. À confirmer
      par le RSSI et la direction opérationnelle avant la recette OPS.
- [x] **DEC-05 — ETARE :** contenu minimal des sections configurables P0 ; réserver logo, palette et
      modèle complet par SIS à ETARE-03/P1 sauf décision contraire.
      **Décidé le 3 octobre 2026 ([ADR-026](decisions/ADR-026-etare-sections-photos.md))** : registre
      unique dans l'ordre de la maquette, sections non obligatoires masquables par le SIS et réglage figé
      dans la version soumise ; annexe photos dans le PDF ; ordre libre et identité visuelle en P1.
- [ ] **DEC-06 — Imports/exports :** arbitrer la contradiction entre CSV dans le périmètre général et
      MAP-03/ADMIN-04 classés P1 ; prévoir au minimum une méthode contrôlée de reprise pour le pilote.
- [ ] **DEC-08 — Différentiel :** faire accepter par le SIS l’interprétation d’OFF-02 retenue par l’ADR-015
      (différentiel par empreinte de fichier ; fichier de données d’un site modifié renvoyé en entier) ou
      demander un différentiel par objet.
- [ ] **DEC-09 — Accès au risque critique :** harmoniser « ≤ 3 interactions » (indicateur) et « moins de
      3 interactions » (OPS-01), et fixer le point de départ du parcours mesuré en recette.
- [ ] **DEC-07 — Exploitation :** durée de conservation, RPO/RTO, disponibilité/support, responsables de
      révision métier et procédure de retrait urgent d’une publication.

**Acceptation :** chaque décision a un responsable, une option retenue, un motif et une échéance ;
les décisions structurantes sont enregistrées dans un ADR. Une absence de réponse reste « à décider ».

**Décisions prises par le porteur le 1er octobre 2026** (à confirmer avec le SIS, consignées dans
l’ADR-017 au fil du Sprint 5) :

- Cycle d’un signalement : états du modèle de données (`new`, `triaged`, `resolved`, `rejected`),
  présentés à l’agent comme « en attente » (non envoyé), « reçu » puis « traité » ; la visite de
  vérification est une décision motivée, sans module dédié.
- Localisation : objet visé et position facultative sur le plan publié consulté ; position GPS reportée
  à DEC-04 (nouvelle permission Android).
- File d’envoi : à la déconnexion, les signalements restent liés à leur auteur et invisibles des autres
  utilisateurs ; à la révocation du terminal, ils sont purgés avec le reste, l’agent étant averti
  auparavant des envois en attente. Ce choix de sécurité prime sur la conservation jusqu’à l’accusé
  demandée par l’architecture §11 ; il fait partie de DEC-04.

### R1 — signalement terrain et documents (réalisé, Sprints 5 et 6)

- [x] **TER-01 — Saisie OPS :** depuis un site ou un objet, commentaire, type d’écart, horodatage, photo
      et localisation uniquement si autorisée ; référence à la publication consultée.
- [x] **TER-02 — File locale durable :** données et photos chiffrées, état brouillon/à envoyer/envoyé/erreur,
      identifiant stable, conservation après arrêt forcé/redémarrage et compression avant envoi.
- [x] **TER-03 — Synchronisation montante :** dépôt contrôlé des pièces, reprise avec temporisation,
      idempotence serveur et accusé ; une coupure entre réception et accusé ne crée pas deux signalements.
- [x] **TER-04 — Traitement Prévision :** liste et détail, affectation/état, décision motivée, comparaison
      avec la version actuelle et intégration explicite dans un brouillon ; lien de traçabilité jusqu’à la publication.
- [x] **TER-05 — Retour à l’agent :** état consultable après synchronisation, correction ou rejet expliqué ;
      aucune proposition ne remplace directement une version OPS.
- [x] **DOC-01 — Lecteur PDF offline :** rendre le fichier déjà vérifié depuis le stockage chiffré,
      zoom/pages et gestion d’erreur, sans export temporaire persistant en clair.
- [x] **DOC-02 — Documents à la demande :** téléchargement explicite en ligne, taille/état affichés,
      vérification et conservation selon la politique ; message exact si le document manque hors réseau.
- [x] **SYN-01 — Exécution Android en arrière-plan :** définir les contraintes réseau/batterie, éviter deux
      synchronisations concurrentes, reprendre au retour de l’application et garder une commande manuelle.
      Ce lot est distinct de la synchronisation manuelle déjà livrée.
- [x] **SYN-02 — Version minimale d’application :** le catalogue ou le manifeste porte la version minimale
      requise ; une application trop ancienne conserve le référentiel déjà installé, lisible, et invite à
      la mise à jour (architecture §12, « application incompatible »).

**Livré au Sprint 5 (1er octobre 2026) :** TER-01 à TER-05 et DOC-01, avec SEC-01 (R4) en parallèle
([rapport](sprint-5-report.md)). Restent dans R1 : DOC-02, SYN-01 et SYN-02, et la localisation GPS
d’un signalement (DEC-04). Éprouvé sur émulateur seulement : tablette physique à qualifier.

**Livré au Sprint 6 (1er octobre 2026) :** DOC-02, SYN-01 et SYN-02 ([rapport](sprint-6-report.md)) : R1
est réalisé, hors localisation GPS d’un signalement (DEC-04). Éprouvé sur émulateur seulement : tablette
physique, réseau dégradé et volumes réels à qualifier (R5) ; fréquence, budget de 50 Mo et Wi-Fi à
arbitrer (DEC-01).

**Dépendances :** l’antivirus et les contrôles de R4 s’appliquent aux nouvelles photos comme aux documents.
Définir les règles de déconnexion/révocation avec une file locale non envoyée : ne pas perdre silencieusement
un signalement ni laisser ses pièces accessibles à un autre utilisateur.

**Acceptation :** créer en mode avion, tuer/redémarrer l’application, reconnecter avec coupure pendant
l’envoi, rejouer la demande, instruire par un autre agent, valider, publier et revoir la correction sur
la tablette. Un seul signalement serveur, pièces contrôlées, ancienne publication intacte, chaîne d’audit complète.
Lire le PDF essentiel après redémarrage sans réseau. Tests de contrat, d’intégration et parcours Flutter associés.

### R2 — portail exploitant minimal (réalisé, Sprint 7)

- [x] **POR-01 — Invitation :** invitation limitée à un ou plusieurs sites, durée de validité, usage unique,
      révocation, acceptation et politique MFA configurable ; aucun rôle EXPLOITANT global au SIS.
- [x] **POR-02 — Consultation :** liste blanche des champs/documents exposés à l’exploitant ; refus des
      données opérationnelles non destinées à ce public, même par appel direct à l’API.
- [x] **POR-03 — Proposition :** modification rattachée au champ/objet/document et à sa version source,
      commentaire, pièces et suivi. Réutiliser le traitement des contributions de R1.
- [x] **POR-04 — Concurrence :** détecter une proposition basée sur une ancienne valeur, demander une
      résolution explicite et tracer acceptation partielle/refus ; aucune écriture directe dans le publié.
      **Décisions prises par le porteur le 1er octobre 2026 (Sprint 7) :** l'administrateur du SIS et les
      rédacteurs Prévision invitent les exploitants, avec second facteur ; le second facteur des exploitants est
      un réglage du SIS, exigé par défaut ; l'exploitant voit une **liste blanche minimale** de la version
      publiée (identité, adresse, classement, contacts du site, liste des plans par titre et date, documents
      marqués « visibles par l'exploitant ») et jamais les codes d'accès, les risques détaillés, les PEI ni les
      images des plans.

- [x] **POR-05 — Notifications utiles :** invitation, demande de précision, décision ; envoi rejouable,
      liens à durée limitée et suivi d’erreur. Le workflow doit rester utilisable si la notification échoue.

**Acceptation :** un exploitant de deux sites n’accède à aucun autre ; un lien expiré/révoqué ne fonctionne
plus ; fichier infecté ou non contrôlé non diffusé ; acceptation crée une modification de travail qui
exige ensuite une validation SIS indépendante. Tester utilisateur sans droit, autre site, autre SIS et API directe.

**Livré au Sprint 7 (1er octobre 2026) :** POR-01 à POR-05 ([rapport](sprint-7-report.md), ADR-019 et
ADR-020) : R2 est réalisé, critères d’acceptation couverts par les tests d’intégration et pgTAP. Réserves :
report manuel d’une proposition acceptée dans les données de travail, contacts à visibilité « exploitant »
non exposés, pas de notification des équipes du SIS ; recette avec un exploitant pilote (R5).

### R3 — compléter les parcours P0 et la carte terrain

- [x] **MET-01 — Recherche :** filtre par risque, combinaison avec commune/type/texte ; pagination et
      compteurs exacts dans les dossiers ETARE, suppression du plafond silencieux de 1 000.
- [x] **MET-02 — Risques extérieurs :** placer et modifier la géométrie d’un risque sur la carte et
      conserver sa portée site/bâtiment/zone dans l’aperçu, la publication et la consultation.
- [x] **MET-03 — Cohérence des zones :** comportement explicite lorsqu’une zone bouge ou est archivée :
      recalcul contrôlé des rattachements ou signalement bloquant des incohérences, avec tests de bords et chevauchements.
- [x] **MET-04 — Cycle de vie :** archivage du dossier et retrait motivé d’une publication, permissions,
      historique, diffusion du retrait et statut intelligible sur le terminal ; ne pas effacer l’audit.
- [x] **MET-05 — Composition :** implémenter les sections configurables minimales arbitrées en DEC-05,
      avec aperçu/PDF/OPS cohérents. Décider de la présence des photos d’objets dans le PDF et l’implémenter
      si retenue ; elles sont déjà présentes dans le paquet et les fiches OPS.
      **Livré au Sprint 10** : registre unique (aperçu, PDF `etare-pdf/4`, tablette), masquage par le SIS
      figé dans la version soumise, points à risque sous Risques, même tri partout, annexe photos (ADR-026).
- [x] **PER-01 — Secteurs et listes :** administrer les périmètres, affecter les droits et les packs,
      filtrer le catalogue signé, retirer localement ce qui n’est plus autorisé.
      **Livré au Sprint 10** : secteurs par communes et sites, tablettes et membres affectés, catalogue à
      l’intersection, retrait motivé « périmètre » sur la tablette (ADR-025).
- [x] **PER-02 — Sites sensibles :** règles d’accès, audit des consultations/exports, exclusion des
      téléchargements massifs, durée locale adaptée et authentification avant consultation selon DEC-04.
      Maintenir l’exclusion actuelle tant que cette politique n’est pas implémentée et testée.
      **Livré au Sprint 10** : habilitation nominative datée, sites restreints à la demande (code, 24 h,
      chiffrés), élevés jamais sur tablette, journal des consultations ; code personnel et verrouillage
      d’inactivité sur la tablette (ADR-025). À confirmer par le RSSI.
- [ ] **CAR-01 — Prototype IGN sur matériel :** un pack représentatif, attribution visible, couverture
      et zoom bornés, ouverture après redémarrage sans réseau, en respectant DEC-02.
- [ ] **CAR-02 — Carte locale OPS :** sites et objets depuis la publication, ouverture de fiche,
      position de l’utilisateur si autorisée, distinction entre absence de couverture et absence de données.
- [ ] **CAR-03 — Distribution des fonds :** versions, taille/progression, contrôle d’intégrité, renouvellement,
      reprise et nettoyage ; vérifier la consommation RAM/disque et les limites de stockage autorisées.

**Décisions prises par le porteur le 3 octobre 2026 (Sprint 8) :** une publication en vigueur est
retirée par un validateur (permission de publication, second facteur), avec un motif obligatoire ; un site
et son dossier ne s'archivent qu'une fois la version en vigueur retirée, par l'administration du SIS ou la
Prévision, avec un motif, brouillons clos et site exclu des tablettes ; une zone déplacée ou archivée
entraîne le recalcul automatique des rattachements des éléments placés sur le plan (tracé dans l'audit),
une référence encore incohérente bloquant la soumission ; la recherche par risque filtre sur le type du
catalogue et une gravité minimale.

**Livré au Sprint 8 (3 octobre 2026) :** MET-01 à MET-04 ([rapport](sprint-8-report.md), ADR-021). Restent
dans R3 : MET-05 (après DEC-05), PER-01 et PER-02 (après DEC-04), CAR-01 à CAR-03 (après DEC-02). Réserves :
tracé des risques sur la carte non éprouvé visuellement dans le navigateur intégré, mesure de la recherche
sur jeu pilote (R5).

**Décisions prises par le porteur le 3 octobre 2026 pour terminer R3** (ADR-024, ADR-025, ADR-026 ; à
confirmer par le référent SIG, le RSSI et la direction opérationnelle) :

- **MET-05** : registre unique de sections (Synthèse, Accès, Risques, Eau, Énergies, Moyens de secours,
  Plans, Contacts, Annexes, Photos). Synthèse, Accès, Risques, Eau et Contacts sont obligatoires ; les
  autres sont masquables par le SIS. Le réglage est figé dans la version soumise. Les écarts actuels sont
  corrigés (ordre, objets à risque, tablette). Les photos figurent en annexe du PDF, réduites depuis
  l'original contrôlé, avec plafond.
- **PER-01** : secteurs = groupes de sites, affectés aux tablettes (ou tout le SIS) et aux membres. Le
  catalogue signé est l'intersection des deux ; ce qui sort du périmètre est retiré au contact suivant,
  avec un motif.
- **PER-02** :
  - sites « restreints » réservés à une habilitation nominative, ouverts à la demande (jamais en masse),
    consultables 24 h, avec un code avant chaque ouverture ;
  - sites « élevés » en ligne seulement ;
  - consultations et exports tracés ;
  - côté tablette : 7 jours de consultation puis verrouillage sans effacement, verrouillage par code
    après 15 min d'inactivité, purge à la révocation inchangée.
- **CAR-01 à CAR-03** :
  - Plan IGN vectoriel en un fichier PMTiles par secteur (zoom 14 en général, 18 autour des sites) avec
    style, polices et pictogrammes ;
  - lecture locale par MapLibre après qualification sur la tablette ;
  - téléchargement en Wi-Fi, renouvellement semestriel, attribution visible ;
  - position de l'agent affichée, jamais transmise.

**Livré au Sprint 10 (5 octobre 2026) :** MET-05, PER-01 et PER-02 ([rapport](sprint-10-report.md),
ADR-025 et ADR-026 complétés). Reste dans R3 : CAR-01 à CAR-03, après la fiche de droits IGN et la
livraison de la tablette. Réserves :

- onglets d'administration des secteurs, des affectations, des habilitations et du journal non vus dans le
  navigateur (second facteur de démonstration), mais couverts par l'intégration ;
- durée, code et sites élevés à confirmer par le RSSI ;
- `MOBILE_MIN_APP_VERSION` à relever à 0.2.0 au déploiement.

**Acceptation :** toute exigence P0 partielle a un scénario démontré ; site sensible jamais exposé par
un contournement API/pack ; terminal limité à son périmètre ; retrait appliqué au prochain contact ;
carte, fiches et plans utilisables après démarrage à froid en mode avion sur la tablette choisie.

### R4 — sécurité, capacité et exploitation (à commencer dès R0/R1)

- [x] **SEC-01 — Antivirus :** brancher un moteur derrière `MalwareScanner`, refuser les verdicts infectés,
      garder en quarantaine en cas d’indisponibilité, prévoir reprise et supervision ; aucun `not_scanned`
      admis comme contrôle réussi dans le parcours destiné aux données réelles.
- [x] **SEC-02 — Identité :** imposer le second facteur côté API selon la politique des comptes enrôlés,
      récupération sécurisée, codes de secours, suspension/révocation de sessions et état des invitations/MFA visible.
- [x] **SEC-03 — Protection réseau :** limitation de débit login/invitations/enrôlement/uploads/API,
      CSP compatible avec les workers carte/PDF, politique CORS et traces des refus sensibles.
- [ ] **SEC-04 — Secrets et signatures :** stockage dans un gestionnaire de secrets ou KMS, séparation
      des clés API/worker, rotation testée avec chevauchement des clés publiques, procédure de compromission.
- [ ] **SEC-05 — Terminal :** verrouillage applicatif selon le parc, politique déconnexion/expiration,
      rotation/récupération de clé locale, test d’horloge manipulée et de tablette partagée. Attestation,
      détection root et épinglage de certificat à arbitrer par l’analyse de risques, pas à présumer obligatoires.
- [ ] **SEC-06 — Analyse de risques :** permissions, imports, cache, distribution, support exceptionnel
      limité dans le temps ; SAST/DAST, contrôle des dépendances et pentest avant pilote opérationnel.
- [ ] **CAP-01 — Volumétrie :** jeu représentatif de 10 000 sites et plusieurs centaines de milliers
      d’objets ; recherche, carte, RLS, publication, file de jobs, catalogue et transfert mesurés.
- [ ] **CAP-02 — Gros fichiers :** contrôle d’espace libre, réserve pour ancienne/nouvelle version,
      erreurs disque plein, limites mémoire, décodage des images et lecture des PDF ; optimiser les BLOB
      ou introduire un stockage chiffré alternatif seulement si les mesures le justifient.
- [x] **CAP-03 — Cycle des fichiers :** miniatures côté serveur, nettoyage des dépôts abandonnés,
      quarantaine et sorties de tentatives perdantes ; protection des références conservées et audit de purge.
- [ ] **EXP-01 — Environnements :** préproduction/prod distinctes, données fictives/anonymisées en recette,
      configuration obligatoire vérifiée, déploiement web/worker/base coordonné et procédure de retour arrière.
- [ ] **EXP-02 — Reprise :** sauvegardes chiffrées, restauration base + objets + configuration de clés,
      mesure RPO/RTO, répétition d’un parcours publié/restauré et vérification des empreintes.
- [ ] **EXP-03 — Supervision :** métriques de jobs en échec, délai de publication, erreurs de sync,
      espace/volumes, disponibilité et fraîcheur métier ; alertes, corrélation et procédures de diagnostic.
- [ ] **EXP-04 — Livraison mobile :** clé de signature Android dédiée, paquet release, distribution/MDM
      et mise à jour compatibles avec les anciens manifestes et migrations locales ; iOS selon DEC-01.
- [ ] **EXP-05 — Qualité de livraison :** tests E2E automatisés des parcours majeurs, migration depuis
      versions précédentes, échecs injectés, mise à jour OpenAPI ; client Dart généré ou contrôle renforcé
      de parité avec le contrat, sans migration technique gratuite si le bénéfice n’est pas démontré.
- [ ] **EXP-06 — Accompagnement :** identité et mentions des dépendances, guides utilisateur/admin,
      formation, support, dossier d’hébergement/réversibilité et cadre du pilote à valider par les responsables compétents.

**Livré au Sprint 9 (3 octobre 2026) :** SEC-02, SEC-03 et CAP-03 ([rapport](sprint-9-report.md), ADR-022,
ADR-023, complément de l’ADR-009). Réserves : droits du rôle des migrations sur le schéma `auth`, gabarit
« mot de passe oublié », plafonds et durée des sessions à reporter sur le projet hébergé ; adresse du client
connue seulement derrière un proxy de confiance (DEC-03).

**Acceptation :** aucune réserve critique de sécurité ouverte ; restauration démontrée ; installation
et mise à jour d’une release sur matériel cible ; tableaux et alertes utilisés pendant un incident simulé ;
charge et stockage compatibles avec le parc, sans perte de publication ni de signalement.

### R5 — recette et pilote SIS

- [ ] **PIL-01 — Données :** sélectionner 20 à 50 sites représentatifs et reconstruire 5 à 10 ETARE complets ;
      contrôler qualité, provenance, dates, contacts, plans et droits des documents avant diffusion.
- [ ] **PIL-02 — Utilisateurs :** mobiliser 3 à 6 prévisionnistes et 10 à 20 agents terrain, former,
      consigner les appareils et scénarios, recueillir les temps et erreurs.
- [ ] **PIL-03 — Terrain :** exercice sans couverture, véhicule/extérieur, lumière dégradée, usage tactile
      et gants selon équipement ; recherche, plans, coupures, PDF, photo et signalement.
- [ ] **PIL-04 — Pannes :** perte réseau à chaque étape, redémarrage/arrêt forcé, fichier altéré, manque
      d’espace, clé indisponible, migration interrompue, terminal révoqué/perdu et URL encore valide.
- [ ] **PIL-05 — Acceptation :** procès-verbal métier/DSI/RSSI/SIG, écarts restants avec propriétaire et
      décision, dossier de restauration/formation ; décider l’élargissement après mesure, pas après une seule démo.

| Indicateur du cadrage                       | Cible            | Preuve à produire                                                                                       |
| ------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------- |
| Ouverture d’une fiche synchronisée          | < 2 s            | Mesure en mode avion sur tablette identifiée                                                            |
| Recherche sur jeu pilote                    | < 2 s            | Jeu et requêtes documentés, critères de mesure définis                                                  |
| Création d’un site simple                   | < 20 min         | Chronométrage d’un prévisionniste formé                                                                 |
| Ajout d’un objet sur plan                   | < 30 s           | Test utilisateur avec enregistrement des erreurs                                                        |
| Risque critique depuis OPS                  | ≤ 3 interactions | Parcours chronométré/observé ; le tableau OPS-01 formule aussi « moins de 3 », à harmoniser avec le SIS |
| Disponibilité des sites affectés hors ligne | 100 %            | Démarrage à froid, coupure, contrôles des fichiers et documents essentiels                              |
| Traçabilité des publications                | 100 %            | De la contribution à la version installée, audit exportable/consultable                                 |
| Synchronisations sans erreur                | > 99 %           | Journal du pilote, période et dénominateur définis                                                      |

**Passage en production :** résultats acceptés, seuils définis pour les tests de charge, défauts critiques
résolus, droits IGN et responsabilités d’exploitation validés. La CI reste nécessaire à chaque livraison,
mais ne remplace pas ces preuves.

## 5. Matrice exhaustive des 44 exigences

Chaque ligne reste reliée au [suivi des preuves automatisées](suivi-exigences.md).
La colonne « suite » indique le lot qui ferme la réserve ; **R5 s’applique aussi aux lignes implémentées**.
Les exigences transverses hors de cette table sont couvertes par R0/R4 et la section interopérabilité.

| ID        | Priorité | Fonction                                 | État actuel | Suite / critère restant                                                                       |
| --------- | -------- | ---------------------------------------- | ----------- | --------------------------------------------------------------------------------------------- |
| SITE-01   | P0       | Site, géométrie, identifiants            | Implémenté  | R5 : création et audit avec données pilotes                                                   |
| SITE-02   | P0       | Bâtiments multiples                      | Implémenté  | R5 : plusieurs bâtiments, ordre/emprises cohérents                                            |
| SITE-03   | P0       | Classifications                          | Implémenté  | R5 : valeurs multiples, dates et historique                                                   |
| SITE-04   | P0       | Contacts et astreintes                   | Implémenté  | R5 : confidentialité et usage terrain                                                         |
| SITE-05   | P0       | Photos et documents versionnés           | Implémenté  | R5 : documents « à la demande » sur tablette réelle, volumes                                  |
| SITE-06   | P0       | Recherche texte/commune/catégorie/risque | Implémenté  | Sprint 8 (MET-01) ; mesure < 2 s sur jeu pilote en R5                                         |
| MAP-01    | P0       | Carte des sites et regroupement          | Implémenté  | R4 CAP-01, R5 : fluidité/filtrage sur jeu cible                                               |
| MAP-02    | P0       | Emprises et points opérationnels         | Implémenté  | R5 : zoom, filtres et ouverture des fiches                                                    |
| MAP-03    | P1       | Import GeoJSON/CSV                       | À faire     | R6 ; décision DEC-06 pour reprise initiale MVP                                                |
| MAP-04    | P1       | Mesure de distances                      | À faire     | R6 ; desktop/tablette, unités/projections explicites                                          |
| PLAN-01   | P0       | Fond PDF ou image                        | Implémenté  | R5 : rattachement, version et lisibilité                                                      |
| PLAN-02   | P0       | Points/lignes/surfaces, annulation       | Implémenté  | R3 MET-03 ; R5 : gestes et cohérence spatiale                                                 |
| PLAN-03   | P0       | Fiches d’objets typés                    | Implémenté  | R5 : champs métier et lecture offline                                                         |
| PLAN-04   | P0       | Calques activables                       | Implémenté  | R5 : terrain et lisibilité                                                                    |
| PLAN-05   | P0       | Photos attachées aux objets              | Implémenté  | Sprint 9 : miniatures (CAP-03) ; R5 : photo du même objet offline                             |
| PLAN-06   | P0       | Historique des fonds                     | Implémenté  | R5 : ancienne publication intacte après remplacement                                          |
| RISK-01   | P0       | Catalogue des risques SIS                | Implémenté  | R5 : catalogue national/propre au SIS et propriétés                                           |
| RISK-02   | P0       | Risques avec géométrie et portée         | Implémenté  | Sprint 8 (MET-02/03) ; carte sur la tablette en R3 CAR-02                                     |
| RISK-03   | P1       | Matières dangereuses et FDS              | À faire     | R6 : produit, quantité/unité, localisation, FDS                                               |
| ETARE-01  | P0       | Assemblage, aperçu, sections             | À qualifier | Sprint 10 (MET-05, ADR-026) ; R5 : dossiers longs et chargés en texte                         |
| ETARE-02  | P0       | PDF standardisé/versionné                | Implémenté  | R5 : relecture métier ; R1 pour lecture mobile                                                |
| ETARE-03  | P1       | Modèle ETARE par SIS                     | À faire     | R6 : logo, sections, couleurs, mentions et obligations                                        |
| ETARE-04  | P1       | Scénarios et consignes structurés        | À faire     | R6 : création, validation, PDF et OPS                                                         |
| WF-01     | P0       | Cycle de vie jusqu’à l’archive           | Implémenté  | Sprint 8 (MET-04, ADR-021) ; recette du retrait d’urgence en R5                               |
| WF-02     | P0       | Validation avant publication             | Implémenté  | R5 : séparation des tâches, aucun brouillon OPS                                               |
| WF-03     | P1       | Comparaison de versions                  | Partiel     | R6 : détail par champ/document, au-delà de l’élément                                          |
| WF-04     | P0       | Journal d’audit                          | Implémenté  | Sprint 9 : refus sensibles tracés (SEC-03) ; R5 : couverture des nouveaux parcours            |
| OPS-01    | P0       | Synthèse opérationnelle                  | À qualifier | R5 : critères d’interactions harmonisés et testés                                             |
| OPS-02    | P0       | Plans tactiles par niveau                | À qualifier | R5 : tablette physique, zoom/calques/fiches                                                   |
| OPS-03    | P0       | Recherche locale                         | À qualifier | R5 : nom/adresse/commune/n° ETARE, performance                                                |
| OPS-04    | P0       | Signalement avec photo hors ligne        | À qualifier | Livré (ADR-017) ; R5 : tablette physique, réseau dégradé, DEC-04 (GPS, file à la révocation)  |
| OPS-05    | P0       | Version et âge de la donnée              | Implémenté  | R5 : compréhension fraîcheur/validité métier                                                  |
| OFF-01    | P0       | Paquets signés, progression/taille       | Implémenté  | R5 : progression et taille sur tablette ; affectations → ADMIN-01/PER-01, carte → CAR-01 à 03 |
| OFF-02    | P0       | Synchronisation différentielle           | Implémenté  | DEC-08 : différentiel par fichier à faire accepter ; R5 : arrière-plan, panne/reprise         |
| OFF-03    | P0       | Stockage local chiffré                   | Implémenté  | R4 SEC-05/CAP-02 ; nouveaux PDF/signalements sans fichier en clair                            |
| OFF-04    | P0       | Révocation et purge au contact           | Implémenté  | DEC-04, R5 : latence et limites hors réseau acceptées                                         |
| OFF-05    | P1       | Rétention configurable par SIS           | À faire     | R6 ; distinguer conservation serveur et cache local                                           |
| PORTAL-01 | P0       | Invitation exploitant par site           | Implémenté  | Sprint 7 (ADR-019) ; R5 : recette avec un exploitant pilote                                   |
| PORTAL-02 | P0       | Proposition sans publication directe     | Implémenté  | Sprint 7 : conflit explicite, report manuel dans les données de travail                       |
| PORTAL-03 | P0       | Documents et photos exploitants          | Implémenté  | Sprint 7 : pièces contrôlées (antivirus), documents partagés par le SIS                       |
| ADMIN-01  | P0       | Rôles et périmètres                      | Implémenté  | Sprint 10 (PER-01, PER-02) ; R5 : recette avec un parc et des sites sensibles pilotes         |
| ADMIN-02  | P0       | Terminaux                                | Implémenté  | Sprint 9 : codes limités en débit (SEC-03) ; R4 SEC-05 ; R5 inventaire/enrôlement/révocation  |
| ADMIN-03  | P1       | Catalogues configurables                 | Partiel     | R6 : objets/icônes/champs/valeurs ; risques déjà livrés                                       |
| ADMIN-04  | P1       | Exports et rapports                      | Partiel     | R6 : CSV/rapports ; PDF déjà livré ; DEC-06                                                   |

## 6. Interopérabilité et extensions après le socle MVP

### Préparation des interfaces — périmètre §8 à confirmer avant clôture MVP

L’API REST versionnée, OpenAPI et des identifiants externes de sites existent. **Cela ne livre pas
encore toutes les interfaces demandées par le §8**, même si une intégration de production NexSIS reste hors MVP.

- [ ] **INT-01 :** authentification de systèmes tiers par client credentials, comptes techniques,
      périmètres, rotation et audit, distincts des sessions humaines.
- [ ] **INT-02 :** événements/webhooks site/ETARE publié, contribution et signalement créés,
      signature, livraison idempotente, temporisation, journal et reprise après erreur.
- [ ] **INT-03 :** mappings d’identifiants externes, notamment pour les objets, formats GeoJSON/CSV,
      validation et rapport d’import ; aligner ce lot avec DEC-06 et MAP-03/ADMIN-04.
- [ ] **INT-04 :** point d’entrée adresse/coordonnée vers un site (« incident/location »), contrôle
      d’accès et comportement en cas d’ambiguïté ; aucune dépendance au SGO dans le parcours autonome.

**Positionnement proposé :** figer les contrats et réaliser le minimum démontrable avant clôture MVP,
ou faire valider explicitement leur report. Ne pas les compter « faits » parce que l’API interne existe.
Les connecteurs de production restent en R7.

### R6 — MVP+ / V1.5

- [ ] Import GeoJSON/CSV avec prévisualisation, validation et erreurs par ligne (MAP-03).
- [ ] Mesure des distances sur carte ; calibration d’un plan à décider avant toute mesure en mètres (MAP-04).
- [ ] Matières dangereuses structurées et FDS rattachées, pas seulement un document nommé FDS (RISK-03).
- [ ] Modèles par SIS et règles de complétude, génériques et versionnés (ETARE-03).
- [ ] Scénarios et consignes structurés, cohérents dans l’aperçu, le PDF et OPS (ETARE-04).
- [ ] Comparaison détaillée objet/champ/document ; comparaison graphique selon retour pilote (WF-03).
- [ ] Rétention/périmètre configurable avec purge contrôlée et audit (OFF-05).
- [ ] Catalogue d’objets, icônes et propriétés configurables en complément des risques (ADMIN-03).
- [ ] Exports CSV et rapports autorisés/audités, utiles à la réversibilité (ADMIN-04).
- [ ] Selon valeur pilote : tableaux de qualité/fraîcheur métier, rappels de révision, DECI enrichie,
      partage inter-SIS explicitement autorisé et reprise documentaire avancée.

### R7 — V2 puis V3, lots à cadrer séparément

- SSO OIDC/SAML fédéré et MDM selon les besoins des SIS ; hébergement dédié si justifié.
- Connecteurs SIG/DECI/annuaires/SGO/NexSIS selon les interfaces effectivement disponibles.
- Qualification RRF : programme distinct, sans présenter la compatibilité Android comme une qualification.
- Import DWG/DXF via adaptateur, assistance IA à l’import dans le circuit de propositions et validation humaine.
- Évolutions du portail exploitant selon valeur mesurée ; partage inter-SIS, catalogues mutualisés et
  écosystème de connecteurs après définition des responsabilités et droits.
- Optimisations (delta binaires, tuiles métier, extraction de services) déclenchées par des mesures.

**Garde-fous conservés :** pas de SITAC temps réel, gestion d’engins/personnels, GMAO, registre de
conformité généraliste ni facturation exploitant ajoutés par opportunité. L’IA ne valide ni ne publie
automatiquement. Le modèle économique reste SIS payeur, exploitants contributeurs, paramétrage générique sans fork client.

## 7. Conditions de passage et suivi

| Passage                                  | Condition minimale                                                                              | Décision attendue                       |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------- |
| Démonstration actuelle → données réelles | Hébergement/accès acceptés, antivirus opérationnel, sauvegardes et politique de données         | Porteur + DSI/RSSI + métier             |
| Développement → recette terrain          | R1–R3 démontrés, réserve critique R4 levée, droits IGN et matériel définis                      | Référents Prévision/OPS, SIG, technique |
| Recette → pilote opérationnel            | Scénarios de panne, sécurité, charge, restauration et objectifs métier acceptés                 | Responsables SIS désignés               |
| Pilote → généralisation                  | Bilan mesuré, support/formation, distribution release, reprise de données et exploitation prêts | Porteur + SIS                           |

Après chaque lot :

1. Vérifier le critère de sortie avec ses tests et preuves matérielles si nécessaires.
2. Cocher seulement les tâches effectivement terminées ; garder les réserves visibles.
3. Mettre à jour cette roadmap, le suivi des exigences, les ADR concernés et le README.
4. Écrire un rapport daté avec commit, tests, limites et décision de passage.
5. Réestimer le lot suivant selon les retours ; toute nouvelle demande garde une priorité et un lien au cadrage.

**Prochaine tranche recommandée :** Sprint 11 — CAR-01 à CAR-03 (fonds IGN par secteur et carte locale), dès
la fiche de droits validée par le référent SIG et la tablette de référence livrée. En attendant, suite de
R4 : SEC-04 (secrets et rotation des clés de signature), CAP-01 (volumétrie de 10 000 sites, dont le coût des
périmètres) et EXP-03 (supervision).

## 8. Références

- [Cahier des charges MVP](reference/01_Cahier_des_charges_MVP_ETARE_numerique.pdf) : 44 exigences,
  parcours, objectifs de recette, pilote et trajectoire MVP/V1.5/V2/V3.
- [Modèle de données](reference/02_Modele_de_donnees_ETARE_numerique.pdf) : sites, publications,
  contributions, terminaux, synchronisation et audit.
- [Modèle économique](reference/03_Modele_economique_ETARE_numerique.pdf) : SIS payeur, pilote, reprise,
  support et personnalisation générique.
- [Maquette](reference/04_Maquette_produit_ETARE_numerique.pdf) : parcours Prévision/OPS/exploitant.
- [Architecture technique](reference/05_Architecture_technique_ETARE_numerique_IGN.pdf) : invariants,
  distribution/offline, IGN, sécurité, exploitation, tests et critères de passage (§32–33).
- [Suivi des exigences](suivi-exigences.md), [bilan actuel](bilan-depot-2026-10-01.md),
  [rapports de livraison](sprint-4-report.md) et [registre ADR](decisions/).
