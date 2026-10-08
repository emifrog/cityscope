#!/usr/bin/env bash
# Exercice de reprise sur la pile Supabase locale (EXP-02, ADR-031), en CI et sur un poste :
#
#   bash infra/backup/exercice.sh --effacer-la-pile-locale
#
# 1. sauvegarde de la pile (base, fichiers, configuration factice), chiffrée pour une clé jetable ;
# 2. contrôle de l'archive, et relevé des anomalies du contenu de la source (référence) ;
# 3. effacement : fichiers supprimés du stockage, base recréée vierge par les migrations ;
# 4. restauration de la base et des fichiers depuis l'archive seule ;
# 5. contrôle des lignes, des fichiers, des manifestes et des signatures (pnpm backup:verify) : fidèle à
#    l'archive, avec exactement les anomalies de la source.
#
# La base locale est remplacée par son propre contenu restauré : si l'exercice échoue, `pnpm db:reset`.
set -euo pipefail

die() {
  printf 'ERREUR : %s\n' "$*" >&2
  exit 1
}

[ "${1:-}" = --effacer-la-pile-locale ] ||
  die "la pile locale est effacée puis restaurée : relancer avec --effacer-la-pile-locale."
cd "$(dirname "$0")/../.."

status=$(pnpm exec supabase status -o env 2>/dev/null) || die "pile Supabase locale arrêtée (pnpm db:start)."
value() { printf '%s\n' "$status" | sed -n "s/^$1=\"\{0,1\}\([^\"]*\)\"\{0,1\}$/\1/p"; }
db_url=$(value DB_URL)
s3_url=$(value STORAGE_S3_URL)
[ -n "$s3_url" ] || die "protocole S3 du stockage local inactif (supabase/config.toml, [storage.s3_protocol])."
case $db_url in
  *@127.0.0.1:* | *@localhost:*) ;;
  *) die "la base n'est pas la pile locale : exercice refusé." ;;
esac

# Les conteneurs joignent la pile par l'hôte : réseau de l'hôte sous Linux, host.docker.internal ailleurs.
if docker info --format '{{.OperatingSystem}}' | grep -q 'Docker Desktop'; then
  host=host.docker.internal
  docker_args=()
else
  host=127.0.0.1
  docker_args=(--network host --user "$(id -u):$(id -g)")
fi
in_container() { printf '%s' "$1" | sed -E "s#@(127\.0\.0\.1|localhost):#@$host:#; s#//(127\.0\.0\.1|localhost):#//$host:#"; }
hostpath() { if command -v cygpath >/dev/null; then cygpath -m "$1"; else printf '%s' "$1"; fi; }

# Données en clair (extractions) : supprimées à la fin, même en cas d'échec.
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$work"/{cles,etat,sortie,controle,restauration,configuration/secrets}
printf 'EXEMPLE=valeur\n' >"$work/configuration/exemple.env"
printf 'secret factice\n' >"$work/configuration/secrets/exemple.pem"

image=firescape-sauvegarde:exercice
docker build -q -t "$image" infra/backup >/dev/null
run() {
  MSYS_NO_PATHCONV=1 docker run --rm "${docker_args[@]}" \
    -e BACKUP_STATE_DIR=/etat -e HOME=/etat -v "$(hostpath "$work/etat"):/etat" \
    -v "$(hostpath "$work/cles"):/cles" -v "$(hostpath "$work/sortie"):/sortie" \
    -v "$(hostpath "$work/controle"):/controle" -v "$(hostpath "$work/restauration"):/restauration" \
    -v "$(hostpath "$work/configuration"):/configuration:ro" \
    -e RCLONE_CONFIG_STOCKAGE_TYPE=s3 -e RCLONE_CONFIG_STOCKAGE_PROVIDER=Other \
    -e "RCLONE_CONFIG_STOCKAGE_ENDPOINT=$(in_container "$s3_url")" \
    -e "RCLONE_CONFIG_STOCKAGE_REGION=$(value S3_PROTOCOL_REGION)" \
    -e "RCLONE_CONFIG_STOCKAGE_ACCESS_KEY_ID=$(value S3_PROTOCOL_ACCESS_KEY_ID)" \
    -e "RCLONE_CONFIG_STOCKAGE_SECRET_ACCESS_KEY=$(value S3_PROTOCOL_ACCESS_KEY_SECRET)" \
    "$@"
}
seconds() { echo $(($(date +%s) - $1)); }
dotenv=()
[ -f .env.local ] && dotenv=(--dotenv .env.local)

run "$image" cle /cles/exercice.txt
recipient=$(grep -o 'age1[0-9a-z]*' "$work/cles/exercice.txt" | head -1)

echo "== 1. Sauvegarde"
t=$(date +%s)
backup_url=$(in_container "${db_url/postgres:postgres@/etare_backup:etare_backup_local_only@}")
run -e BACKUP_ENVIRONMENT=exercice -e "BACKUP_DATABASE_URL=$backup_url" -e "BACKUP_AGE_RECIPIENTS=$recipient" \
  -e BACKUP_DESTINATION=destination:/sortie -e RCLONE_CONFIG_DESTINATION_TYPE=local \
  -e BACKUP_CONFIG_DIR=/configuration -e RCLONE_CONFIG_SOURCE_TYPE=alias -e RCLONE_CONFIG_SOURCE_REMOTE=stockage: \
  "$image" sauvegarder
backup_seconds=$(seconds "$t")
archive=$(cd "$work/sortie" && find . -name '*.tar.zst.age' | head -1)
[ -n "$archive" ] || die "aucune archive déposée."
archive=/sortie/${archive#./}

echo "== 2. Contrôle de l'archive et relevé de la source"
run -e BACKUP_AGE_IDENTITY=/cles/exercice.txt "$image" verifier "$archive" --dossier /controle/archive
RESTORE_DATABASE_URL="$db_url" pnpm backup:verify --restauration "$work/controle/archive" --contenu-seulement \
  --rapport "$work/reference.json" "${dotenv[@]}"

echo "== 3. Effacement de la pile locale"
t=$(date +%s)
buckets=$(run --entrypoint psql "$image" "$(in_container "$db_url")" -At -c 'select id from storage.buckets')
for bucket in $buckets; do
  run --entrypoint rclone "$image" delete "stockage:$bucket" --retries 3
done
pnpm exec supabase db reset --no-seed >/dev/null
wipe_seconds=$(seconds "$t")

echo "== 4. Restauration"
t=$(date +%s)
run -e BACKUP_AGE_IDENTITY=/cles/exercice.txt -e "RESTORE_DATABASE_URL=$(in_container "$db_url")" \
  -e RCLONE_CONFIG_CIBLE_TYPE=alias -e RCLONE_CONFIG_CIBLE_REMOTE=stockage: \
  "$image" restaurer "$archive" --dossier /restauration/archive
restore_seconds=$(seconds "$t")
[ -f "$work/restauration/archive/configuration/secrets/exemple.pem" ] ||
  die "configuration du serveur absente de l'archive."
# Les rôles sont recréés par la remise à zéro : connexions locales de seed.sql, comme pnpm db:reset.
grep '^alter role etare_' supabase/seed.sql | run -i --entrypoint psql "$image" "$(in_container "$db_url")" -q -v ON_ERROR_STOP=1

echo "== 5. Contrôle de la plateforme restaurée"
t=$(date +%s)
RESTORE_DATABASE_URL="$db_url" pnpm backup:verify --restauration "$work/restauration/archive" \
  --reference "$work/reference.json" "${dotenv[@]}"
verify_seconds=$(seconds "$t")

echo "== Durées : sauvegarde ${backup_seconds} s, effacement ${wipe_seconds} s, restauration ${restore_seconds} s, contrôle ${verify_seconds} s"
