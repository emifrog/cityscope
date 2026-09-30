# ADR-014 — PDF ETARE généré à la publication

- Statut : acceptée — Sprint 3, 30/09/2026
- Sources : exigence ETARE-02 (PDF horodaté, versionné, identifié comme publié) ; architecture technique §09
  (dérivés fabriqués par le worker) et §10 (fichiers du paquet par empreinte) ; complète ADR-013

## Contexte

Le PDF est la forme imprimable de l’ETARE. Il doit correspondre exactement à la version validée, dire
de quelle version publiée il s’agit et quand elle l’a été, et ne jamais être produit à partir des données de
travail.

## Décision

1. **Produit par le worker pendant la fabrication de la publication**, à partir de l’instantané figé
   (ADR-013) : `generateEtarePdf` (application) prépare les entrées, `PdfLibEtareRenderer` (adaptateur,
   `pdf-lib` 1.17.1, MIT) dessine. Version de gabarit `etare-pdf/2` (depuis le 30/09/2026), enregistrée
   dans `publication.template_version`.
2. **Identification sur chaque page** : « VERSION PUBLIÉE N° n », date et heure de publication (heure de
   Paris), numéro de révision, empreinte SHA-256 du contenu validé, pagination ; métadonnées du document
   (titre, date, producteur et gabarit).
3. **Contenu** : synthèse et points critiques, risques par gravité, sections de la maquette, contacts
   destinés aux intervenants, annexes ; **une page par plan** : le fond validé et, dessinés par-dessus en
   pixels du fond, les zones, objets (couleurs des calques) et risques (losange), avec une légende.
4. **Fonds vérifiés** : les fonds de plans sont relus dans le stockage et leur SHA-256 comparé à celui de
   l’instantané ; un écart arrête la publication (`PLAN_BACKGROUND_HASH_MISMATCH`). **Aucun plan n’est
   omis** : PNG et JPEG sont intégrés tels quels, un fond WebP est converti sans perte en PNG au moment du
   rendu (`sharp`, chargé seulement dans ce cas) ; un fond indisponible fait échouer la fabrication plutôt
   que de produire un PDF « publié » incomplet.
5. **Stockage et diffusion** : objet immuable adressé par son empreinte,
   `tenants/{sis}/publications/{publication}/etare-{sha256}.pdf` (jamais écrasé ; voir ADR-013), référencé
   par `publication.pdf_storage_key` et listé dans le manifeste avec son empreinte et sa taille
   (`required: true`). Les publications antérieures au 30/09/2026 gardent la clé `etare.pdf`. Téléchargement par `GET /publications/{id}/pdf` :
   autorisation sous RLS (un profil OPS n’atteint que les versions publiées), événement d’audit
   `publication.pdf_download`, URL signée de 60 s. Le nom et le numéro affichés viennent du contenu publié.
6. **Polices standard PDF (WinAnsi)** : les caractères qu’elles n’encodent pas sont décomposés ou remplacés
   (O₂ → O2, ≥ → >=).

## Conséquences

- Sans stockage configuré, le worker publie sans PDF (il l’annonce au démarrage) ; le manifeste ne liste
  alors pas de PDF.
- Une police embarquée (Unicode complet, charte du SIS) et le paramétrage du gabarit par SIS relèvent
  d’ETARE-03 (MVP+).
- La signature du manifeste (Ed25519) couvrira le PDF comme les autres fichiers.
- `sharp` 0.35 (Apache-2.0) embarque des binaires libvips sous LGPL-3.0-or-later, liés dynamiquement et
  non modifiés ; il n’est chargé par le worker que pour convertir un fond WebP.
- Les PDF des tentatives perdantes restent dans le stockage sans être référencés : purge à prévoir.
- Le test du rendu vérifie le contenu visuel de la page du plan : fond identique au pixel près (PNG,
  WebP) ou à l’octet près (JPEG), puis zones, objets, risques et libellés dessinés par-dessus.
