# RforRee

Warehouse Management System (WMS) — Phase 1 foundations: clients, location hierarchy (warehouse → zone → bin), and SKUs.

## Stack

- **Node.js** + **TypeScript**
- **Express** REST API
- **PostgreSQL** via **Prisma** ORM
- **Zod** request validation

## Domain model

| Entity | Parent | Unique constraints |
|--------|--------|--------------------|
| **Client** | — | `code` (global) |
| **Warehouse** | Client | `(clientId, code)` |
| **Zone** | Warehouse | `(warehouseId, code)` |
| **Bin** | Zone | `(zoneId, code)` |
| **SKU** | Client | `(clientId, code)` |

Hierarchy is enforced with foreign keys. Deleting a parent **cascades** to children (Client → warehouses & SKUs; Warehouse → zones; Zone → bins).

## Prerequisites

- Node.js 20+
- Docker (for local Postgres) **or** any PostgreSQL 16 instance

## Run locally

### 1. Start Postgres

```bash
cp .env.example .env
npm run db:up
```

This starts Postgres 16 on `localhost:5432` with user/password/db `wms` / `wms` / `wms`.

### 2. Install & migrate

```bash
npm install
npx prisma migrate deploy
npx prisma generate
```

For iterative schema work during development, use `npm run prisma:migrate` instead of `migrate deploy`.

### 3. Start the API

```bash
npm run dev
```

API listens on `http://localhost:3000` (override with `PORT`).

Health check: `GET /health`

## API overview

Base path: `/api`

| Resource | Endpoints |
|----------|-----------|
| Clients | `GET/POST /clients`, `GET/PATCH/DELETE /clients/:id` |
| Nested | `GET /clients/:id/warehouses`, `GET /clients/:id/skus` |
| Warehouses | `GET/POST /warehouses`, `GET/PATCH/DELETE /warehouses/:id` |
| Nested | `GET /warehouses/:id/zones` · filter `GET /warehouses?clientId=` |
| Zones | `GET/POST /zones`, `GET/PATCH/DELETE /zones/:id` |
| Nested | `GET /zones/:id/bins` · filter `GET /zones?warehouseId=` |
| Bins | `GET/POST /bins`, `GET/PATCH/DELETE /bins/:id` · filter `?zoneId=` |
| SKUs | `GET/POST /skus`, `GET/PATCH/DELETE /skus/:id` · filter `?clientId=` |

Updates use **PATCH** (partial). Deletes return **204**. Duplicate codes return **409**.

### Example

```bash
# Create client
curl -s -X POST http://localhost:3000/api/clients \
  -H 'content-type: application/json' \
  -d '{"code":"ACME","name":"Acme Corp"}'

# Create warehouse (replace CLIENT_ID)
curl -s -X POST http://localhost:3000/api/warehouses \
  -H 'content-type: application/json' \
  -d '{"clientId":"CLIENT_ID","code":"WH1","name":"Main DC","address":"100 Dock Rd"}'
```

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | API with hot reload |
| `npm run build` / `npm start` | Compile & run production build |
| `npm run db:up` / `db:down` | Start/stop Postgres via Docker Compose |
| `npm run prisma:migrate` | Create/apply migrations (dev) |
| `npm run prisma:migrate:deploy` | Apply migrations (CI/prod) |
| `npm run prisma:studio` | Prisma Studio GUI |

## Project layout

```
prisma/schema.prisma     # Data model
prisma/migrations/       # SQL migrations
src/app.ts               # Express app
src/routes/              # CRUD routers
src/schemas/             # Zod validators
src/lib/prisma.ts        # Prisma client
docker-compose.yml       # Local Postgres
```
