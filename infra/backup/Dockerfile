# Image de sauvegarde et de restauration (EXP-02, ADR-031) : pg_dump et psql de la version du serveur
# (Postgres 17, comme le projet Supabase), age pour le chiffrement, rclone pour les fichiers (Supabase
# Storage en S3) et le dépôt (Scaleway Object Storage), zstd pour la compression.
#   docker build -t firescape-sauvegarde infra/backup
FROM postgres:17-alpine
RUN apk add --no-cache age bash coreutils findutils jq rclone tar zstd \
 && adduser -D -H -u 1000 -h /var/lib/firescape-sauvegarde sauvegarde \
 && mkdir -p /var/lib/firescape-sauvegarde /restauration \
 && chown sauvegarde:sauvegarde /var/lib/firescape-sauvegarde /restauration
COPY --chmod=0755 firescape-sauvegarde.sh /usr/local/bin/firescape-sauvegarde
# Remotes rclone définis par l'environnement seulement (RCLONE_CONFIG_SOURCE_*, _DESTINATION_*, _CIBLE_*).
ENV RCLONE_CONFIG=/dev/null
# Même utilisateur (1000) que celui qui détient la configuration sur le serveur (fichiers en 600).
USER sauvegarde
WORKDIR /var/lib/firescape-sauvegarde
# Copie des fichiers, archives gardées sur place, dossiers de travail.
VOLUME /var/lib/firescape-sauvegarde
ENTRYPOINT ["firescape-sauvegarde"]
CMD ["aide"]
