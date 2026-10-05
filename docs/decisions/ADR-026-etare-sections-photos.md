# ADR-026 — Sections de l'ETARE et photos du PDF (DEC-05)

- Statut : acceptée — décision du porteur, 03/10/2026
- Sources : roadmap R0 (DEC-05) et R3 (MET-05) ; cahier des charges ETARE-01 (P0, « prévisualisation
  fidèle et sections configurables »), ETARE-02, ETARE-03 (P1, « logo, ordre sections, mentions,
  couleurs, champs obligatoires »), ETARE-04 (P1, scénarios), p.3 (« le PDF ETARE est un export, pas la
  source de vérité ») ; maquette écran 05 (sections) et écran 07 (tablette) ; modèle de données
  (`etare_template`) ; architecture p.11, p.18, p.25 ; ADR-013, ADR-014

## Contexte

ETARE-01 exige des « sections configurables » sans les définir, tandis qu'ETARE-03 (P1) couvre l'ordre
des sections et le modèle par SIS. Aujourd'hui rien n'est réglable, et trois écarts séparent l'aperçu, le
PDF, la tablette et la maquette :

- Risques passe avant Accès ;
- dans le PDF, une section « Objets à risque » décale la numérotation ;
- la tablette n'affiche nulle part les objets de catégorie « risque ».

Enfin, les photos des objets sont dans le paquet hors ligne et sur la tablette, mais ni dans l'aperçu ni
dans le PDF.

## Décision

1. **Un registre unique des sections**, aux clés stables, utilisé par l'aperçu, le PDF et la tablette,
   dans l'ordre de la maquette : Synthèse, Accès, Risques, Eau, Énergies, Moyens de secours, Plans,
   Contacts, Annexes, Photos. Les scénarios restent en P1 (ETARE-04).
2. **Sections obligatoires** : Synthèse, Accès, Risques, Eau, Contacts. **Le SIS peut masquer les
   autres** (Énergies, Moyens de secours, Plans, Annexes, Photos). L'ordre reste national.
   - Masquer une section la retire de l'aperçu, du PDF et des entrées de la tablette ; les éléments
     concernés restent sur les plans.
   - L'ordre libre, le logo, la palette, les mentions et les champs obligatoires restent en P1
     (ETARE-03).
3. **Le réglage est figé dans chaque version soumise** (instantané) : le validateur décide sur ce qui
   sera publié, et une publication ancienne ne change jamais quand le SIS modifie son réglage. Le
   gabarit du PDF change de version.
4. **Écarts corrigés** :
   - Accès avant Risques ;
   - les objets de catégorie « risque » rejoignent la section Risques (numérotation identique entre
     aperçu et PDF) et apparaissent sur la tablette ;
   - le même tri partout.
5. **Photos des objets : une annexe en fin de PDF**, en grille légendée (légende, objet, section).
   - Les images sont réduites à la fabrication à partir de l'original contrôlé, dont l'empreinte
     approuvée est vérifiée (comme pour les fonds de plan), jamais à partir des miniatures du
     back-office.
   - Un plafond par objet et par PDF limite le poids ; au-delà, le PDF indique le nombre de photos
     consultables sur la tablette.
   - L'aperçu montre la même annexe.

## Conséquences

- MET-05 est débloqué.
- ETARE-01 sera « Implémenté » une fois le registre, le masquage et l'annexe livrés et éprouvés sur des
  dossiers courts, longs et chargés en texte.
- L'instantané gagne un champ de mise en page optionnel, absent des instantanés antérieurs pour que
  leurs empreintes restent valables. La tablette lit ce champ ; une ancienne publication garde l'ordre
  national complet.
- Le poids du PDF, fichier obligatoire du paquet, est mesuré au regard du budget de synchronisation
  (ADR-018).

## Mise en œuvre (Sprint 10, 5 octobre 2026)

- **Registre** : `packages/domain/src/etare-layout.ts` (clés `synthesis`, `access`, `risks`, `water`,
  `energy`, `rescue`, `plans`, `contacts`, `annexes`, `photos`), repris à l'identique en Dart
  (`ops_labels.dart`, `ops_order.dart`).
- **Réglage du SIS** : Administration › Paramètres, carte « Sections de l'ETARE ». Il exige
  `catalog:manage` et chaque changement est tracé (`tenant.etare_layout`). Le champ `layout` n'est figé
  que si une section est masquée : un SIS qui ne masque rien garde les mêmes empreintes de contenu.
- **Précision du porteur (5 octobre 2026)** : masquer **Plans** ou **Annexes** ne concerne que le
  document (aperçu et PDF, pages de plans comprises). La tablette garde toujours ses entrées Plans et
  Documents, indispensables en intervention (OPS-02, DOC-02). Énergies, Moyens de secours et Photos
  masquées disparaissent aussi de la tablette.
- **Tri commun** :
  - points par criticité, puis titre sans accents, puis identifiant ;
  - risques par gravité, puis titre ;
  - le titre d'un point est son nom complet, à défaut son libellé court de carte, comme sur la tablette.
- **Tablette** :
  - les six grandes entrées gardent l'ordre de l'écran 07 (Risques en tête), et Coupures reste le nom
    terrain de la section Énergies ;
  - les points à risque sont listés sous Risques ;
  - les points critiques apparaissent dans la synthèse ;
  - une galerie Photos est ajoutée.
- **Annexe photos** (gabarit `etare-pdf/4`) :
  - au plus 4 photos par point et 40 par PDF, deux colonnes et trois rangées par page ;
  - une photo réduite à 1 000 px (JPEG) depuis l'original, après vérification de son empreinte ;
  - une photo dont l'original contrôlé ne se décode pas est signalée « Image illisible » au lieu de
    bloquer la publication ;
  - pas d'annexe pour un contenu sans photo.

## Critère de réexamen

Demande d'un SIS pour réordonner ou renommer les sections avant ETARE-03 ; poids des PDF incompatible
avec la synchronisation ; arrivée des scénarios (ETARE-04).
