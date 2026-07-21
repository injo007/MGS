#!/bin/sh
set -e

echo "⏳ Running database migrations..."
npx drizzle-kit push --force 2>&1 || echo "⚠ Migration warning (may be expected)"

echo "🌱 Seeding database (idempotent)..."
npx tsx src/db/seed.ts 2>&1 || echo "⚠ Seed warning (may be expected)"

echo "🚀 Starting CloudOps CRM..."
exec node server.js
