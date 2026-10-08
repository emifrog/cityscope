# ADR-031 — Sauvegarde et restauration : archive chiffrée hors site, restauration contrôlée

- Statut : acceptée — préproduction (EXP-02), 08/10/2026
- Sources : roadmap EXP-02 (« sauvegardes chiffrées, restauration base + objets + configuration de clés,
  mesure RPO/RTO, répétition d'un parcours publié/restauré et vérification des empreintes ») ; DEC-07
  (RPO/RTO et durée de conservation, à fixer par les responsables) ; ADR-015 et ADR-027 (signatures,
  jeu de clés) ; ADR-028 (alerte « sauvegarde absente ») ; choix du porteur du 8 octobre 2026
  (stockage objet Scaleway, Paris)
- Complète l'ADR-027 (garde des clés) pour les clés de chiffrement des archives

## Contexte

La préproduction repose sur un projet Supabase managé (base, comptes, fichiers) et sur un VPS (web,
worker, clés de signature, configuration). Les sauvegardes de Supabase restent chez Supabase, dans la
même région : elles ne protègent ni contre la perte du compte ni contre une erreur répliquée, et leur
restauration n'est pas éprouvée par nous. Une restauration utile doit rendre ce que les tablettes
reçoivent : des publications dont le manifeste correspond à son empreinte et à une signature de
confiance, avec chaque fichier à son contenu. Une restauration qui « réussit » sans ce contrôle ne
prouve rien.

## Décision

1. **Une archive par nuit, chiffrée sur le serveur, déposée hors site.**
   - Base : données des schémas `app` et `auth` (`pg_dump --data-only`, un seul instantané).
     - Le schéma n'est pas dans l'archive. Il vient des migrations du dépôt, rejouées sur la cible :
       le dépôt reste la seule source du schéma, et le schéma `app` exporté n'est gardé que pour
       mémoire.
     - Sessions et jetons sont exclus : chacun se reconnecte après une restauration.
   - Fichiers : tous les objets que `storage.objects` liste, copiés par le protocole S3 de Supabase
     dans une copie locale incrémentale. Ceux qui ont disparu entre-temps sont listés.
   - Configuration du serveur : fichiers `.env` et `secrets/`, de quoi reconstruire le VPS.
   - Chaque fichier de l'archive est inscrit au manifeste avec son empreinte. Le manifeste indique
     aussi les lignes par table et l'historique des migrations.
   - Chaîne : `tar | zstd | age`, pour deux clés publiques (principale et secours). Les clés privées
     sont hors ligne, gardées comme la racine des jeux de clés (ADR-027) : le serveur ne peut pas
     relire ses propres archives.
   - Dépôt : Scaleway Object Storage, région de Paris, chez un autre fournisseur que Supabase et
     Hostinger. Bucket versionné. La clé du serveur n'a que le droit d'écrire : ni lecture, ni liste,
     ni suppression. La rétention passe par le cycle de vie du bucket.
2. **Un rôle de sauvegarde, pas les rôles applicatifs.**
   - `etare_backup` lit tout (`pg_read_all_data`, `BYPASSRLS` pour que `pg_dump` voie chaque ligne).
   - Il n'écrit que sa trace : `app.backup_record_run()`, une fois l'archive déposée.
   - L'API et le worker ne peuvent pas inscrire de fausse sauvegarde.
3. **Restauration dans un projet vierge, puis contrôle.**
   - `firescape-sauvegarde restaurer` vérifie d'abord l'archive : empreintes, nombre de fichiers et de
     lignes.
   - Il refuse une cible dont les migrations diffèrent, ou qui contient déjà des SIS ou des comptes.
   - Il charge les données en une transaction, déclencheurs suspendus (`session_replication_role =
replica`). Les tables de référence remplies par les migrations sont reprises de l'archive.
   - Il dépose chaque fichier avec son type, puis relit tout le stockage pour le comparer octet par
     octet.
   - `pnpm backup:verify` sépare deux familles de contrôles.
     - La **fidélité**, bloquante : migrations, lignes de chaque table, fichiers et stockage conformes
       à l'archive.
     - Le **contenu** : ce que recevraient les tablettes. Fichiers à leur empreinte, manifestes à la
       leur, signatures par une clé du jeu, jeu de clés pas plus ancien que celui des tablettes.
   - Une anomalie de contenu déjà présente dans la source est restaurée telle quelle et signalée.
     L'exercice exige qu'elles soient exactement celles de la source.
4. **Éprouvé en continu.**
   - `infra/backup/exercice.sh` sauvegarde la pile locale, l'efface (fichiers et base), la restaure
     depuis l'archive seule et la contrôle.
   - La CI le lance après les tests d'intégration, sur une base remplie par eux.
   - La préproduction s'exerce sur une archive réelle, téléchargée depuis le bucket.
5. **Supervision.**
   - `etare_backup_last_success_seconds` et l'alerte `EtareSauvegardeAbsente` : aucune sauvegarde
     depuis 26 heures.
   - `etare_backup_last_missing_objects` et `EtareSauvegardeIncomplete` : des fichiers référencés par
     la base manquent au stockage.

## Conséquences

- RPO : 24 heures au plus, plus la durée d'une sauvegarde, tant que DEC-07 n'en fixe pas un autre.
  RTO mesuré par l'exercice, détail dans [sauvegarde et restauration](../exploitation/sauvegarde-restauration.md).
- Les deux clés privées perdues, les archives sont illisibles. Leur garde suit la cérémonie des clés
  (ADR-027) : deux supports chiffrés, deux coffres, un procès-verbal.
- L'archive contient les secrets du serveur, dont les clés de signature des publications et des
  catalogues, chiffrés pour les seules clés de sauvegarde. Avec le coffre Transit (ADR-027), ces clés
  ne sont plus des fichiers et ne figurent plus dans l'archive.
- Une restauration dans un nouveau projet Supabase demande ses propres clés (API, S3, mot de passe de
  `postgres`) et un redéploiement. Les facteurs TOTP chiffrés par la plateforme pourraient devoir être
  réenrôlés : à vérifier au premier exercice sur un projet neuf.
- Les sauvegardes managées de Supabase restent actives : elles couvrent la reprise rapide dans le même
  projet, et celle-ci couvre la perte du projet ou du fournisseur.

## Critère de réexamen

Volume des fichiers au point de rendre la copie nocturne trop longue (plus d'une heure), décision
d'hébergement de la production (DEC-03), objectifs RPO/RTO de DEC-07 plus exigeants que 24 heures, ou
passage des clés de signature au coffre Transit.
