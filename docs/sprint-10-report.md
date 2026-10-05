# Sprint 10 — rapport de livraison

Validation locale du **5 octobre 2026** sur Windows. La CI GitHub tourne sur `main` (branche unique).
Cinq commits :

- sections et annexe photos (`81860be`) ;
- secteurs et périmètres (`7f0e1f0`) ;
- sites sensibles côté serveur (`1977e22`) ;
- tablette (`891666e`) ;
- ce rapport.

Aucun déploiement, aucune donnée réelle.

Périmètre : terminer R3 sans la carte. MET-05, PER-01 et PER-02 appliquent les décisions DEC-04 et DEC-05
du 3 octobre (ADR-025, ADR-026). Choix du porteur du 5 octobre :

- au back-office, les rôles actuels gardent l'accès aux sites sensibles, et tout est tracé ;
- un secteur se compose de communes et de sites ajoutés un à un ;
- l'habilitation aux sites sensibles a une portée et une date de fin (douze mois au plus) ;
- chaque agent a un code de six chiffres sur la tablette ;
- masquer Plans ou Annexes ne touche que le document : la tablette garde ses plans et ses documents.

## Réalisé

### Lot A — sections de l'ETARE et annexe photos (MET-05)

- **Registre unique des sections**, en TypeScript et en Dart : Synthèse, Accès, Risques, Eau, Énergies,
  Moyens de secours, Plans, Contacts, Annexes, Photos.
  - Ordre, tri et numérotation sont identiques dans l'aperçu, le PDF et la tablette.
  - Les points à risque rejoignent la section Risques ; le PDF n'a plus de section « Objets à risque » qui
    décalait la numérotation.
  - Tri commun : points par criticité puis titre sans accents, risques par gravité puis titre.
- **Masquage par le SIS** (Administration › Paramètres, `catalog:manage`, tracé) des sections
  facultatives.
  - Le réglage est figé dans la version soumise ; il n'est écrit que si une section est masquée, si bien
    que les empreintes d'un SIS qui ne masque rien ne changent pas.
  - Plans et Annexes masqués ne quittent que le document ; Énergies, Moyens de secours et Photos
    disparaissent aussi de la tablette.
- **Tablette** : points critiques dans la synthèse, points à risque sous Risques, galerie Photos.
- **PDF `etare-pdf/4`** : annexe photos en fin de document, deux colonnes et trois rangées par page,
  légende, point et section.
  - Chaque photo est réduite à 1 000 px depuis l'original vérifié par son empreinte.
  - Plafonds : 4 photos par point et 40 par PDF, le reste étant signalé comme consultable sur la tablette.
  - Une image illisible est signalée au lieu de bloquer la publication.
  - L'aperçu montre la même annexe.

### Lot B — secteurs et périmètres (PER-01)

- **Secteurs** (Administration › Secteurs) :
  - composés de communes (code INSEE de l'adresse, sites futurs compris) et de sites ajoutés un à un ;
  - un compteur signale les sites hors de tout secteur ;
  - un secteur encore affecté n'est pas archivé.
- **Tablettes** : affectées à tout le SIS, explicitement, ou à des secteurs (colonne « Affectation » de
  l'écran 11).
- **Membres** :
  - limités à des secteurs ou des sites dès l'invitation ou ensuite, tous leurs rôles partageant ce
    périmètre ; l'administration du SIS reste entière ;
  - au back-office, la RLS leur montre leur part du SIS ;
  - ils ne créent pas de site, qui n'appartiendrait à aucun secteur.
- **Catalogue signé** :
  - il contient l'intersection de la tablette et de la personne ;
  - un site qui en sort est retiré au contact suivant avec le motif `perimeter` (« Retiré de votre
    périmètre ») ;
  - la tablette lit désormais un motif inconnu sans bloquer la synchronisation.

### Lot C — sites sensibles, côté serveur (PER-02)

- **Sensibilité effective** : la plus restrictive de la version publiée et du site au moment présent. Un
  site rendu sensible quitte les tablettes au contact suivant, sans attendre une nouvelle publication.
- **Habilitation** nominative et datée (douze mois au plus), pour tout le SIS ou des secteurs, auditée :
  Administration › Membres › Sites sensibles.
- **Distribution** :
  - les sites « restreints » sont proposés à la demande aux personnes habilitées, jamais en masse ;
  - leur paquet porte une fin de consultation à 24 h ;
  - les sites « élevés » ne vont jamais sur une tablette.
- **Journal `access_event`** (ajout seul) :
  - il trace les consultations du site, de l'aperçu et des révisions, les exports (PDF, documents) et les
    ouvertures sur tablette ;
  - les consultations hors ligne remontent par `POST /sync/access-events`, de façon idempotente ;
  - onglet « Journal des sites sensibles » (`audit:read`).
- **PDF d'un site sensible** : réservé aux rôles du back-office du site et, pour un site restreint, aux
  personnes habilitées.

### Lot D — tablette (PER-02, SEC-05 en partie)

- **Code personnel** de six chiffres :
  - choisi à la connexion, saisi sur un pavé à grosses touches sans clavier système ;
  - exigé au démarrage et après 15 minutes d'inactivité, le verrou couvrant toute la navigation ;
  - cinq erreurs déconnectent l'agent, sans rien effacer ;
  - rien du code n'est conservé : PBKDF2-HMAC-SHA-256 à 100 000 tours dans un isolat, mêlé à un secret
    de l'installation.
- **Site restreint** :
  - ouvert avec le réseau et le code, vérifié comme une synchronisation ;
  - chiffré (AES-256-GCM) par une clé propre au site, elle-même enveloppée par le code ;
  - le code est redemandé à chaque ouverture ;
  - effacé après 24 h, au changement d'agent, à la révocation ou au retrait de l'habilitation ; une
    horloge reculée vaut expiration.
- **Journal** : les consultations sont mises en file et remontées après la synchronisation.
- Schéma local v6, vérification des paquets partagée avec la synchronisation, application 0.2.0.

## Base de données

Trois migrations :

- sections masquées par le SIS ;
- secteurs, portée « secteur » de `has_permission`, `holds_permission_on_part`, affectation des
  terminaux, catalogue à l'intersection, retraits « périmètre » ;
- sensibilité effective, `sensitive_habilitation`, `access_event`, `on_demand`.

## Tests

| Suite                              | Résultat                                                            |
| ---------------------------------- | ------------------------------------------------------------------- |
| Unitaires et composants (`vitest`) | 353 tests, 58 fichiers                                              |
| Base de données (pgTAP)            | 560 tests, 30 fichiers (dont 250, 260 et 270 pour ce sprint)        |
| Intégration (Auth → API → RLS)     | 132 tests, 30 fichiers (dont sections, périmètres, sites sensibles) |
| Flutter (`flutter test`)           | 195 tests, 1 ignoré (bout en bout sur demande)                      |
| CI GitHub (3 jobs)                 | au vert sur chaque commit du sprint (lots A à D)                    |

L'intégration couvre :

- le réglage figé dans une révision et inchangé quand le SIS change d'avis ;
- la tablette affectée ailleurs puis à un secteur, l'agent limité, l'archivage refusé tant qu'un secteur
  est affecté ;
- le lecteur limité qui ne voit que les sites de son secteur ;
- le site restreint absent sans habilitation, puis proposé à la demande avec 24 h de consultation ;
- le journal (une seule consultation remontée deux fois, consultation du back-office, export) ;
- le site élevé jamais servi.

Le PDF a été rendu et relu page par page : sections numérotées, objet à risque sous Risques, annexe en
grille, plafond par point, image illisible signalée.

Vérifié dans le navigateur, sur la pile locale :

- la carte « Sections de l'ETARE » ;
- l'aperçu d'un dossier avec Énergies et Photos masquées (numérotation continue, mention des sections
  masquées), puis le réglage rétabli.

Vérifié sur l'émulateur Android (APK de debug 0.2.0, pile locale) :

- connexion de l'agent OPS de démonstration, puis écran « Choisissez votre code » et saisie double sur le
  pavé ;
- application verrouillée au redémarrage ;
- mauvais code refusé avec « encore 4 essais avant la déconnexion », puis bon code accepté.

## Décisions prises

- ADR-026, mise en œuvre : registre, précision du porteur sur Plans et Annexes, tri commun, annexe.
- ADR-025, mise en œuvre : secteurs par communes, habilitation, journal, code personnel, sites
  restreints chiffrés.
- ADR-014 complété (gabarit `etare-pdf/4`, emplois de sharp).

## Écarts

- **Onglets Secteurs, Terminaux (affectation), Membres (périmètre, habilitation) et Journal** : non vus
  dans le navigateur. Ils exigent le second facteur de l'administrateur de démonstration, et
  l'assouplissement temporaire de cette règle en base locale a été refusé (non contourné). Leur API est
  couverte de bout en bout par l'intégration.
- **Tablette** :
  - le verrou est éprouvé sur l'émulateur ;
  - l'ouverture d'un site sensible est couverte par les tests Flutter (service réel contre un serveur
    simulé, parcours d'interface), mais pas sur l'émulateur : enrôler la tablette demande le second
    facteur de l'administrateur ;
  - essai sur la tablette physique toujours attendu.
- **À confirmer par le RSSI et la direction opérationnelle** : 24 h, code à six chiffres, cinq essais,
  15 minutes, traitement des sites élevés au back-office.
- **Déploiement** : relever `MOBILE_MIN_APP_VERSION` à 0.2.0, car une application antérieure refuse un
  catalogue qui contient le motif `perimeter`.

## Dette technique

- Coût de `has_permission` pour un membre limité : vérification d'appartenance au secteur ligne à ligne,
  à mesurer avec la volumétrie (CAP-01).
- Changement d'agent hors ligne impossible sur une tablette partagée (connexion en ligne requise).
- Code à six chiffres exposé à un essai exhaustif par qui détient à la fois la base et le secret de
  l'installation (borné par les 24 h).
- Toujours à traiter avant le pilote : SEC-04 (secrets), SEC-05 (reste du terminal), supervision,
  livraison Android.

## Prochaine étape

Sprint 11 : CAR-01 à CAR-03 (fonds IGN par secteur et carte locale), dès que la fiche de droits est
validée par le référent SIG et que la tablette de référence est livrée. En attendant, R4 se poursuit :
SEC-04, CAP-01 (dont le coût des périmètres) et EXP-03.
