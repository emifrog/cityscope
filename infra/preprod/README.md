# Préproduction sur un VPS — procédure

Première étape d'EXP-01 : une préproduction sur un VPS Hostinger KVM 2 situé en France, avec des
**données fictives uniquement**. L'hébergement de production reste à décider avec la DSI, le RSSI et le
DPO du SIS pilote (DEC-03).

| Élément                              | Où                                                                        |
| ------------------------------------ | ------------------------------------------------------------------------- |
| Web et API (Next.js)                 | conteneur `web` sur le VPS                                                |
| Worker (fichiers, PDF, signatures)   | conteneur `worker`                                                        |
| Antivirus                            | conteneur `clamav`, réseau interne                                        |
| HTTPS                                | Caddy, certificat Let's Encrypt ; seul service exposé (ports 80 et 443)   |
| Base, authentification, stockage     | projet Supabase managé de la préproduction, région Europe (Irlande)       |
| Sauvegardes chiffrées                | conteneur `sauvegarde` chaque nuit, archive chez Scaleway (Paris)         |
| Clés de signature de la distribution | fichiers secrets sur le VPS (ADR-027), racine de préproduction hors ligne |

Fichiers du dossier :

- `bootstrap.sh` : préparation du serveur ;
- `compose.yaml`, `Caddyfile` : les conteneurs ;
- `*.env.example` : modèles de configuration, à copier sans `.example` sur le serveur ;
- `deploy.sh` : déploiement et retour arrière ;
- `sauvegarde.sh`, `firescape-sauvegarde.{service,timer}` : sauvegarde nocturne (§10).

La configuration réelle (`*.env`) et le dossier `secrets/` n'existent que sur le serveur. Ils sont
ignorés par git et exclus des images.

## 1. Créer le VPS

Dans l'assistant Hostinger :

- système **Ubuntu LTS** (24.04 ou 26.04, éprouvé en 26.04 le 8 octobre 2026), sans panneau de contrôle ni
  application préinstallée ;
- une **clé SSH**, créée sur le poste :

  ```sh
  ssh-keygen -t ed25519 -C "firescape-vps" -f ~/.ssh/firescape_vps
  ```

  Coller le contenu de `firescape_vps.pub`. La clé privée ne quitte pas le poste. Une clé ajoutée dans
  hPanel **après** la création du VPS peut ne pas être appliquée : connecté en root (mot de passe), ajouter
  la ligne de `firescape_vps.pub` à `/root/.ssh/authorized_keys`, puis vérifier
  `ssh -i ~/.ssh/firescape_vps root@<ip> true` avant l'étape 2.

- un mot de passe root long, rangé dans le gestionnaire de mots de passe ;
- nom d'hôte, par exemple `preprod-firescape` ; scanner Monarx inutile.

Relever dans hPanel l'**adresse IP** et le **nom d'hôte public** (`srvXXXXXX.hstgr.cloud`). Ce nom sert
d'adresse HTTPS tant qu'il n'y a pas de domaine. À défaut, utiliser `<ip-avec-tirets>.sslip.io`.

## 2. Préparer le serveur

Depuis le poste, à la racine du dépôt :

```sh
scp -i ~/.ssh/firescape_vps infra/preprod/bootstrap.sh root@<ip>:/root/
ssh -i ~/.ssh/firescape_vps root@<ip> NEEDRESTART_MODE=a bash /root/bootstrap.sh
```

Le script :

- met le système à jour, règle l'heure (Europe/Paris, synchronisée) ;
- crée le compte `etare` (sudo, groupe docker) avec la clé SSH de root ;
- n'autorise plus que cette clé : ni root, ni mot de passe ;
- active le pare-feu (SSH, 80, 443), fail2ban et les mises à jour de sécurité automatiques ;
- ajoute 2 Go d'échange et installe Docker depuis le dépôt officiel.

**Avant de fermer la session root**, vérifier dans un autre terminal :
`ssh -i ~/.ssh/firescape_vps etare@<ip>`.

Raccourci conseillé dans `~/.ssh/config` du poste :

```text
Host firescape-preprod
  HostName <ip>
  User etare
  IdentityFile ~/.ssh/firescape_vps
```

En cas de perte d'accès, utiliser la console de secours de hPanel.

## 3. Projet Supabase de la préproduction

Le projet hébergé existant `vpcudfrwvzdliunmsjvt` (plan payant, région **West EU (Ireland)**) sert à la
fois d'intégration et de préproduction (choix du 8 octobre 2026). Données fictives uniquement.

1. **Réglages** : reprendre ceux de [l'environnement d'intégration](../../docs/development.md) (§1) :
   - inscriptions fermées, mots de passe forts ;
   - TOTP ;
   - clés JWT asymétriques ;
   - schéma `app` jamais exposé ;
   - modèle d'invitation.

   La **Site URL** est `https://srv2044690.hstgr.cloud`. Ajouter `http://127.0.0.1:3000/**` aux Redirect
   URLs pour l'utiliser aussi depuis un poste.

2. **Migrations, jamais le seed.**
   - La voie normale est `pnpm exec supabase db push --linked --dry-run`, puis `pnpm db:push:integration`.
   - Si la CLI est refusée (erreur 403 sur le « login role »), appliquer chaque nouvelle migration dans
     l'éditeur SQL du tableau de bord, puis l'inscrire dans l'historique :

     ```sql
     insert into supabase_migrations.schema_migrations (version, name) values ('<AAAAMMJJhhmmss>', '<nom>');
     ```

   Les 43 premières migrations y ont été appliquées à la main puis contrôlées. Le schéma est identique au
   dépôt (empreinte des fonctions, colonnes, politiques et déclencheurs), et l'historique est enregistré.

3. **Rôles applicatifs** : mots de passe aléatoires, écrits dans `.env.integration` et jamais affichés.
   Deux voies :
   - **avec l'URL d'administration**, définie dans le terminal seulement :

     ```sh
     export INTEGRATION_ADMIN_DATABASE_URL='postgresql://postgres.<ref>:<mot-de-passe>@<hôte-pooler>:5432/postgres?sslmode=verify-full&sslrootcert=<chemin>/prod-ca-2021.crt'
     pnpm integration roles && pnpm integration check
     ```

   - **sans elle**, par l'éditeur SQL : l'URL du pooler s'écrit sans mot de passe. Lancer ensuite le
     fichier produit dans l'éditeur SQL, puis le supprimer. Il ne contient que les empreintes SCRAM.

     ```sh
     pnpm integration roles-sql --pooler-url 'postgresql://postgres.<ref>@<hôte-pooler>:5432/postgres?sslmode=verify-full&sslrootcert=<chemin>/supabase-ca.crt' --out <hors dépôt>/roles.sql
     ```

   `--dotenv .env.<nom>` vise un autre fichier que `.env.integration`.

4. **SIS de préproduction et premier administrateur.** Créer d'abord le compte dans
   Authentication → Users, puis :

   ```sh
   pnpm integration tenant --slug sdis-preprod-06 --name "SDIS PRÉPROD 06"
   pnpm integration grant --email <adresse> --tenant sdis-preprod-06 --role SIS_ADMIN
   ```

   Ces deux commandes demandent l'URL d'administration. À défaut, l'équivalent SQL se lance dans l'éditeur
   (voir `tenant` et `grant` dans `scripts/integration.ts`).

## 4. Clés de signature de la préproduction

Sur le poste, de préférence hors ligne. Ce sont des clés **propres à la préproduction** : la racine de
production naîtra lors de la vraie cérémonie
([cles-de-signature.md](../../docs/exploitation/cles-de-signature.md)).

1. Créer les clés et noter ce qu'affiche chaque commande :

   ```sh
   pnpm keys root --out <support>/preprod-racine.pem
   pnpm keys root --out <support>/preprod-racine-secours.pem
   pnpm keys generate --purpose publication --out <support>/preprod-publication.pem
   pnpm keys generate --purpose catalog --out <support>/preprod-catalogue.pem
   ```

2. Écrire le brouillon `brouillon.json` : `{"sequence": 1, "keys": [ … ]}`, avec les deux lignes JSON
   affichées par `generate`. Puis le signer et le contrôler :

   ```sh
   pnpm keys sign --root <support>/preprod-racine.pem --in brouillon.json --out jeu-1.json
   pnpm keys show --in jeu-1.json --root-keys "root:…;root:…"
   ```

3. Garder les deux racines hors ligne. Seuls `jeu-1.json`, la clé de publication et la clé de catalogue
   vont sur le serveur.

## 5. Configuration et premier déploiement

Sur le serveur (`ssh firescape-preprod`) :

```sh
git clone https://github.com/emifrog/cityscope.git /opt/firescape/app
cd /opt/firescape/app/infra/preprod
cp preprod.env.example preprod.env
cp web.env.example web.env
cp worker.env.example worker.env
mkdir -m 700 secrets
```

Remplir les trois fichiers :

- adresse publique, URL et clé publishable du projet ;
- URL des rôles, reprises de `.env.integration` (certificat : `/run/secrets/supabase_ca`) ;
- clé secrète du projet ;
- `DISTRIBUTION_ROOT_KEYS` : les deux lignes racine.

Depuis le poste, déposer les secrets :

```sh
scp <support>/preprod-catalogue.pem firescape-preprod:/opt/firescape/app/infra/preprod/secrets/catalog_signing_key.pem
scp <support>/preprod-publication.pem firescape-preprod:/opt/firescape/app/infra/preprod/secrets/publication_signing_key.pem
scp jeu-1.json firescape-preprod:/opt/firescape/app/infra/preprod/secrets/distribution_keyset.json
scp <chemin>/prod-ca-2021.crt firescape-preprod:/opt/firescape/app/infra/preprod/secrets/supabase-ca.crt
```

Puis, sur le serveur :

```sh
chmod 600 *.env
chmod 644 secrets/*
bash /opt/firescape/app/infra/preprod/deploy.sh
```

Le dossier `secrets/` reste en 700 ; les fichiers doivent être lisibles par l'utilisateur des
conteneurs.

Le premier déploiement construit les images, ce qui prend plusieurs minutes. ClamAV télécharge ses
signatures au premier démarrage. Contrôles :

- `https://<adresse publique>/api/v1/health` répond `ok` ;
- la connexion au back-office avec le compte administrateur fonctionne.

## 6. Tablettes de préproduction

APK de la variante `staging` ([livraison-mobile.md](../../docs/exploitation/livraison-mobile.md)), avec
un fichier de configuration hors dépôt :

- `ENV` : `staging` ;
- `API_BASE_URL` : `https://<adresse publique>/api/v1` ;
- `AUTH_URL` : `https://<ref>.supabase.co/auth/v1` ;
- `AUTH_PUBLISHABLE_KEY` ;
- `TRUSTED_SIGNING_KEYS` : les deux lignes racine, puis `publication:<id>:<clé>;catalog:<id>:<clé>`.

Tant que la clé Android de la cérémonie n'existe pas, une clé propre à la préproduction convient. Les
tablettes devront réinstaller l'application quand la vraie clé signera.

## 7. Exploitation courante

- **Déployer** : appliquer d'abord les nouvelles migrations depuis le poste (§3), puis lancer
  `bash infra/preprod/deploy.sh` sur le serveur. Chaque déploiement est noté dans
  `/opt/firescape/deployments.log`.
- **Revenir en arrière** : `bash infra/preprod/deploy.sh <commit précédent>`, seulement si aucune
  migration incompatible n'est passée entre-temps. Les images restent en cache.
- **Journaux** : `docker compose -f infra/preprod/compose.yaml --env-file infra/preprod/preprod.env logs -f web`
  (ou `worker`, `clamav`, `caddy`).
- **Système** : mises à jour de sécurité et redémarrage automatiques à 4 h 30, conteneurs relancés.
  Docker se met à jour à la main, une fois par mois : `sudo apt upgrade`.
- **Disque** : `docker system df`. Les images de plus d'une semaine sans étiquette sont purgées à chaque
  déploiement.

## 8. Domaine

`firescape.fr` (en cours d'achat) : `preprod.firescape.fr` pour ce VPS, le domaine nu réservé à la
production.

1. Chez le registraire : enregistrements `A` (69.62.107.88) et `AAAA` (2a02:4780:28:ad02::1) pour
   `preprod.firescape.fr`.
2. `SITE_ADDRESS=preprod.firescape.fr, srv2044690.hstgr.cloud` dans `preprod.env`. Caddy sert alors les
   deux noms : les tablettes déjà configurées avec l'ancien continuent de fonctionner.
3. Supabase : Site URL `https://preprod.firescape.fr`, et l'ancien nom ajouté aux Redirect URLs.
4. `APP_BASE_URL=https://preprod.firescape.fr` dans `worker.env` (liens des e-mails), puis
   `bash infra/preprod/deploy.sh`.

## 9. E-mails (Scaleway Transactional Email)

Un seul service pour deux expéditeurs : Supabase Auth (invitations, mot de passe oublié) et le worker
(notifications du portail exploitant). Adresse d'envoi : `ne-pas-repondre@firescape.fr`. Le domaine
doit exister avant l'étape 2.

1. **Compte Scaleway**, projet `firescape`. Le même projet portera le stockage des sauvegardes (§10).
2. **Transactional Email → ajouter le domaine** `firescape.fr`, région Paris.
   - Chez le registraire, ajouter les enregistrements DNS que la console affiche (SPF, DKIM, et MX s'il
     est demandé), plus une politique DMARC : `_dmarc.firescape.fr` en TXT, valeur
     `v=DMARC1; p=quarantine; adkim=s; aspf=s`.
   - Attendre que la console marque le domaine comme vérifié.
3. **Identifiants SMTP** :
   - créer une application IAM `firescape-smtp`, avec le seul droit d'envoyer des e-mails
     transactionnels, et sa clé d'API ;
   - l'identifiant SMTP est l'ID du projet, le mot de passe est la clé secrète ;
   - serveur `smtp.tem.scaleway.com`, port 465 (TLS).
4. **Supabase** → Authentication → Emails → SMTP Settings :
   - « Enable custom SMTP » ;
   - serveur et identifiants ci-dessus ;
   - expéditeur `ne-pas-repondre@firescape.fr`, nom « FireScape » ;
   - ensuite, relever la limite d'envoi dans Authentication → Rate Limits.
5. **Worker**, dans `worker.env` sur le serveur (chmod 600) :

   ```text
   SMTP_URL=smtps://<id-du-projet>:<clé-secrète>@smtp.tem.scaleway.com:465
   MAIL_FROM=FireScape <ne-pas-repondre@firescape.fr>
   APP_BASE_URL=https://preprod.firescape.fr
   ```

   Puis `bash infra/preprod/deploy.sh`. Au démarrage, le worker ne doit plus écrire
   « mail server not configured ».

6. **Contrôle** : inviter un membre depuis Administration ; l'e-mail arrive, sans passer en indésirables.
   Dans le message reçu, les en-têtes montrent SPF, DKIM et DMARC en « pass ».

## 10. Sauvegardes (EXP-02)

Une archive chiffrée chaque nuit à 2 h 15, déposée chez Scaleway (Paris) : base, fichiers et
configuration du serveur. Principe et restauration :
[sauvegarde et restauration](../../docs/exploitation/sauvegarde-restauration.md), ADR-031.

1. **Base** :
   - appliquer la migration `20261111000100_backups.sql` (§3, éditeur SQL et historique) ;
   - donner un mot de passe au rôle `etare_backup`. L'URL produite est déjà celle du serveur
     (certificat monté en `/run/secrets/supabase_ca`) :

   ```sh
   pnpm integration roles-sql --only etare_backup --out <hors dépôt>/role-sauvegarde.sql \
     --pooler-url 'postgresql://postgres.<ref>@<hôte-pooler>:5432/postgres?sslmode=verify-full&sslrootcert=/run/secrets/supabase_ca'
   ```

   Lancer le fichier dans l'éditeur SQL, puis le supprimer. `BACKUP_DATABASE_URL` est alors dans
   `.env.integration`.

2. **Fichiers** : Supabase → Storage → S3 Configuration.
   - Relever le point d'accès et la région.
   - Créer une clé d'accès « firescape-sauvegarde » : elle n'est affichée qu'une fois.
3. **Scaleway**, projet FireScape :
   1. Object Storage → créer le bucket `firescape-preprod-sauvegardes`, région Paris, privé, avec le
      **versioning** activé.
   2. Ajouter au bucket trois règles de cycle de vie :
      - expiration des versions courantes à 35 jours ;
      - suppression des versions remplacées à 7 jours ;
      - abandon des envois multiparties inachevés à 1 jour.
   3. IAM → Applications → `firescape-sauvegarde-vps`. Lui donner une politique au seul droit
      **ObjectStorageObjectsWrite** sur le projet FireScape : ni lecture, ni liste, ni suppression.
   4. Créer la clé d'API de cette application : identifiant `SCW…` et clé secrète.
4. **Clés age** : deux paires, principale et secours (guide, §2). Seules les clés publiques vont sur le
   serveur.
5. **Serveur** :
   - `sauvegarde.env` depuis le modèle (`chmod 600`), puis `bash infra/preprod/deploy.sh`, qui
     construit l'image de la sauvegarde ;
   - première sauvegarde à la main : `bash infra/preprod/sauvegarde.sh`. Elle doit finir par
     « Sauvegarde terminée », et l'archive doit apparaître dans le bucket ;
   - minuteur de la sauvegarde nocturne :

   ```sh
   sudo cp infra/preprod/firescape-sauvegarde.service infra/preprod/firescape-sauvegarde.timer /etc/systemd/system/
   sudo systemctl daemon-reload && sudo systemctl enable --now firescape-sauvegarde.timer
   systemctl list-timers firescape-sauvegarde.timer
   ```

6. **Exercice** : restaurer la dernière archive, téléchargée depuis la console, dans la pile locale
   vidée, puis la contrôler avec le jeu de clés de l'archive (guide, §4 et §5). Noter les durées
   mesurées.

## 11. Restent à faire (EXP-01)

- Collecte des métriques et alertes (EXP-03 livré côté application ; l'alerte « sauvegarde absente »
  en fait partie).
- Coffre Transit (OpenBao) à la place des fichiers, si l'analyse de risques le demande.
