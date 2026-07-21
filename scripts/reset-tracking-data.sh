#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/opt/cloudops-crm}"

if [ "${EUID:-$(id -u)}" -ne 0 ]; then
  exec sudo -E bash "$0" "$@"
fi

cd "$APP_DIR"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

POSTGRES_DB="${POSTGRES_DB:-cloudops_crm}"

echo "This will permanently delete tracking/demo data:"
echo "  - sending statistics"
echo "  - IP addresses"
echo "  - server assignments"
echo "  - servers"
echo "  - campaigns"
echo "  - tasks"
echo
echo "It will keep providers, users/team, roles, settings, and cached Email Inbox data."
echo
read -r -p "Type DELETE TRACKING DATA to continue: " confirmation

if [ "$confirmation" != "DELETE TRACKING DATA" ]; then
  echo "Cancelled."
  exit 0
fi

docker compose exec -T db psql -U postgres -d "$POSTGRES_DB" <<'SQL'
BEGIN;
DELETE FROM sending_logs;
DELETE FROM ip_addresses;
DELETE FROM server_users;
DELETE FROM servers;
DELETE FROM campaigns;
DELETE FROM tasks;
COMMIT;
SQL

echo "Tracking/demo data was removed. Providers, settings, team, and Email Inbox cache were kept."
