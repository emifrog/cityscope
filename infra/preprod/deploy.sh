#!/usr/bin/env bash
# Déploie un commit sur la préproduction (EXP-01), depuis le dépôt cloné sur le serveur :
#
#   bash infra/preprod/deploy.sh            dernier commit de main
#   bash infra/preprod/deploy.sh <commit>   un commit précis (retour arrière compris)
#
# Les migrations de la base ne sont PAS appliquées ici : elles le sont avant, depuis le poste de
# déploiement (README.md, étape 5). Chaque déploiement est noté dans /opt/firescape/deployments.log.
set -euo pipefail

die() {
  printf 'ERREUR : %s\n' "$*" >&2
  exit 1
}

cd "$(dirname "$0")/../.."
here=infra/preprod
ref="${1:-origin/main}"

for file in "$here/preprod.env" "$here/web.env" "$here/worker.env" \
  "$here/secrets/catalog_signing_key.pem" "$here/secrets/publication_signing_key.pem" \
  "$here/secrets/distribution_keyset.json" "$here/secrets/supabase-ca.crt"; do
  [ -s "$file" ] || die "$file manquant (README.md, étape 4)."
done
[ -z "$(git status --porcelain --untracked-files=no)" ] || die "fichiers suivis modifiés sur le serveur : rien n'est déployé."

git fetch --quiet origin
git checkout --quiet --detach "$ref"
commit=$(git rev-parse --short=12 HEAD)
echo "Déploiement de ${commit} : $(git log -1 --format=%s)"

compose=(docker compose -f "$here/compose.yaml" --env-file "$here/preprod.env")
export APP_VERSION="$commit"
"${compose[@]}" build --pull
# Image de la sauvegarde nocturne (EXP-02), une fois sauvegarde.env en place (README.md, §10).
if [ -s "$here/sauvegarde.env" ]; then "${compose[@]}" --profile sauvegarde build --pull sauvegarde; fi
"${compose[@]}" up -d --remove-orphans

# Le web répond sain une fois connecté à la base ; Caddy ne démarre qu'après lui.
for _ in $(seq 1 30); do
  status=$(docker inspect --format '{{.State.Health.Status}}' "$("${compose[@]}" ps -q web)" 2>/dev/null || true)
  [ "$status" = healthy ] && break
  sleep 5
done
[ "${status:-}" = healthy ] || die "le web n'est pas sain : docker compose logs web."

"${compose[@]}" ps
printf '%s %s\n' "$(date -Iseconds)" "$commit" >>/opt/firescape/deployments.log
docker image prune -f --filter 'until=168h' >/dev/null
echo "Préproduction en ${commit}."
