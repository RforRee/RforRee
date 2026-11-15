# Deployment & Testing Site

How to run the full WMS testing stack (Postgres + API + Vue UI) locally, on a LAN for Android / wireless scanners, or against cloud hosts.

## Architecture

| Layer | Local Docker | Cloud options |
|-------|--------------|---------------|
| Frontend (`web/`) | nginx on `:8080` | Vercel / Netlify / static CDN |
| API (`src/`) | Node on `:3000` | Render / Railway / VM |
| Database | Postgres 16 `:5432` | Supabase / managed Postgres |

Handhelds and barcode guns talk to the **same REST API** the desktop UI uses (`/api/...`). Offline sync endpoints from Phase 4 remain available with an API key.

## One-command local Testing Site (Docker Compose)

Prerequisites: Docker + Docker Compose.

```bash
# From repo root
docker compose up -d --build
```

Services:

| URL | Service |
|-----|---------|
| http://localhost:8080 | Web UI (nginx proxies `/api` → API) |
| http://localhost:3000 | API directly (`/health`, `/api/...`) |
| localhost:5432 | Postgres (`wms` / `wms` / `wms`) |

First boot runs `prisma migrate deploy` inside the API container.

Open the UI → **Station login**. If no clients exist yet, create one via:

```bash
curl -s -X POST http://localhost:3000/api/clients \
  -H 'content-type: application/json' \
  -d '{"code":"ACME","name":"Acme Corp"}'
```

Then refresh the login client dropdown (or create Warehouse / SKU from **Master Data**).

Stop:

```bash
docker compose down
# add -v to wipe the Postgres volume
```

### Postgres-only (API/UI on host)

```bash
docker compose up -d postgres
cp .env.example .env
npm install
npx prisma migrate deploy
npm run dev          # API :3000

cd web && npm install && npm run dev   # UI :5173 (Vite proxies /api → :3000)
```

## LAN testing (Android phone / wireless barcode scanner)

1. Find your machine’s LAN IP (examples):

   ```bash
   hostname -I | awk '{print $1}'   # Linux
   ipconfig getifaddr en0           # macOS
   ```

2. Start the stack (`docker compose up -d --build`).

3. On the phone / scanner browser open:

   ```
   http://<LAN_IP>:8080
   ```

4. Wireless USB/HID barcode scanners act as keyboards — focus a Lot# / barcode field and scan. The Inbound / Outbound screens listen for Enter after a scan.

5. If the phone cannot reach the host, allow inbound TCP **8080** (and **3000** if calling the API directly) on the host firewall.

> Tip: For Compose UI, leave `VITE_API_BASE_URL` empty so the browser calls `http://<LAN_IP>:8080/api/...` and nginx proxies to the API container. No CORS issues.

### Dev server on LAN (without Docker web)

```bash
cd web
npm run dev -- --host
# open http://<LAN_IP>:5173
```

Vite already proxies `/api` to `localhost:3000` on the host.

## Frontend environment files

| File | Purpose |
|------|---------|
| `web/.env.development` | Local Vite; empty `VITE_API_BASE_URL` → proxy |
| `web/.env.production` | Production build; set absolute API URL if UI and API are on different hosts |

Examples for `web/.env.production`:

```bash
# Same-origin behind nginx (Docker / reverse proxy)
VITE_API_BASE_URL=

# Cloud API
VITE_API_BASE_URL=https://your-api.onrender.com

# LAN API without nginx proxy
VITE_API_BASE_URL=http://192.168.1.50:3000
```

Rebuild the web image after changing build-time env:

```bash
docker compose build web --no-cache && docker compose up -d web
```

## Cloud sketch

1. **Database** — create managed Postgres; set `DATABASE_URL`.
2. **API** — deploy the Node app (Render/Railway/Docker). Run `npx prisma migrate deploy` on release. Set `PORT`.
3. **Frontend** — `cd web && npm run build` with `VITE_API_BASE_URL` pointing at the API; deploy `web/dist` to Vercel/Netlify.
4. **CORS** — API already enables `cors()`; restrict origins in production if needed.
5. **API keys** — `POST /api/api-keys` for ERP / handheld sync clients.

## Smoke checklist

- [ ] `GET /health` → `{ "status": "ok" }`
- [ ] UI login lists clients
- [ ] Master Data: create warehouse → zone → bin → SKU
- [ ] Inbound: create ASN → receive to bin
- [ ] Inventory: balances show qty; ledger shows `INBOUND`
- [ ] Outbound: create order → ship (FIFO)
- [ ] Phone on Wi‑Fi opens `http://<LAN_IP>:8080`
