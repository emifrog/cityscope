# ADR-012 — Éléments des plans et catalogue des risques du SIS

- Statut : acceptée — Sprint 3, 30/09/2026
- Sources : prompt §12 ; exigences PLAN-02, PLAN-03, PLAN-04, RISK-01, RISK-02 ; architecture technique §08
  (objets et migrations de plan)

## Contexte

Les objets opérationnels, les zones (locaux, refuges, circulations) et les risques se dessinent sur les plans
de niveau (ADR-011), en pixels d’une révision du fond. Un fond peut être remplacé : l’architecture impose que
la reprise des objets soit contrôlée visuellement, jamais déduite d’une translation automatique. Chaque SIS
doit pouvoir compléter le catalogue des risques (types, gravité, pictogramme, champs spécifiques) sans toucher
au catalogue national.

## Décision

1. **Règles de placement en base** (trigger `placement` sur `zone`, `operational_object`,
   `risk_occurrence`) : une position sur plan appartient à une révision, reste dans le fond (`st_coveredby`
   de l’emprise en pixels) et n’est posée ou déplacée **que sur la révision courante**. Un élément resté sur
   un fond remplacé reste modifiable (libellé, propriétés) mais ne bouge qu’en étant replacé sur le fond
   actuel. Le client propose l’ancienne position quand elle tient dans le nouveau fond ; l’agent la vérifie
   et enregistre.
2. **Portée cohérente** : zone ⊂ niveau ⊂ bâtiment, déduits vers le haut et contradictions refusées ; sur un
   plan de niveau, le niveau et le bâtiment viennent du plan, et la zone d’un objet ou d’un risque est la plus
   petite zone active qui le contient. Une zone ne se dessine que sur un plan de niveau.
3. **Risques** : un point ou une surface (`risk_occurrence_geometry_kind`), un libellé court, une gravité
   (par défaut celle du type), une quantité avec son unité et les **champs propres au type**, validés comme
   les propriétés des objets (sous-ensemble de JSON Schema, `packages/domain`).
4. **Catalogue du SIS** (`catalog:manage`, administrateur du SIS) : l’API reçoit une liste de champs
   (`texte`, `nombre`, `entier`, `oui/non`, `date`, `liste de choix`, unité, obligatoire), jamais un schéma
   libre ; le schéma est construit par le domaine. Le catalogue national est en lecture seule (RLS et
   `FORBIDDEN` explicite) ; un code national ne peut pas être repris (trigger `catalog_code_guard`). Un type
   retiré n’est plus proposé, ses occurrences restent.
5. **Pictogrammes** : clés fixes (`RISK_ICON_KEYS`), dessinées par les clients (losange de danger et icône
   lucide, ISC) ; aucun fichier déposé.
6. **Suppression et annulation** : supprimer = archiver (transition explicite, historique conservé) ;
   « annuler la dernière action » rejoue l’opération inverse (archivage d’une création, valeurs précédentes
   d’une modification) avec la version courante de l’élément (concurrence optimiste).

## Conséquences

- Les calques du plan (PLAN-04) regroupent les catégories d’objets : risques, eau, accès, énergie, secours
  (sécurité, désenfumage, refuges, circulations verticales, communication), annotations, et les zones.
- La zone d’un objet est recalculée quand il bouge. **Complément du Sprint 8 (MET-03) :** elle l’est aussi
  quand une zone est tracée, déplacée, archivée ou réactivée, pour les éléments placés sur le même fond
  (mise à jour ordinaire, auditée, au nom de la personne qui modifie la zone) ; un élément placé tire sa zone
  de sa position, une demande contraire est recalculée ; un risque sans position garde la zone choisie, sauf
  si elle est archivée. Une référence à une zone qui n’est plus active bloque la soumission.
- Les risques placés sur la carte (hors plan) : réalisés au Sprint 8 (MET-02), point ou zone de danger,
  avec leur portée, figés dans l’instantané.
- L’annulation porte sur les actions de la session d’édition ; l’historique complet reste celui de l’audit.
