# Sprint 13 — rapport de livraison

Validation locale du **7 octobre 2026** sur Windows. La CI GitHub tourne sur `main` (branche unique).
Huit commits :

- clé du terminal dans le Keystore et politique des tablettes, côté serveur (`0195297`) ;
- sécurité de la tablette (`1e09315`) ;
- gros fichiers sur la tablette (`f850042`) ;
- livraison de l'application Android (`1d88c25`) ;
- trois correctifs du nouveau job de CI « Android release » (`5e3e905`, `fc38d60`, `852ed9d`) ;
- ce rapport.

Aucun déploiement, aucune donnée réelle.

Périmètre : suite de R4, sans attendre l'hébergement, avec SEC-05 (terminal), CAP-02 (gros fichiers) et
EXP-04 (livraison mobile). Choix du porteur du 7 octobre :

- **terminal** :
  - politique réglée par chaque SIS, durcie par défaut : verrouillage après 5 min d'inactivité, dès la
    sortie de l'application, captures interdites, mot de passe tous les 30 jours ;
  - la politique voyage dans le catalogue signé, sur une horloge monotone ;
  - la révocation efface session, code et clé locale ;
- **intégrité** : analyse écrite, sans détection de root, attestation ni épinglage. La clé du terminal
  passe dans le Keystore matériel ;
- **gros fichiers** :
  - espace contrôlé avant chaque téléchargement, « stockage plein » expliqué ;
  - images décodées à la taille de l'écran ;
  - fichiers en morceaux dans la base chiffrée, mesurés sur émulateur ;
- **livraison** : APK signé par une clé créée hors ligne et détenue par l'exploitant, construction
  traçable, préproduction installable à côté, identifiant `fr.etare.ops` définitif.

## Réalisé

### Lot A — clé du terminal et politique des tablettes, côté serveur (SEC-05)

- **Algorithme de la clé du terminal** :
  - `ed25519` pour les tablettes de la première génération, `ecdsa-p256` pour une clé du Keystore ;
  - l'enrôlement l'annonce ;
  - chaque requête est vérifiée dans l'algorithme de la clé (SHA256withECDSA, signature DER, pour P-256).
- **Rotation** demandée par la tablette (`POST /sync/device-key`) :
  - requête signée par la clé actuelle, texte de rotation signé par la nouvelle ;
  - l'ancienne clé est refusée aussitôt ;
  - auditée avec les empreintes des deux clés. Jamais pour une tablette révoquée.
- **Politique des tablettes du SIS** :
  - réglages : inactivité (1–60 min), verrouillage en quittant l'application (0–600 s), captures,
    reconnexion par mot de passe (1–90 jours), consultation hors ligne (1–14 jours) ;
  - réglée avec `device:manage` et un second facteur, bornée, auditée ;
  - portée par le catalogue, qui en tire la fin de l'autorisation de consultation.
- **Administration › Terminaux** : carte « Politique des tablettes », type de clé de chaque tablette
  (matérielle ou logicielle).

### Lot B — sécurité de la tablette (SEC-05)

Application 0.5.0, schéma local v9.

- **Clé du terminal dans le Keystore Android** :
  - ECDSA P-256, StrongBox si présent, jamais extractible ;
  - une tablette Ed25519 y passe à sa synchronisation par la rotation du lot A. Une réponse perdue est
    reprise au passage suivant ;
  - clé perdue (Keystore réinitialisé) : purge, puis réenrôlement.
- **Plugin local `etare_platform`** : Keystore, horloge monotone (temps depuis le démarrage, nombre de
  démarrages), espace libre, `FLAG_SECURE`.
- **Heure de confiance** :
  - chaque catalogue pose un repère (heure du serveur, horloge monotone) ;
  - sans redémarrage, reculer ou avancer l'horloge ne change rien ;
  - après un redémarrage, l'heure ne descend jamais sous la plus haute constatée.
- **Verrouillage selon le SIS** :
  - inactivité ;
  - sortie de l'application, avec un voile pendant le délai ;
  - captures et aperçus interdits par défaut ;
  - reconnexion par mot de passe.
- **Révocation complète** :
  - données, fonds, identité et clés du Keystore ;
  - puis session, code personnel, secret de l'installation et nouvelle clé de la base locale ;
  - l'agent lit le motif à la connexion.
- **Tablette partagée** : rien de l'agent précédent ne reste. La carte ne montre plus rien sans
  autorisation de consultation (faille corrigée).
- **[ADR-029](decisions/ADR-029-terminal-security.md)** : analyse des risques. Détection de root,
  attestation et épinglage ne sont pas retenus, avec leurs raisons ; à revoir avec SEC-06.

### Lot C — gros fichiers sur la tablette (CAP-02)

Schéma local v10. Mesures : [volumetrie/cap-02.md](volumetrie/cap-02.md).

- **Fichiers par morceaux de 1 Mio** dans la base chiffrée (`file_chunk`).
  - L'empreinte est calculée au fil de l'eau. Un fichier n'est visible qu'une fois complet et vérifié.
  - La reprise en cours de fichier passe par une requête `Range`. Un stockage qui l'ignore fait tout
    reprendre, sans mélange.
  - Un fichier altéré ne laisse aucun morceau.
- **Lecture** :
  - PDF ouverts par PDFium avec des rappels de lecture, 4 morceaux au plus en mémoire ;
  - plans décodés à 4 096 px au plus, photos en plein écran à 2 560 px ;
  - contenus libérés à la fermeture des écrans.
- **Espace** :
  - vérifié avant chaque version, document à la demande, site sensible et fond de carte ;
  - place demandée : nouvelle version entière moins ce qui est déjà reçu, plus 10 % et 64 Mo ;
  - disque plein reconnu (`SQLITE_FULL`, `ENOSPC`) ;
  - messages pour l'agent, codes `STORAGE_INSUFFICIENT` et `STORAGE_FULL` dans l'accusé et la
    supervision.
- **Bilan des fonds de carte** affiché après la synchronisation : installés, en attente du Wi-Fi, non
  installés et pourquoi.

### Lot D — livraison de l'application Android (EXP-04)

[ADR-030](decisions/ADR-030-mobile-delivery.md), procédure
[livraison-mobile.md](exploitation/livraison-mobile.md).

- **Variantes** : `prod` (`fr.etare.ops`, définitif, variante par défaut) et `staging`
  (`fr.etare.ops.staging`, « FireScape préprod »), installables côte à côte.
- **Signature** : la release est signée par la clé désignée par `ETARE_ANDROID_SIGNING`. Elle n'est jamais
  signée par la clé de debug : sans clé, la construction s'arrête. R8 et réduction des ressources sont
  actifs.
- **Garde-fou** : en release, l'application refuse l'environnement `dev`, et tout environnement qui n'est
  pas celui de sa variante.
- **`pnpm mobile:release`** :
  - `signing-key` : magasin PKCS12 (RSA 4096, 30 ans) créé hors du dépôt. Le mot de passe ne passe jamais
    en argument. L'empreinte publique du certificat est affichée ;
  - `build` : depuis un commit propre, configuration vérifiée. Produit l'APK, son SHA-256 et une fiche
    (identifiant, versions, commit, Flutter, environnement, certificat) ;
  - `verify` : signataire unique, jamais la clé de debug, certificat et identifiant attendus.
- **« À propos »** : version, variante, commit, et licences (paquets, SQLCipher, OpenSSL 3.6, glyphes
  Noto Sans).
- **Mises à jour** :
  - un catalogue d'un format plus récent dit la version exigée ;
  - migration de la base locale testée d'un coup, de v1 à v10.
- **CI** : nouveau job qui construit la préproduction en release avec une clé jetable, la vérifie, et
  constate qu'une release sans clé est refusée.

## Base de données

Une migration (lot A) :

- algorithme et date de rotation de la clé du terminal, avec contrôle du format ;
- rotation par fonction réservée à l'API, sous garde ;
- politique des tablettes (lecture, lecture par la tablette, mise à jour bornée et auditée), dont la
  modification fait avancer la génération du catalogue.

Schéma local de la tablette : v9 (politique, heure de confiance), v10 (morceaux de fichiers).

## Tests

| Suite                              | Résultat                                                                                            |
| ---------------------------------- | --------------------------------------------------------------------------------------------------- |
| Unitaires et composants (`vitest`) | 454 tests, 72 fichiers                                                                              |
| Base de données (pgTAP)            | 669 tests, 35 fichiers (dont 320 pour ce sprint)                                                    |
| Intégration (Auth → API → RLS)     | 154 tests, 34 fichiers, dont `terminal-security` ; `antivirus` et `signing-keys` optionnels hors CI |
| Flutter (`flutter test`)           | 298 tests, 1 ignoré (bout en bout sur demande)                                                      |
| APK de release                     | préproduction construite, signée par une clé d'essai et vérifiée, en local et en CI                 |
| CI GitHub (4 jobs)                 | au vert sur `852ed9d`, dont l'APK de release de préproduction construit, vérifié et refusé sans clé |

Au dernier passage local, les 3 tests de `signing-keys` ont été ignorés : OpenBao n'était pas configuré
dans le terminal. Ils passent en CI, et passaient en local au lot A.

Points couverts par les tests :

- clé du terminal :
  - vecteurs fixes Ed25519 et P-256 (DER) ;
  - rotation signée par l'ancienne et la nouvelle clé, ancienne refusée aussitôt ;
  - rotation reprise après une réponse perdue, clé perdue suivie d'une purge ;
- politique : bornes, second facteur, audit, génération du catalogue, valeurs par défaut ;
- heure de confiance : horloge reculée ou avancée, redémarrage, plus haute heure constatée ;
- verrouillage :
  - inactivité, sortie avec voile ;
  - mot de passe après la durée ;
  - tablette partagée (carte comprise) ;
  - révocation jusqu'à la déconnexion ;
- gros fichiers :
  - morceaux et lecture par plages ;
  - coupure en cours de fichier puis reprise, stockage qui ignore la plage ;
  - fichier altéré, téléchargement partiel devenu orphelin ;
  - place insuffisante (synchronisation, document, fond de carte), disque plein reconnu ;
- livraison :
  - configuration de release (environnement, variante) ;
  - fiche et vérification de l'APK (lecture des sorties d'`apksigner`, `aapt2` et `keytool`) ;
  - licences embarquées ;
  - migrations v9 → v10 et v1 → v10.

Vérifié sur l'émulateur Android (pile locale) :

- **lot B**, application 0.5.0 en debug :
  - mise à jour depuis 0.4.0, puis reconnexion demandée ;
  - rotation Ed25519 → P-256 du Keystore acceptée par le serveur (audit `device.key_rotated`) ;
  - capture noire (`FLAG_SECURE`) ;
  - avec une sortie autorisée 30 s : retour à 5 s sans code, à 40 s verrouillé ;
- **lot C**, site de mesure (plan de 12 000 × 8 000 px, PDF de 43 Mo, document à la demande de 29 Mo) :
  - synchronisation de 96 Mo coupée à 35,8 Mo, reprise avec réponse 206, moins de 1 Mo retéléchargé ;
  - mémoire plate pendant la reprise ;
  - plan affiché, PDF parcouru jusqu'à la page 19, document à la demande téléchargé et ouvert ;
- **lot D** :
  - APK de préproduction en release (122 Mo, clé d'essai) installé à côté de l'application de
    développement : il démarre, fenêtre protégée, configuration acceptée ;
  - une connexion vers l'hôte fictif répond « Réseau indisponible » : R8 n'a rien cassé ;
  - l'application de développement, passée à la variante `prod`, a gardé ses données.

Vérifié dans le navigateur (carte du lot A, pendant le lot B), avec un second facteur de test retiré ensuite : carte « Politique des
tablettes », réglage modifié puis audité.

## Décisions prises

- [ADR-029](decisions/ADR-029-terminal-security.md) :
  - clé du terminal dans le Keystore ;
  - politique des tablettes du SIS et heure de confiance ;
  - révocation complète ;
  - analyse des risques : détection de root, attestation et épinglage non retenus.
- Complément de l'[ADR-016](decisions/ADR-016-mobile-offline-store.md) : fichiers par morceaux, reprise,
  lecture par plages, espace et disque plein. Pas de stockage chiffré alternatif.
- [ADR-030](decisions/ADR-030-mobile-delivery.md) :
  - clé de release détenue par l'exploitant ;
  - variantes, construction tracée, distribution par APK ;
  - pas d'offuscation, iOS hors périmètre.

## Écarts

- **Terminal** :
  - l'analyse des risques est à revoir avec SEC-06 ;
  - un code à six chiffres reste exposé à un essai exhaustif par qui détient la base et le secret de
    l'installation ;
  - un Keystore réinitialisé impose un réenrôlement ;
  - le changement d'agent exige le réseau.
- **Gros fichiers** :
  - mesures faites sur émulateur en debug, à refaire sur la tablette cible avec l'APK de release ;
  - plans et photos sont encore relus entiers avant décodage ;
  - les fichiers d'un site sensible sont scellés entiers ;
  - les parties de 32 Mio d'un fond de carte sont tenues entières le temps de leur vérification.
- **Livraison** :
  - la vraie clé est à créer lors de la première cérémonie des clés ;
  - mode de distribution (MDM ou manuel) à trancher (DEC-01) ;
  - APK universel de 122 Mo, qui pourrait être scindé par architecture pour la tablette ;
  - construction rejouable, mais pas identique à l'octet près.
- **Job de CI « Android release »** : vert au troisième correctif.
  - Le plugin de carte exige un JDK 21. La CI en installait un 17, la procédure de livraison le disait aussi.
  - Les build-tools du runner sont plus récents : `apksigner` y écrit « V2 Signer: » au lieu de
    « Signer #1 ». La lecture accepte les deux formats, avec un test sur la sortie relevée.
- **Défaut trouvé sur l'émulateur, corrigé avant le commit du lot C** : sur la base chiffrée de la tablette,
  un `PRAGMA` ne rendait pas le nom de colonne attendu. Le calcul de la place réutilisable faisait donc
  échouer la synchronisation, alors que les tests sur l'hôte passaient. La valeur est désormais lue sans
  se fier au nom.
- **Poste de développement** :
  - la configuration Gradle personnelle limite la mémoire à 512 Mo ;
  - la compilation Kotlin incrémentale échoue quand le projet et le cache Pub sont sur deux lecteurs ;
  - `pnpm mobile:release build --gradle-home` contourne les deux.
- **Données locales** : deux sites « Mesure CAP-02 » (environ 200 Mo de fichiers) restent dans la base de
  développement du SIS 06. La politique des tablettes du SIS 06 est revenue aux valeurs par défaut.

## Dette technique

- Les journaux de l'application (`developer.log`) ne passent pas par logcat. Le diagnostic sur
  l'émulateur a demandé le service de la VM Dart. Un relais vers logcat en debug aiderait.
- Un décodage d'image alimenté par morceaux supprimerait le pic de mémoire à l'ouverture d'un grand plan.
- 17 paquets Dart ont des versions plus récentes hors contraintes. Plusieurs plugins annoncent la
  migration « Built-in Kotlin » de Flutter.

## Prochaine étape

Avec la décision d'hébergement (DEC-03) :

- EXP-01 (préproduction, déploiement coordonné, retour arrière) et EXP-02 (sauvegarde et restauration
  mesurées) ;
- première cérémonie des clés, clé Android comprise ;
- mesures de CAP-01 et CAP-02 en préproduction, avec l'APK de release sur la tablette cible.

Sans l'attendre : EXP-05 (parcours de bout en bout automatisés, échecs injectés) et la préparation de
SEC-06 (contrôle des dépendances, SAST).
