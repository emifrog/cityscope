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

## Critère de réexamen

Demande d'un SIS pour réordonner ou renommer les sections avant ETARE-03 ; poids des PDF incompatible
avec la synchronisation ; arrivée des scénarios (ETARE-04).
