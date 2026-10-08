#!/usr/bin/env bash
# Préparation d'un VPS Ubuntu 24.04 neuf pour la préproduction FireScape (EXP-01).
#
#   À lancer une fois, en root, sur le serveur :  bash bootstrap.sh
#   Variables facultatives : ADMIN_USER (etare), SWAP_SIZE (2G).
#
# Relancer ne casse rien. Le script refuse de durcir SSH tant que le compte d'administration n'a pas de
# clé : on ne peut pas s'enfermer dehors. Procédure complète : infra/preprod/README.md.
set -euo pipefail

ADMIN_USER="${ADMIN_USER:-etare}"
SWAP_SIZE="${SWAP_SIZE:-2G}"
APP_DIR=/opt/firescape

log() { printf '\n==> %s\n' "$*"; }
die() {
  printf 'ERREUR : %s\n' "$*" >&2
  exit 1
}

[ "$(id -u)" -eq 0 ] || die "lancer en root (sudo bash bootstrap.sh)."
# shellcheck source=/dev/null
. /etc/os-release
[ "${ID:-}" = ubuntu ] || die "prévu pour Ubuntu 24.04 (système trouvé : ${ID:-inconnu})."

log "Mises à jour du système"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get -y -q -o Dpkg::Options::=--force-confold upgrade
apt-get install -y -q ca-certificates curl gnupg git jq ufw fail2ban unattended-upgrades

log "Fuseau horaire et synchronisation de l'heure (signatures, horloge des tablettes)"
timedatectl set-timezone Europe/Paris
timedatectl set-ntp true

log "Compte d'administration ${ADMIN_USER}"
if ! id "$ADMIN_USER" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "$ADMIN_USER"
fi
usermod -aG sudo "$ADMIN_USER"
# SSH par clé seulement et pas de mot de passe sur le compte : sudo sans mot de passe.
printf '%s ALL=(ALL) NOPASSWD:ALL\n' "$ADMIN_USER" >"/etc/sudoers.d/90-$ADMIN_USER"
chmod 440 "/etc/sudoers.d/90-$ADMIN_USER"
visudo -cf "/etc/sudoers.d/90-$ADMIN_USER" >/dev/null
home=$(getent passwd "$ADMIN_USER" | cut -d: -f6)
install -d -m 700 -o "$ADMIN_USER" -g "$ADMIN_USER" "$home/.ssh"
keys="$home/.ssh/authorized_keys"
touch "$keys"
if [ -s /root/.ssh/authorized_keys ]; then
  # Clé donnée à la création du VPS : reprise pour le compte d'administration.
  cat /root/.ssh/authorized_keys "$keys" | awk 'NF && !seen[$0]++' >"$keys.new"
  mv "$keys.new" "$keys"
fi
chown "$ADMIN_USER:$ADMIN_USER" "$keys"
chmod 600 "$keys"
grep -qE '^(ssh-(ed25519|rsa)|ecdsa-sha2-|sk-)' "$keys" ||
  die "aucune clé SSH pour ${ADMIN_USER} : ajoutez-la dans ${keys}, puis relancez. SSH n'a pas été durci."

log "Dossier de l'application ${APP_DIR}"
install -d -m 750 -o "$ADMIN_USER" -g "$ADMIN_USER" "$APP_DIR"

log "SSH : clé seulement, root refusé"
# Préfixe 10- : lu avant le 50-cloud-init.conf de l'hébergeur (la première valeur l'emporte).
cat >/etc/ssh/sshd_config.d/10-firescape.conf <<EOF
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
AuthenticationMethods publickey
X11Forwarding no
MaxAuthTries 3
LoginGraceTime 30
AllowUsers ${ADMIN_USER}
EOF
sshd -t || die "configuration SSH invalide : rien n'a été rechargé."
systemctl restart ssh

log "Pare-feu : SSH, HTTP et HTTPS seulement"
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

log "fail2ban sur SSH"
cat >/etc/fail2ban/jail.d/sshd.local <<'EOF'
[sshd]
enabled = true
backend = systemd
maxretry = 5
findtime = 10m
bantime = 1h
EOF
systemctl enable fail2ban >/dev/null
systemctl restart fail2ban

log "Mises à jour de sécurité automatiques (redémarrage à 4 h 30 si nécessaire)"
cat >/etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
cat >/etc/apt/apt.conf.d/52firescape-unattended-upgrades <<'EOF'
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "04:30";
EOF

log "Mémoire d'échange ${SWAP_SIZE} (construction des images, pointes de ClamAV)"
if ! swapon --show | grep -q .; then
  fallocate -l "$SWAP_SIZE" /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
fi
echo 'vm.swappiness=10' >/etc/sysctl.d/90-firescape.conf
sysctl -q -p /etc/sysctl.d/90-firescape.conf

log "Docker Engine et Compose (dépôt officiel de Docker)"
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  printf 'deb [arch=%s signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu %s stable\n' \
    "$(dpkg --print-architecture)" "$VERSION_CODENAME" >/etc/apt/sources.list.d/docker.list
  apt-get update -q
  apt-get install -y -q docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
install -d -m 755 /etc/docker
cat >/etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "5" },
  "live-restore": true
}
EOF
systemctl enable docker >/dev/null
systemctl restart docker
# Le groupe docker vaut root : réservé au compte d'administration.
usermod -aG docker "$ADMIN_USER"

ip=$(hostname -I | awk '{print $1}')
log "Terminé"
cat <<EOF
Avant de fermer cette session root, vérifiez dans un AUTRE terminal :
  ssh -i ~/.ssh/firescape_vps ${ADMIN_USER}@${ip}
La connexion root et les mots de passe SSH sont désormais refusés.
Suite : infra/preprod/README.md, étape 3 (déploiement).
EOF
