# CAP-01 — Volumétrie de 10 000 sites

Sprint 12 (R4), mesures du 5 octobre 2026. Exigence : « jeu représentatif de 10 000 sites et plusieurs
centaines de milliers d’objets ; recherche, carte, RLS, publication, file de jobs, catalogue et transfert
mesurés » ([feuille de route](../roadmap-developpement.md)). Objectif du pilote (architecture §29,
[ADR-028](../decisions/ADR-028-supervision.md)) : latence p95 de l’API sous 500 ms.

## 1. En bref

- **Un défaut bloquant trouvé et corrigé : le coût des périmètres.** Un membre limité à un secteur
  attendait 1,6 à 9,8 s par liste. Ses dossiers et sa carte dépassaient la limite de 5 s par instruction,
  avec des erreurs 500. La tablette d’un secteur attendait 2 s son catalogue. Après correction :
  16 à 60 ms, et 40 ms pour le catalogue.
- **Toutes les lectures interactives tiennent l’objectif.** Sur 10 000 sites, le p95 est sous 70 ms.
  Font exception les entités de la carte (166 ms) et le catalogue d’une tablette de tout le SIS
  (264 ms, 1,6 Mo).
- **Charge de 100 sessions simultanées sur une instance d’API (pool de 10 connexions).**
  - débit : 170 → 292 requêtes/s ;
  - p95 : 670–760 ms → 375–416 ms ;
  - aucune erreur.
- Recherche de sites : 45 → 13–23 ms. Les index trigrammes sont désormais utilisés malgré la RLS.
- Liste des dossiers : 61 → 27 ms.
- Couverture des fonds de carte de tous les secteurs : 4,0 → 0,17 s.
- File de travaux : 1 060 travaux/s. Une prise de travail coûte 1 ms avec 100 000 travaux d’historique.
- Publication d’un dossier de 500 objets, PDF compris : 0,3 s.

## 2. Jeu de données

Deux SIS fictifs (`sdis-banc-a`, 80 % des sites ; `sdis-banc-b`, 20 %), conformément à l’architecture
§31 (« au moins deux SIS »). Ils sont chargés dans la base locale par des instructions ensemblistes.
Les déclencheurs restent actifs : journal d’audit, placement, gardes de publication.

| Volume                                              | Quantité                 |
| --------------------------------------------------- | ------------------------ |
| Sites (16 communes et 16 secteurs pour A, 4 pour B) | 10 000                   |
| Bâtiments / niveaux / zones                         | 20 000 / 60 000 / 20 000 |
| Objets opérationnels (25 par site, 15 sur plan)     | 250 000                  |
| Risques (5 par site) / contacts (3 par site)        | 50 000 / 30 000          |
| Publications en vigueur, signées (60 % des sites)   | 6 000                    |
| Brouillons en cours (un dossier sur dix)            | 1 000                    |
| Terminaux (un sur vingt sur tout le SIS)            | 500                      |
| Versions détenues par les terminaux                 | 244 500                  |
| Accusés de synchronisation (historique)             | 30 000                   |
| Travaux (historique de la file)                     | 100 000                  |
| Événements d’audit                                  | 561 000                  |
| Taille de la base                                   | 1,15 Go                  |

Les sites mélangent dix natures (EHPAD, collège, entrepôt…) et trois sensibilités : 2 % « haute » et
8 % « restreinte ». Chaque SIS compte un administrateur, un rédacteur, un validateur et un agent OPS sur
tout le SIS ; le SIS A ajoute un rédacteur et un agent limités au secteur de Nice (500 sites).

## 3. Méthode

- Script `pnpm bench:volume` ([scripts/bench/volume.ts](../../scripts/bench/volume.ts), jeu dans
  [dataset.ts](../../scripts/bench/dataset.ts)).
- Les requêtes passent par l’API réelle, en processus : vrais jetons Supabase Auth, `begin_request`, RLS
  de PostgreSQL. Seul le réseau HTTP manque.
- Chaque mesure enchaîne n requêtes (15 à 100) après échauffement. Elle donne p50, p95, max et erreurs.
- La charge lance 100 sessions en boucle pendant 30 s, sur un mélange de recherche, fiche, objets,
  carte et dossiers. L’instance d’API est unique, avec le pool par défaut de 10 connexions.
- Le coût en base a été lu dans `pg_stat_statements`, puis chaque requête chaude a été expliquée par
  `EXPLAIN ANALYZE` sous le rôle `etare_api` et le contexte d’un utilisateur du banc.

**Environnement.** Poste de développement :

- processeur Intel i9-9900K (8 cœurs, 16 fils), 64 Go de mémoire ;
- Docker Desktop (16 processeurs, 31 Go) ;
- pile Supabase locale, PostgreSQL 17.6 ;
- Node 22.15.

Ce ne sont pas les valeurs de l’hébergeur. Les écarts relatifs et les ordres de grandeur sont
significatifs ; les valeurs absolues restent à confirmer en préproduction (EXP-01).

## 4. Résultats (ms, p50 / p95)

### Back-office, rédacteur sur tout le SIS A (8 000 sites)

| Mesure                                       | Avant     | Après     |
| -------------------------------------------- | --------- | --------- |
| Recherche fréquente « EHPAD » (800 réponses) | 45 / 48   | 17 / 21   |
| Recherche « Lavandes »                       | 44 / 63   | 23 / 31   |
| Recherche par n° ETARE                       | 45 / 49   | 13 / 17   |
| Recherche précise « Collège Pasteur 41 »     | 46 / 52   | 13 / 14   |
| Recherche sans réponse                       | 44 / 53   | 12 / 14   |
| Liste filtrée par commune                    | 22 / 25   | 19 / 21   |
| Page suivante (curseur)                      | 30 / 36   | 19 / 21   |
| Carte sans emprise (2 000 premiers, tronqué) | 88 / 102  | 51 / 60   |
| Carte, emprise d’une commune                 | 34 / 42   | 25 / 29   |
| Entités de la carte, emprise de 0,02°        | 152 / 163 | 145 / 166 |
| Dossiers, 1re page et compteurs              | 61 / 74   | 27 / 30   |
| Dossiers, recherche « Lavandes »             | 90 / 99   | 56 / 63   |
| Fiche d’un site                              | 17 / 20   | 10 / 10   |
| Objets d’un site (25)                        | 20 / 21   | 12 / 15   |
| Dossier ETARE d’un site                      | 27 / 30   | 18 / 20   |

### Coût des périmètres : rédacteur limité au secteur de Nice

| Mesure              | Avant                     | Après   |
| ------------------- | ------------------------- | ------- |
| Recherche « EHPAD » | 4 777 / 4 902             | 22 / 30 |
| Liste               | 1 602 / 1 816             | 16 / 19 |
| Carte sans emprise  | 9 759 / 9 826, 4 erreurs  | 37 / 42 |
| Dossiers            | 6 630 / 6 746, 30 erreurs | 57 / 60 |

### Second SIS (B, 2 000 sites)

| Mesure              | Avant   | Après   |
| ------------------- | ------- | ------- |
| Recherche « EHPAD » | 21 / 27 | 11 / 11 |
| Dossiers            | 35 / 40 | 18 / 21 |

### Terminaux, supervision, file, publication, fonds de carte

| Mesure                                                           | Avant           | Après           |
| ---------------------------------------------------------------- | --------------- | --------------- |
| Catalogue signé, tablette de tout le SIS (4 266 entrées, 1,6 Mo) | 318 / 350       | 247 / 264       |
| Accusé de la tablette de tout le SIS                             | 125 / 138       | 127 / 136       |
| Catalogue, tablette d’un secteur et agent limité (187 entrées)   | 2 017 / 2 093   | 40 / 46         |
| Accusé de la tablette d’un secteur                               | 24 / 28         | 19 / 20         |
| Tableau Supervision du SIS                                       | 23 / 28         | 19 / 20         |
| Collecte des métriques de la plateforme (14,7 Ko)                | 371 / 382       | 397 / 420       |
| Prise d’un travail (`claim_jobs`), 100 000 travaux d’historique  | 1 / 2           | 1 / 1           |
| Débit de la file (travaux sans effet, 8 emplacements)            | 1 051/s         | 1 060/s         |
| Publication de 25 / 150 / 500 objets (demande → publiée)         | 195 / 190 / 315 | 179 / 161 / 305 |
| Couverture des fonds de tous les secteurs du SIS A               | 3 995           | 172             |
| Compteur de limitation de débit (coût par requête)               | < 1             | < 1             |

Le fond du secteur de Nice compte 500 sites et 5 287 tuiles. Au débit convenu avec l’IGN (4 requêtes/s),
sa préparation dure 0,4 h.

### Charge : 100 sessions simultanées, 30 s, une instance d’API

| Scénario  | Avant     | Après     |
| --------- | --------- | --------- |
| Recherche | 596 / 710 | 348 / 404 |
| Fiche     | 561 / 667 | 324 / 375 |
| Objets    | 565 / 673 | 329 / 382 |
| Carte     | 576 / 686 | 343 / 400 |
| Dossiers  | 651 / 758 | 360 / 416 |
| Débit     | 170 req/s | 292 req/s |

Sous cette charge, la latence est surtout l’attente d’une connexion. 100 sessions pour 292 requêtes/s
donnent environ 340 ms d’attente (loi de Little). Le service lui-même coûte environ 34 ms de connexion par
requête (10 connexions / 292 requêtes/s). La base locale occupait alors près de 9 processeurs sur 16.

## 5. Constats et corrections

Migration [20261028000300_perimeter_sets.sql](../../supabase/migrations/20261028000300_perimeter_sets.sql),
tests pgTAP [310_perimeter_sets.test.sql](../../supabase/tests/database/310_perimeter_sets.test.sql).

1. **Périmètres évalués ligne à ligne.**
   - _Avant :_ les politiques des tables rattachées à un site appelaient `has_permission(code, site_id)`
     pour chaque ligne lue. Chaque appel parcourait les rattachements de la personne et l’appartenance du
     site au secteur. Le coût était linéaire en lignes lues : 8 000 sites × 1 appel donnaient plusieurs
     secondes.
   - _Correction :_ les 65 politiques sont réécrites en `site_id IN (SELECT app.permitted_site_ids(code))`.
     Les sites permis sont calculés une fois par instruction, en sous-plan haché ; les rattachements sur
     tout le SIS restent vérifiés à part par `has_permission(code)`.
   - _Fonctions ensemblistes ajoutées :_ `app.sector_site_ids` et `app.device_site_ids` servent le
     catalogue des tablettes, la couverture des fonds et l’administration des secteurs.
   - _Garantie :_ les règles sont inchangées. pgTAP vérifie l’égalité avec `has_permission`,
     `site_in_sector` et `device_covers_site`, et qu’aucune politique n’appelle plus le contrôle ligne à
     ligne.
2. **Permissions de chaque requête.** `current_permissions()` (appelée par `begin_request`) faisait un
   appel de `has_permission` par code de permission. Elle tient désormais en une requête : 4,9 → 0,7 ms
   par requête.
3. **Recherche et RLS.** `ILIKE` n’est pas _leakproof_. Sous RLS, PostgreSQL l’évalue donc après les
   politiques, sur toutes les lignes, et n’utilise jamais les index trigrammes existants (nom, n° ETARE,
   libellé d’adresse).
   - _Correction :_ `app.site_ids_matching(motif)` (security definer, rôle `etare_api` seul) lit par ces
     index les identifiants des sites du SIS courant qui correspondent. La requête de l’API relit ensuite
     les sites sous RLS (`s.id in (select app.site_ids_matching($n))`) : le périmètre s’applique toujours,
     ce que pgTAP vérifie.
   - _Limite :_ sous 3 caractères (aucun trigramme), l’ancien filtrage ligne à ligne est conservé.
     L’utiliser par les index serait plus lent (59 ms contre 29 ms mesurés).
4. **Compteurs des dossiers.** La dernière révision de chaque site était cherchée site par site
   (`lateral`). Elle est maintenant lue en un passage (`distinct on`) : 49 → 25 ms en base.
5. **`has_permission` en PL/pgSQL.**
   - _Constat :_ une fonction SQL _security definer_ n’est jamais intégrée à la requête appelante. Elle
     est donc replanifiée par chaque instruction qui l’appelle, environ 1 ms par politique et par
     instruction.
   - _Correction :_ la fonction est réécrite en PL/pgSQL, avec le même corps. Elle garde son plan pour la
     connexion : 0,4 ms de moins par contrôle (lecture des publications : 3,1 → 2,3 ms).
6. **Index de périmètre.** Deux index servent le chemin « commune du secteur » :
   - `address (tenant_id, insee_code)` ;
   - `site (tenant_id, address_id)`.
7. **Lectures simultanées sur une connexion.** L’instantané d’un dossier à la soumission lançait onze
   requêtes en parallèle sur la connexion de la transaction. `pg` 8 les met en file, sans gain ;
   `pg` 9 les refusera. Elles sont désormais lancées l’une après l’autre.

## 6. Risques résiduels et suites

- **Compteurs des dossiers recalculés à chaque page.** C’est le premier consommateur de la base sous
  charge, avec 40 ms en moyenne, contre 25 ms à vide. Au-delà de 20 000 sites par SIS, il faudrait des
  compteurs entretenus par déclencheur ou mis en cache quelques secondes.
- **Recherche dans les dossiers** (nom, n° ETARE) : 56–63 ms. Les lignes y sont encore filtrées ; la
  même fonction pourra servir si besoin.
- **Collecte des métriques.** Elle prend 0,4 s par collecte en une requête (`platform_metrics()`). Il
  faut garder un intervalle de collecte d’au moins 30 s et suivre cette durée avec l’historique, que le
  worker purge.
- **Dimensionnement.**
  - Calcul : environ 34 ms de connexion par requête en moyenne. Pour l’objectif de 500 ms au p95, il
    faut prévoir un pool de connexions et des instances à la mesure des sessions simultanées attendues
    (par exemple 2 instances × 10 connexions pour 100 sessions actives).
  - Surveillance : l’alerte `EtarePoolSqlSature` signale la saturation du pool
    ([supervision](../exploitation/supervision.md)).
- **Latence réseau vers la base.** Une requête de l’API fait 4 à 6 allers-retours vers la base
  (`begin`, `begin_request`, lectures, `commit`). À 1 ms d’aller-retour chez l’hébergeur, cela ajoute
  environ 5 ms : à mesurer en préproduction.
- **Catalogue d’une tablette de tout le SIS.** Il pèse 1,6 Mo pour 4 266 versions et coûte 0,25 s :
  acceptable, ces tablettes étant une minorité. Une tablette de secteur reçoit 69 Ko.
- **`app.site_ids_matching`.** La fonction renvoie au rôle `etare_api` les identifiants des sites
  correspondants de tout le SIS courant, quel que soit le périmètre de la personne. L’API ne s’en sert
  qu’à l’intérieur d’une lecture sous RLS. Elle n’est exécutable ni par `anon`, ni par `authenticated`,
  ni par le worker ([sécurité](../security.md)).

## 7. Rejouer le banc

Le banc vise uniquement la pile locale : `tests/integration/helpers` refuse toute URL distante. Il ne doit
jamais viser le projet hébergé.

```bash
pnpm bench:volume --out bench.json
```

- **Jeu complet.** Le chargement dure environ 5 min et fait grossir la base de 1,2 Go. Les données du
  banc sont retirées à la fin.
- **Options de reprise :**
  - `--keep` conserve les données pour une nouvelle mesure ;
  - `--reuse` reprend un jeu déjà chargé ;
  - `--skip reads,load…` saute des étapes. Étapes disponibles : `reads`, `supervision`, `terminal`,
    `queue`, `publication`, `basemaps`, `ratelimit`, `load`.
- **Après un `--keep` :**
  - relancer `pnpm bench:volume --reuse --skip reads,supervision,terminal,queue,publication,basemaps,ratelimit,load`
    retire les données ;
  - un `vacuum (full, analyze)` local rend l’espace disque.
- **CI.** Elle lance une version réduite (`--sites 1000 --jobs 10000 --seconds 5`, environ 1 min 30) après
  les tests d’intégration. Le banc reste ainsi utilisable, et la CI échoue si une seule requête est en
  erreur (dépassement de délai d’un périmètre, erreur serveur sous charge).
