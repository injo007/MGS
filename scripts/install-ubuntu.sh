#!/usr/bin/env bash
set -Eeuo pipefail

DOMAIN="${DOMAIN:-cloud.alphalink.it.com}"
APP_DIR="${APP_DIR:-/opt/cloudops-crm}"
APP_PORT="${APP_PORT:-127.0.0.1:3000}"
POSTGRES_PORT="${POSTGRES_PORT:-127.0.0.1:5432}"
POSTGRES_DB="${POSTGRES_DB:-cloudops_crm}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@cloudops.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:-}"
REPO_URL="${REPO_URL:-}"
SKIP_CERTBOT="${SKIP_CERTBOT:-0}"
CERTBOT_STAGING="${CERTBOT_STAGING:-0}"
NO_CACHE_BUILD="${NO_CACHE_BUILD:-0}"
ACCESS_ALLOWED_IPS="${ACCESS_ALLOWED_IPS:-${WHITELISTED_IPS:-}}"

if [ "${EUID:-$(id -u)}" -ne 0 ]; then
  exec sudo -E bash "$0" "$@"
fi

log() {
  printf '\n\033[1;34m==>\033[0m %s\n' "$1"
}

warn() {
  printf '\n\033[1;33mWARNING:\033[0m %s\n' "$1"
}

fail() {
  printf '\n\033[1;31mERROR:\033[0m %s\n' "$1" >&2
  exit 1
}

random_hex() {
  openssl rand -hex "${1:-32}"
}

upsert_env() {
  local key="$1"
  local value="$2"
  local file="$3"
  if grep -qE "^${key}=" "$file"; then
    sed -i "s|^${key}=.*|${key}=\"${value}\"|" "$file"
  else
    printf '%s="%s"\n' "$key" "$value" >> "$file"
  fi
}

ensure_env() {
  local key="$1"
  local value="$2"
  local file="$3"
  if ! grep -qE "^${key}=" "$file"; then
    printf '%s="%s"\n' "$key" "$value" >> "$file"
  fi
}

env_value() {
  local key="$1"
  local file="$2"
  grep -E "^${key}=" "$file" | tail -n1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'
}

cert_fullchain_path() {
  printf '/etc/letsencrypt/live/%s/fullchain.pem' "$DOMAIN"
}

cert_privkey_path() {
  printf '/etc/letsencrypt/live/%s/privkey.pem' "$DOMAIN"
}

certificate_is_valid() {
  local cert
  cert="$(cert_fullchain_path)"

  [ -f "$cert" ] || return 1
  openssl x509 -in "$cert" -noout -checkend 86400 >/dev/null 2>&1 || return 1
  openssl x509 -in "$cert" -noout -ext subjectAltName 2>/dev/null | grep -Eq "DNS:${DOMAIN}([,[:space:]]|$)" && return 0
  openssl x509 -in "$cert" -noout -subject 2>/dev/null | grep -Eq "CN[ =]+${DOMAIN}([,/]|$)" && return 0

  return 1
}

install_docker() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    log "Docker and Docker Compose are already installed"
    return
  fi

  log "Installing Docker Engine and Compose plugin"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc

  . /etc/os-release
  printf 'deb [arch=%s signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu %s stable\n' \
    "$(dpkg --print-architecture)" "$VERSION_CODENAME" \
    > /etc/apt/sources.list.d/docker.list

  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
}

check_dns() {
  log "Checking DNS for ${DOMAIN}"
  local server_ip=""
  local domain_ips=""
  server_ip="$(curl -fsS https://api.ipify.org 2>/dev/null || true)"
  domain_ips="$(getent ahostsv4 "$DOMAIN" | awk '{print $1}' | sort -u | tr '\n' ' ' || true)"

  if [ -z "$domain_ips" ]; then
    warn "No IPv4 DNS record was found for ${DOMAIN}. Create an A record before requesting HTTPS."
    return
  fi

  if [ -n "$server_ip" ] && ! printf '%s' "$domain_ips" | grep -qw "$server_ip"; then
    warn "${DOMAIN} resolves to: ${domain_ips}. This server public IP appears to be: ${server_ip}."
  else
    printf 'DNS looks ready: %s -> %s\n' "$DOMAIN" "$domain_ips"
  fi
}

prepare_source() {
  log "Preparing application source in ${APP_DIR}"
  install -d -m 0755 "$APP_DIR"

  if [ -n "$REPO_URL" ]; then
    if [ -d "${APP_DIR}/.git" ]; then
      git -C "$APP_DIR" pull --ff-only
    elif [ -z "$(find "$APP_DIR" -mindepth 1 -maxdepth 1 -print -quit)" ]; then
      git clone "$REPO_URL" "$APP_DIR"
    else
      fail "${APP_DIR} is not empty and is not a git checkout. Empty it or set APP_DIR to another path."
    fi
    return
  fi

  local source_dir
  source_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  [ -f "${source_dir}/package.json" ] || fail "Could not find package.json beside this installer. Run it from the project checkout or set REPO_URL."

  if [ "$source_dir" != "$APP_DIR" ]; then
    rsync -a \
      --exclude '.git' \
      --exclude '.next' \
      --exclude 'node_modules' \
      --exclude '.env' \
      "${source_dir}/" "${APP_DIR}/"
  fi
}

prepare_runtime_files() {
  log "Preparing runtime files"
  [ -f "${APP_DIR}/package.json" ] || fail "Application source is missing from ${APP_DIR}."
  [ -f "${APP_DIR}/Dockerfile" ] || fail "Dockerfile is missing from ${APP_DIR}."
  [ -f "${APP_DIR}/docker-compose.yml" ] || fail "docker-compose.yml is missing from ${APP_DIR}."
  [ -f "${APP_DIR}/scripts/docker-entrypoint.sh" ] || fail "scripts/docker-entrypoint.sh is missing from ${APP_DIR}."

  chmod +x "${APP_DIR}/scripts/docker-entrypoint.sh"
  if [ -f "${APP_DIR}/scripts/install-ubuntu.sh" ]; then
    chmod +x "${APP_DIR}/scripts/install-ubuntu.sh"
  fi
  if [ -f "${APP_DIR}/scripts/reset-tracking-data.sh" ]; then
    chmod +x "${APP_DIR}/scripts/reset-tracking-data.sh"
  fi
}

write_env() {
  log "Writing production environment"
  local env_file="${APP_DIR}/.env"
  local generated_admin_password=""

  touch "$env_file"
  chmod 600 "$env_file"

  generated_admin_password="${ADMIN_PASSWORD:-$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-20)}"

  upsert_env "NEXTAUTH_URL" "https://${DOMAIN}" "$env_file"
  upsert_env "NEXT_PUBLIC_APP_URL" "https://${DOMAIN}" "$env_file"
  upsert_env "APP_PORT" "$APP_PORT" "$env_file"
  upsert_env "POSTGRES_PORT" "$POSTGRES_PORT" "$env_file"
  upsert_env "POSTGRES_DB" "$POSTGRES_DB" "$env_file"
  upsert_env "ADMIN_EMAIL" "$ADMIN_EMAIL" "$env_file"
  ensure_env "ADMIN_PASSWORD" "$generated_admin_password" "$env_file"
  ensure_env "POSTGRES_PASSWORD" "$(random_hex 24)" "$env_file"
  ensure_env "NEXTAUTH_SECRET" "$(random_hex 32)" "$env_file"
  ensure_env "CRON_API_KEY" "$(random_hex 32)" "$env_file"
  ensure_env "EMAIL_WEBHOOK_SECRET" "$(random_hex 32)" "$env_file"
  ensure_env "TELEGRAM_WEBHOOK_SECRET" "$(random_hex 32)" "$env_file"
  ensure_env "PROXY_ONLY" "${PROXY_ONLY:-true}" "$env_file"
  ensure_env "TRUSTED_PROXY_SECRET" "$(random_hex 32)" "$env_file"
  ensure_env "NO_PROXY" "${NO_PROXY:-localhost,127.0.0.1,db,app,cloudops-db,cloudops-app}" "$env_file"
  if [ -n "$ACCESS_ALLOWED_IPS" ]; then
    upsert_env "ACCESS_ALLOWED_IPS" "$ACCESS_ALLOWED_IPS" "$env_file"
  else
    ensure_env "ACCESS_ALLOWED_IPS" "" "$env_file"
  fi
  ensure_env "PROVIDER_CREDENTIALS_SECRET" "$(random_hex 32)" "$env_file"
  ensure_env "SEED_DEMO_TRACKING_DATA" "${SEED_DEMO_TRACKING_DATA:-false}" "$env_file"
  ensure_env "OPENROUTER_API_KEY" "${OPENROUTER_API_KEY:-}" "$env_file"
  ensure_env "OPENROUTER_MODEL" "${OPENROUTER_MODEL:-openai/gpt-4o-mini}" "$env_file"
  ensure_env "MXTOOLBOX_API_KEY" "${MXTOOLBOX_API_KEY:-}" "$env_file"
  ensure_env "TELEGRAM_BOT_TOKEN" "${TELEGRAM_BOT_TOKEN:-}" "$env_file"
  ensure_env "GMAIL_IMAP_HOST" "${GMAIL_IMAP_HOST:-imap.gmail.com}" "$env_file"
  ensure_env "GMAIL_IMAP_PORT" "${GMAIL_IMAP_PORT:-993}" "$env_file"
  ensure_env "GMAIL_ADDRESS" "${GMAIL_ADDRESS:-}" "$env_file"
  ensure_env "GMAIL_APP_PASSWORD" "${GMAIL_APP_PASSWORD:-}" "$env_file"
}

configure_nginx() {
  log "Configuring Nginx reverse proxy"
  local conf="/etc/nginx/sites-available/cloudops-crm.conf"
  local trusted_proxy_secret=""

  if [ -f "${APP_DIR}/.env" ]; then
    trusted_proxy_secret="$(env_value "TRUSTED_PROXY_SECRET" "${APP_DIR}/.env")"
  fi

  if certificate_is_valid; then
    cat > "$conf" <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${DOMAIN};

    ssl_certificate $(cert_fullchain_path);
    ssl_certificate_key $(cert_privkey_path);
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;

    client_max_body_size 50m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-CloudOps-Proxy-Secret "${trusted_proxy_secret}";
        proxy_read_timeout 120s;
    }
}
NGINX
  else
    cat > "$conf" <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    client_max_body_size 50m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-CloudOps-Proxy-Secret "${trusted_proxy_secret}";
        proxy_read_timeout 120s;
    }
}
NGINX
  fi

  ln -sf "$conf" /etc/nginx/sites-enabled/cloudops-crm.conf
  rm -f /etc/nginx/sites-enabled/default
  nginx -t
  systemctl enable nginx >/dev/null
  systemctl reload nginx
}

issue_certificate() {
  if [ "$SKIP_CERTBOT" = "1" ]; then
    warn "Skipping Let's Encrypt because SKIP_CERTBOT=1."
    return
  fi

  if certificate_is_valid; then
    log "Valid HTTPS certificate already exists for ${DOMAIN}"
    certbot renew --quiet || warn "Certificate renewal check failed. Existing certificate was left unchanged."
    configure_nginx
    return
  fi

  log "Requesting HTTPS certificate for ${DOMAIN}"
  local certbot_args=(--nginx -d "$DOMAIN" --agree-tos --redirect --non-interactive)

  if [ -n "$LETSENCRYPT_EMAIL" ]; then
    certbot_args+=(--email "$LETSENCRYPT_EMAIL")
  else
    certbot_args+=(--register-unsafely-without-email)
  fi

  if [ "$CERTBOT_STAGING" = "1" ]; then
    certbot_args+=(--staging)
  fi

  if [ -f "$(cert_fullchain_path)" ]; then
    warn "An existing certificate file was found but it is not valid for ${DOMAIN}; forcing certificate renewal."
    certbot_args+=(--force-renewal)
  fi

  certbot "${certbot_args[@]}"
  certificate_is_valid || fail "Certbot finished, but the certificate is still not valid for ${DOMAIN}."
  configure_nginx
}

start_app() {
  log "Building and starting CloudOps CRM"
  cd "$APP_DIR"
  local trusted_proxy_secret=""
  if [ -f "${APP_DIR}/.env" ]; then
    trusted_proxy_secret="$(env_value "TRUSTED_PROXY_SECRET" "${APP_DIR}/.env")"
  fi

  docker compose --env-file .env pull db cron || true
  if [ "$NO_CACHE_BUILD" = "1" ]; then
    docker compose --env-file .env build --pull --no-cache app
  else
    docker compose --env-file .env build --pull app
  fi
  docker compose --env-file .env up -d --force-recreate

  log "Waiting for the app to answer locally"
  for _ in $(seq 1 60); do
    if curl -fsS -H "X-CloudOps-Proxy-Secret: ${trusted_proxy_secret}" http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
      printf 'Application is responding on localhost.\n'
      return
    fi
    sleep 3
  done

  docker compose logs --tail=80 app
  fail "The app did not become healthy on http://127.0.0.1:3000."
}

main() {
  [ -f /etc/os-release ] || fail "This installer is intended for Ubuntu servers."
  . /etc/os-release
  [ "${ID:-}" = "ubuntu" ] || warn "Detected ${PRETTY_NAME:-unknown OS}; this script is tested for Ubuntu."

  log "Installing host packages"
  apt-get update
  apt-get install -y ca-certificates curl gnupg lsb-release nginx certbot python3-certbot-nginx openssl git rsync

  install_docker
  systemctl enable --now docker >/dev/null

  if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
    log "Opening HTTP/HTTPS in UFW"
    ufw allow 'Nginx Full' >/dev/null
  fi

  check_dns
  prepare_source
  prepare_runtime_files
  write_env
  start_app
  configure_nginx
  issue_certificate

  log "Deployment complete"
  printf 'URL:   https://%s\n' "$DOMAIN"
  printf 'Admin: %s\n' "$ADMIN_EMAIL"
  printf 'Password is stored in: %s/.env as ADMIN_PASSWORD\n' "$APP_DIR"
  if [ -n "$ACCESS_ALLOWED_IPS" ]; then
    printf 'Whitelist: ACCESS_ALLOWED_IPS=%s\n' "$ACCESS_ALLOWED_IPS"
  else
    printf 'Whitelist: not configured. To restrict access, rerun with ACCESS_ALLOWED_IPS="YOUR_PUBLIC_IP" or edit %s/.env.\n' "$APP_DIR"
  fi
  printf 'Note: OUTBOUND_PROXY_URL is optional and only controls app outgoing internet requests. It is not needed for access protection.\n'
  printf '\nImportant: change the seeded admin password after first login.\n'
}

main "$@"
