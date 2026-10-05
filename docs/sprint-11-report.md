# Sprint 11 — rapport de livraison

Validation locale du **5 octobre 2026** sur Windows. La CI GitHub tourne sur `main` (branche unique).
Cinq commits :

- fonds par secteur, préparation et distribution (`47e969a`) ;
- onglet « Fonds de carte » du back-office (`f8de1e5`) ;
- téléchargement des fonds sur la tablette (`d44a633`) ;
- carte locale de la tablette (`bfcde2b`) ;
- ce rapport.

Aucun déploiement, aucune donnée réelle.

Périmètre : CAR-01 à CAR-03 (ADR-024), carte hors ligne de la tablette. Constat préalable : l'IGN ne
propose pas le Plan IGN vectoriel en fichier. Sa FAQ autorise la mise en cache des tuiles mais n'en propose
pas le téléchargement, et la version téléchargeable est raster. Choix du porteur du 5 octobre :

- construire toute la chaîne, la lecture du Plan IGN par le flux convenu restant verrouillée tant que la
  fiche de droits n'est pas validée, et un fond d'essai synthétique servant aux essais ;
- un secteur affiché à la fois sur la tablette ;
- libellés en Noto Sans (licence OFL 1.1), embarqués dans l'application ;
- préparation automatique des fonds, et à la demande de l'administration.

## Réalisé

### Lot A — fonds par secteur, côté serveur (CAR-01, CAR-03)

- **Couverture d'un secteur** :
  - vue générale jusqu'au zoom 14 sur l'emprise des sites localisés, plus 5 km de marge ;
  - détail jusqu'au zoom 18 à 500 m des sites diffusés, c'est-à-dire de version signée en vigueur et de
    sensibilité normale ;
  - un site restreint ou élevé ne marque jamais de zone de détail, qui le désignerait.
- **Préparation par le worker** :
  - fichier PMTiles v3 écrit par la plateforme (répertoires, sous-répertoires, tuiles dédupliquées et
    compressées), relu par la bibliothèque de référence `pmtiles` dans les tests ;
  - parties de 32 Mo, style et pictogrammes ;
  - manifeste signé par la clé des publications (contexte `etare.basemap.v1`) ;
  - au-delà de 250 000 tuiles ou de 1 Go, la préparation est refusée avec un motif.
- **Sources** :
  - `synthetic`, fond d'essai généré (avenues, rues, bâti, plans d'eau, mention « aucune donnée IGN »).
    C'est la source par défaut en développement et en essai ; elle est refusée en production ;
  - `ign-plan-vector`, Plan IGN par le flux convenu, avec un débit borné et l'exploitant identifié.
    Ses droits restent `unverified` : aucune préparation ni requête vers l'IGN d'ici la fiche de droits
    ([modèle](sig/fiche-droits-plan-ign.md)).
- **Planification** :
  - un travail par quart d'heure prépare le premier fond, puis un nouveau quand les sites du secteur ont
    changé, quand la source change, et tous les six mois ;
  - seuls les secteurs reçus par au moins une tablette sont préparés ;
  - un échec sur la même couverture attend un jour ; les fichiers d'une version remplacée sont effacés
    après une semaine.
- **Distribution** :
  - le catalogue signé liste les fonds des secteurs de la tablette ;
  - manifeste, URL de 5 minutes pour les parties, accusé de réception (qui détient quoi) ;
  - un fond est une donnée publique, rattachée à la tablette : il n'est pas tracé au journal.
- **Worker** : chaque emplacement prend son propre travail, et une préparation de fond n'en occupe qu'un
  seul. Les publications ne sont plus retenues par un long travail.

### Lot B — back-office (CAR-03)

- Administration › Fonds de carte (`device:manage`) :
  - source de la plateforme, état de ses droits hors ligne, mention du fond d'essai ;
  - par secteur : fond en vigueur (version, date, taille, tuiles), renouvellement dû, sites modifiés
    depuis, préparation en cours ou échouée avec son motif, tablettes à jour ;
  - « Préparer maintenant », refusé tant que les droits ne sont pas validés.

### Lot C — transfert vers la tablette (CAR-03)

- Manifeste vérifié : signature, empreinte annoncée par le catalogue signé, SIS et secteur.
- Téléchargement partie par partie, hors de la base chiffrée (`files/basemaps/`) :
  - chaque partie est vérifiée avant d'être ajoutée au fichier ;
  - après une coupure, la reprise se fait à la partie suivante ;
  - le fichier entier est revérifié avant l'installation.
- Au-delà de 50 Mo, le fond attend une tâche Android sur réseau non limité. Budget de 2 Go.
- L'ancienne version reste affichée jusqu'au remplacement. Un secteur qui n'est plus reçu perd son fond.
  Tout est effacé à la révocation, rien au changement d'agent.
- Base locale v7 : index des fonds installés.

### Lot D — carte locale (CAR-01, CAR-02)

- MapLibre Native 13.5 (`maplibre_gl` 0.27), lecture `pmtiles://file://`.
- Entrées : icône de l'accueil, « Situer sur la carte » dans la fiche d'un site.
- Un secteur à la fois, avec un sélecteur. Le fond du site visé est choisi d'office.
- Repères :
  - sites installés, dont la position est lue dans les données publiées par une seule requête ;
  - points extérieurs du site visé ;
  - un toucher ouvre une carte d'information avec « Ouvrir la fiche ».
- Libellés en Noto Sans (glyphes PBF de 810 Ko, OFL), copiés une fois en local : aucun appel à un serveur.
- Avertissements « fond non disponible ici », « détail non disponible ici », « aucun fond sur cette
  tablette » et « aucune donnée opérationnelle ». Sans fond, les sites restent placés sur un aplat.
- Attribution et date du fond affichées, distinctes des dates des ETARE.
- « Me situer » : autorisation demandée au premier usage, position affichée et jamais transmise. Un refus
  laisse la carte utilisable.
- Application 0.3.0.

## Base de données

Trois migrations :

- `basemap_pack` et `device_basemap`, couverture, planification, préparation, distribution, nettoyage ;
- `claim_jobs` excluant les types de travaux qu'un worker mène déjà ;
- correction : zones de détail limitées aux sites de version signée (une version publiée avant la
  signature des paquets n'est pas diffusée).

## Tests

| Suite                              | Résultat                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------- |
| Unitaires et composants (`vitest`) | 397 tests, 63 fichiers                                                    |
| Base de données (pgTAP)            | 587 tests, 31 fichiers (dont 280 pour ce sprint)                          |
| Intégration (Auth → API → RLS)     | 139 tests, 31 fichiers (dont `basemaps` : préparation, transfert, verrou) |
| Flutter (`flutter test`)           | 219 tests, 1 ignoré (bout en bout sur demande)                            |
| CI GitHub (3 jobs)                 | au vert sur les lots C et D ; lot B rouge sur un test instable (corrigé)  |

Points couverts par les tests :

- le fichier PMTiles relu par la bibliothèque de référence (en-tête, tuiles, répétitions,
  sous-répertoires, métadonnées) ;
- l'encodeur de tuiles vectorielles ;
- le style IGN rendu local (une source, polices remplacées, rien de distant) ;
- le verrou des droits : jamais une requête vers la source tant que les droits ne sont pas validés ;
- la préparation, le refus d'un secteur trop étendu, une erreur passagère relancée ;
- la planification et le nettoyage ;
- l'intégration de bout en bout : préparation par le worker, catalogue et manifeste signés, parties
  téléchargées et recomposées, accusé, remplacement de version, tablette affectée ailleurs, Plan IGN
  verrouillé ;
- sur la tablette : installation, reprise après coupure, partie altérée, mauvaise signature, report au
  Wi-Fi, remplacement, budget, purge ;
- l'écran de carte (doublure de la vue native) ;
- la migration v6 → v7.

Vérifié dans le navigateur, sur la pile locale, avec un second facteur de test retiré ensuite :

- Administration › Fonds de carte : fond d'essai, droits validés, deux secteurs, versions et tablettes ;
- les onglets Secteurs, Terminaux, Membres et Journal, non vus au Sprint 10 : la réserve est levée.

Vérifié sur l'émulateur Android (APK de débogage 0.3.0, pile locale, fond d'essai) :

- enrôlement d'une tablette affectée au secteur de Nice, synchronisation, fond de 45 Ko installé, puis
  remplacé par la version 2 (l'ancienne effacée du disque) ;
- **mode avion, arrêt de l'application, redémarrage à froid** : déverrouillage par le code, fiche du
  site, carte au zoom 16 avec bâti, noms de voies, site et point d'eau ; vue générale au zoom 12 ;
- toucher d'un site, puis « Ouvrir la fiche » ;
- sortie de la couverture (« Fond de carte non disponible ici ») ;
- demande de localisation refusée, message affiché, carte utilisable ;
- mesures, en build de débogage, donc peu représentatives : 465 Mo de mémoire (PSS), 92 Ko de fond et
  884 Ko de glyphes sur le disque.

## Décisions prises

- ADR-024, mise en œuvre : constat sur le canal IGN, sources, couverture, préparation, distribution,
  tablette, carte.
- Fiche de droits du Plan IGN : modèle à valider par le référent SIG (`docs/sig/fiche-droits-plan-ign.md`).
- `permission_handler` 12 plutôt que 13, qui exige un SDK de compilation 37 que le plugin Gradle
  Android installé ne prend pas encore en charge.

## Écarts

- **Plan IGN réel** :
  - non préparé, faute de fiche de droits validée ;
  - le volume réel d'un secteur reste à mesurer, le fond d'essai étant très léger ;
  - le style IGN rendu local n'est testé que sur un extrait.
- **Tablette de référence** : non livrée. Démarrage à froid en mode avion, mémoire et disque à refaire
  en build de production.
- **Risques extérieurs** : pas encore placés sur la carte de la tablette (sites et points seulement).
- **Un secteur à la fois** : un lieu à la limite de deux secteurs demande de changer de fond.
- **Base locale de développement** : polluée par les tests d'intégration. L'EHPAD de démonstration n'a
  pas de version signée, et sa révision est bloquée par des documents de test. Un site d'essai signé a
  été publié à Nice pour l'émulateur ; tant qu'il y est, le test pgTAP 260 (liste exacte des sites d'un
  secteur) échoue en local. La CI part d'une base neuve ; `pnpm db:reset` rétablit la base locale.

## Dette technique

- Préparation séquentielle des tuiles d'une source distante : un grand secteur au débit convenu peut
  prendre des heures. À mesurer avec CAP-01 et l'IGN.
- Positions des sites lues par `json_extract` à chaque affichage : à mesurer sur un parc de plusieurs
  milliers de sites.
- Espace libre de la tablette non contrôlé avant un téléchargement : l'erreur est rattrapée, mais pas
  anticipée (CAP-02).

## Prochaine étape

Sprint 12 — R4 : SEC-04 (secrets et rotation des clés de signature), CAP-01 (volumétrie, dont la
préparation des fonds et le coût des périmètres) et EXP-03 (supervision, dont les préparations de fonds
échouées). Dès la fiche de droits validée et la tablette livrée : activation du Plan IGN sur un secteur
pilote et qualification de CAR-01 sur matériel.
