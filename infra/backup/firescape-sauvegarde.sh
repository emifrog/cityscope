#!/usr/bin/env bash
# Sauvegarde et restauration de FireScape (EXP-02, ADR-031, docs/exploitation/sauvegarde-restauration.md).
#
#   firescape-sauvegarde sauvegarder            base, fichiers et configuration : archive chiffrée déposée hors site
#   firescape-sauvegarde verifier <archive>     déchiffre et contrôle une archive, sans rien restaurer
#                            [--dossier <d>]    et garde l'extraction dans <d>
#   firescape-sauvegarde restaurer <archive>    base et fichiers dans un projet Supabase vierge
#   firescape-sauvegarde cle <fichier>          crée une clé age (exercice ; clés réelles : README)
#
# Archive : tar | zstd | age, chiffrée pour les clés publiques BACKUP_AGE_RECIPIENTS. Les clés privées
# restent hors ligne : le serveur sauvegardé ne peut pas relire ses propres archives.
set -euo pipefail
umask 077

STATE=${BACKUP_STATE_DIR:-/var/lib/firescape-sauvegarde}
# Dossiers de travail (données en clair) : supprimés à la sortie, même en cas d'échec.
CLEANUP=()
cleanup() { [ ${#CLEANUP[@]} -eq 0 ] || rm -rf -- "${CLEANUP[@]}"; }
trap cleanup EXIT
RCLONE_FLAGS=(--retries 5 --low-level-retries 10 --stats 0)

# Données seulement : le schéma vient des migrations du dépôt, rejouées sur le projet cible. Exclus :
# sessions et jetons (reconnexion après restauration), historique interne de Supabase Auth, et le schéma
# storage (chaque fichier est recréé par son dépôt dans le stockage cible, avec ses métadonnées).
DUMP_SCOPE=(
  --schema=app --schema=auth
  --exclude-table-data=auth.schema_migrations
  --exclude-table-data=auth.sessions --exclude-table-data=auth.refresh_tokens
  --exclude-table-data=auth.mfa_amr_claims --exclude-table-data=auth.mfa_challenges
  --exclude-table-data=auth.flow_state --exclude-table-data=auth.one_time_tokens
  --exclude-table-data=auth.saml_relay_states --exclude-table-data=auth.oauth_authorizations
  --exclude-table-data=auth.oauth_client_states --exclude-table-data=auth.webauthn_challenges
)

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die() {
  printf 'ERREUR : %s\n' "$*" >&2
  exit 1
}
need() { [ -n "${!1:-}" ] || die "$1 manquant (sauvegarde.env.example)."; }
# Requête sans fioritures : valeurs brutes, arrêt à la première erreur.
sql() {
  local url=$1
  shift
  psql "$url" -X -q -A -t -v ON_ERROR_STOP=1 "$@"
}
since() { echo $(($(date +%s) - $1)); }

# Lignes de chaque table d'un export pg_dump : « COPY schéma.table (...) FROM stdin; », lignes, « \. ».
table_counts() {
  awk '/^COPY / { table = $2; rows = 0; inside = 1; next }
       inside && $0 == "\\." { printf "%s\t%d\n", table, rows; inside = 0; next }
       inside { rows++ }' "$1"
}
tsv_to_json() { jq -R -s 'split("\n") | map(select(length > 0) | split("\t") | {(.[0]): (.[1] | tonumber)}) | add // {}'; }

recipients_file() {
  need BACKUP_AGE_RECIPIENTS
  local key
  : >"$1"
  for key in ${BACKUP_AGE_RECIPIENTS//,/ }; do
    [[ $key =~ ^age1[02-9ac-hj-np-z]{58}$ ]] || die "BACKUP_AGE_RECIPIENTS : « ${key:0:12}… » n'est pas une clé publique age."
    printf '%s\n' "$key" >>"$1"
  done
  [ -s "$1" ] || die "BACKUP_AGE_RECIPIENTS est vide."
}

sauvegarder() {
  need BACKUP_DATABASE_URL
  need BACKUP_DESTINATION
  local env=${BACKUP_ENVIRONMENT:-preprod}
  [[ $env =~ ^[a-z0-9-]{1,30}$ ]] || die "BACKUP_ENVIRONMENT : minuscules, chiffres et tirets."
  mkdir -p "$STATE/travail" "$STATE/archives" "$STATE/miroir/objets"
  exec 9>"$STATE/.verrou"
  flock -n 9 || die "une sauvegarde est déjà en cours."

  local t0 step started stamp name work lists
  t0=$(date +%s)
  started=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  name="firescape-$env-$stamp"
  work="$STATE/travail/$name"
  lists="$STATE/travail/$name.listes"
  CLEANUP+=("$work" "$lists")
  mkdir -p "$work/base" "$lists"
  recipients_file "$lists/destinataires"
  log "Sauvegarde $name"

  # 1. Base : les données (un seul instantané) et, pour mémoire, le schéma métier.
  step=$(date +%s)
  pg_dump "$BACKUP_DATABASE_URL" --data-only --no-owner --no-privileges "${DUMP_SCOPE[@]}" \
    --file "$work/base/donnees.sql" 2>"$lists/pg_dump.log" || {
    cat "$lists/pg_dump.log" >&2
    die "export de la base en échec."
  }
  # Seul avertissement attendu : clés étrangères circulaires, sans effet (restauration en mode replica).
  if grep -v -e 'circular foreign-key constraints' -e '^pg_dump: detail:' -e '^pg_dump: hint:' \
    "$lists/pg_dump.log" | grep -q .; then
    cat "$lists/pg_dump.log" >&2
  fi
  pg_dump "$BACKUP_DATABASE_URL" --schema-only --no-owner --no-privileges --schema=app \
    --file "$work/base/schema-app.sql"
  sql "$BACKUP_DATABASE_URL" -F $'\t' \
    -c "select version, coalesce(name, '') from supabase_migrations.schema_migrations order by version" \
    >"$work/base/migrations.tsv"
  local server
  server=$(sql "$BACKUP_DATABASE_URL" -c 'show server_version')
  local base_seconds
  base_seconds=$(since "$step")
  log "Base exportée en ${base_seconds} s : $(du -h "$work/base/donnees.sql" | cut -f1), $(wc -l <"$work/base/migrations.tsv") migrations"

  # 2. Fichiers : la liste vient de la base, le contenu du stockage. La copie locale est incrémentale.
  step=$(date +%s)
  sql "$BACKUP_DATABASE_URL" -F $'\t' -c "
    select bucket_id, name, coalesce((metadata ->> 'size')::bigint, -1),
           coalesce(metadata ->> 'mimetype', 'application/octet-stream')
    from storage.objects order by bucket_id, name" >"$work/base/objets.tsv"
  if awk -F'\t' '$1 !~ /^[a-z0-9][a-z0-9._-]*$/ || $2 !~ /^[A-Za-z0-9._\/=+-]+$/ || $2 ~ /(^|\/)\.\.?(\/|$)/ || $2 ~ /^\//' \
    "$work/base/objets.tsv" | grep -q .; then
    die "nom d'objet inattendu dans storage.objects : sauvegarde arrêtée."
  fi
  local bucket
  for bucket in $(cut -f1 "$work/base/objets.tsv" | sort -u); do
    need RCLONE_CONFIG_SOURCE_TYPE
    rclone sync "source:$bucket" "$STATE/miroir/objets/$bucket" --fast-list --checkers 8 --transfers 4 "${RCLONE_FLAGS[@]}"
  done
  # Présents à la taille annoncée ; les autres ont disparu du stockage entre-temps et sont signalés.
  (cd "$STATE/miroir/objets" && find . -type f -printf '%P\t%s\n') >"$lists/presents.tsv"
  awk -F'\t' -v OFS='\t' -v present="$lists/objets.tsv" -v missing="$work/base/objets-manquants.tsv" '
    NR == FNR { size[$1] = $2; next }
    { key = $1 "/" $2
      if ((key in size) && ($3 < 0 || size[key] == $3)) print "objets/" key, size[key] > present
      else print $1, $2 > missing }
  ' "$lists/presents.tsv" "$work/base/objets.tsv"
  touch "$lists/objets.tsv" "$work/base/objets-manquants.tsv"
  cut -f1 "$lists/objets.tsv" | tr '\n' '\0' >"$lists/objets"
  (cd "$STATE/miroir" && xargs -0 -r sha256sum <"$lists/objets") >"$work/objets.sha256"
  local count bytes missing files_seconds
  count=$(wc -l <"$lists/objets.tsv")
  bytes=$(awk -F'\t' '{ total += $2 } END { printf "%d", total }' "$lists/objets.tsv")
  missing=$(wc -l <"$work/base/objets-manquants.tsv")
  files_seconds=$(since "$step")
  log "Fichiers copiés en ${files_seconds} s : $count objets, $bytes octets, $missing manquant(s)"

  # 3. Configuration du serveur (fichiers .env et secrets) : de quoi reconstruire le serveur.
  local config=false
  if [ -n "${BACKUP_CONFIG_DIR:-}" ]; then
    [ -d "$BACKUP_CONFIG_DIR" ] || die "BACKUP_CONFIG_DIR : $BACKUP_CONFIG_DIR absent."
    mkdir -p "$work/configuration"
    find "$BACKUP_CONFIG_DIR" -maxdepth 1 -type f -name '*.env' -exec cp {} "$work/configuration/" \;
    if [ -d "$BACKUP_CONFIG_DIR/secrets" ]; then cp -R "$BACKUP_CONFIG_DIR/secrets" "$work/configuration/"; fi
    config=true
  fi

  # 4. Manifeste : contenu, lignes par table, empreintes de chaque fichier de l'archive.
  table_counts "$work/base/donnees.sql" | tsv_to_json >"$lists/tables.json"
  (cd "$work" && find . -type f -print0 | sort -z | xargs -0 sha256sum) >"$lists/empreintes"
  jq -n \
    --arg nom "$name" --arg environnement "$env" --arg debut "$started" \
    --arg version "${APP_VERSION:-}" --arg serveur "$server" --arg outil "$(pg_dump --version)" \
    --argjson nombre "$count" --argjson octets "$bytes" --argjson manquants "$missing" \
    --argjson configuration "$config" --slurpfile tables "$lists/tables.json" \
    --rawfile migrations "$work/base/migrations.tsv" --rawfile empreintes "$lists/empreintes" \
    '{
      format: 1, nom: $nom, environnement: $environnement, debut: $debut, version_application: $version,
      serveur: $serveur, outil: $outil,
      migrations: ($migrations | split("\n") | map(select(length > 0) | split("\t")[0])),
      tables: $tables[0],
      objets: {nombre: $nombre, octets: $octets, manquants: $manquants},
      configuration: $configuration,
      empreintes: ($empreintes | split("\n") | map(select(length > 0)
        | capture("^(?<h>[0-9a-f]{64})  \\./(?<f>.+)$") | {(.f): .h}) | add // {})
    }' >"$work/manifeste.json"

  # 5. Archive chiffrée, gardée sur place (BACKUP_KEEP_LOCAL) et déposée hors site.
  step=$(date +%s)
  local archive="$STATE/archives/$name.tar.zst.age"
  # Entrées nommées, jamais « . » : le dossier d'extraction (souvent monté depuis l'hôte) garde ses droits.
  local top=(manifeste.json objets.sha256 base)
  [ "$config" = false ] || top+=(configuration)
  tar --create --format=posix --file - -C "$work" "${top[@]}" -C "$STATE/miroir" --null --files-from "$lists/objets" |
    zstd -q -T0 "-${BACKUP_ZSTD_LEVEL:-6}" |
    age --encrypt -R "$lists/destinataires" >"$archive.partiel"
  mv "$archive.partiel" "$archive"
  local size target
  size=$(stat -c %s "$archive")
  target="$BACKUP_DESTINATION/${stamp:0:4}/${stamp:4:2}/$name.tar.zst.age"
  need RCLONE_CONFIG_DESTINATION_TYPE
  # Clé d'écriture seule : ni lecture ni liste du bucket, donc aucun contrôle de l'existant.
  rclone copyto "$archive" "$target" --no-check-dest --s3-no-check-bucket --s3-no-head "${RCLONE_FLAGS[@]}"
  local upload_seconds
  upload_seconds=$(since "$step")
  log "Archive chiffrée déposée en ${upload_seconds} s : $target ($size octets)"

  # 6. Trace en base (supervision : « sauvegarde absente »), puis ménage des archives locales.
  sql "$BACKUP_DATABASE_URL" -v debut="$started" -v nom="$name" -v octets="$size" -v objets="$count" \
    -v objets_octets="$bytes" -v manquants="$missing" >/dev/null <<'SQL'
select app.backup_record_run(:'debut', :'nom', :octets, :objets, :objets_octets, :manquants);
SQL
  local keep=${BACKUP_KEEP_LOCAL:-2}
  find "$STATE/archives" -maxdepth 1 -name '*.tar.zst.age' -printf '%T@\t%p\n' | sort -rn |
    tail -n +$((keep + 1)) | cut -f2 | xargs -r rm -f --
  [ "$missing" -eq 0 ] || log "ATTENTION : $missing objet(s) listé(s) par la base absent(s) du stockage (base/objets-manquants.tsv)."
  log "Sauvegarde terminée en $(since "$t0") s (base ${base_seconds} s, fichiers ${files_seconds} s, archive et dépôt ${upload_seconds} s)"
}

# Déchiffre et extrait une archive dans un dossier vide, puis contrôle empreintes et lignes.
extraire() {
  local archive=$1 out=$2 identity=${BACKUP_AGE_IDENTITY:-/cles/identite.txt}
  [ -f "$archive" ] || die "archive introuvable : $archive"
  [ -f "$identity" ] || die "clé privée introuvable : $identity (BACKUP_AGE_IDENTITY)."
  mkdir -p "$out"
  [ -z "$(ls -A "$out")" ] || die "$out n'est pas vide."
  # Le dossier cible (souvent monté depuis l'hôte) garde ses droits ; le contenu prend ceux du conteneur.
  age --decrypt -i "$identity" "$archive" | zstd -dc -q |
    tar --extract --file - -C "$out" --no-same-owner --no-same-permissions --no-overwrite-dir
  [ -f "$out/manifeste.json" ] || die "archive sans manifeste."
  jq -e '.format == 1' "$out/manifeste.json" >/dev/null || die "format d'archive inconnu."
  jq -r '.empreintes | to_entries[] | "\(.value)  ./\(.key)"' "$out/manifeste.json" |
    (cd "$out" && sha256sum --check --quiet --strict -) || die "empreinte différente : archive altérée."
  (cd "$out" && sha256sum --check --quiet --strict objets.sha256) || die "fichier altéré dans l'archive."
  [ "$(wc -l <"$out/objets.sha256")" -eq "$(jq '.objets.nombre' "$out/manifeste.json")" ] ||
    die "nombre de fichiers différent du manifeste."
  table_counts "$out/base/donnees.sql" | tsv_to_json >"$out/.lignes.json"
  jq -e --slurpfile lignes "$out/.lignes.json" '.tables == $lignes[0]' "$out/manifeste.json" >/dev/null ||
    die "nombre de lignes différent du manifeste."
  rm -f "$out/.lignes.json"
}

resume() {
  jq -r '"Archive \(.nom) (\(.environnement)), commencée le \(.debut), application \(.version_application | if . == "" then "non renseignée" else . end)",
    "  base : Postgres \(.serveur), \(.migrations | length) migrations (dernière \(.migrations[-1])), \(.tables | length) tables, \(.tables | add) lignes",
    "  fichiers : \(.objets.nombre) objets, \(.objets.octets) octets, \(.objets.manquants) manquant(s)",
    "  configuration du serveur : \(if .configuration then "incluse" else "absente" end)"' "$1/manifeste.json"
}

verifier() {
  local archive=${1:?archive à vérifier} out=""
  shift
  while [ $# -gt 0 ]; do
    case $1 in
      --dossier) out=${2:?dossier} && shift ;;
      *) die "option inconnue : $1" ;;
    esac
    shift
  done
  # Sans --dossier, l'extraction est supprimée après contrôle.
  if [ -z "$out" ]; then
    out=$(mktemp -d "$STATE/verification.XXXXXX")
    CLEANUP+=("$out")
  fi
  extraire "$archive" "$out"
  resume "$out"
  echo "Archive intègre : empreintes, fichiers et lignes conformes au manifeste."
}

restaurer() {
  local archive=${1:?archive à restaurer} out=/restauration files=true schema_check=true
  shift
  while [ $# -gt 0 ]; do
    case $1 in
      --dossier) out=${2:?dossier} && shift ;;
      --sans-fichiers) files=false ;;
      --schema-different) schema_check=false ;;
      *) die "option inconnue : $1" ;;
    esac
    shift
  done
  need RESTORE_DATABASE_URL
  local t0 step tmp
  t0=$(date +%s)
  tmp=$(mktemp -d)
  CLEANUP+=("$tmp")

  step=$(date +%s)
  extraire "$archive" "$out"
  resume "$out"
  local extract_seconds
  extract_seconds=$(since "$step")
  log "Archive déchiffrée et contrôlée en ${extract_seconds} s dans $out"

  # Cible : même schéma (migrations du dépôt déjà appliquées) et vierge (aucun SIS, aucun compte).
  sql "$RESTORE_DATABASE_URL" -c 'select version from supabase_migrations.schema_migrations order by version' \
    >"$tmp/cible.txt"
  jq -r '.migrations[]' "$out/manifeste.json" >"$tmp/archive.txt"
  if ! diff -q "$tmp/archive.txt" "$tmp/cible.txt" >/dev/null; then
    local absentes
    absentes=$(comm -23 "$tmp/archive.txt" "$tmp/cible.txt" | head -3 | tr '\n' ' ')
    [ "$schema_check" = false ] ||
      die "migrations de la cible différentes de l'archive (absentes de la cible : ${absentes:-aucune}). Appliquer celles du dépôt au commit de la sauvegarde, ou --schema-different."
    log "ATTENTION : migrations différentes de l'archive, restauration forcée (--schema-different)."
  fi
  [ "$(sql "$RESTORE_DATABASE_URL" -c 'select (select count(*) from app.tenant) + (select count(*) from auth.users)')" = 0 ] ||
    die "la base cible contient déjà des SIS ou des comptes : la restauration se fait dans un projet vierge."

  # Base : une transaction, déclencheurs suspendus (les contrôles et l'audit ont joué à l'origine). Les
  # tables de référence remplies par les migrations (rôles, permissions…) sont reprises de l'archive.
  step=$(date +%s)
  {
    echo 'set session_replication_role = replica;'
    table_counts "$out/base/donnees.sql" | cut -f1 | grep '^app\.' | paste -sd, - | sed 's/^/truncate table /; s/$/;/'
  } >"$tmp/avant.sql"
  psql "$RESTORE_DATABASE_URL" -X -q -v ON_ERROR_STOP=1 --single-transaction \
    -f "$tmp/avant.sql" -f "$out/base/donnees.sql" >/dev/null
  sql "$RESTORE_DATABASE_URL" -c 'analyze' 2>/dev/null || true
  local base_seconds
  base_seconds=$(since "$step")
  log "Base restaurée en ${base_seconds} s"

  # Fichiers : déposés par bucket et par type de contenu, puis relus et comparés octet par octet.
  local files_seconds=0
  if [ "$files" = true ] && [ -s "$out/objets.sha256" ]; then
    need RCLONE_CONFIG_CIBLE_TYPE
    step=$(date +%s)
    sed -E 's/^[0-9a-f]{64}  objets\///' "$out/objets.sha256" >"$tmp/presents.txt"
    awk -F'\t' -v OFS='\t' 'NR == FNR { present[$0] = 1; next } ($1 "/" $2) in present { print $1, $4, $2 }' \
      "$tmp/presents.txt" "$out/base/objets.tsv" >"$tmp/a-deposer.tsv"
    local bucket mime list n=0
    while IFS=$'\t' read -r bucket mime; do
      [[ $mime =~ ^[a-z]+/[a-z0-9.+-]+$ ]] || die "type de contenu inattendu : $mime"
      n=$((n + 1))
      list="$tmp/liste-$n"
      awk -F'\t' -v b="$bucket" -v m="$mime" '$1 == b && $2 == m { print $3 }' "$tmp/a-deposer.tsv" >"$list"
      rclone copy "$out/objets/$bucket" "cible:$bucket" --files-from-raw "$list" --no-traverse \
        --header-upload "Content-Type: $mime" --s3-no-check-bucket --transfers 8 "${RCLONE_FLAGS[@]}"
    done < <(cut -f1,2 "$tmp/a-deposer.tsv" | sort -u)
    for bucket in $(cut -f1 "$tmp/a-deposer.tsv" | sort -u); do
      awk -F'\t' -v b="$bucket" '$1 == b { print $3 }' "$tmp/a-deposer.tsv" >"$tmp/controle"
      rclone check "$out/objets/$bucket" "cible:$bucket" --one-way --download --files-from-raw "$tmp/controle" \
        --checkers 8 "${RCLONE_FLAGS[@]}" || die "fichiers du bucket $bucket différents après dépôt."
    done
    files_seconds=$(since "$step")
    log "Fichiers déposés et relus en ${files_seconds} s : $(wc -l <"$tmp/a-deposer.tsv") objets"
  fi

  log "Restauration terminée en $(since "$t0") s (archive ${extract_seconds} s, base ${base_seconds} s, fichiers ${files_seconds} s)"
  echo "Suite : contrôle des empreintes (pnpm backup:verify), puis suppression de $out (données en clair)."
}

cle() {
  local file=${1:?fichier de la clé}
  [ ! -e "$file" ] || die "$file existe déjà."
  age-keygen -o "$file" 2>&1 | sed 's/^Public key: /Clé publique : /'
}

aide() {
  sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'
}

case "${1:-aide}" in
  sauvegarder) sauvegarder ;;
  verifier) verifier "${@:2}" ;;
  restaurer) restaurer "${@:2}" ;;
  cle) cle "${@:2}" ;;
  aide | -h | --help) aide ;;
  *)
    aide >&2
    exit 2
    ;;
esac
