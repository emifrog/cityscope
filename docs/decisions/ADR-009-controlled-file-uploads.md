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

- L’antivirus n’est pas encore choisi : `antivirusNotConfigured` le dit explicitement dans le détail du
  verdict (`antivirus: not_scanned`) et le worker l’annonce au démarrage. Brancher ClamAV (ou un service
  managé) revient à implémenter `MalwareScanner`.
- La clé secrète Supabase est désormais utilisée **côté serveur uniquement** (API pour signer les URL,
  worker pour lire, copier et supprimer les objets). Elle n’est jamais exposée au navigateur.
- Un dépôt déclaré mais jamais envoyé reste `pending` : le web cesse de l’attendre après 10 minutes ; une
  purge planifiée des dépôts abandonnés et des objets orphelins de quarantaine reste à écrire.
- Miniatures, conversion et extraction de texte s’ajouteront comme handlers en aval du verdict `clean`.

## Critère de réexamen

Fichiers volumineux (vidéos, maquettes 3D) imposant un dépôt fractionné, ou stockage objet hors Supabase.
