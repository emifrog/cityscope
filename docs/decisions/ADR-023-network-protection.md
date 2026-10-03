# ADR-023 — Protection réseau : limitation de débit, CSP, origines et traces des refus

- Statut : acceptée — Sprint 9, 03/10/2026
- Sources : roadmap R4, SEC-03 (« limitation de débit login/invitations/enrôlement/uploads/API, CSP
  compatible avec les workers carte/PDF, politique CORS et traces des refus sensibles ») ; ADR-006
  (cartographie IGN), ADR-007 (pas de Redis au MVP), ADR-015 (enrôlement) ; décision du porteur du
  3 octobre 2026 (compteurs dans PostgreSQL)

## Contexte

L'API n'avait aucune limitation de débit. Un code d'enrôlement (60 bits), un code de secours
(50 bits) ou une invitation pouvaient être essayés sans fin. Les pages n'avaient pas de CSP, l'absence
de CORS n'était qu'implicite, et un refus ne laissait qu'une ligne de journal, sans personne ni SIS.
Une écriture d'audit faite dans la transaction de la requête était perdue avec elle : un refus annule
la transaction.

## Décision

1. **Compteurs dans PostgreSQL**, partagés par toutes les instances, sans nouvelle brique
   (`app.rate_limit_bucket`, table UNLOGGED, fenêtres fixes, clés hachées). Chaque passage est une
   instruction autonome, hors de la transaction de la requête : une tentative refusée ou en échec
   compte toujours. Au-delà du plafond, réponse 429 `RATE_LIMITED` avec `Retry-After`.
   - Plafonds par défaut : 600 requêtes par minute et par personne ; 10 enrôlements par heure par
     personne et 30 par adresse ; 5 codes de secours par quart d'heure ; 30 invitations par heure ;
     120 dépôts de fichiers par heure ; 60 géocodages par minute ; 120 jetons refusés par minute et par
     adresse.
   - L'adresse du client n'est connue que derrière un proxy de confiance déclaré
     (`TRUSTED_PROXY_HOPS`) : Next.js conserve un `X-Forwarded-For` envoyé par le client lui-même. Sans
     proxy, seules les limites par personne s'appliquent.
   - La connexion et l'envoi des e-mails d'authentification relèvent du fournisseur d'identité, qui a
     ses propres plafonds (`[auth.rate_limit]`), à reporter sur le projet hébergé.
2. **CSP des pages, avec nonce** généré par le `proxy` à chaque page, qui rend donc chaque page
   dynamiquement :
   - scripts de l'application seulement, avec le nonce de la page (`'strict-dynamic'`) ;
   - workers de la carte et du lecteur PDF servis par l'application ;
   - images et appels vers l'application, Supabase et les seuls hôtes cartographiques
     (`MAP_TILE_ORIGINS`, couverture du catalogue vérifiée par un test) ;
   - ni cadre, ni plugin, ni `base`, ni formulaire vers un autre site.

   Les attributs `style` restent permis, car ceux que le serveur rend ne peuvent pas porter de nonce ;
   les éléments `style` exigent le nonce. Pour l'API : `default-src 'none'`,
   `frame-ancestors 'none'` et `Cross-Origin-Resource-Policy: same-origin`. HSTS est envoyé dès que la
   page est servie en HTTPS.

3. **Pas de CORS, explicitement** : une requête de navigateur venant d'une autre origine, ou une
   requête de pré-vol, est refusée (403) et tracée. Des origines supplémentaires peuvent être
   déclarées (`ALLOWED_ORIGINS`). L'application mobile n'envoie pas d'en-tête `Origin`.
4. **Traces des refus sensibles** dans `audit_event`, avec le résultat `denied`, dans leur propre
   transaction :
   - refus faute de second facteur ou de permission ;
   - preuve de terminal invalide, terminal révoqué ou inconnu ;
   - session fermée, origine refusée ;
   - code d'enrôlement ou code de secours refusé ;
   - première limite atteinte de chaque fenêtre.

   La personne est nommée si son jeton a été vérifié ; le SIS seulement si elle en est membre.
   L'adresse est conservée quand elle est connue.

## Conséquences

- Une requête authentifiée coûte une écriture de plus, le passage du compteur. Elle est mesurée avec
  la volumétrie (CAP-01) ; les fenêtres de plus d'un jour sont purgées par le worker (CAP-03).
- Tests d'intégration : limites coupées (`RATE_LIMITS=off`) sauf dans leur propre fichier, qui les
  éprouve sur des fenêtres neuves.
- Une fenêtre fixe admet jusqu'au double du plafond à cheval sur deux fenêtres, ce qui est accepté
  pour ces plafonds.
- Les pages ne sont plus prérendues statiquement : coût de rendu à chaque requête, sans effet notable
  pour une application derrière authentification.

## Critère de réexamen

Hébergement retenu (DEC-03) : un WAF ou reverse proxy géré peut reprendre la limitation par adresse ;
charge mesurée incompatible avec un compteur en base ; besoin d'un rapport des violations CSP
(`report-to`).
