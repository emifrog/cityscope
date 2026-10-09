# ADR-033 — Export de réversibilité : toutes les données et tous les fichiers du SIS, sans accès à la base

- Statut : acceptée — Sprint 14, 09/10/2026
- Sources : cahier des charges ADMIN-04 (P1, « CSV/PDF sans accès base direct ») et §3 (« journalisation
  des accès aux sites sensibles et des exports », « exports inter-SIS tracés ») ; modèle économique
  (réversibilité attendue par tout acheteur public) ; DEC-06 (imports/exports, à arbitrer) ; ADR-007 (file
  de travaux et bail), ADR-009 (cycle des fichiers), ADR-024 (parties de 32 Mo), ADR-031 (sauvegarde de
  la plateforme, jamais d’un seul SIS) ; choix du porteur du 9 octobre 2026 (données **et** fichiers)
- Complète l’ADR-009 (purge des objets temporaires)

## Contexte

Un SIS doit pouvoir reprendre ses données en quittant la plateforme, ou les confier à un autre outil,
sans qu’on lui ouvre la base. La sauvegarde (ADR-031) couvre la plateforme entière, chiffrée pour
l’exploitant : elle n’est pas un livrable par SIS. Le PDF ETARE n’est qu’une restitution. Il manquait
un export complet, autorisé, tracé, lisible sans FireScape.

## Décision

1. **Une demande par l’administration du SIS, avec le second facteur** : nouvelle permission
   `export:manage` (privilégiée, `SIS_ADMIN`), un export à la fois par SIS, chaque demande auditée
   (`export.requested`). L’API ne construit rien : elle enregistre la demande (`export_run`) et met un
   travail `export.build` en file, dans la même transaction.
2. **Le worker construit l’export comme il construit les fonds de carte** : il lit les tables par
   fonctions dédiées (liste blanche, filtre par SIS, pages par clé primaire ; les secrets de la
   plateforme, empreinte du code d’enrôlement par exemple, ne sortent jamais), télécharge chaque fichier
   vérifié et chaque PDF publié, et écrit des **parties** dans le stockage objet :
   - `donnees.zip` : chaque table en JSON (une ligne par enregistrement, tel qu’en base), les
     référentiels aussi en CSV (séparateur « ; », UTF-8 avec BOM), `manifeste.json` (tables et nombre
     de lignes, chaque fichier avec son empreinte SHA-256, les parties), `LISEZMOI.md` ;
   - `fichiers-NNN.zip` : les fichiers, par archives de 32 Mo au plus (le stockage plafonne un objet
     à 50 Mo) ; un fichier plus gros est copié comme une partie à lui seul ;
   - chaque objet est enregistré **avant** d’être écrit (clé sous `tenants/<sis>/exports/<export>/`),
     et chaque étape est clôturée par le travail en cours (bail, tentative, clé d’idempotence) ;
   - un travail mort laisse l’export « en échec », jamais « en préparation » ; les erreurs de stockage
     relancent le travail, les autres sont définitives et dites.
3. **Téléchargement contrôlé, 7 jours** : chaque partie se télécharge par une URL signée de 60 s,
   demandée à l’API qui l’audite (`export.downloaded`, numéro et nom de la partie). Les clés de
   stockage ne sont jamais montrées. À l’échéance, la maintenance horaire des fichiers (ADR-009) retire
   les objets et marque l’export « expiré » (`export.purged`) ; un export en échec est purgé un jour après.
4. **Format ouvert, vérifiable** : JSON et CSV sans dépendance à FireScape ; les empreintes du
   manifeste permettent de contrôler chaque fichier, et les publications gardent leurs propres
   empreintes et signatures. Le format porte un numéro (`format: 1`).

## Conséquences

- Onglet « Export de réversibilité » de l’administration : demande, état, parties à télécharger,
  échéance, erreurs. Le second facteur est demandé comme pour les autres actions privilégiées.
- Les fonds de carte des tablettes ne sont pas exportés : données publiques régénérables.
- Volume : l’export tient en mémoire par partie (32 Mo) ; sur 10 000 sites (CAP-01), les données
  restent de l’ordre de quelques dizaines de Mo compressés, les fichiers font la taille de l’export.
  Un seul export à la fois par SIS, et un seul travail `export.build` à la fois par worker.
- Les exports sont des copies des données du SIS dans le stockage de la plateforme, pendant 7 jours
  au plus : couverts par la sauvegarde (ADR-031) comme le reste, purgés avec elle.
- Non retenus : l’export d’un seul site ou d’une seule publication (le PDF le couvre), l’export inter-SIS
  (aucun partage au MVP), le format GeoJSON par couche (INT-03, avec DEC-06).

## Critère de réexamen

Volume de fichiers d’un SIS dépassant ce qu’un travail peut copier en une heure (découpage en
plusieurs travaux), demande d’un format d’échange normalisé par un SIS ou un acheteur (DEC-06), ou
passage à un stockage S3 permettant la copie côté serveur sans transiter par le worker.
