#!/usr/bin/env bash
# Sauvegarde de la préproduction (EXP-02), lancée chaque nuit par firescape-sauvegarde.timer, ou à la main :
#
#   bash infra/preprod/sauvegarde.sh
#
# Image construite par deploy.sh ; configuration dans sauvegarde.env (README.md, §10).
set -euo pipefail
cd "$(dirname "$0")/../.."
[ -s infra/preprod/sauvegarde.env ] || {
  echo 'ERREUR : infra/preprod/sauvegarde.env manquant (README.md, §10).' >&2
  exit 1
}
# Version déployée, inscrite dans le manifeste de l'archive.
APP_VERSION=$(git rev-parse --short=12 HEAD)
export APP_VERSION
exec docker compose -f infra/preprod/compose.yaml --env-file infra/preprod/preprod.env --profile sauvegarde \
  run --rm --no-deps sauvegarde
