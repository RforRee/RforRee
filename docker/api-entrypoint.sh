#!/bin/sh
set -e
echo "Running Prisma migrations…"
npx prisma migrate deploy
echo "Starting WMS API on :${PORT:-3000}"
exec node dist/index.js
