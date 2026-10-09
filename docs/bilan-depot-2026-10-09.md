# Bilan du dépôt FireScape — 9 octobre 2026

**Référence examinée : `e38b1181783605136c26768053df256616ca3d48`.**
Le dépôt était propre au début de la revue. Depuis le [bilan du 1er octobre](bilan-depot-2026-10-01.md)
(`6d8170d`), **64 commits et neuf sprints supplémentaires, du 5 au 13**, ont été intégrés, puis les
outils de préproduction et de sauvegarde ont été ajoutés le 8 octobre. Le dépôt compte **44 migrations
et 31 décisions d’architecture**. La [roadmap](roadmap-developpement.md) reste le plan de travail courant.

## 1. Avis général

**FireScape reste aligné avec le projet et a franchi une étape importante : le socle fonctionnel du
MVP est largement implémenté, avec des outils d’exploitation désormais présents. La prochaine étape
est la qualification du pilote, pas une nouvelle reconstruction du socle.**

Le précédent bilan décrivait surtout une chaîne de publication et de consultation hors ligne.
Aujourd’hui, cette chaîne comprend aussi les signalements terrain, leur instruction, le portail
exploitant, les documents mobiles, les secteurs, les sites sensibles et la sécurité des terminaux.
L’antivirus, la gestion des clés, la supervision, la livraison Android et la restauration ont eux aussi
une implémentation et des preuves automatisées.

La distinction à conserver est celle entre **code livré**, **essais réussis** et **recette acceptée**.
Le dépôt ne permet pas encore d’attester une recette sur tablette physique, un fond IGN réel qualifié,
une restauration complète sur un nouveau projet hébergé, ni l’acceptation du pilote par un SIS.
L’état effectif des services hébergés n’a pas été contrôlé pendant cette revue : leur procédure de
déploiement est présente, ce qui ne prouve pas à elle seule leur mise en service.

## 2. Ce qui a changé depuis le 1er octobre

| Domaine                    | État lors du précédent bilan                        | État constaté aujourd’hui                                                                                                                                    |
| -------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Boucle terrain             | Consultation OPS, sans signalement                  | Signalement hors ligne avec photo, transmission sans doublon, instruction Prévision, décision et suivi jusqu’à la correction publiée — Sprints 5–6           |
| Documents mobiles          | PDF distribué mais sans lecteur                     | Lecteur PDF intégré, documents essentiels et à la demande, synchronisation Android en arrière-plan — Sprints 5–6                                             |
| Exploitants                | Portail absent                                      | Invitations limitées aux sites, consultation filtrée, contributions et pièces contrôlées, notifications transactionnelles — Sprint 7                         |
| Référentiel et cycle ETARE | Recherche par risque, zones et archivage incomplets | Recherche par risque/gravité, risques extérieurs sur le web, recalcul des zones, retrait motivé et archivage — Sprint 8                                      |
| Sécurité web et fichiers   | Plusieurs réserves bloquantes ouvertes              | ClamAV, second facteur et sessions contrôlés en base, récupération, limitation de débit, CSP, miniatures et purge — Sprints 5 et 9                           |
| Structure et périmètres    | Modèle fixe, secteurs et sites sensibles incomplets | Sections réglables, annexe photos PDF, groupes de sites, affectations des membres et tablettes, habilitations nominatives — Sprint 10                        |
| Carte OPS                  | Pas de carte hors ligne                             | Fond par secteur, distribution signée, carte locale avec sites et points ; fond synthétique utilisé tant que les droits IGN ne sont pas validés — Sprint 11  |
| Clés, suivi et capacité    | Industrialisation à construire                      | Racine hors ligne, rotation/révocation, fichier de secret ou OpenBao Transit, métriques et alertes, banc de 10 000 sites — Sprint 12                         |
| Terminal et gros fichiers  | Sécurité et capacité matérielle à renforcer         | Keystore Android, politique du SIS, contrôle d’horloge, reprise par morceaux, PDF par plages, contrôle d’espace, variantes Android signées — Sprint 13       |
| Exploitation               | Déploiement et sauvegardes à construire             | Kit VPS/Supabase managé, images Docker, procédure de déploiement/retour arrière, archive chiffrée externalisée et exercice de restauration en CI — 8 octobre |

Les quatre défauts de publication A à D identifiés le 30 septembre restent corrigés par `dd976d0` :
PDF immuable, cohérence de l’instantané, traitement des échecs définitifs et conversion WebP.
Ils ne constituent plus le backlog du projet.

## 3. Vérifications et portée des preuves

| Vérification                       | Résultat                                                                                            | Origine et limite                                                                                                           |
| ---------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`                       | Réussi : format, lint, types, **466 tests dans 73 fichiers**, contrat OpenAPI à jour                | Relancé localement le 9 octobre sur le commit examiné                                                                       |
| `flutter analyze`                  | Aucune anomalie                                                                                     | Relancé localement                                                                                                          |
| `flutter test --reporter expanded` | **298 tests réussis, 1 ignoré**                                                                     | Relancé localement ; ne constitue pas une recette matérielle                                                                |
| CI du dernier commit               | **5 travaux réussis** : TypeScript/build, base/intégration, Flutter, release Android, images Docker | [Exécution 37797000964 du 8 octobre](https://github.com/emifrog/cityscope/actions/runs/37797000964), commit exact `e38b118` |
| Base de données                    | **683 assertions pgTAP dans 36 fichiers** ; contrôle du schéma réussi                               | Journaux de cette CI, migrations et données fictives rejouées sur une base isolée                                           |
| Intégration                        | **154 tests dans 34 fichiers**                                                                      | Même CI ; notamment ClamAV et OpenBao Transit réels dans l’environnement de test                                            |
| Charge réduite                     | Banc réussi : **1 000 sites, 10 000 jobs, 5 secondes**                                              | Même CI ; contrôle de fonctionnement du banc, pas qualification de charge en production                                     |
| Sauvegarde/restauration            | Archive chiffrée restaurée, **33 objets de stockage**, contrôles de fidélité réussis                | Même CI ; environnement de test détruit puis reconstruit par l’exercice                                                     |
| APK et conteneurs                  | Release Android de préproduction et images web/worker/sauvegarde construites                        | Même CI ; signature Android avec une clé jetable de test                                                                    |
| Charge complète et gros fichiers   | Mesures documentées sur 10 000 sites et essais de reprise/PDF volumineux                            | [CAP-01](volumetrie/cap-01.md), [CAP-02](volumetrie/cap-02.md) ; mesures antérieures, non rejouées pendant cette revue      |

L’exercice de restauration de cette CI relève **quatre anomalies de contenu, identiques avant et
après restauration**. La fidélité de la copie est donc validée ; cela ne certifie pas la qualité métier
des données sources. Ce ne sont pas quatre nouvelles pertes produites par la restauration.

Les tests SQL/intégration et l’exercice de restauration n’ont pas été relancés sur la base locale afin
de préserver son état. Les preuves correspondantes viennent de la CI du commit examiné. Aucun parcours
visuel complet, essai physique, contrôle du serveur hébergé ni audit d’intrusion n’a été réalisé dans
cette revue. Les rapports de sprint apportent des preuves sur navigateur et émulateur, avec leurs limites.

## 4. Alignement avec le cadrage

Les choix structurants restent cohérents avec les documents de référence : le SIS conserve l’autorité
de publication ; l’exploitant et le terrain contribuent sans publier directement ; les versions
publiées sont immuables ; les tablettes consultent des données signées et chiffrées sans réseau ; les
périmètres des SIS, membres et terminaux sont contrôlés ; les opérations sensibles sont tracées.
Le produit reste centré sur la connaissance opérationnelle, sans dérive vers la gestion d’engins ou
la conduite d’intervention en temps réel. L’identité FireScape ne change pas ce périmètre.

La matrice actuelle des **44 exigences fonctionnelles** se répartit ainsi :

| Priorité  | Implémenté | À qualifier | Partiel | À faire | Total |
| --------- | ---------- | ----------- | ------- | ------- | ----- |
| P0 — MVP  | 30         | 5           | 0       | 0       | 35    |
| P1 — MVP+ | 0          | 0           | 3       | 6       | 9     |

Ces nombres décrivent les **états de la roadmap**, pas un pourcentage de livraison ni une réception.
Les cinq P0 explicitement « à qualifier » sont **ETARE-01 et OPS-01 à OPS-04**. La recette R5 s’applique
aussi aux trente P0 « implémentés ». Les obligations transverses de sécurité, d’exploitation, de
cartographie et d’interopérabilité ne disparaissent pas parce qu’aucune ligne P0 n’est « à faire ».

Les écarts à garder visibles sont les suivants :

- **Cartographie :** le chemin technique hors ligne est livré, mais le fond d’essai ne vaut pas un
  fond IGN réel. La fiche de droits, la préparation d’un secteur réel et les mesures restent nécessaires.
  Les risques extérieurs ne sont pas encore dessinés sur la carte OPS, contrairement au web.
- **Interfaces du §8 :** OpenAPI et une API interne versionnée existent ; les comptes techniques
  `client credentials`, webhooks, mappings/imports et point d’entrée incident/localisation ne sont pas
  tous livrés. Leur minimum MVP ou leur report doit être décidé explicitement (INT-01 à INT-04).
- **Interprétations à accepter :** différentiel par fichier plutôt que par objet (DEC-08), nombre
  d’interactions vers le risque critique (DEC-09), reprise CSV au pilote malgré son classement P1
  (DEC-06), règles de révocation et devenir des signalements non transmis (DEC-04).
- **MVP+ :** import GeoJSON/CSV, mesures, matières dangereuses/FDS structurées, modèles par SIS,
  scénarios/consignes et rétention configurable restent à faire. Comparaison détaillée de versions,
  catalogues d’objets et exports/rapports sont partiels. Ces neuf exigences restent en R6.

## 5. Réserves qui conditionnent le pilote

### 5.1 Tablette et fond de carte réels

La roadmap retient l’Alldocube iPlay 40H comme matériel de référence. Les preuves disponibles portent
sur un émulateur Android ; le dépôt ne contient pas encore de procès-verbal équivalent sur ce matériel.
Il faut éprouver une **release signée** : installation et mise à jour, démarrage à froid en mode avion,
recherche et plans, PDF, signalement avec photo, coupure/reprise, manque d’espace, travail en
arrière-plan, révocation, sites sensibles et rotation des clés.

Les optimisations de CAP-02 sont réelles mais leur portée doit rester précise : les téléchargements
sont découpés et les PDF peuvent être lus par plages. Les images comprimées restent chargées avant
leur décodage borné ; les paquets sensibles sont encore traités en entier ; les parties de fond de
carte sont vérifiées par blocs pouvant atteindre 32 Mio. La mémoire et le stockage doivent donc être
mesurés sur la tablette, avec un fond réel et des données représentatives.

### 5.2 Préproduction, restauration et retour arrière

Le [kit de préproduction](../infra/preprod/README.md) documente le VPS Hostinger, Supabase managé,
Caddy, ClamAV, le domaine `firescape.fr`, l’envoi transactionnel et les sauvegardes externalisées.
La préparation Ubuntu 26.04 est rapportée comme éprouvée le 8 octobre. Cela apporte un chemin de
déploiement concret ; la disponibilité actuelle du service complet reste **non vérifiée par ce bilan**.
La production et l’usage de données réelles restent soumis à DEC-03.

EXP-01 doit être fermé par un parcours sur l’environnement hébergé : connexion/second facteur,
téléversement/antivirus, publication/PDF par le worker, e-mail, synchronisation d’une tablette,
métriques et alerte reçue. Le retour à un ancien commit n’est possible que si son code reste compatible
avec le schéma déjà migré ; ce n’est pas un retour automatique de la base à son état précédent.

EXP-02 possède désormais une [procédure](exploitation/sauvegarde-restauration.md), un outil et un
exercice automatisé. Il reste à restaurer une archive externalisée vers **un nouveau projet hébergé**,
avec base, objets, configuration, clés, authentification puis ouverture et nouvelle publication d’un
ETARE. Les sessions ne sont pas restaurées ; la portabilité des facteurs d’authentification et la
reconnexion doivent être vérifiées. Si OpenBao est retenu, sa propre sauvegarde et sa reprise doivent
être couvertes en plus des fichiers de configuration de FireScape.

Une sauvegarde nocturne fournit une cible de perte de données de l’ordre de **24 heures plus la durée
de la sauvegarde**, tant que chaque exécution réussit ; une panne de sauvegarde allonge cette fenêtre.
Le délai de reprise réel comprend la recréation du projet, les migrations, les clés, la configuration
et le redéploiement. Les quelques secondes de restauration en CI ne sont donc pas un RTO hébergé.
Ces objectifs, leur surveillance et la conservation sont à accepter dans DEC-07.

### 5.3 Clés, sécurité et supervision

Les mécanismes sont présents, mais la première cérémonie des clés doit produire les clés de racine,
de secours, de signature Android et de déchiffrement des archives, avec garde et procédure de reprise.
La clé jetable utilisée par la CI ne remplit pas cette fonction. Le mode de distribution des APK et
la place d’iOS au pilote restent à décider.

Les politiques du SIS concernant les sites sensibles, l’expiration hors ligne et les tablettes
partagées doivent être acceptées par les responsables métier et sécurité. SEC-06 reste ouvert :
analyse de risques, dépendances, contrôles de sécurité et audit d’intrusion adaptés au pilote.
Le choix de ne pas imposer root detection, attestation ou épinglage est documenté dans l’ADR-029 ;
il faut le faire examiner dans cette analyse, sans ajouter ces fonctions automatiquement.

Les métriques et règles d’alerte sont livrées. Leur collecte, l’acheminement des alertes, les personnes
qui les reçoivent et les procédures d’intervention doivent encore être éprouvés sur l’hébergement.
Cela inclut l’absence de sauvegarde, les signatures antivirus périmées et les travaux bloqués.

### 5.4 Recette et accompagnement

Les résultats de CAP-01 sont encourageants mais proviennent d’un poste de développement. La latence
entre les services hébergés, la charge simultanée, les transferts vers le parc et les objectifs métier
doivent être mesurés dans l’environnement cible. Les tests E2E des principaux parcours et les essais
de migration restent à compléter (EXP-05).

Il manque enfin la preuve de recette sur 20 à 50 sites représentatifs, les utilisateurs pilotes,
les guides et la formation, le support, puis un procès-verbal avec écarts acceptés et responsabilités
identifiées (EXP-06, PIL-01 à PIL-05). Ces livrables ferment le MVP au même titre que le code.

## 6. Ordre de travail recommandé

| Ordre | Travail                                                                          | Preuve de fin attendue                                                                                                   |
| ----- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1     | Terminer ou constater la mise en service du kit EXP-01 avec des données fictives | Version déployée identifiée et parcours web → worker → tablette → e-mail réussi sur l’hébergement                        |
| 2     | Organiser les clés et tester EXP-02 sur un projet hébergé vierge                 | Archive externalisée déchiffrable, restauration fidèle, reconnexion et ETARE utilisable, temps de reprise complet mesuré |
| 3     | Valider la fiche IGN et qualifier la tablette en release                         | Secteur réel, mesures mémoire/disque/réseau, scénarios hors ligne et mise à jour Android consignés                       |
| 4     | Fermer les arbitrages métier, interfaces et sécurité                             | DEC-03/06/07/08/09 et politiques sensibles acceptés ; minimum INT-01 à INT-04 défini ; SEC-06 traité                     |
| 5     | Renforcer la recette automatisée et tester l’exploitation                        | Parcours E2E, migration/retour arrière compatibles, charge hébergée, panne et alerte réellement reçue                    |
| 6     | Préparer puis conduire le pilote SIS                                             | Sites et utilisateurs choisis, guides, formation, indicateurs, procès-verbal et décision d’ouverture                     |
| 7     | Prioriser le MVP+ avec les retours du pilote                                     | Lots R6 ordonnés par besoin observé ; pas de pourcentage ou de date artificiels                                          |

Les travaux 2 à 4 peuvent être préparés pendant la mise en service. Le dépôt ne justifie plus de
recommander de « développer les signalements », « créer le portail » ou « ajouter les sauvegardes » :
ces bases existent. Les prochaines tâches doivent porter sur leurs réserves précises et leurs preuves
d’exploitation.

## 7. Documentation et méthode de revue

Cette revue croise les documents de cadrage, l’historique Git, les rapports des Sprints 5 à 13, la
roadmap, le suivi des exigences, des points ciblés du code et de la configuration, les tests locaux et
les journaux de la CI du commit examiné. Elle n’est pas une relecture exhaustive de chaque ligne.
Le prompt initial du Sprint 0 est une référence historique, pas un ordre de relancer ce sprint.

Le README, la roadmap et le suivi des exigences ont été actualisés avec ce bilan : lien vers la revue
du 9 octobre, chiffres vérifiés, outils EXP-01/02 désormais livrés, réserves encore ouvertes, annexe
photos effectivement présente dans le PDF et portée exacte de la lecture des gros fichiers. Les bilans
antérieurs conservent leurs constats datés et renvoient à l’état courant.

Points d’entrée utiles :

- [Roadmap et matrice des 44 exigences](roadmap-developpement.md), [preuves par exigence](suivi-exigences.md).
- [Cadrage MVP](reference/01_Cahier_des_charges_MVP_ETARE_numerique.pdf),
  [architecture cible](reference/05_Architecture_technique_ETARE_numerique_IGN.pdf), [ADR](decisions/).
- [Rapport Sprint 13](sprint-13-report.md), [sécurité](security.md),
  [livraison Android](exploitation/livraison-mobile.md), [supervision](exploitation/supervision.md).
- [Déploiement préproduction](../infra/preprod/README.md),
  [sauvegarde/restauration](exploitation/sauvegarde-restauration.md),
  [ADR-031](decisions/ADR-031-sauvegarde-restauration.md).
