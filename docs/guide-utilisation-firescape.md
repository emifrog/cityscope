# Guide de prise en main de FireScape

Utilisation du web du portail exploitant et de la tablette Android

**Édition du 9 octobre 2026 • Version documentaire 1.0**

Ce guide accompagne la première connexion puis les opérations courantes dans FireScape : préparer un site et son ETARE, publier une version, la consulter hors ligne, signaler un écart et proposer une mise à jour. Chaque parcours indique le profil concerné et le résultat à vérifier.

Utilisez l’environnement, le compte et l’application remis par votre administrateur SIS. Les fonctions visibles dépendent de vos droits. Les exercices de découverte se font sur des sites fictifs dans la préproduction. Le fond IGN réel, l’environnement hébergé et la tablette retenue doivent être qualifiés avant l’usage pilote prévu par le SIS.

## 1 Préparer sa première utilisation

### Disposer des bons accès

Avant de commencer, obtenez l’adresse web de votre environnement, votre invitation nominative, le nom du SIS et le contact de votre administrateur. Préparez une application d’authentification si un second facteur est requis. Pour le terrain, demandez également l’application Android autorisée, un terminal affecté et son code d’enrôlement.

L’adresse du service n’est pas déduite du nom FireScape : utilisez celle que le SIS vous a communiquée. FireScape préprod et FireScape correspondent à des environnements distincts. Un compte, une tablette ou un code destiné à l’un ne doit pas être réutilisé dans l’autre sans la procédure prévue.

| Votre profil         | Parcours à lire en priorité                                                    |
| -------------------- | ------------------------------------------------------------------------------ |
| Rédacteur prévision  | Connexion, recherche, site, plans, documents, préparation ETARE et instruction |
| Validateur prévision | Connexion, publication, mise à jour et retrait                                 |
| Intervenant OPS      | Installation, consultation, synchronisation et signalements                    |
| Exploitant           | Connexion et parcours du portail exploitant                                    |
| Administrateur SIS   | Connexion, terminaux, administration et dépannage                              |
| Lecteur              | Connexion, recherche et consultation des contenus autorisés                    |

### Comprendre les données affichées

Une **fiche de travail** contient les informations préparées par le SIS. Une **révision soumise** est une copie figée pour validation. Une **publication** est la version officielle diffusée. Une tablette reçoit uniquement les publications auxquelles elle et son utilisateur ont droit.

La **date de synchronisation** indique le dernier échange réussi ; la **date de publication** indique l’âge du dossier reçu. Une synchronisation récente ne signifie pas que les informations du bâtiment ont été vérifiées récemment sur place.

Un **secteur** regroupe des sites pour organiser les accès. Un **enrôlement** associe la tablette au SIS. Un **signalement** vient du terrain ; une **contribution** vient de l’exploitant. Dans les deux cas, la Prévision doit instruire la demande avant une éventuelle nouvelle publication.

**Premier résultat attendu :** vous connaissez votre environnement, votre SIS, votre profil et la personne à contacter si un accès manque.

## 2 Se connecter et sécuriser son compte

**Profils concernés :** utilisateurs web et exploitants ; les principes de compte s’appliquent également aux intervenants.

### Effectuer la première connexion

1. Ouvrez le lien transmis par votre SIS et suivez les étapes d’activation de votre compte.
2. Connectez-vous avec l’adresse invitée et votre mot de passe personnel.
3. Si un code de vérification est demandé, saisissez le code actuel de votre application d’authentification.
4. Vérifiez le SIS actif. Si plusieurs SIS vous sont ouverts, sélectionnez celui dans lequel vous devez travailler.
5. Contrôlez votre nom ou votre adresse affichée avant de commencer une saisie.

Les exploitants sont orientés vers leur portail. Un message d’accès absent ou une invitation expirée doit être traité par l’administrateur ; il ne faut pas créer des comptes supplémentaires pour contourner le problème.

### Activer la double authentification

Dans votre compte, ouvrez la section de double authentification et choisissez **Activer la double authentification**. Associez l’application de votre téléphone à l’aide du QR code ou de la clé affichée, puis saisissez un code à six chiffres pour terminer l’activation.

Générez ensuite les **Codes de secours**. Notez-les ou téléchargez-les immédiatement dans l’emplacement protégé prévu par votre organisation, puis confirmez **Je les ai conservés**. Ils ne seront plus affichés. Une nouvelle génération remplace les anciens codes.

La validation, la publication, la gestion des membres et des terminaux nécessitent un second facteur. Selon la politique du SIS, celui-ci peut être exigé pour tous les accès, y compris le portail exploitant.

### Récupérer un accès

Si vous avez oublié votre mot de passe, utilisez **Mot de passe oublié** et le message reçu à votre adresse. Si vous avez perdu votre moyen de double authentification, utilisez un code de secours par le parcours proposé ou contactez votre administrateur pour une réinitialisation contrôlée. Réactivez ensuite un second facteur avant les actions qui l’exigent.

Consultez vos sessions dans votre compte et fermez celles qui ne doivent plus rester ouvertes. Une suspension par l’administrateur ferme les sessions serveur ; elle ne garantit pas une action instantanée sur une tablette sans réseau.

**Résultat attendu :** votre compte est actif, le bon SIS est sélectionné et les actions correspondant à votre rôle sont accessibles.

## 3 Se repérer et retrouver un site

**Profils concernés :** Prévision, validation, administration et lecteurs autorisés.

### Utiliser la navigation web

| Entrée          | À quoi elle sert                               |
| --------------- | ---------------------------------------------- |
| Tableau de bord | Revenir à la vue d’ensemble du SIS             |
| Carte           | Situer les sites et filtrer les résultats      |
| Sites           | Rechercher un site et ouvrir sa fiche          |
| ETARE           | Retrouver les dossiers et leurs états          |
| Validations     | Examiner les révisions soumises                |
| Signalements    | Instruire les retours des agents terrain       |
| Contributions   | Instruire les propositions exploitant          |
| Exploitants     | Inviter les personnes sur les sites retenus    |
| Administration  | Gérer membres, secteurs, terminaux et réglages |

Un menu visible ne donne pas nécessairement le droit d’effectuer toutes ses actions. Les boutons et les données restent soumis à vos habilitations. Sur un écran étroit, ouvrez le menu de navigation pour retrouver ces entrées.

### Rechercher dans la liste

1. Ouvrez **Sites** ou utilisez la recherche de l’en-tête.
2. Saisissez un nom, une adresse ou un numéro ETARE ; affinez par commune, type ou statut.
3. Utilisez les filtres de risque et de gravité si vous cherchez une catégorie particulière de sites.
4. Lancez **Filtrer**, puis ouvrez le résultat correspondant au nom et à l’adresse recherchés.
5. Si le site manque, retirez les filtres, vérifiez le SIS et consultez le statut d’archive si nécessaire.

### Lire la fiche

La fiche propose les onglets **Synthèse**, **Localisation**, **Bâtiments & niveaux**, **Plans**, **Classifications**, **Contacts**, **Documents** et **ETARE**. Le bandeau indique notamment si une version est publiée ou si le site est archivé.

Dans la carte web, rapprochez l’adresse, le point de référence et l’emprise du site. Une géolocalisation issue d’une recherche d’adresse doit être contrôlée avant de devenir une référence opérationnelle.

**Résultat attendu :** vous avez ouvert le bon site et identifié sa version publiée, ou constaté qu’aucune version n’est encore diffusée.

## 4 Créer et renseigner un site

**Profils concernés :** rédacteur prévision ou administrateur SIS disposant du droit de modification.

### Préparer les informations

Rassemblez le nom du site, son adresse, sa commune, son numéro ETARE s’il existe, le type de bâtiment, les contacts utiles et les documents de référence. Utilisez les conventions de nommage et de classement retenues par votre SIS.

### Créer la fiche

1. Dans **Sites**, utilisez l’action de création d’un site.
2. Renseignez le nom, puis le type, le statut et la sensibilité appropriés.
3. Saisissez le numéro ETARE et les informations d’adresse disponibles. La commune est nécessaire lorsqu’une adresse est renseignée.
4. Utilisez la recherche d’adresse ou renseignez ensemble latitude et longitude ; vérifiez la position dans **Localisation**.
5. Enregistrez puis relisez la synthèse. Corrigez les champs signalés si l’enregistrement est refusé.

Le statut de la fiche n’est pas l’état de publication de l’ETARE. Passer une fiche à « Actif » ne publie aucun dossier. La sensibilité doit suivre la politique du SIS : un choix « Restreinte » ou « Élevée » modifie les conditions d’accès.

### Décrire la structure du site

Dans **Bâtiments & niveaux**, ajoutez les bâtiments puis leurs niveaux avec des noms compréhensibles sur le terrain. Contrôlez l’ordre des étages et sous-sols avant d’importer les plans. Un intitulé explicite réduit le risque d’ouvrir le mauvais niveau sur tablette.

Dans **Classifications**, renseignez les classements connus et leurs informations associées. Plusieurs classements peuvent coexister. Ne transformez pas une information incertaine en fait confirmé : faites-la vérifier selon le circuit métier du SIS.

Dans **Contacts**, préparez les interlocuteurs et astreintes utiles. Les modalités de diffusion des contacts et documents sont détaillées au chapitre 7.

### Vérifier le résultat

Recherchez le site par son nom et son numéro, ouvrez sa localisation puis sa liste de niveaux. Assurez-vous que les informations désignent le même établissement et que les accès attribués correspondent à sa sensibilité.

**Résultat attendu :** la fiche, sa localisation et sa structure sont enregistrées. Le site reste à enrichir et à publier avant toute distribution terrain.

## 5 Localiser le site et importer ses plans

**Profil concerné :** personne autorisée à préparer le dossier.

### Travailler dans la localisation

Dans **Localisation**, vérifiez le point du site et son emprise. Utilisez les outils proposés pour tracer l’emprise du site ou d’un bâtiment et placer les objets extérieurs. Choisissez le type d’objet, placez sa géométrie, renseignez sa fiche puis enregistrez.

Les risques extérieurs peuvent être placés comme points ou surfaces. Une surface doit être fermée en rejoignant son premier sommet. Vérifiez visuellement la position, le type et la gravité avant enregistrement. La représentation des risques extérieurs sur la carte de la tablette n’est pas encore disponible ; le web et la carte OPS n’ont pas une représentation strictement identique.

### Importer un fond de plan

1. Ouvrez **Plans**, puis **Importer un plan**.
2. Choisissez le type de plan et, pour un plan de niveau, le niveau auquel il appartient.
3. Donnez un titre explicite et choisissez le fichier PDF ou image. Si l’interface demande une page du PDF, sélectionnez celle correspondant au plan attendu.
4. Validez l’import puis attendez la fin du contrôle du fichier.
5. Ouvrez le plan et vérifiez sa lisibilité, son niveau et son orientation visuelle avant de placer des objets.

Les formats courants admis sont PDF, PNG, JPEG et WebP, avec une limite de 50 Mo pour les fichiers concernés. Les dimensions des images sont également contrôlées. Les restrictions affichées par le formulaire et les messages du contrôle font référence pour le fichier choisi.

### Remplacer un fond existant

Utilisez **Remplacer le fond** sur le plan concerné. L’ancien fond reste dans l’historique. Les objets de l’ancien fond ne doivent pas être considérés comme correctement repositionnés : vérifiez chacun de ceux signalés, replacez-le ou redessinez-le, puis enregistrez.

Le sélecteur **Révision du fond** permet de consulter les versions conservées. L’ancienne publication reste inchangée tant qu’une nouvelle révision ETARE n’est pas publiée.

**Résultat attendu :** les fonds sont contrôlés et lisibles, associés au bon bâtiment et au bon niveau. Aucun élément de l’ancien fond n’est laissé sans vérification.

## 6 Placer les objets les zones et les photos

**Profil concerné :** personne autorisée à modifier les plans et données du site.

### Ajouter un élément sur un plan

1. Ouvrez le plan et choisissez son fond courant.
2. Dans **Ajouter sur le plan**, sélectionnez un type d’objet, un risque ou une zone.
3. Utilisez **Placer sur le plan** ou l’outil de dessin proposé. Selon le type, placez un point ou tracez la ligne ou la surface demandée.
4. Renseignez la fiche : libellé, informations métier, état et autres champs affichés pour ce type.
5. Enregistrez, puis cliquez sur l’élément pour relire sa fiche et contrôler sa position.

Les catégories regroupent notamment les accès, l’eau, l’énergie, la sécurité incendie, le désenfumage et les circulations. Choisissez le type métier le plus précis disponible ; une simple annotation ne remplace pas un objet structuré quand celui-ci existe.

### Organiser la lecture

Utilisez **Calques affichés** pour masquer ou afficher les familles d’éléments. Cela change la lecture du plan, pas l’existence des objets. Après un ajout ou un déplacement incorrect, l’action **Annuler la dernière action** est disponible pour les opérations prises en charge par l’éditeur.

Décrivez les zones avec un nom compréhensible, puis vérifiez les risques et objets qui s’y rattachent. Lorsqu’une zone est déplacée ou archivée, les rattachements sont recalculés. La vérification métier du résultat reste nécessaire.

### Ajouter une photo utile

Ouvrez la fiche de l’objet et sa zone de photos. Déposez la photo, ajoutez une légende qui indique ce qu’il faut reconnaître, puis attendez son contrôle. Vérifiez le lien avec l’objet : une photo du bon équipement rattachée au mauvais accès peut être trompeuse.

Les photos retenues suivent le circuit de publication et sont consultables sur tablette. Une annexe photo est également produite dans le PDF, selon les sections visibles et les limites de fabrication. Contrôlez le PDF final si la photo est indispensable à la compréhension du dossier.

### Relecture avant soumission

Vérifiez la cohérence entre plan, légende, niveau, objet et zone. Les fonds ne disposent pas d’une calibration permettant de déduire automatiquement des distances réelles ; n’interprétez pas une mesure graphique comme une distance opérationnelle validée.

**Résultat attendu :** les éléments sont lisibles, correctement positionnés et documentés. Les photos et fonds nécessaires ont terminé leur contrôle.

## 7 Gérer les contacts et les documents

**Profils concernés :** Prévision et administration autorisées.

### Renseigner les contacts

Dans **Contacts**, ajoutez ou corrigez l’identité, la fonction, les numéros, l’adresse e-mail et les disponibilités utiles. Choisissez la visibilité adaptée : diffusion aux intervenants, usage interne au SIS ou partage exploitant selon le cas proposé.

Contrôlez le résultat dans le contenu publié et les espaces concernés. Le portail restitue une vue filtrée de la publication, pas l’ensemble du référentiel de contacts de travail. Ne supposez pas qu’un contact est visible dans tous les espaces parce qu’il existe dans la fiche.

### Déposer un document

1. Ouvrez **Documents**, puis **Nouveau document**.
2. Saisissez le titre et la catégorie, puis choisissez le fichier.
3. Renseignez les dates de validité lorsqu’elles ont un sens pour cette pièce.
4. Choisissez sa règle de consultation hors ligne.
5. Activez **Visible par l’exploitant** uniquement si ce document doit être partagé.
6. Déposez le document puis attendez l’état **Contrôlé** avant de poursuivre la publication.

| Règle                          | Effet sur la tablette                                                                  |
| ------------------------------ | -------------------------------------------------------------------------------------- |
| Toujours embarqué hors ligne   | Le fichier fait partie de la distribution prévue avec le dossier                       |
| Hors ligne à la demande        | L’agent doit demander son téléchargement avec du réseau avant consultation sans réseau |
| Pas de consultation hors ligne | Le fichier n’est pas conservé pour un usage hors ligne dans ce parcours                |

La mention **Visible par l’exploitant** prend effet dans sa consultation après la prochaine publication. Elle n’envoie pas immédiatement les modifications de travail dans le portail.

### Mettre à jour et contrôler

Utilisez **Nouvelle version** pour remplacer le contenu d’un document tout en conservant son historique. **Modifier** sert à faire évoluer ses informations et règles. Relisez les dates d’expiration, la politique hors ligne et le partage avant de soumettre le dossier.

**Contrôle en cours** signifie que la pièce n’est pas encore disponible. **Refusé** demande de lire le motif, corriger le fichier ou faire intervenir l’administrateur. Un document en quarantaine ne devient pas sûr simplement en attendant ; ne multipliez pas les dépôts identiques si le traitement est indisponible.

**Résultat attendu :** les pièces utiles sont contrôlées, versionnées et affectées à la bonne politique de diffusion.

## 8 Préparer valider et publier un ETARE

**Profils concernés :** rédacteur prévision puis validateur distinct, avec double authentification.

### Préparer la révision

1. Dans la fiche du site, ouvrez **ETARE**.
2. Si aucune révision n’est ouverte, choisissez **Préparer une nouvelle version**.
3. Relisez l’aperçu et le **Contrôle avant validation**. Corrigez tous les points bloquants et examinez ceux indiqués « à vérifier ».
4. Vérifiez les sections, les plans, les photos, les contacts et les documents destinés au terrain. Le réglage des sections relève des paramètres du SIS.
5. Renseignez le **Résumé des changements** avec ce qui change et pourquoi.
6. Choisissez **Soumettre à validation**. Le contenu soumis est alors figé.

Modifier ensuite les données de travail ne modifie pas silencieusement la révision déjà soumise. L’aperçu de travail et le contenu à valider peuvent donc représenter deux états différents ; utilisez **Voir la révision soumise** pour lire l’état réellement présenté au validateur.

### Décider sur la révision

Le validateur ouvre **Validations**, puis la révision. Il lit le résumé, les éléments ajoutés ou modifiés, les pièces et les signalements ou contributions rattachés. Il contrôle le contenu figé et son origine.

S’il a contribué à cette révision, il doit la faire traiter par un autre validateur. Sinon, il choisit **Demander une correction** et décrit le motif, ou **Valider et publier** lorsque la révision peut être diffusée. L’accès exige la double authentification.

### Attendre la publication effective

La fabrication peut afficher un état en cours. Attendez la version publiée, ouvrez son PDF et contrôlez les pages importantes. Si la fabrication échoue, relevez le message et le code puis faites traiter la cause. Une personne autorisée peut utiliser **Relancer la publication**. La précédente version reste active lorsqu’elle existe.

La diffusion n’est achevée que lorsque la tablette a synchronisé puis installé la nouvelle version. Comparez son numéro de publication à celui du web pour vérifier le résultat.

**Résultat attendu :** une nouvelle publication est disponible avec un PDF lisible, puis son numéro apparaît sur une tablette autorisée après synchronisation.

## 9 Mettre à jour retirer ou archiver un dossier

**Profils concernés :** Prévision pour les données et l’archivage, validateur pour le retrait d’une publication.

### Mettre à jour un dossier diffusé

Modifiez les données nécessaires dans les onglets du site puis préparez une nouvelle révision. Renseignez les raisons du changement, corrigez les contrôles et faites valider. Vérifiez ensuite la nouvelle publication et sa réception sur tablette.

Si une correction a été demandée sur une révision, lisez son motif dans le dossier ETARE. Corrigez les données de travail puis préparez et soumettez une nouvelle version selon les actions proposées. L’historique conserve la décision antérieure.

Une modification du nom, d’un contact ou d’un plan ne met pas instantanément à jour un dossier déjà installé. Pour une information urgente, appliquez également les moyens de communication et les consignes retenus par le SIS.

### Retirer une version en vigueur

1. Ouvrez l’onglet **ETARE** du site avec un rôle autorisé à publier.
2. Sur la publication en vigueur, choisissez **Retirer cette version**.
3. Saisissez le **Motif du retrait** de façon compréhensible pour les intervenants.
4. Relisez la conséquence affichée, puis confirmez **Retirer la version**.
5. Vérifiez l’état retiré et le motif ; contrôlez leur propagation lors de la prochaine synchronisation.

Après retrait, les tablettes qui ont reçu l’information n’ont plus de dossier pour ce site jusqu’à une nouvelle publication. Une tablette hors réseau ne reçoit pas la décision immédiatement.

### Archiver puis restaurer le site

L’archivage du site et de son dossier exige qu’il n’existe plus de version en vigueur ni de fabrication qui l’empêche. Utilisez l’action d’archivage dans le dossier, renseignez le motif et confirmez. Le site est exclu de la diffusion courante, tandis que son historique reste consultable.

Pour reprendre le travail, retrouvez le site avec le filtre des archives puis choisissez **Restaurer le site**. Relisez ses données avant de préparer une nouvelle révision. La restauration de la fiche ne réactive pas automatiquement une publication retirée.

**Résultat attendu :** le statut et le motif correspondent à la décision métier ; la personne responsable a vérifié les conséquences sur la diffusion.

## 10 Installer et enrôler une tablette

**Profils concernés :** administrateur SIS et intervenant autorisé. **Réseau nécessaire.**

### Préparer le terminal côté administration

Dans **Administration**, ouvrez **Terminaux** puis **Ajouter un terminal**. Donnez un nom identifiable dans le parc et attribuez le périmètre prévu. Remettez le code d’enrôlement à la personne chargée de cette tablette. Ce code comporte douze caractères, est à usage unique et valable 24 heures. S’il expire, utilisez **Nouveau code**.

La tablette reçoit les sites communs à son affectation et au périmètre de l’agent connecté. Les habilitations aux sites sensibles s’ajoutent à ces conditions.

### Installer et associer la tablette

1. Installez la version signée distribuée par votre SIS, selon sa procédure de gestion du parc ou d’installation manuelle.
2. Vérifiez le nom de la variante : **FireScape préprod** pour les essais, **FireScape** pour l’environnement de production autorisé.
3. Avec du réseau, connectez-vous avec votre propre compte et sélectionnez le bon SIS.
4. Ouvrez **Compte et tablette**, puis **Enrôler cette tablette**.
5. Saisissez le code remis, vérifiez le SIS affiché puis choisissez **Enrôler la tablette**.
6. Attendez la synchronisation initiale. Vérifiez la présence des sites attendus et ouvrez au moins un plan et un PDF.

Un code invalide peut correspondre à un code expiré, déjà utilisé ou destiné à un autre SIS ou environnement. Demandez un nouveau code à l’administrateur plutôt que de réinitialiser l’application.

### Vérifier la préparation hors ligne

Téléchargez les documents à la demande nécessaires et le fond de secteur disponible. Passez ensuite en mode avion, fermez puis rouvrez l’application, et consultez le site d’essai. Réactivez le réseau après le contrôle.

Les sites de sensibilité restreinte suivent un accès spécifique à durée limitée ; ils ne sont pas tous embarqués avec la synchronisation générale. Le fond synthétique d’essai ne doit pas être pris pour une cartographie IGN réelle.

**Résultat attendu :** l’administration reconnaît le terminal, le bon compte est connecté et les publications prévues s’ouvrent après un redémarrage sans réseau.

## 11 Consulter les sites et les plans hors ligne

**Profil concerné :** intervenant OPS disposant d’une tablette enrôlée et synchronisée.

### Avant de partir

Ouvrez FireScape avec du réseau et vérifiez le bandeau de synchronisation. Lancez **Synchroniser** si nécessaire et attendez son résultat. Contrôlez les sites attendus, la disponibilité des pièces utiles, l’espace libre et l’état de l’application. Une tâche Android en arrière-plan peut être retardée par le système : le contrôle manuel reste le repère avant le terrain.

### Retrouver un dossier

1. Dans l’accueil, recherchez par nom, adresse, commune ou numéro ETARE.
2. Ouvrez le site et vérifiez son nom, son adresse et sa version.
3. Lisez la synthèse et les risques prioritaires, puis ouvrez la section utile : accès, eau, énergies, contacts ou plans.
4. Choisissez le bon bâtiment et le bon niveau avant de consulter un plan.
5. Zoomez, déplacez la vue et utilisez les calques. Touchez un objet pour ouvrir sa fiche et ses photos.

La liste locale reflète les publications installées et votre périmètre. L’absence d’un résultat ne signifie pas que le site n’existe pas dans le SIS. Consultez **Compte et tablette** pour connaître les retraits et l’état de synchronisation, puis contactez l’administrateur si nécessaire.

### Lire le PDF et les annexes

Dans la fiche, ouvrez **Dossier ETARE (PDF)**. Les documents déjà installés sont consultables dans l’application sans réseau. Un document seulement proposé « à la demande » ne sera pas disponible hors ligne tant qu’il n’a pas été téléchargé avec succès.

Comparez toujours la fraîcheur de la synchronisation et celle de la publication. L’autorisation hors ligne est limitée par la politique reçue du SIS ; à son expiration, reconnectez la tablette pour renouveler l’accès. Modifier l’horloge n’est pas une procédure de récupération.

### Utiliser une tablette partagée

Chaque agent utilise son compte. Le changement de personne exige une connexion en ligne. Avant de se déconnecter, vérifiez les signalements en attente. Ceux-ci restent liés à leur auteur ; ils ne sont pas transmis au nom de la personne suivante.

**Résultat attendu :** vous avez identifié la bonne version et pouvez ouvrir les informations nécessaires sans dépendre du réseau.

## 12 Utiliser la carte les documents et les sites sensibles

**Profil concerné :** intervenant OPS. Certains téléchargements et ouvertures nécessitent du réseau.

### Lire la carte locale

Depuis l’accueil, ouvrez **Carte**. Depuis un site, utilisez **Situer sur la carte**. Choisissez le fond du secteur disponible et touchez un site ou un point pour ouvrir les informations proposées.

La carte peut afficher votre position avec **Me situer sur la carte**, après autorisation du terminal. Cette position n’est pas envoyée au serveur. Elle ne constitue pas une navigation routière et ne remplace pas la lecture des accès du dossier.

Un message d’absence de couverture indique que le fond n’est pas disponible à cet endroit. Ce n’est pas la preuve d’une absence de sites. Un seul fond de secteur est actif à la fois ; utilisez le choix de secteur lorsqu’il est proposé. Les risques extérieurs ne sont pas encore dessinés sur la carte OPS.

### Télécharger une pièce à la demande

Avec du réseau, ouvrez le document concerné et lancez le téléchargement proposé. Attendez l’état installé puis ouvrez-le pour vérifier la lecture. Les gros transferts et les fonds de carte peuvent attendre le Wi-Fi selon les règles appliquées. En cas de coupure, relancez la synchronisation ou le téléchargement lorsque le réseau revient ; la reprise conserve les parties vérifiées.

Si vous retirez une copie à la demande de la tablette, elle n’est plus disponible sans réseau jusqu’à son prochain téléchargement. Ce retrait local ne supprime pas la pièce du dossier publié.

### Ouvrir un site de sensibilité restreinte

Une habilitation nominative et encore valide est nécessaire. Ouvrez le site proposé dans votre périmètre, connectez la tablette au réseau pour obtenir le contenu à la demande et utilisez votre code personnel selon l’écran affiché. Le code est demandé à chaque ouverture et la consultation est tracée.

La durée de consultation est actuellement limitée à 24 heures. Lisez l’échéance affichée ; une fois dépassée, une nouvelle ouverture autorisée avec du réseau est nécessaire. Les sites de sensibilité élevée ne sont pas distribués à la tablette. Un manque d’habilitation se règle avec l’administrateur, pas par le partage du code d’un autre agent.

**Résultat attendu :** vous distinguez une absence de fond, une pièce non téléchargée et un accès sensible non autorisé, puis utilisez le parcours approprié.

## 13 Signaler un écart depuis le terrain

**Profil concerné :** intervenant OPS autorisé. **La saisie peut se faire sans réseau.**

### Enregistrer le constat

1. Ouvrez le site puis **Signaler un écart sur ce site**, ou l’action de signalement de la fiche concernée. Sur un plan, un appui long prépare un signalement à la position touchée.
2. Vérifiez le site, la version consultée et l’élément ou la position rattachée.
3. Choisissez la catégorie : accès, eau, risque, contact, plan ou autre.
4. Choisissez l’importance et décrivez les faits : ce qui a été observé, où et ce qui diffère du dossier.
5. Ajoutez si utile jusqu’à cinq photos en respectant les limites affichées, puis enregistrez.
6. Vérifiez le message confirmant l’enregistrement et retrouvez le constat dans **Mes signalements**.

Exemple de description : « Le portail secondaire représenté sur le plan est condamné par une clôture fixe. Constat sur l’accès situé côté cour. Photo jointe. » Une description factuelle facilite la vérification ; le signalement ne modifie pas lui-même la fiche officielle.

### Comprendre son suivi

| État visible    | Ce que vous pouvez en déduire                                                                            |
| --------------- | -------------------------------------------------------------------------------------------------------- |
| En attente      | Le serveur n’a pas encore reçu l’ensemble du constat ; conservez la tablette et réessayez avec du réseau |
| Reçu            | Le constat a été transmis et peut être instruit par la Prévision                                         |
| Traité          | Une décision est documentée ; lisez le motif, la correction peut attendre une nouvelle publication       |
| Refus ou erreur | Lisez la raison, vérifiez le fichier ou l’accès et sollicitez le support si nécessaire                   |

Reconnectez-vous avec le même compte auteur puis synchronisez pour transmettre les constats et recevoir les décisions. Évitez de recréer le même signalement parce que l’envoi est retardé : les reprises sont prévues.

Les constats en attente restent chiffrés et liés à leur auteur après une déconnexion. Une désinstallation, une réinitialisation ou la purge déclenchée par une révocation peut les perdre ; transmettez-les avant une opération de maintenance lorsque cela est possible.

L’importance **Urgent** qualifie le constat dans FireScape. Elle ne remplace pas la procédure d’alerte et les communications opérationnelles du SIS.

**Résultat attendu :** le constat passe à « Reçu », puis la décision et, le cas échéant, la nouvelle publication sont retrouvées lors des synchronisations suivantes.

## 14 Utiliser le portail exploitant

**Profil concerné :** exploitant invité par le SIS. **Réseau nécessaire.**

### Accepter son invitation

Ouvrez le lien reçu à l’adresse invitée, activez ou utilisez le compte correspondant, puis suivez le parcours d’acceptation. Activez la double authentification si elle est demandée. Vérifiez les sites ouverts dans **Portail exploitant**.

Une invitation peut expirer et l’accès peut posséder une date de fin. Si aucun site n’apparaît, contactez la personne qui vous a invité. L’accès à un site ne donne aucun droit sur les autres sites de votre organisation qui ne figurent pas dans l’invitation.

### Consulter les informations partagées

Ouvrez un site et lisez son identité, les contacts proposés, la liste des plans et les **Documents partagés**. Téléchargez seulement les pièces pour lesquelles l’action est disponible. La liste des plans n’ouvre pas leur contenu opérationnel réservé aux secours.

Si aucune publication n’est disponible ou si le SIS l’a retirée, le portail le signale. Il ne montre pas automatiquement les données en cours de rédaction par la Prévision.

### Proposer une mise à jour

1. Choisissez **Proposer une mise à jour**.
2. Sélectionnez la nature de la proposition : corriger le nom ou l’adresse, ajouter ou modifier un contact, signaler un plan à mettre à jour, transmettre un document ou fournir une autre information.
3. Désignez l’élément concerné lorsqu’il existe dans la version publiée.
4. Renseignez les valeurs proposées, un titre et une description compréhensibles. Ajoutez les pièces nécessaires.
5. Envoyez la proposition puis vérifiez sa présence dans **Vos propositions de mise à jour**.

La proposition ne change pas directement l’ETARE. Les pièces sont contrôlées et la Prévision examine la demande avant d’accepter, d’accepter en partie ou de refuser.

### Répondre et suivre la décision

Ouvrez la proposition pour consulter les échanges. Répondez aux demandes de précision avec les informations attendues. Les notifications e-mail servent à attirer votre attention ; consultez le portail pour lire l’état et le motif exacts.

Une acceptation peut précéder la publication du dossier corrigé. Vérifiez la version publiée ultérieurement au lieu de supposer que la décision a déjà modifié ce que les intervenants consultent.

**Résultat attendu :** la proposition est identifiée et suivie jusqu’à une décision du SIS, sans modification directe de la donnée opérationnelle.

## 15 Instruire les signalements et les contributions

**Profils concernés :** Prévision, validation ou administration selon les droits attribués. La modification des données exige un rôle d’édition.

### Traiter un signalement terrain

1. Ouvrez **Signalements**, sélectionnez le constat et choisissez **Prendre en charge**.
2. Lisez la description, les photos, l’auteur et la version consultée. Comparez l’élément signalé avec les données actuelles.
3. Si une correction est nécessaire, utilisez la révision en brouillon du site ou **Ouvrir une révision**.
4. Corrigez les données de travail dans les onglets appropriés puis rattachez le signalement à la révision selon l’action proposée.
5. Documentez la décision dans **Motif, lu par l’agent**, puis choisissez **Clore : traité** ou **Rejeter** selon le résultat de l’instruction.
6. Faites suivre la correction par la validation et la publication habituelles.

La décision finale est définitive. « Traité » peut signifier qu’une visite de vérification est programmée ; précisez-le dans le motif si la correction n’est pas encore publiée. Ne présentez pas la clôture comme une confirmation d’installation sur toutes les tablettes.

### Traiter une contribution exploitant

Ouvrez **Contributions**, sélectionnez la proposition puis **Prendre en charge**. Examinez ses pièces et les valeurs proposées. Si les informations sont incomplètes, rédigez un **Message** et choisissez **Demander une précision** ; l’échange reste attaché à la proposition.

Lorsque la version a changé depuis la demande, comparez l’état d’origine, l’état actuel et la proposition. Renseignez la **Résolution du conflit** quand elle est requise. L’objectif est d’éviter qu’une proposition ancienne écrase une mise à jour plus récente.

Pour accepter, reportez d’abord les changements dans les données de travail et rattachez-les à la révision en brouillon. Ce report est contrôlé par l’instructeur ; l’acceptation seule ne réalise pas une fusion automatique. Choisissez ensuite **Accepter**, **Accepter en partie** ou **Refuser**, avec un **Motif, lu par l’exploitant**.

### Fermer la boucle

Soumettez la révision, faites intervenir un validateur distinct puis vérifiez la publication. Les références du signalement ou de la contribution permettent de retrouver l’origine de la correction. Suivez les éventuels échecs de notification dans l’administration.

**Résultat attendu :** chaque demande possède un responsable, une décision compréhensible et, si nécessaire, un lien vers la révision qui porte sa correction.

## 16 Administrer les accès et les terminaux

**Profil concerné :** administrateur SIS avec double authentification. Les opérations de serveur et de sauvegarde relèvent des procédures d’exploitation.

### Gérer les membres et les secteurs

Dans **Administration > Membres**, utilisez **Inviter une personne**, renseignez l’adresse professionnelle, les rôles et le périmètre. Vérifiez ensuite l’état de l’invitation et de la double authentification. Le rôle de validation doit être attribué explicitement ; l’administration seule ne permet pas de publier.

Dans **Secteurs**, préparez les groupes de sites puis affectez-y les membres et terminaux concernés. Une personne ne modifie pas ses propres habilitations et le SIS garde au moins un administrateur actif. Si le rôle d’administration SIS est conservé, son périmètre administratif reste celui du SIS entier.

Pour les sites sensibles, attribuez une habilitation nominative, datée et limitée au périmètre approprié via **Sites sensibles**. Contrôlez régulièrement les dates de fin. Les sites de sensibilité élevée ne sont jamais embarqués sur tablette.

### Suivre et révoquer un terminal

Dans **Terminaux**, contrôlez l’utilisateur, la dernière synchronisation, les paquets reçus et l’état. **Affectation** modifie le périmètre. **Nouveau code** renouvelle un code d’enrôlement selon l’état du terminal.

En cas de perte, vol ou retrait du parc, choisissez **Révoquer**, renseignez le motif et confirmez. La révocation est définitive : le serveur refuse le terminal et la purge locale intervient au prochain contact. Une tablette hors réseau conserve la limite de son autorisation locale ; prévenez les responsables selon la procédure du SIS.

### Autres réglages utiles

| Rubrique                    | Action de l’administrateur                                                               |
| --------------------------- | ---------------------------------------------------------------------------------------- |
| Fonds de carte              | Contrôler source, droits, préparation et état par secteur avant distribution             |
| Catalogue des risques       | Maintenir les types et informations utiles au SIS                                        |
| Paramètres                  | Régler sections ETARE, politiques de compte et de tablette selon les choix approuvés     |
| Notifications               | Identifier les e-mails en échec et organiser leur reprise                                |
| Journal des sites sensibles | Examiner les consultations selon les responsabilités attribuées                          |
| Supervision                 | Repérer les traitements et synchronisations en difficulté puis solliciter l’exploitation |

Les exploitants sont invités dans **Exploitants**, avec leurs sites, la validité de l’invitation et la fin éventuelle d’accès. Ne leur attribuez pas un rôle général couvrant tout le SIS.

**Résultat attendu :** chaque utilisateur et terminal dispose uniquement du périmètre prévu ; les accès obsolètes et les anomalies visibles sont pris en charge.

## 17 Résoudre les difficultés courantes

Vérifiez d’abord le compte, le SIS et l’environnement. Relevez le message exact. Adressez les problèmes de droits à l’administrateur et les erreurs de service à l’exploitation.

| Situation                                         | Vérification et action utile                                                                                                  |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Connexion ou double authentification refusée      | Vérifier l’adresse invitée, le code actuel et l’heure du téléphone ; utiliser le parcours de récupération ou l’administrateur |
| Action de validation absente                      | Vérifier le rôle, le second facteur et l’absence de contribution personnelle à la révision                                    |
| Site introuvable sur le web                       | Vérifier SIS, filtres, archives et périmètre ; demander à l’administrateur si l’accès est attendu                             |
| Site absent de la tablette                        | Vérifier publication effective, affectation du terminal, droits de l’agent et dernière synchronisation                        |
| Fichier en contrôle ou refusé                     | Lire le motif, vérifier type et taille ; faire contrôler le service si plusieurs fichiers restent bloqués                     |
| Publication en échec                              | Relever le code, vérifier que l’ancienne version reste active et faire traiter la cause avant relance autorisée               |
| Téléchargement interrompu                         | Retrouver un réseau stable ou le Wi-Fi et relancer ; vérifier les messages de budget ou de version minimale                   |
| Stockage plein                                    | Libérer de l’espace selon la procédure du SIS ; retirer des copies à la demande inutiles, puis reprendre                      |
| PDF absent ou plan illisible                      | Vérifier que la pièce est installée et contrôlée ; synchroniser puis signaler la version et le fichier concernés              |
| Carte sans fond                                   | Vérifier le secteur, la couverture et le téléchargement ; distinguer un fond manquant de sites absents                        |
| Autorisation expirée ou application trop ancienne | Reconnecter puis installer la mise à jour autorisée ; vérifier la reprise de synchronisation                                  |
| Site sensible refusé                              | Vérifier habilitation, échéance, réseau et code ; ne pas utiliser le compte ou le code d’un autre agent                       |
| Signalement toujours en attente                   | Revenir avec le compte auteur, vérifier le réseau et synchroniser ; consulter le détail de l’erreur                           |
| Aucun site dans le portail                        | Vérifier l’adresse invitée, l’acceptation, l’expiration ou la révocation de l’accès                                           |

Évitez de désinstaller ou d’effacer les données de l’application pour un simple problème de synchronisation : les publications et les constats non transmis peuvent être perdus. Faites d’abord vérifier la situation par le support.

**Pour le support :** indiquez l’heure, l’environnement, le SIS, le terminal, la version de l’application et de la publication, l’action, le réseau et le message exact. Joignez uniquement les captures autorisées, sans mot de passe, code ou clé.

## 18 Réaliser un exercice complet de prise en main

**But :** vérifier le parcours avec plusieurs rôles sur des données fictives, avant les usages pilotes. Préparez un rédacteur, un validateur distinct, un agent OPS, un exploitant invité et une tablette de préproduction.

### Exercice proposé

1. Le rédacteur crée « Site école Démonstration », son adresse fictive de test, un bâtiment et un niveau. Il importe un plan d’exercice, ajoute un accès, un point d’eau, un risque, un contact et un document.
2. Il prépare une révision, corrige les contrôles, renseigne le résumé et soumet.
3. Le validateur examine la révision puis publie. Les participants vérifient le PDF et notent le numéro de publication.
4. L’agent enrôle sa tablette si nécessaire, synchronise et ouvre le dossier. Il télécharge la pièce à la demande prévue dans l’exercice.
5. Il passe en mode avion, redémarre l’application puis retrouve le site, le plan, une fiche et le PDF.
6. Il signale un accès fictivement condamné, avec une photo d’exercice. Le constat apparaît en attente.
7. Il rétablit le réseau, synchronise et vérifie que le constat est reçu.
8. La Prévision instruit, corrige le dossier et prépare la révision suivante ; le validateur publie puis l’agent vérifie la nouvelle version.
9. L’exploitant propose un contact corrigé. La Prévision demande une précision, reçoit la réponse puis instruit la proposition jusqu’à la décision.

### Vérifier les résultats

- Le bon SIS et le bon environnement ont été utilisés pour toutes les étapes.
- Une personne distincte du contributeur a pris la décision de validation.
- Le même numéro de publication a été retrouvé sur le web et la tablette.
- Le site, le plan, la pièce prévue et le PDF se sont ouverts après redémarrage sans réseau.
- Le signalement a été conservé pendant la coupure, reçu puis relié à son instruction.
- La contribution exploitant n’a pas modifié directement le dossier officiel.
- Les difficultés ont été notées avec leur contexte, sans effacement inutile de la tablette.

Cet exercice prépare la prise en main ; la recette métier, les mesures sur matériel réel et les essais de panne restent des étapes distinctes du pilote.

### Retrouver les ressources

La présentation de FireScape explique le produit et son périmètre. La roadmap et le bilan du 9 octobre suivent les réserves et l’avancement. Les procédures d’exploitation détaillent la livraison Android, les clés, la supervision et la restauration. Demandez à votre SIS l’adresse du service, les coordonnées du support et les consignes locales complémentaires.
