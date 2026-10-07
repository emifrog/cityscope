# ADR-030 — Livraison de l'application Android : clé détenue par l'exploitant, APK signé et tracé

- Statut : acceptée — Sprint 13, 07/10/2026
- Sources : roadmap R4, EXP-04 (« clé de signature Android dédiée, paquet release, distribution/MDM et
  mise à jour compatibles avec les anciens manifestes et migrations locales ; iOS selon DEC-01 ») ;
  DEC-01 (tablette Alldocube iPlay 40H, Android 11, distribution MDM ou manuelle à trancher) ;
  ADR-016 (migrations locales), ADR-027 (cérémonie des clés), ADR-029 (sécurité du terminal) ; choix
  du porteur du 7 octobre 2026
- Complète l'ADR-027 (garde des clés) pour la clé de signature de l'application

## Contexte

Jusqu'ici, l'APK de release était signé par la clé de debug de l'outillage Android, et son identifiant
`fr.etare.ops` était provisoire. Une tablette n'accepte une mise à jour que si l'application a le même
identifiant et la même clé. Perdre la clé, ou changer d'identifiant, impose de désinstaller : la base
locale, l'enrôlement et les signalements non transmis sont alors perdus. La distribution, MDM ou
installation manuelle, n'est pas tranchée (DEC-01), et le Play Store public n'est pas visé. La
préproduction doit pouvoir s'essayer sur les tablettes du pilote sans toucher l'application de
production.

## Décision

1. **Clé de release détenue par l'exploitant, créée hors ligne.**
   - `pnpm mobile:release signing-key --out <dossier hors dépôt>` crée un magasin PKCS12 (RSA 4096,
     validité 30 ans) et son `key.properties`. Le mot de passe, aléatoire, ne passe jamais en
     argument. Le script refuse un dossier du dépôt.
   - Garde : deux copies chiffrées dans deux coffres distincts, avec un procès-verbal, comme la
     racine des jeux de clés (ADR-027).
   - L'empreinte SHA-256 du certificat est publique : elle sert à la console MDM et à la vérification
     avant diffusion.
2. **Jamais la clé de debug.**
   - Gradle signe la release avec la clé désignée par `ETARE_ANDROID_SIGNING` (ou `android/key.properties`,
     ignoré par git).
   - Sans clé, la construction s'arrête. La vérification refuse un APK signé par la clé de debug.
3. **Identifiant définitif et variantes.**
   - `fr.etare.ops` pour la production (variante `prod`, celle par défaut).
   - `fr.etare.ops.staging`, « FireScape préprod », pour la préproduction (variante `staging`). Elle
     s'installe à côté de la production, avec ses propres base, clé de terminal et session.
   - En release, l'application refuse de démarrer si son environnement est `dev`, ou s'il diffère de
     sa variante. HTTPS et clé racine restent obligatoires hors `dev`.
4. **Construction tracée.**
   - `pnpm mobile:release build` part d'un commit propre et vérifie la configuration (environnement de
     la variante, HTTPS, clé publishable, clé racine).
   - Il construit l'APK (R8 et réduction des ressources) et y inscrit le commit (`BUILD_COMMIT`).
   - Il produit l'APK, son SHA-256 et une fiche JSON : identifiant, versions, commit, Flutter et Dart,
     environnement, empreinte du certificat.
   - La vérification (`verify`) contrôle la signature, le certificat attendu, l'identifiant et
     l'empreinte du fichier. Le même commit, avec les mêmes outils, redonne la même application. L'APK
     n'est pas garanti identique à l'octet près.
5. **Distribution par APK**, MDM (diffusion et mise à jour imposées) ou installation manuelle depuis
   un poste du SIS. Le choix reste à DEC-01, la procédure couvre les deux. `versionCode` ne fait que
   croître : un retour en arrière passe par une nouvelle version, jamais par une version plus
   ancienne.
6. **Mises à jour compatibles.**
   - Les migrations locales sont pas à pas. Elles sont testées avec données, étape par étape et d'un
     seul coup de la v1 à la v10 (tablette restée en 0.1).
   - Un catalogue, un paquet, un fond de carte ou un jeu de clés d'un format plus récent ne casse rien.
     La tablette garde ce qu'elle a et demande la mise à jour, avec la version exigée si le catalogue
     l'annonce (SYN-02).
7. **Version visible.** « Compte et tablette » montre la version, la variante et le commit, avec la
   page des licences : paquets, SQLCipher, OpenSSL et glyphes Noto Sans (OFL).
8. **Pas d'offuscation.** Elle ne protège rien que l'ADR-029 n'ait écarté, et rendrait les traces
   d'erreur illisibles pour le support.
9. **iOS** reste hors périmètre tant que DEC-01 ne l'exige pas.

## Conséquences

- La perte des deux copies de la clé interdit toute mise à jour. Il faudrait alors une nouvelle
  application, avec désinstallation et réenrôlement de chaque tablette. La garde de la clé est donc
  aussi critique que celle de la racine.
- Le poste qui construit doit avoir Flutter, un JDK 17 ou plus et le SDK Android. Une configuration
  Gradle personnelle trop pauvre en mémoire se contourne avec `--gradle-home` (construction isolée).
- La CI construit la préproduction en release avec une clé jetable. Elle prouve que la configuration
  de signature, R8 et les variantes tiennent, sans jamais voir la vraie clé.
- Développement inchangé : `flutter run` construit la variante `prod` en debug, avec la clé de debug.

## Critère de réexamen

Choix MDM de DEC-01 (configuration gérée, restrictions), passage au Play Store privé (signature par
Google), besoin iOS, ou incident de garde de la clé.
