# Présentation de FireScape

Fonctions et déploiement du projet

**Édition du 9 octobre 2026 • Version documentaire 1.0**

FireScape permet aux services d’incendie et de secours de préparer, valider et diffuser la connaissance opérationnelle des bâtiments et sites à risques. Les équipes terrain consultent les dossiers ETARE publiés sur tablette Android, y compris sans réseau, puis signalent les écarts constatés. Les exploitants contribuent aux mises à jour sous le contrôle du SIS.

Ce document présente le produit aux responsables de SIS, aux services Prévision et Opérations, aux référents numériques et aux partenaires du projet. Il décrit les fonctions livrées, les responsabilités de chacun et les conditions de mise en service. Le socle fonctionnel est développé ; sa qualification sur le matériel et dans l’environnement du pilote reste à achever.

## 1 La finalité du produit et ses utilisateurs

### Une connaissance structurée et maintenue

Un dossier opérationnel doit rester utilisable lorsque la situation change ou que le réseau manque. FireScape rassemble l’identité du site, ses bâtiments, ses niveaux, les accès, les ressources en eau, les énergies, les risques, les contacts et les documents dans un même référentiel. Les plans sont reliés à ces informations plutôt que conservés comme de simples fichiers isolés.

La valeur recherchée est concrète : faciliter la préparation d’un ETARE, rendre sa mise à jour traçable et donner au terrain une version identifiée. Ces bénéfices doivent être mesurés pendant le pilote ; aucun gain de temps ou résultat opérationnel n’est garanti à ce stade.

### Des espaces adaptés aux responsabilités

| Public                      | Usage principal                                                       | Espace utilisé                          |
| --------------------------- | --------------------------------------------------------------------- | --------------------------------------- |
| Prévision                   | Préparer les sites, les plans et les dossiers ; instruire les retours | Application web                         |
| Validateur                  | Contrôler une révision et décider de sa publication                   | Application web                         |
| Intervenant OPS             | Consulter les versions publiées et signaler un écart                  | Application Android                     |
| Exploitant                  | Consulter les informations partagées et proposer une mise à jour      | Portail web dédié                       |
| Administrateur SIS          | Gérer les membres, secteurs, terminaux et paramètres                  | Administration web                      |
| Référents SIG et numériques | Préparer la cartographie, l’hébergement et l’exploitation             | Administration et procédures techniques |

Les fonctions accessibles dépendent des rôles et des périmètres attribués. Un administrateur SIS ne dispose pas automatiquement du droit de valider ou de publier. Le rôle technique d’administration de plateforme ne donne pas, à lui seul, accès aux données métier.

### Un périmètre centré sur les ETARE

FireScape accompagne la préparation et la consultation de la connaissance opérationnelle. La conduite d’intervention en temps réel, la gestion des engins ou des effectifs et la maintenance des bâtiments ne font pas partie du périmètre actuel. Les interfaces futures avec d’autres systèmes doivent préserver l’utilisation autonome du produit.

## 2 Le parcours de la donnée et les responsabilités

### Du travail préparatoire à la tablette

1. La Prévision crée ou met à jour les données du site, ses plans, ses objets et ses documents.
2. Elle prépare une révision ETARE et examine les contrôles de complétude et de cohérence.
3. La soumission fige le contenu proposé et son résumé de changements.
4. Un validateur qui n’a pas contribué à cette révision la contrôle avec une double authentification.
5. La publication produit une version immuable, son PDF et les fichiers nécessaires à la consultation.
6. Les tablettes autorisées vérifient puis installent la version. Elles la conservent pour la consultation sans réseau.
7. Les retours terrain et exploitant alimentent une nouvelle révision après instruction.

### Trois états à bien distinguer

| État               | Qui le consulte                     | Ce qu’il signifie                                                    |
| ------------------ | ----------------------------------- | -------------------------------------------------------------------- |
| Données de travail | Personnes autorisées dans le SIS    | Informations modifiables, pas encore une nouvelle version officielle |
| Révision soumise   | Prévision et validation autorisées  | Contenu figé pour une décision précise                               |
| Version publiée    | Utilisateurs et terminaux autorisés | Référence diffusée jusqu’à remplacement ou retrait                   |

Une modification du référentiel ne remplace donc pas immédiatement le dossier installé sur une tablette. Elle doit suivre le circuit de validation et de publication, puis être synchronisée. L’historique permet de retrouver ce qui a été diffusé et les décisions associées.

### Une contribution ne vaut pas publication

L’intervenant constate et signale ; l’exploitant propose ; la Prévision vérifie et prépare ; le validateur décide. Cette séparation conserve au SIS l’autorité sur l’information opérationnelle.

Le retrait d’une version est une action motivée. Il est transmis aux tablettes lors de leur prochain contact. Une tablette entièrement hors réseau ne peut pas recevoir immédiatement une décision prise sur le serveur : les durées d’autorisation locale encadrent cette limite.

## 3 Le référentiel des sites et les plans

### Un dossier commun pour chaque site

La fiche d’un site rassemble son nom, son adresse, sa localisation, son numéro ETARE, son type et sa sensibilité. Elle accueille plusieurs bâtiments et niveaux, différents classements, des contacts et des documents versionnés. Les onglets séparent la synthèse, la localisation, les bâtiments et niveaux, les plans, les classifications, les contacts, les documents et l’ETARE.

Les listes et la carte facilitent la recherche par texte, commune, type de site et risque. Les filtres par type de risque et gravité permettent de cibler les sites concernés. Les emprises et les points opérationnels donnent un contexte géographique au dossier.

### Des plans enrichis par des éléments métier

Les fonds de plans PDF ou image sont versionnés. Des points, lignes, surfaces, zones et risques peuvent y être placés. Les objets disposent d’une fiche adaptée à leur type : accès, eau, énergie, sécurité incendie, désenfumage, circulations, mise à l’abri ou autre catégorie du catalogue.

Les calques permettent de choisir les familles visibles. Les photos et légendes apportent des repères complémentaires sur un équipement ou un accès. Lorsqu’une zone change, les rattachements des éléments sont recalculés ; les incohérences qui subsistent doivent être traitées avant soumission.

Remplacer un fond de plan conserve l’ancienne version. La position des objets doit être vérifiée sur le nouveau fond : une translation automatique ne suffit pas à garantir leur emplacement. Cette vérification fait partie du travail de mise à jour.

### Documents et risques

Les fichiers déposés sont contrôlés avant consultation, notamment par antivirus. Les documents peuvent être toujours embarqués, téléchargés à la demande ou exclus de la consultation hors ligne. Le SIS choisit séparément les documents partagés avec l’exploitant.

Les risques peuvent être représentés sur un plan ou sur la carte web du site. La carte mobile affiche les sites et les points opérationnels ; le dessin des risques extérieurs sur cette carte reste à compléter. La mesure de distance, l’import GeoJSON ou CSV et la gestion structurée des matières dangereuses avec leurs FDS appartiennent aux extensions prévues.

## 4 La préparation et la publication des ETARE

### Une composition commune et réglable

L’ETARE organise les informations en sections : synthèse, accès, risques, eau, énergies, moyens de secours, plans, contacts, annexes et photos. Certaines sections constituent le socle obligatoire ; d’autres peuvent être masquées selon le réglage du SIS. Le choix des sections est figé dans la révision soumise.

L’aperçu sert à relire le dossier avant soumission. Le PDF reprend la version publiée, ses plans et une annexe de photos avec légendes, dans les limites prévues pour sa fabrication. La personnalisation complète du modèle, de l’ordre et de l’identité graphique par SIS relève encore du MVP+.

### Une décision portant sur un contenu précis

La Prévision fournit un résumé des changements. Le validateur dispose du contenu figé, de l’origine de la révision et d’une comparaison avec la version précédente. Il peut demander une correction motivée ou valider et publier. Une personne ayant contribué à la révision doit faire intervenir un autre validateur.

Les contrôles préalables signalent les points conformes, à vérifier ou bloquants. Ils complètent la relecture métier sans la remplacer. Une information présente peut rester inexacte sur le terrain ; les responsabilités de vérification et de révision périodique doivent donc être définies par le SIS.

### Une fabrication suivie

La génération du PDF et des paquets est asynchrone. Une révision validée peut être en cours de fabrication avant que sa publication soit disponible. En cas d’échec, l’état et la possibilité de relance sont visibles aux personnes autorisées ; la version précédente reste la référence active lorsqu’elle existe.

Les anciennes publications sont conservées dans l’historique. Une nouvelle version ne réécrit pas le contenu de l’ancienne. Un retrait motivé interrompt la diffusion ; l’archivage du site intervient lorsque le dossier ne possède plus de publication en vigueur ni de traitement bloquant. Restaurer le site autorise une nouvelle préparation mais ne republie pas automatiquement son ancien dossier.

## 5 La consultation sur le terrain

### Préparer puis utiliser hors ligne

L’application Android est destinée aux terminaux enrôlés par le SIS. La tablette est associée à un périmètre ; les sites reçus dépendent également des droits de l’agent connecté. Une première connexion, l’enrôlement et la synchronisation nécessitent du réseau.

Une fois installées et autorisées, les données se consultent localement : recherche d’un site, synthèse, risques, accès, eau, coupures, contacts, plans tactiles, fiches d’objets, photos et PDF. Le numéro de version, la date de publication et l’état de synchronisation aident l’agent à comprendre ce qu’il consulte.

### Des transferts adaptés aux coupures

Les paquets et leurs fichiers sont vérifiés avant activation. Les fichiers inchangés peuvent être réutilisés ; les téléchargements volumineux reprennent par morceaux après une interruption. L’ancienne version utilisable est conservée jusqu’à l’installation complète de la suivante. L’espace libre est contrôlé avant téléchargement.

Les documents « à la demande » doivent être téléchargés avant de perdre le réseau. La synchronisation peut aussi se déclencher en arrière-plan sous Android, selon les contraintes du réseau, du système et du SIS. Elle ne dispense pas de vérifier manuellement l’état de la tablette avant son utilisation terrain.

### Cartographie et sites sensibles

Un fond local est préparé et distribué par secteur. La carte présente les sites installés et certains points opérationnels ; la position de l’utilisateur peut être affichée à sa demande, sans être transmise au serveur. Le chemin technique est livré, mais le fond IGN réel attend la validation de sa fiche de droits. Les essais actuels utilisent un fond synthétique.

Les sites de sensibilité restreinte exigent une habilitation nominative. Ils s’ouvrent à la demande, avec un code personnel et une durée limitée, actuellement de 24 heures. Les sites de sensibilité élevée restent consultables en ligne dans les espaces autorisés et ne sont pas distribués aux tablettes. Ces règles et les paramètres de verrouillage sont à confirmer dans la politique du SIS pilote.

## 6 Les signalements et les contributions exploitant

### Une boucle de correction depuis le terrain

L’agent signale un écart depuis un site, une fiche ou une position sur un plan. Il choisit une catégorie et une importance, décrit le constat et peut joindre des photos. Le signalement conserve la référence de la publication consultée. Il est enregistré dans une file chiffrée sur la tablette puis envoyé lorsque les conditions le permettent.

La Prévision le prend en charge, confronte le constat aux données actuelles et prépare une correction. La décision est motivée et visible par l’agent après synchronisation. Le statut « traité » correspond à une décision documentée ; la correction n’est effective dans le dossier diffusé qu’après validation, publication et installation de la nouvelle version.

### Un portail limité aux sites confiés

L’exploitant reçoit une invitation à durée limitée portant sur un ou plusieurs sites. Après connexion et, selon la politique du SIS, double authentification, il consulte une vue filtrée de la version publiée. Le portail présente l’identité, les contacts autorisés, la liste des plans et les documents explicitement partagés.

Le contenu opérationnel des plans n’est pas ouvert par le simple affichage de leur liste. L’exploitant peut proposer un contact corrigé, un nouveau document, un plan à remplacer ou une autre information utile. Les pièces jointes passent par les contrôles de fichiers. Il peut suivre ses propositions et répondre aux demandes de précision.

### Un traitement maîtrisé par la Prévision

La Prévision compare les valeurs proposées, l’état publié à l’origine de la demande et les données actuelles. Si elles ont changé entre-temps, le conflit doit être résolu explicitement. Le report de la proposition dans les données de travail reste contrôlé par l’instructeur ; l’acceptation ne déclenche pas une modification automatique sans relecture.

Des notifications transactionnelles accompagnent les invitations, les questions et les décisions. Leur envoi et les erreurs éventuelles sont suivis dans l’administration. Le service d’envoi doit être configuré et testé dans l’environnement de mise en service.

## 7 Les accès et la protection des données

### Des droits associés aux personnes et au territoire

Chaque SIS dispose de son périmètre de données. Les rôles déterminent les actions possibles ; les secteurs et habilitations restreignent les sites accessibles. Les tablettes reçoivent l’intersection entre leur affectation et le périmètre de l’utilisateur. Les exploitants n’accèdent qu’aux sites qui leur sont ouverts.

L’administration ne permet pas à une personne de modifier ses propres habilitations. Un SIS conserve au moins un administrateur actif. Les décisions de publication, l’administration et d’autres actions sensibles requièrent une double authentification. La suspension d’un membre ferme ses sessions serveur.

### Une protection adaptée aux données embarquées

Les données locales sont chiffrées et la clé de la tablette est conservée par le mécanisme de sécurité Android. Le terminal vérifie les signatures des contenus et des autorisations. Les clés peuvent être renouvelées ou révoquées selon les procédures prévues.

Le SIS règle les durées de connexion, le verrouillage et les captures d’écran. Une modification de l’horloge ne doit pas prolonger artificiellement l’autorisation. La révocation interdit immédiatement les échanges serveur et provoque la purge locale au prochain contact ; hors réseau, l’expiration locale demeure la limite applicable.

### Des actions traçables et des fichiers contrôlés

Les changements et décisions sensibles alimentent un journal d’audit. Les consultations des sites sensibles disposent d’un suivi dédié. Les fichiers restent indisponibles tant que leur contrôle n’est pas satisfaisant ; l’indisponibilité de l’antivirus ne doit pas être assimilée à un résultat favorable.

Ces mécanismes sont implémentés et testés, mais ne constituent pas une homologation. L’analyse de risques, les paramètres de session, la politique des terminaux, la gestion des clés et les responsabilités de support doivent être validés avec les responsables du pilote. La qualification RRF et les intégrations d’identité ou de gestion de parc avancées sont des chantiers distincts.

## 8 Le déploiement et son exploitation

### Une plateforme centrale et une application locale

L’architecture associe une application web, une API, une base de données géographique, un stockage de fichiers et un service de traitement asynchrone. Ce dernier contrôle les fichiers et prépare notamment les PDF et contenus distribués. La tablette conserve une copie locale des publications qui lui sont autorisées.

Le socle technique utilise Next.js et TypeScript pour le web et les services, PostgreSQL et PostGIS avec Supabase pour les données et services associés, Flutter pour Android et MapLibre pour les cartes. Ces choix permettent de partager des règles communes et des contrats d’interface ; ils ne rendent pas les connecteurs externes automatiquement disponibles.

### Une préproduction préparée

Le kit actuel décrit un serveur VPS pour le web, le traitement des fichiers, l’antivirus et HTTPS, associé à un projet Supabase managé. Il prévoit des configurations distinctes, des contrôles de démarrage et un déploiement identifiable. Les variantes Android FireScape et FireScape préprod possèdent des installations et données séparées.

Le choix documenté pour les données fictives est un VPS Hostinger en France, une base Supabase en Irlande et des services Scaleway pour la messagerie et les archives. L’hébergement de production, les responsabilités et l’usage de données réelles restent à décider avec le SIS. L’adresse de connexion doit être communiquée par l’administrateur ; l’existence du domaine ne prouve pas la disponibilité du service.

### Sauvegarder et savoir reprendre

Les outils sauvegardent les données, les objets et la configuration dans une archive chiffrée externalisée. Les clés privées de déchiffrement sont gardées hors du serveur. La restauration contrôle la compatibilité des migrations et la fidélité des fichiers. Un exercice de restauration passe en intégration continue.

La mise en service doit encore prouver une restauration sur un projet hébergé vierge, suivie d’une reconnexion et d’un parcours ETARE. Les délais de reprise et la perte de données acceptable doivent être mesurés puis acceptés. Les métriques et alertes doivent être raccordées à une collecte et à des personnes chargées d’intervenir.

## 9 Le niveau de réalisation et les limites actuelles

### Une progression établie au 9 octobre 2026

Le développement est arrivé au Sprint 13, complété par les outils de préproduction et de sauvegarde. La matrice du projet comporte 44 exigences fonctionnelles. Elle recense 30 exigences prioritaires implémentées et 5 à qualifier ; les 9 exigences de l’étape suivante sont encore partielles ou à réaliser. Ce classement décrit le code et ses preuves, pas une réception par un SIS.

| Domaine                          | État du développement                  | Validation restante                         |
| -------------------------------- | -------------------------------------- | ------------------------------------------- |
| Référentiel et publication ETARE | Implémentés                            | Relecture métier et dossiers représentatifs |
| Terrain et signalements          | Implémentés et essayés sur émulateur   | Tablette physique et réseau dégradé         |
| Portail exploitant               | Implémenté                             | Essai avec des exploitants pilotes          |
| Carte hors ligne                 | Fonctionne avec un fond d’essai        | Droits IGN et secteur réel                  |
| Sécurité et gestion des clés     | Mécanismes présents                    | Cérémonie des clés et analyse de risques    |
| Déploiement et restauration      | Outils et exercice automatisé présents | Mise en service et reprise hébergée         |

Les contrôles du commit examiné sont réussis : 466 tests web et serveur et 298 tests Flutter relancés localement ; 683 assertions SQL et 154 tests d’intégration dans la chaîne automatisée. Celle-ci vérifie aussi la construction Android et les images des services. Ces nombres attestent des vérifications effectuées ; ils ne mesurent pas à eux seuls la qualité d’usage.

Les essais sur 10 000 sites et les gros fichiers apportent de premières mesures. Ils doivent être reproduits dans l’environnement cible et sur l’application Android de livraison. La validation de la disponibilité réelle du service hébergé reste également à établir.

### Les extensions encore prévues

Imports GeoJSON/CSV, mesures de distance, matières dangereuses structurées, modèles ETARE par SIS, scénarios et consignes, comparaison détaillée, rétention configurable, catalogues d’objets et exports enrichis constituent le MVP+. Les comptes techniques, webhooks et interfaces de localisation doivent être cadrés avant clôture du MVP ou faire l’objet d’un report explicite. Les connecteurs de production et la qualification RRF ne sont pas annoncés comme livrés.

## 10 La préparation du pilote et le modèle de service

### Un pilote organisé autour des usages

Le cadrage propose 20 à 50 sites représentatifs, dont 5 à 10 ETARE complets, avec des prévisionnistes et des agents terrain identifiés. Le parcours doit être essayé depuis la création jusqu’à la correction d’un écart, en incluant publication, consultation sans réseau, retour terrain et contribution exploitant.

Avant l’exercice, les responsables définissent le matériel, les secteurs, les règles applicables aux données sensibles, les contacts de support et les critères de réussite. Les essais doivent inclure les coupures réseau, le redémarrage, l’espace insuffisant, une mise à jour, la révocation d’un terminal et une restauration. Le résultat attendu est un procès-verbal avec les écarts et les décisions de passage.

| Indicateur proposé dans le cadrage    | Cible à vérifier pendant le pilote                         |
| ------------------------------------- | ---------------------------------------------------------- |
| Ouverture d’une fiche synchronisée    | Moins de 2 secondes sur le matériel retenu                 |
| Recherche d’un site                   | Moins de 2 secondes sur le jeu pilote                      |
| Création d’un site simple             | Moins de 20 minutes par une personne formée                |
| Ajout d’un objet sur plan             | Moins de 30 secondes dans le scénario retenu               |
| Données des sites affectés hors ligne | Tous les dossiers prévus disponibles après synchronisation |
| Synchronisations sans erreur          | Plus de 99 pour cent sur une période et un volume définis  |

Ces valeurs sont des objectifs de recette, pas des performances contractuellement acquises. Le nombre d’interactions pour atteindre un risque critique reste à harmoniser avec le SIS.

### Le modèle de service envisagé

Le cadrage économique retient le SIS comme client principal, avec un abonnement de service et un accompagnement de mise en place. Les intervenants ne sont pas facturés individuellement ; le portail contributif exploitant est prévu sans facturation dédiée dans le MVP.

La reprise des données, le paramétrage, la formation, les connecteurs et les niveaux de support constituent des prestations à définir. Les tarifs présents dans le cadrage initial sont des hypothèses de travail ; aucune offre commerciale ni garantie de disponibilité n’est arrêtée par cette présentation. L’objectif est un produit configurable commun aux SIS, sans version spécifique divergente pour chaque client.

## 11 Les prochaines étapes et les ressources

### La séquence de mise en service

1. Terminer ou constater le fonctionnement complet de la préproduction avec des données fictives.
2. Organiser la garde des clés et réussir une restauration sur un environnement hébergé vierge.
3. Valider les droits du fond IGN et les essais sur tablette physique avec une version Android signée.
4. Fermer les arbitrages de sécurité, de périmètre et d’interopérabilité.
5. Former les utilisateurs puis réaliser le pilote avec des critères mesurés.
6. Prioriser les extensions à partir du bilan du pilote.

### Quelques termes communs

| Terme       | Signification dans FireScape                                                |
| ----------- | --------------------------------------------------------------------------- |
| SIS         | Service d’incendie et de secours responsable de son périmètre               |
| ETARE       | Établissement répertorié et dossier opérationnel associé                    |
| Prévision   | Service qui prépare et maintient la connaissance des sites                  |
| OPS         | Consultation et remontées des intervenants sur le terrain                   |
| Révision    | État de travail ou contenu figé soumis à validation                         |
| Publication | Version officielle immuable mise à disposition des utilisateurs autorisés   |
| Enrôlement  | Association d’une tablette au SIS pour recevoir les publications            |
| Secteur     | Groupe de sites utilisé pour limiter les périmètres et distribuer les fonds |

### Documents complémentaires

Le guide d’utilisation FireScape accompagne les premiers parcours et les gestes quotidiens. La roadmap décrit les travaux réalisés et restants. Le bilan du 9 octobre précise l’origine des vérifications, les réserves et le commit examiné, e38b118.

Références du projet : cahier des charges MVP, modèle de données, modèle économique, maquette produit et architecture technique, édition du 27 septembre 2026, dans le dossier docs/reference. La documentation d’exploitation traite séparément la livraison Android, la supervision, les clés et les sauvegardes.

Pour une mise en service, le SIS désigne un référent métier, un administrateur, un référent SIG et un responsable de l’exploitation. Leurs coordonnées et l’adresse de connexion sont remises aux utilisateurs lors de la formation.
