# ADR-015 — Distribution hors ligne signée et terminaux enrôlés

- Statut : acceptée — Sprint 4, 01/10/2026
- Sources : cahier des charges §3.1 (matrice des droits), §6 (paquet, synchronisation, sites sensibles),
  OFF-01 à OFF-04, ADMIN-02 ; architecture technique §09 (signature du manifeste), §10 (contrat du
  paquet), §11 (synchronisation descendante), §19 (sécurité du terminal) ; modèle de données §9 ; complète
  ADR-004 et ADR-005

## Contexte

Une publication immuable (ADR-005, ADR-013) doit atteindre les tablettes et y rester consultable sans
réseau. Le terminal doit pouvoir prouver l’origine de ce qu’il installe, le serveur doit savoir quel
terminal l’interroge, et un terminal perdu doit pouvoir être refusé.

## Décision

1. **Deux clés Ed25519 serveur, deux usages.** La clé de **publication** (worker seulement) signe le
   manifeste canonique pendant la fabrication ; la signature détachée (`algorithm`, `key_id`,
   `signature`) est enregistrée avec la publication (`manifest_signature`, immuable). La clé de
   **catalogue** (API seulement) signe le catalogue de chaque terminal. Une compromission de l’API ne
   permet donc pas de forger un contenu. Le terminal ne fait confiance qu’aux clés publiques embarquées
   dans sa configuration, chacune liée à son usage (`publication:` ou `catalog:`). L’identifiant d’une
   clé dérive de sa clé publique (`ed25519-` + 16 caractères du SHA-256) : une rotation consiste à
   ajouter la nouvelle clé publique à l’application, puis à changer la clé privée du serveur.
2. **Ce qui est signé est un texte exact** : une ligne de contexte (`etare.manifest.v1`,
   `etare.catalog.v1`, `etare.device-request.v1`, `etare.enrollment.v1`) suivie du contenu (JSON
   canonique). Le manifeste et les données voyagent comme chaînes : le terminal vérifie la signature et
   l’empreinte sur ces octets avant de les lire ; il n’a jamais à recanoniser.
3. **Terminaux enrôlés.** L’administrateur (`device:manage`, second facteur) déclare un terminal et
   obtient un **code à usage unique** de 12 caractères (60 bits, valable 24 h, seul son SHA-256 est
   conservé). Sur la tablette, l’utilisateur connecté (`offline:download`) saisit le code ; l’application
   génère sa paire de clés, envoie la clé publique et **prouve détenir la clé privée** en signant le code.
   L’enrôlement est définitif ; la révocation aussi.
4. **Chaque requête de synchronisation est signée par le terminal** (`X-Device-Id`, `X-Device-Time`,
   `X-Device-Signature`) sur la méthode, le chemin exact, l’heure et le SHA-256 du corps reçu ; l’horloge
   doit être à 5 minutes de celle du serveur (`DEVICE_CLOCK_SKEW` sinon). Le jeton de l’utilisateur reste
   exigé : la requête est celle d’une personne habilitée sur un terminal enrôlé.
5. **Catalogue complet, génération monotone.** `GET /sync/catalog` liste toutes les publications que le
   terminal peut détenir (un site absent doit être retiré) : publiées, signées, non sensibles, lisibles
   par l’utilisateur, avec la taille des fichiers obligatoires. Une génération par SIS
   (`distribution_generation`) avance à chaque version qui entre en publication ou en sort ; elle est
   lue dans le même instantané que la liste. Le catalogue porte l’**autorisation de consultation locale**
   de l’utilisateur : 7 jours (proposition pilote de l’architecture §19, à arbitrer par le RSSI).
6. **Paquet et fichiers.** `GET /sync/publications/{id}` rend le manifeste signé et le fichier de données
   tels que fabriqués (l’API refuse de servir un manifeste dont l’empreinte ne correspond pas).
   `POST /sync/publications/{id}/downloads` donne des URL de 5 minutes pour les seuls fichiers demandés
   **par empreinte** et présents dans le manifeste ; le téléchargement est audité
   (`publication.offline_download`).
7. **Différentiel par empreinte** (arbitrage du point ouvert de l’ADR-004) : le cahier des charges parle de
   retransmettre les « objets modifiés » (OFF-02), l’architecture de fichiers adressés par empreinte
   (§11, prioritaire pour l’infrastructure). Retenu : un site inchangé n’est pas retéléchargé ; pour un
   site modifié, seuls les plans, documents et PDF d’empreinte nouvelle sont transférés, plus son fichier
   de données (quelques dizaines de Ko).
8. **Reçus et administration.** `POST /sync/receipts` (jusqu’à 1 Mo) enregistre la génération installée,
   l’issue (`installed`, `partial`, `error`) et les publications actives du terminal
   (`device_publication`, pour retrouver les terminaux restés sur une version). L’onglet « Terminaux »
   montre version d’application, dernier utilisateur, dernière synchronisation, sites installés et état
   (à jour, en retard au-delà de 7 jours, erreur, révoqué).
9. **Révocation** : refus immédiat de toute requête du terminal (`DEVICE_REVOKED`) ; l’application efface
   alors ses données. Hors réseau, l’exposition restante est bornée par l’autorisation locale.
10. **Droits** : `offline:download` est accordé à l’administrateur, au rédacteur et au validateur, comme le
    prévoit la matrice du cahier des charges (§3.1) ; il ne l’était qu’à l’intervenant OPS.

## Conséquences

- Les publications antérieures (dont la publication de démonstration du seed) ne sont pas signées : elles
  ne sont pas distribuées tant qu’une nouvelle version n’est pas publiée ; l’administration les compte.
- Sans clé configurée, l’API répond 503 aux terminaux et le worker publie sans signature (il l’annonce) ;
  les deux clés sont obligatoires en préproduction et en production. Localement, `pnpm setup:local` les
  génère, les conserve et écrit les clés publiques dans la configuration du mobile.
- Sites sensibles (`restricted`, `high`) : exclus de la distribution au Sprint 4, faute de la politique
  renforcée du cahier des charges §6.3 (rôles, durée, authentification avant déchiffrement).
- Pas encore de secteurs ni de profils de synchronisation : le périmètre d’un terminal est le SIS entier.
- Les clés privées sont lues dans l’environnement ; un gestionnaire de secrets ou un KMS est à brancher
  avant la production. Pas de limitation de débit sur les codes d’enrôlement (60 bits, 24 h).
- Le retrait signé d’une version (architecture §09) n’a pas d’interface : une version retirée disparaît du
  catalogue suivant.

## Critère de réexamen

Arrivée des secteurs et profils de synchronisation, politique des sites sensibles, ou passage à un KMS.
