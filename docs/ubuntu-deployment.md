# Ubuntu production deployment

This project includes an automated installer for a fresh Ubuntu server. It installs Docker, Docker Compose, Nginx, Certbot, generates production secrets, starts the app, and issues an HTTPS certificate for `cloud.alphalink.it.com`.

## Before running

Create a DNS `A` record:

```bash
cloud.alphalink.it.com -> YOUR_SERVER_PUBLIC_IP
```

Open ports `80` and `443` on the server firewall/security group.

If the DNS record is managed through Cloudflare, set `cloud.alphalink.it.com` to **DNS only** while running the installer. After Certbot installs the origin certificate successfully, you can enable the Cloudflare proxy again and use SSL/TLS mode **Full (strict)**.

## Install

From the project folder on the Ubuntu server:

```bash
chmod +x scripts/install-ubuntu.sh
LETSENCRYPT_EMAIL="admin@alphalink.it.com" ./scripts/install-ubuntu.sh
```

To deploy from a Git repository instead of a local folder:

```bash
REPO_URL="https://github.com/YOUR_ORG/YOUR_REPO.git" \
LETSENCRYPT_EMAIL="admin@alphalink.it.com" \
./scripts/install-ubuntu.sh
```

Useful overrides:

```bash
DOMAIN="cloud.alphalink.it.com"
APP_DIR="/opt/cloudops-crm"
ADMIN_EMAIL="admin@cloudops.com"
ADMIN_PASSWORD="set-a-strong-password-before-first-run"
SKIP_CERTBOT="0"
CERTBOT_STAGING="0"
```

## After install

Open:

```text
https://cloud.alphalink.it.com
```

The seeded admin login is controlled by `.env` in `/opt/cloudops-crm`:

```bash
sudo grep -E '^(ADMIN_EMAIL|ADMIN_PASSWORD)=' /opt/cloudops-crm/.env
```

Change the admin password after first login.

## Operations

Restart:

```bash
cd /opt/cloudops-crm
sudo docker compose restart
```

Update from Git:

```bash
cd /opt/cloudops-crm
sudo git pull --ff-only
sudo docker compose --env-file .env up -d --build
```

View logs:

```bash
cd /opt/cloudops-crm
sudo docker compose logs -f app
```

Renew HTTPS certificates:

```bash
sudo certbot renew --dry-run
```
