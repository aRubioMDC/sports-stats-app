#!/usr/bin/env bash
# One-time host bootstrap for a fresh Ubuntu Server 24.04 install: firewall,
# automatic security updates, brute-force protection, swap, and Docker Engine.
# Run as the non-root admin user with sudo. Idempotent-ish: safe to re-run.
set -euo pipefail

echo "==> Updating apt and installing base packages"
sudo apt update && sudo apt upgrade -y
sudo apt install -y ufw fail2ban unattended-upgrades ca-certificates curl gnupg

echo "==> Configuring UFW (deny all inbound except SSH; no 80/443 needed — Cloudflare Tunnel is outbound-only)"
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw --force enable

echo "==> Enabling fail2ban (sshd jail is on by default)"
sudo systemctl enable --now fail2ban

echo "==> Enabling unattended security upgrades"
sudo dpkg-reconfigure -f noninteractive unattended-upgrades

echo "==> Creating a 2GB swap file (cheap insurance on low-RAM hardware)"
if [ ! -f /swapfile ]; then
    sudo fallocate -l 2G /swapfile
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
fi

echo "==> Installing Docker Engine + Compose plugin from Docker's official apt repo"
if ! command -v docker >/dev/null 2>&1; then
    sudo install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    sudo chmod a+r /etc/apt/keyrings/docker.gpg
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
      sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    sudo apt update
    sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

sudo usermod -aG docker "$USER"
sudo systemctl enable --now docker

echo "==> Done. Log out and back in for the 'docker' group membership to take effect."
echo "    Validate with: docker run hello-world"
