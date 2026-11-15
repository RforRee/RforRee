# RforRee

Warehouse Management System (WMS) — location master data, multi-dimensional inventory ledger, inbound/outbound flows, offline sync APIs, and a Vue floor console.

## Stack

- **Node.js** + **TypeScript** + **Express** REST API
- **PostgreSQL** via **Prisma** ORM + **Zod** validation
- **Vue 3** + **Vite** + **Tailwind CSS** + **Pinia** (`web/`)
- **Docker Compose** Testing Site (Postgres + API + nginx UI)

## Domain model

### Phase 1 — master data

| Entity | Parent | Unique constraints |
|--------|--------|--------------------|
| **Client** | — | `code` (global) |
| **Warehouse** | Client | `(clientId, code)` |
| **Zone** | Warehouse | `(warehouseId, code)` |
| **Bin** | Zone | `(zoneId, code)` |
| **SKU** | Client | `(clientId, code)` |

Hierarchy FKs cascade on delete (Client → warehouses & SKUs; Warehouse → zones; Zone → bins).

### Phase 2 — inventory

| Entity | Purpose |
|--------|---------|
| **InventoryTransaction** | Append-only ledger (流水帳). Types: `INBOUND`, `OUTBOUND`, `TRANSFER_OUT`, `TRANSFER_IN`, `ADJUSTMENT`. Quantity is signed. |
| **InventoryBalance** | Current on-hand (即時結存) keyed by **SKU + Lot# + ED + MD + Bin**. |

All stock changes go through `InventoryService`: write transaction **first**, then atomically update balance (row lock via `SELECT … FOR UPDATE`). Balance uniqueness uses a coalesced unique index so null ED/MD still collide correctly.

### Phase 3 — orders

| Entity | Notes |
|--------|-------|
| **InboundOrder** + lines | ASN unique per client. `POST …/receive` validates ASN, put-away to bin, writes inbound txns. |
| **OutboundOrder** + lines | Order number unique per client. `POST …/ship` allocates FIFO by **expiry date (ED)** within the warehouse, then deducts. |

### Phase 4 — offline sync foundation

API-first sync for Android / PWA handhelds (Barcode/RFID, non-WiFi):

| Piece | Role |
|-------|------|
| `POST /api/sync/pull` | Download SKU + Bin/Zone master, pending inbound/outbound tasks, and on-hand balances for a warehouse |
| `POST /api/sync/push` | Batch-apply offline **mutation queue** (`RECEIVE` / `SHIP` / `TRANSFER` / `ADJUST`) with idempotency + conflict detection |
| `SyncMutationReceipt` | Server-side receipt keyed by `(clientId, deviceId, clientMutationId)` |

**Client strategy (not shipped in this repo yet):** persist pull payload in SQLite / WatermelonDB / IndexedDB; enqueue local mutations while offline; batch `push` when back online. Conflicts (e.g. `INSUFFICIENT_INVENTORY`) return status `CONFLICT` (HTTP **207** if mixed).

Requires API key scopes `sync:pull` / `sync:push`.

### Phase 5 — external integration layer

| Piece | Role |
|-------|------|
| `ApiKey` | SHA-256 hashed keys; scopes `external:inventory`, `external:orders`, `sync:*`, or `*` |
| `POST /api/v1/external/inventory-query` | ERP-friendly inventory lookup by **codes** (not internal IDs) |
| `POST /api/v1/external/orders` | Create inbound (ASN / EDI_943) or outbound (SHIP_ORDER / EDI_940) via **Adapter** |
| `OrderAdapter` / `InventoryQueryAdapter` | Map external JSON → internal schema; `Edi940943Adapter` stub for future EDI |

Auth: header `X-Api-Key: wms_…` or `Authorization: Bearer wms_…`.

### Phase 6 — Web UI

Vue console in `web/` with sidebar: Dashboard, Master Data, Inbound, Outbound, Inventory (balances + ledger). Station login selects Client / Warehouse; Axios talks to the Phase 1–5 APIs. Barcode fields accept keyboard-wedge scanners.

### Phase 7 — Testing Site

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for Docker one-shot stack, LAN Android testing, and cloud env notes. Compose services: `postgres`, `api` (:3000), `web` (:8080, proxies `/api`).

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

### 3. Start the API + UI

```bash
npm run dev          # API http://localhost:3000
npm run dev:web      # UI  http://localhost:5173 (proxies /api)
```

Or full Testing Site:

```bash
npm run stack:up     # UI http://localhost:8080  API :3000  Postgres :5432
```

Health: `GET /health`.

## API overview

Base path: `/api`

### Master data

| Resource | Endpoints |
|----------|-----------|
| Clients | `GET/POST /clients`, `GET/PATCH/DELETE /clients/:id` |
| Nested | `GET /clients/:id/warehouses`, `GET /clients/:id/skus` |
| Warehouses | `GET/POST /warehouses`, `GET/PATCH/DELETE /warehouses/:id`, `GET /warehouses/:id/zones` |
| Zones | `GET/POST /zones`, `GET/PATCH/DELETE /zones/:id`, `GET /zones/:id/bins` |
| Bins | `GET/POST /bins`, `GET/PATCH/DELETE /bins/:id` |
| SKUs | `GET/POST /skus`, `GET/PATCH/DELETE /skus/:id` |

### Inventory

| Endpoint | Description |
|----------|-------------|
| `GET /inventory/balances` | Filter: `clientId`, `skuId`, `binId`, `lotNumber`, `warehouseId` |
| `GET /inventory/transactions` | Filter: `clientId`, `skuId`, `binId`, `referenceType`, `referenceId`, `limit` |
| `POST /inventory/transfer` | Move qty between bins (same SKU/Lot/ED/MD); writes `TRANSFER_OUT` + `TRANSFER_IN` |

### Inbound / outbound

| Endpoint | Description |
|----------|-------------|
| `GET/POST /inbound-orders` | List / create ASN orders (with lines); filter `?source=API\|IMPORT\|MANUAL` |
| `GET/PATCH/DELETE /inbound-orders/:id` | **Detail** includes progress + handheld activity + ledger; PATCH edits header/lines |
| `GET /inbound-orders/import/template` | Download Excel template |
| `POST /inbound-orders/import` | Multipart Excel import (`file` + `clientId`) → `source=IMPORT` |
| `POST /inbound-orders/:id/receive` | Validate ASN + put-away |
| `GET/POST /outbound-orders` | List / create ship orders (+ source filter) |
| `GET/PATCH /outbound-orders/:id` | Detail with pick/ship progress + handheld activity; editable lines |
| `GET/POST …/outbound-orders/import(/template)` | Excel template + import (`source=IMPORT`) |
| `POST /outbound-orders/:id/ship` | FIFO-by-ED deduct |

External API creates set `source=API` so desktop lists show ERP/EDI orders.

Dates for ED/MD use `YYYY-MM-DD`. Insufficient stock / over-receive return **409**. ASN mismatch returns **400** with `ASN_MISMATCH`.

### Sync & external APIs

| Endpoint | Auth | Description |
|----------|------|-------------|
| `POST /api-keys` | (ops) | Create key — plaintext returned **once** |
| `GET /api-keys?clientId=` | (ops) | List key metadata (no secrets) |
| `DELETE /api-keys/:id` | (ops) | Deactivate key |
| `POST /sync/pull` | `sync:pull` | Handheld master + task download |
| `POST /sync/push` | `sync:push` | Offline mutation queue batch |
| `POST /v1/external/inventory-query` | `external:inventory` | Query on-hand by partner codes |
| `POST /v1/external/orders` | `external:orders` | Create orders via adapter |
| `GET /v1/external/orders` | `external:orders` | List recent orders for key's client |

### Examples

```bash
# Create client + warehouse + zone + bin + SKU, then inbound receive
curl -s -X POST http://localhost:3000/api/inbound-orders \
  -H 'content-type: application/json' \
  -d '{
    "clientId":"CLIENT_ID","warehouseId":"WH_ID","asnNumber":"ASN-1","status":"OPEN",
    "lines":[{"skuId":"SKU_ID","expectedQty":10,"lotNumber":"L1","expiryDate":"2027-01-15"}]
  }'

curl -s -X POST http://localhost:3000/api/inbound-orders/ORDER_ID/receive \
  -H 'content-type: application/json' \
  -d '{"asnNumber":"ASN-1","lines":[{"lineId":"LINE_ID","binId":"BIN_ID","quantity":10}]}'

# Ship remaining lines with FIFO by expiry date
curl -s -X POST http://localhost:3000/api/outbound-orders/OUT_ID/ship \
  -H 'content-type: application/json' -d '{}'

# Issue an API key for handheld / ERP
curl -s -X POST http://localhost:3000/api/api-keys \
  -H 'content-type: application/json' \
  -d '{"clientId":"CLIENT_ID","name":"android-1","scopes":["*"]}'

# Sync pull (Android)
curl -s -X POST http://localhost:3000/api/sync/pull \
  -H "x-api-key: $API_KEY" -H 'content-type: application/json' \
  -d '{"clientId":"CLIENT_ID","warehouseId":"WH_ID"}'

# External ASN create (ERP / EDI-shaped JSON)
curl -s -X POST http://localhost:3000/api/v1/external/orders \
  -H "x-api-key: $API_KEY" -H 'content-type: application/json' \
  -d '{
    "documentType":"ASN","format":"json",
    "order":{"clientCode":"ACME","warehouseCode":"WH1","documentNumber":"ASN-99",
      "lines":[{"skuCode":"SKU-100","quantity":5,"expiryDate":"2027-01-15"}]}
  }'
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
prisma/                       # Schema + migrations
src/                          # Express API
web/                          # Vue 3 floor console
docker-compose.yml            # Postgres + API + Web
Dockerfile                    # API image
DEPLOYMENT.md                 # LAN / cloud testing guide
```
