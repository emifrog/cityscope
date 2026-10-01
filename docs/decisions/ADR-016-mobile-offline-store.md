# ADR-016 — Installation hors ligne sur la tablette

- Statut : acceptée — Sprint 4, 01/10/2026
- Sources : cahier des charges OFF-01 à OFF-04, OPS-05, §6.2 ; architecture technique §06 (structure locale),
  §11 (synchronisation descendante), §12 (fonctionnement dégradé), §19 (autorisation hors ligne) ;
  complète ADR-004 et ADR-015

## Contexte

L’application OPS lit toujours son référentiel local (ADR-004). Elle doit installer des publications
signées (ADR-015) sans jamais exposer un contenu non vérifié ni un mélange d’ancien et de nouveau, chiffrer
ce qu’elle conserve (OFF-03), reprendre après une coupure et dire en permanence l’âge de ses données
(OPS-05).

## Décision

1. **Tout le contenu dans la base SQLCipher.** Les fichiers des paquets (plans, PDF, documents) sont stockés
   en BLOB dans la base chiffrée (`file_blob`, adressés par SHA-256 et partagés entre versions), à côté des
   versions installées (`installed_publication`, manifeste et signature tels que reçus), des fichiers de
   données (`site_data`) et de l’index de recherche (`site_search`). Un seul mécanisme de chiffrement
   couvre donc données et fichiers ; aucun fichier en clair dans le répertoire de l’application.
2. **Vérifier avant d’installer.** Le catalogue n’est accepté que signé par une clé de catalogue approuvée,
   émis pour ce terminal, ce SIS et l’utilisateur connecté (sujet de son jeton), et d’une génération au
   moins égale à la dernière acceptée (pas de rejeu). Chaque manifeste doit être signé par une clé de
   publication approuvée, avoir l’empreinte annoncée par le catalogue, désigner le bon site et la bonne
   version, n’avoir que des chemins relatifs sûrs et une version de lecteur compatible. Le fichier de
   données et chaque fichier sont contrôlés en taille et en SHA-256.
3. **Zone de préparation et activation atomique.** Les fichiers vérifiés sont déposés dans `file_blob` ;
   ils ne deviennent visibles qu’une fois référencés. L’activation (versions, fichiers, données, index,
   état, autorisation) se fait en **une transaction**, qui refuse une version dont un fichier obligatoire
   manque : après une coupure, la base contient l’ancien jeu ou le nouveau, jamais un mélange.
4. **Échecs localisés, reprise.** Une version refusée (signature, empreinte, fichier corrompu) n’est pas
   installée ; la précédente reste et l’échec est remonté dans l’accusé (`partial`). Une coupure réseau
   arrête la synchronisation après activation de ce qui est prêt ; les fichiers déjà vérifiés sont
   conservés et ne sont pas retéléchargés à la reprise. Les fichiers qu’aucune version ne référence plus
   sont effacés.
5. **Autorisation locale et horloge.** Le catalogue accorde 7 jours de consultation à un utilisateur ; un
   autre utilisateur de la tablette doit synchroniser pour consulter. L’heure retenue n’est jamais
   antérieure à la dernière heure connue du serveur ni à la dernière synchronisation : reculer l’horloge ne
   prolonge rien. Un refus pour horloge décalée est corrigé une fois avec l’en-tête `Date` du serveur.
6. **Fraîcheur visible (OPS-05)** : « à jour » moins de 24 h après la dernière synchronisation réussie,
   « en retard » au-delà (renouvellement quotidien de l’architecture §19), « erreur » si la dernière
   tentative a échoué, « jamais synchronisé ». L’état du réseau n’est jamais présenté comme une preuve de
   fraîcheur.
7. **Révocation.** Un refus `DEVICE_REVOKED`, `DEVICE_NOT_ENROLLED` ou `DEVICE_PROOF_INVALID` efface les
   données installées, l’état et l’identité du terminal (graine de sa clé), puis compacte la base. Un refus
   `FORBIDDEN` (droits retirés à l’utilisateur) met fin à son autorisation locale sans effacer la tablette.
8. **Identité du terminal** : identifiant, SIS et graine Ed25519 dans le stockage sécurisé (Keystore),
   jamais dans la base ni les sauvegardes.

## Conséquences

- La taille de la base suit celle des paquets (hypothèse de 4 à 6 Go pour 500 dossiers, architecture §12) :
  à mesurer sur la tablette cible ; l’espace libre n’est pas encore vérifié avant téléchargement.
- Un fichier est lu entièrement en mémoire (téléchargement, vérification, affichage) : acceptable pour des
  plans et PDF de quelques Mo, à revoir pour de gros documents (jusqu’à 50 Mo).
- Synchronisation au premier affichage de l’accueil et à la demande ; pas encore de tâche de fond Android
  (WorkManager) ni de reprise par blocs d’un même fichier.
- Les documents « à la demande » sont listés mais pas téléchargés.
- Un test de bout en bout optionnel (`apps/mobile/test/e2e`) enrôle le client Dart auprès de l’API
  TypeScript réelle et installe ses publications : il a révélé et fait corriger l’identité portée par
  l’autorisation (sujet du jeton, pas l’identifiant interne).

## Complément du Sprint 5 — file des signalements (ADR-017)

Le schéma local passe en v3 : tables `field_report` et `field_report_photo`, dans la même base
SQLCipher. Un signalement y est enregistré hors ligne avec ses photos (BLOB), lié à son auteur ; le
corps transmis est reconstruit à l'identique depuis ces colonnes, de sorte qu'un renvoi après un accusé
perdu rend le même signalement côté serveur. Les photos sont retirées de la tablette une fois le
signalement transmis et leur contrôle demandé. La purge de révocation efface aussi la file ; le
message de purge indique combien de signalements non transmis ont été effacés.

Les PDF (dossier ETARE, documents installés) sont lus par `pdfrx` depuis la mémoire : octets lus dans
la base chiffrée, ouverture par PDFium en mémoire (`FPDF_LoadMemDocument`, ou lecture par rappels
au-delà de 1 Mo), sans fichier temporaire.

## Critère de réexamen

Mesures sur la tablette cible (taille de base, temps d’ouverture d’une fiche < 2 s, mémoire), ou besoin de
lecture en flux de gros documents.

## Complément du Sprint 6 — documents « à la demande » (DOC-02)

- Un document `on_demand` figure dans le manifeste signé comme fichier non obligatoire (taille,
  empreinte, type) ; il n'est ni compté dans la taille annoncée par le catalogue ni téléchargé par la
  synchronisation. La tablette le liste avec sa taille et son état.
- Le téléchargement est **explicite** (bouton de l'écran du document) et passe par la même requête
  signée que la synchronisation (`POST /sync/publications/{id}/downloads`, auditée). Le fichier est
  vérifié contre la taille et l'empreinte du manifeste de la **version installée**, puis rangé dans
  `file_blob` (base chiffrée), seulement si une version installée le référence encore : une
  synchronisation concurrente ne peut pas laisser un fichier orphelin visible.
- Conservation : tant qu'une version installée le référence (le nettoyage des fichiers orphelins de
  l'activation s'en charge ensuite), jusqu'au retrait par l'agent (jamais un fichier obligatoire) ou à
  la purge. Une version plus récente publiée sur le serveur rend le document indisponible pour
  l'ancienne : l'agent est invité à synchroniser.
- Messages exacts : sans réseau (le document manque, il faudra du réseau), version plus distribuée,
  fichier altéré (rien n'est enregistré), tablette refusée (la synchronisation purge).
- La synchronisation n'a plus lieu seulement à l'ouverture : tâche de fond Android, reprise au retour,
  budget sur réseau mobile et bail partagé entre moteurs (schéma local v5), voir l'ADR-018.
