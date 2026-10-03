# ADR-022 — Second facteur imposé par la base, sessions révocables

- Statut : acceptée — Sprint 9, 03/10/2026
- Sources : roadmap R4, SEC-02 (« imposer le second facteur côté API selon la politique des comptes
  enrôlés, récupération sécurisée, codes de secours, suspension/révocation de sessions et état des
  invitations/MFA visible ») ; ADR-003 (portabilité), ADR-010 (membres et second facteur), ADR-015
  (terminaux) ; décisions du porteur du 3 octobre 2026

## Contexte

L'ADR-010 laissait trois trous, déjà notés dans la page sécurité :

- le web renvoyait vers l'étape de code un compte qui a un second facteur, mais l'API acceptait encore
  son jeton sans code pour toute permission ordinaire ;
- un membre suspendu gardait des sessions ouvertes, refusées requête par requête, jusqu'à leur expiration ;
- l'administration ne voyait ni l'invitation acceptée ou non, ni le second facteur, ni la dernière
  connexion.

L'application tablette se connecte par mot de passe seul : imposer le code partout l'aurait bloquée
pour un compte enrôlé.

## Décision

1. **Le second facteur d'un compte enrôlé est exigé pour toute requête**, vérifié par
   `app.begin_request`. Sans code, l'API répond `MFA_REQUIRED`. Les exceptions sont limitées par la base
   elle-même (« portée » de la requête, `app.factor_scope_allows`) :
   - **lecture de son propre profil** (`GET /me`), sans aucune permission, pour que le client sache ce
     qu'il doit demander ;
   - **requête signée par une tablette enrôlée du SIS** : la clé du terminal tient lieu de facteur de
     possession. La base ne laisse alors que les permissions de synchronisation (`offline:download`,
     `publication:read`, `field_report:create`). L'API refuse de valider la transaction si la
     signature n'a pas été vérifiée (garde dans la fabrique de sessions) ;
   - **enrôlement d'une tablette** par son code à usage unique, remis par un administrateur avec second
     facteur : seule `offline:download` reste accordée.
2. **Politique du SIS**, réglée par l'administration avec le second facteur en cours d'usage et tracée
   (`tenant.security_settings`) :
   - `privileged` (par défaut) : le second facteur est exigé pour les actions sensibles ;
   - `all` : il est exigé pour tout accès hors tablette, et un membre sans second facteur doit en activer
     un avant toute autre action (le web affiche un écran bloquant) ;
   - `none` : jamais. Ce choix est explicite et déconseillé.

   Les exploitants restent régis par le réglage du portail (ADR-019).

3. **Sessions vérifiées et révocables.** Le jeton porte sa session (`session_id`, désormais exigé par
   l'API). La base refuse le jeton d'une session fermée dès la requête suivante, réponse 401 ; le web
   déconnecte alors localement.
   - Chacun voit ses sessions et ferme une session ou toutes les autres (« Mon compte »), action tracée.
   - **Une suspension ferme toutes les sessions** de la personne, action tracée. La fermeture vaut pour
     tous les SIS, car une session n'appartient pas à un SIS : la personne se reconnecte là où elle est
     encore membre.
4. **État visible des membres** : invitation en attente (jamais connecté), dernière connexion, second
   facteur. Ces informations ne sont lisibles qu'avec `member:manage`.
5. **Portabilité (ADR-003).** Seules six fonctions `app.idp_*` lisent le schéma du fournisseur
   d'identité : facteurs, sessions, dernière connexion, fermeture de sessions. Elles sont écrites en
   PL/pgSQL avec un garde : la migration s'applique sur un PostgreSQL nu, où aucun facteur n'est connu
   et où les sessions ne sont ni vérifiables ni fermables. Un autre fournisseur réimplémente ces seules
   fonctions. Le produit ne se relie toujours pas aux lignes de `auth.users`.

## Conséquences

- Contrat :
  - `Me.user.second_factor`, `Membership.second_factor_required`, `Member.last_sign_in_at` et
    `Member.second_factor` ;
  - `GET /me/sessions`, `POST /me/sessions/{id}/revocation` et `POST /me/sessions/revocation` ;
  - `GET`/`PUT /settings/security`.
- Mobile : `MFA_REQUIRED` et `RATE_LIMITED` sont reconnus, sans révoquer l'accès local. Un compte
  enrôlé synchronise et signale normalement, mais ne peut pas faire les rares appels non signés.
- Un jeton d'accès sans code reste refusé même pour lire, ce qui est plus strict qu'avant pour les tests
  et les scripts : un compte enrôlé doit présenter son code.
- Les tests de base ouvrent des contextes sans session : `begin_request` n'exige la session que si
  l'API la transmet. L'API, elle, l'exige toujours.
- Projet hébergé : vérifier que le rôle propriétaire des migrations lit `auth.sessions`,
  `auth.mfa_factors` et `auth.users` et peut supprimer dans `auth.sessions`. Régler aussi
  `[auth.sessions]` (durée maximale, inactivité) avec la DSI, en tenant compte des tablettes qui se
  synchronisent en arrière-plan.

## Critère de réexamen

SSO OIDC/SAML d'un SIS (le second facteur relève alors de son fournisseur), clés matérielles (WebAuthn),
ou tablette partagée exigeant une identification forte de chaque agent (SEC-05).
