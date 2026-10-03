# ADR-009 — Dépôt de fichiers contrôlé (quarantaine, vérification par le worker)

- Statut : acceptée — Sprint 1, 30/09/2026
- Sources : prompt §10 et §15 ; exigences SITE-05, PORTAL-03 ; architecture technique §07, §24

## Contexte

Les documents d’un site (fiches de données de sécurité, consignes, plans, photos) seront consultés par les
intervenants, y compris hors ligne. Un fichier déposé ne doit être servi qu’une fois vérifié, jamais sur la
foi de ce que le navigateur annonce (extension, type MIME). Les fichiers ne transitent pas par l’API
(corps JSON limités à 64 Kio) et le stockage objet doit rester remplaçable (ADR-003).

## Décision

1. **Déclaration** : le client calcule taille, SHA-256 et type réel (signature des premiers octets) et
   déclare le fichier (`POST /sites/{id}/documents` ou `/documents/{id}/versions`). Types admis : PDF,
   PNG, JPEG, WebP ; 50 Mo maximum ; nom de fichier sans chemin ni caractère de contrôle. L’API crée
   l’`asset` (`scan_status = pending`) et renvoie une URL signée de dépôt vers
   `tenants/{sis}/quarantine/{asset}/{version}`, sans écrasement possible (`x-upsert: false`).
2. **Confirmation** : `POST /assets/{id}/uploaded` planifie `asset.verify` dans la même transaction
   (clé d’idempotence = l’asset).
3. **Vérification par le worker** : taille, SHA-256 et type réel comparés à la déclaration, puis
   antivirus (port `MalwareScanner`). Conforme : copie vers `tenants/{sis}/assets/…`, suppression de la
   quarantaine, verdict `clean`. Sinon : suppression et verdict `rejected` avec motif (`SIZE_MISMATCH`,
   `SHA256_MISMATCH`, `TYPE_MISMATCH`, `MALWARE`). Un job ne traite qu’un asset de son propre SIS.
4. **Le verdict appartient au worker et il est définitif** : `etare_api` n’a le droit de modifier que
   les métadonnées descriptives de `asset` (privilèges par colonne) ; le verdict passe par des fonctions
   `SECURITY DEFINER` réservées à `etare_worker` ; un trigger interdit tout retour en arrière, y compris
   pour le propriétaire des tables. La clé de quarantaine porte toujours le SIS de l’asset (`CHECK`).
5. **Consultation** : `GET /assets/{id}/download` autorise l’asset exact sous RLS, refuse (409) un
   fichier non vérifié ou refusé, trace l’accès (`asset.download`) et renvoie une URL signée de 60 s.
6. Une nouvelle version n’écrase jamais la précédente : `document_version` est numérotée et conservée.

## Conséquences

- Antivirus (Sprint 5, SEC-01) : ClamAV par le démon clamd (commande `INSTREAM`, fichier transmis par
  blocs, jamais écrit sur disque de notre côté), `ANTIVIRUS_URL=tcp://hôte:port`, obligatoire en
  préproduction et en production (le worker refuse de démarrer sans). Verdicts : `OK` admis,
  `… FOUND` refusé (`MALWARE`, signature conservée), fichier au-delà de la limite du démon refusé
  (`UNSCANNABLE`) ; démon injoignable, en erreur ou muet : le travail est rejoué et le fichier reste
  en quarantaine, jamais admis. En développement seulement, sans démon, `antivirusNotConfigured` le dit
  dans le détail du verdict (`antivirus: not_scanned`) et au démarrage du worker. La limite de flux du
  démon (`StreamMaxLength`) doit couvrir la taille maximale des dépôts (50 Mo).
- La clé secrète Supabase est désormais utilisée **côté serveur uniquement** (API pour signer les URL,
  worker pour lire, copier et supprimer les objets). Elle n’est jamais exposée au navigateur.
- Un dépôt déclaré mais jamais envoyé reste `pending` : le web cesse de l’attendre après 10 minutes ; la
  maintenance du Sprint 9 le rejette au bout de 24 h (complément ci-dessous).
- Miniatures, conversion et extraction de texte s’ajoutent comme handlers en aval du verdict `clean`.

## Complément du Sprint 4 — photos des objets (PLAN-05)

Une photo attachée à un point opérationnel (accès, organe de coupure, PEI…) emprunte la même chaîne :
`POST /objects/{id}/photos` déclare le fichier (PNG, JPEG ou WebP, 15 Mo au plus) et rend l’URL de
dépôt, puis le worker rend son verdict. Elle est distincte des documents du site : rattachée à un objet,
ordonnée, légendée, archivée plutôt que supprimée (`PATCH /object-photos/{id}`). Une photo contrôlée
entre dans l’instantané ETARE et dans le paquet hors ligne (`photos/{id}.{ext}`, fichier obligatoire) ;
la tablette l’affiche depuis sa base chiffrée, dans la fiche de l’objet.

## Complément du Sprint 9 — cycle des fichiers (CAP-03)

- **Versions réduites des images.** Le verdict `clean` d’une image (PNG, JPEG, WebP) planifie
  `asset.thumbnail`. Le worker en tire deux images WebP de 320 px et 1 280 px au plus avec sharp :
  orientation appliquée, jamais agrandies, métadonnées retirées (position GPS comprise), décodage
  borné à 100 Mpx. Elles sont rangées à côté de l’asset (`tenants/{t}/thumbnails/…`) et seul le worker
  les enregistre.
  - Le back-office les affiche dans les listes (photos des objets, signalements, propositions) et
    n’ouvre la version 1 280 px qu’à la demande.
  - `GET /assets/{id}/download?variant=thumbnail|preview` sert l’original tant que la version réduite
    n’existe pas ; chaque accès reste tracé, avec sa variante.
  - Les paquets des tablettes et le PDF gardent les originaux, avec leurs empreintes signées.
- **Vérification fiable.** Une vérification abandonnée par la file (tentatives épuisées) rejette son
  asset (`VERIFICATION_FAILED`), qui ne reste plus `pending`. Une tentative interrompue après la copie
  est reprise : le fichier déjà promu est reconnu à son empreinte.
- **Maintenance horaire** (`maintenance.files`, un seul travail par heure quel que soit le nombre de
  workers) :
  - retrait des objets de quarantaine des dépôts rejetés, et des dépôts jamais confirmés ni vérifiés
    après 24 h, ensuite rejetés `ABANDONED` ;
  - retrait des PDF des tentatives de fabrication perdantes, notés avant leur écriture
    (`publication_output`) et retirés une heure après la fin de la fabrication ;
  - purge des fenêtres de limitation de débit.

  La base désigne seule les candidats et n’en propose jamais un qu’un asset ou une publication
  conserve. Le stockage refuse de supprimer un asset vérifié ou une version réduite. Chaque retrait est
  audité au nom du worker ; un élément en erreur est repris au passage suivant.

## Critère de réexamen

Fichiers volumineux (vidéos, maquettes 3D) imposant un dépôt fractionné, ou stockage objet hors Supabase.
