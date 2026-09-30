# ADR-010 — Administration des membres et double authentification

- Statut : acceptée — Sprint 1, 30/09/2026
- Sources : prompt §8 (RBAC, MFA), §15 (sécurité) ; cahier des charges (comptes, habilitations) ;
  ADR-008 (multi-SIS, RBAC)

## Contexte

Les comptes étaient créés à la main (seed, `pnpm integration grant`). Un administrateur de SIS doit
pouvoir inviter des personnes, attribuer ou retirer des rôles et suspendre un accès, sans pouvoir
s’octroyer lui-même des droits. Les permissions sensibles (valider, publier, gérer les membres et les
terminaux) exigeaient déjà une authentification forte (`aal2`) dans `app.has_permission`, mais aucun
écran ne permettait d’enrôler un second facteur.

## Décision

1. **Double authentification TOTP** (application d’authentification) via Supabase Auth : enrôlement et
   retrait dans « Mon compte », étape de code à la connexion. Le proxy web renvoie vers `/verification`
   toute session dont le compte a un facteur vérifié tant que le code n’a pas été saisi. L’API ne fait
   confiance qu’au claim `aal` du jeton vérifié ; PostgreSQL le revérifie.
2. **`MFA_REQUIRED` seulement pour qui en bénéficierait** : quand une permission sensible manque en
   `aal1`, l’API demande à la base (`app.holds_with_second_factor`) si les rôles de la personne
   l’accorderaient avec le second facteur ; sinon la réponse est `FORBIDDEN`.
3. **Écritures d’habilitations par fonctions `SECURITY DEFINER`** (`app.admin_add_member`,
   `app.admin_update_member`) : les tables d’identité restent en lecture seule pour l’API. Règles
   vérifiées dans la base elle-même :
   - `member:manage` requis, donc second facteur (sauf désactivation explicite par le SIS) ;
   - personne ne modifie sa propre adhésion ni ses rôles ;
   - rôles attribuables à l’échelle du SIS : rôles système de niveau SIS, jamais `SUPER_ADMIN`, jamais
     `EXPLOITANT` (toujours limité à des sites, géré avec le portail exploitant) ;
   - un SIS garde au moins un administrateur actif ;
   - concurrence optimiste sur l’adhésion (`If-Match`, 412) ;
   - un rôle retiré est révoqué (historique conservé) et peut être réattribué.
4. **Invitation** : si l’adresse a déjà un compte, il est rattaché ; sinon l’API crée l’identité avec la
   clé secrète côté serveur (`inviteUserByEmail`) puis la rattache. Le lien de l’e-mail ouvre
   `/auth/confirm`, qui ne vérifie le jeton qu’au clic (les analyseurs de liens des messageries ne
   peuvent pas le consommer), puis fait choisir un mot de passe conforme à la politique.
5. **Suspension** : effet immédiat, `app.begin_request` refuse toute requête d’un membre suspendu.

## Conséquences

- Gabarit d’invitation versionné (`supabase/templates/invite.html`) ; sur un projet hébergé, le même
  gabarit est à reporter dans le tableau de bord (Authentication → Emails → Invite user).
- Une adresse déjà connue d’un autre SIS est rattachée sans nouvel e-mail : un administrateur peut en
  déduire qu’elle possède un compte sur la plateforme (information jugée acceptable pour un rôle
  d’administration protégé par le second facteur).
- L’obligation du second facteur pour **toutes** les requêtes d’un compte enrôlé est appliquée par le
  web (proxy), pas encore par l’API : un jeton `aal1` d’un compte enrôlé reste accepté pour les
  permissions non sensibles. À traiter avec un claim personnalisé ou un miroir de l’enrôlement.
- Non couverts : récupération d’un second facteur perdu (procédure support), codes de secours,
  réinitialisation du mot de passe en libre-service, révocation des sessions à la suspension (le jeton
  reste valide jusqu’à expiration mais la base refuse chaque requête).

## Critère de réexamen

SSO OIDC/SAML d’un SIS (le second facteur relève alors de son fournisseur d’identité) ou exigence de
clés matérielles (WebAuthn).
