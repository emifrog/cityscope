# CAP-02 — Gros fichiers sur la tablette

Sprint 13 (R4), mesures du 7 octobre 2026. Exigence : « contrôle d’espace libre, réserve pour
ancienne/nouvelle version, erreurs disque plein, limites mémoire, décodage des images et lecture des PDF ;
optimiser les BLOB ou introduire un stockage chiffré alternatif seulement si les mesures le justifient »
([feuille de route](../roadmap-developpement.md)). Décision : [ADR-016](../decisions/ADR-016-mobile-offline-store.md),
complément du Sprint 13.

## 1. En bref

- **La mémoire ne suit plus la taille des fichiers.**
  - Les fichiers arrivent en morceaux de 1 Mio, rangés un par un dans la base chiffrée. Pendant la reprise
    d’un téléchargement de 60 Mo, le tas Dart a pris 6 Mo.
  - Un PDF de 43 Mo se lit page par page : le tas Dart prend 10 Mo, et 4 morceaux au plus restent en
    mémoire.
- **Une coupure ne fait perdre que le morceau en cours.** Le passage a été coupé à 35,8 Mo, puis repris.
  Le stockage a répondu 206 (plage demandée). Au total, 96,2 Mo ont été transférés pour 95,8 Mo de fichiers.
- **Un plan de 12 000 × 8 000 px s’affiche.** Il est décodé à 4 096 px au plus (44,7 Mo de pixels). Décodé
  entier, il en réclamerait 384 Mo, au-delà de ce que tient une tablette.
- **L’espace est vérifié avant chaque version, document ou fond de carte.** La marge comprend 10 % de plus
  et 64 Mo laissés au système. « Stockage plein » est reconnu (`SQLITE_FULL`, `ENOSPC`) et expliqué à
  l’agent.
- **Pas d’autre stockage chiffré.** La base garde les fichiers en BLOB (SQLCipher) avec environ 2 % de
  surcoût. Les mesures ne justifient pas d’autre stockage.

## 2. Conditions

| Élément       | Valeur                                                                                    |
| ------------- | ----------------------------------------------------------------------------------------- |
| Terminal      | émulateur Android (`Medium_Phone_API_36.0`, x86_64), application 0.5.0 **en debug** (JIT) |
| Serveur       | pile locale (API, Supabase Storage), relais TCP limité à 3 Mio/s pour couper en cours     |
| Plan          | JPEG 12 000 × 8 000 px, 26,4 Mo (le maximum admis est 12 000 px de côté, 50 Mo)           |
| Documents     | PDF « toujours » de 43,0 Mo (19 pages), PDF « à la demande » de 29,4 Mo (13 pages)        |
| Dossier ETARE | PDF généré de 26,4 Mo (le plan y est intégré)                                             |
| Mémoire       | `dumpsys meminfo` chaque seconde : tas natif, tas Dart (mémoire anonyme « Unknown »), PSS |

Une application en debug occupe plus de mémoire qu’en release, et ses pages de code partagées varient selon
que le système les a récupérées ou non (±60 Mo de PSS au repos). Les écarts ci-dessous portent donc sur le
tas natif et le tas Dart. Ce sont des ordres de grandeur, à confirmer sur la tablette cible en release.

## 3. Téléchargement et reprise

| Étape                                  | Résultat                                                           |
| -------------------------------------- | ------------------------------------------------------------------ |
| Premier passage, coupé (relais arrêté) | 35,8 Mo reçus : plan complet, PDF commencé ; « Réseau interrompu » |
| Reprise                                | 206 sur le PDF commencé ; 60,4 Mo reçus ; version installée        |
| Retéléchargé                           | moins de 1 Mo (le morceau en cours à la coupure)                   |
| Tas Dart pendant la reprise (60,4 Mo)  | +6 Mo ; tas natif +10 Mo                                           |
| Tas Dart pendant le premier passage    | +40 à +50 Mo, palier atteint dès le premier fichier                |
| Base chiffrée                          | 98,0 Mio pour 95,8 Mio de fichiers ; 225,9 Mio pour 221,0 Mio      |

Le palier du premier passage correspond à la croissance du tas Dart. Les morceaux déjà rangés y restent
jusqu’au passage du ramasse-miettes. Le palier n’augmente pas avec la taille des fichiers : 96 Mo ont été
transférés pour +50 Mo au plus. Avant CAP-02, un fichier était tenu entier, une fois dans la réponse puis
une fois dans la copie vérifiée. Un PDF de 43 Mo occupait donc à lui seul plus de 86 Mo.

## 4. Lecture

| Contenu                           | Tas natif           | Tas Dart         | Remarque                             |
| --------------------------------- | ------------------- | ---------------- | ------------------------------------ |
| Plan 12 000 × 8 000 (ouverture)   | +62 Mo (pic)        | +55 Mo (pic)     | décodage à 4 096 × 2 731             |
| Plan affiché                      | +2 Mo               | +27 Mo (le JPEG) | PSS +19 Mo au total                  |
| PDF de 43 Mo, ouverture           | +47 Mo              | +10 Mo           | pages rendues par PDFium             |
| PDF de 43 Mo, 19 pages parcourues | stable (pic +84 Mo) | stable           | 4 morceaux de 1 Mio au plus en cache |
| Document à la demande de 29,4 Mo  | +42 Mo              | +26 Mo (pic)     | téléchargé, vérifié, ouvert          |

Le plan est encore relu entier, puis décodé à taille bornée. Un plan de 50 Mo demanderait donc environ
100 Mo en pointe, le temps du décodage. C’est acceptable, et c’est la limite connue (§6).

## 5. Espace libre et disque plein

- Avant chaque version, la tablette demande la place des fichiers manquants, moins ce qui a déjà été reçu.
  À cette place s’ajoutent 10 % (pages et journal de la base) et 64 Mo laissés au système. Les pages libres
  de la base (fichiers effacés) comptent comme disponibles. L’ancienne version reste installée jusqu’à
  l’activation : la réserve porte donc sur la nouvelle version entière.
- Sans place : rien n’est commencé et les versions prêtes sont activées. L’agent lit « Stockage de la
  tablette insuffisant : environ X nécessaires, Y libres… ». L’accusé porte `STORAGE_INSUFFICIENT`. Les
  fonds de carte attendent, car les ETARE passent avant.
- Disque plein en cours d’écriture : le passage s’arrête et les morceaux rangés restent. L’agent lit
  « Stockage de la tablette plein… reprendra là où il en était ». L’accusé porte `STORAGE_FULL`.
- Mêmes contrôles pour un document à la demande, l’ouverture d’un site sensible et chaque fond de carte.
  Le bilan des fonds de carte est désormais affiché (installés, reportés au Wi-Fi, non installés et
  pourquoi).

## 6. Limites connues

- Plans et photos sont relus entiers avant décodage. Le décodage est borné (4 096 px pour un plan, 2 560 px
  pour une photo en plein écran), pas la lecture du fichier compressé.
- Un site sensible est scellé fichier par fichier (AES-GCM) et ouvert entier en mémoire. Ces sites
  restent rares et légers, d’où un contrôle de place seulement.
- Les parties d’un fond de carte (32 Mio) sont encore tenues entières le temps de leur vérification.
- Mesures faites sur émulateur, en debug. À refaire sur la tablette cible avec l’APK de release (EXP-04).
