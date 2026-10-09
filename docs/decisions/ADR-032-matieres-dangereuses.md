# ADR-032 — Matières dangereuses et fiches de données de sécurité structurées

- Statut : acceptée — Sprint 14, 09/10/2026
- Sources : cahier des charges RISK-03 (P1, « produit, quantité, unité, localisation, FDS ») ; modèle de
  données (`document.category = fds`, `object_asset.purpose = fds` non retenu) ; suivi des exigences (« un
  document classé FDS ne remplace pas cette fonction ») ; ADR-013 (instantané figé), ADR-026 (registre
  des sections), ADR-014 (PDF) ; demande du porteur du 9 octobre 2026 (écart visible en démonstration)
- Complète l’ADR-026 (section Risques) et l’ADR-014 (gabarit)

## Contexte

Les risques (`risk_occurrence`) portent déjà une quantité et une unité, et les documents connaissent la
catégorie « FDS ». Mais rien ne dit _quel produit_ est stocké, en quelle quantité, où, ni _quelle_ fiche
de données de sécurité le concerne : un document nommé FDS flotte au niveau du site. Sur le terrain, la
question est précise : quel produit, combien, dans quel local, et la fiche associée.

## Décision

1. **Une table dédiée, `app.hazardous_substance`**, portée par le site comme les risques
   (`site:read` / `site:write`, RLS par périmètre, audit, édition comptée dans la révision pour la
   séparation des tâches, archivage sans suppression) :
   - produit (`name`), **classes CLP** (`hazard_classes`, pictogrammes GHS01 à GHS09, étiquetés en
     français dans le domaine), numéro ONU (quatre chiffres), état physique ;
   - quantité et unité, toujours ensemble ;
   - localisation : bâtiment, niveau, zone (cohérence zone ⊂ niveau ⊂ bâtiment vérifiée par la base,
     niveau et bâtiment déduits de la zone) et note libre ;
   - **la FDS est un document du même site, classé `fds` et actif** (`fds_document_id`) ; la base le
     vérifie, l’API le dit avant elle.
2. **Pas d’extension du catalogue des risques** : une matière n’est pas un type de risque (la même
   matière peut relever de plusieurs classes), et les propriétés libres des types ne portent ni la fiche
   ni la quantité de façon contrôlée. Les risques gardent leur rôle : gravité, position sur plan et carte.
3. **Dans l’instantané ETARE, une section optionnelle `substances`** (additive : clé absente quand il
   n’y en a pas, empreintes des anciens instantanés inchangées, lecteurs anciens indifférents). Chaque
   entrée nomme sa fiche telle que publiée (`fds: {document_id, title, version_id}`) seulement si le
   document est parmi ceux de l’instantané : les tablettes ne pointent jamais vers un fichier qu’elles
   n’ont pas. Le contrôle avant soumission avertit des matières sans fiche prête.
4. **Restitution** : PDF, section Risques (ADR-014, complément) ; aperçu web ; application OPS, section
   Risques, avec l’ouverture de la FDS par le circuit des documents (installée ou à la demande). Le
   portail exploitant ne reçoit pas les matières (comme les risques).

## Conséquences

- Nouvelle API `/sites/{id}/substances` et `/substances/{id}`, nouvel onglet « Matières dangereuses »
  de la fiche du site. La comparaison des révisions liste les matières ajoutées, modifiées, retirées.
- La fiche reste un document ordinaire du site : versions, contrôle antivirus, politique hors ligne. Une
  FDS « jamais hors ligne » est nommée dans l’instantané mais n’est pas sur la tablette : le circuit « à
  la demande » s’applique.
- Non retenus : la saisie assistée depuis la FDS (architecture §25, IA) et les phrases H/P, à cadrer si
  le pilote les demande.

## Critère de réexamen

Demande d’un SIS d’un référentiel de produits (base nationale, numéro CAS), ou besoin de localiser une
matière sur un plan comme un risque : on ajouterait alors un lien matière → risque plutôt qu’une
géométrie propre.
