## OpenClaw Agent Theatre

Read-only realtime visualisation of OpenClaw agents as characters in a shared room, with a secure bridge service and Dockerised deployment. See **Installing on an OpenClaw server** for where to put it and how to integrate with your OpenClaw server.

### Structure

- `frontend`: React + Phaser TypeScript SPA
- `bridge`: Node.js + Express + ws TypeScript bridge (read-only, redacts secrets)
- `deploy`: Dockerfiles, Docker Compose, and Nginx reverse proxy

### Local dev

1. Install dependencies (once):

   - `cd frontend && npm install`
   - `cd ../bridge && npm install`

2. Start dev environment from repo root:

   - `make dev`

   This runs:

   - Bridge on `http://localhost:4000` with `OPENCLAW_MODE=mock`
   - Frontend on `http://localhost:5173` talking to the bridge

The frontend uses:

- `VITE_BRIDGE_URL=http://localhost:4000`
- `VITE_BRIDGE_API_KEY=dev-bridge-key`

The bridge uses:

- `BRIDGE_PORT=4000`
- `BRIDGE_API_KEY=dev-bridge-key`
- `OPENCLAW_MODE=mock` (seed/mock events)

### Production via Docker Compose

From `deploy/`:

- Build images: `make build` (from repo root) or `docker compose -f docker-compose.yml build`
- Run stack: `make up` or `docker compose -f docker-compose.yml up -d`
- Stop stack: `make down` or `docker compose -f docker-compose.yml down`

Services:

- `frontend`: Built Vite app served by Nginx
- `bridge`: Node bridge on port 4000 (internal only)
- `nginx`: HTTPS reverse proxy exposed on `80/443`

Place TLS certs in `deploy/certs` as `fullchain.pem` and `privkey.pem`.

### Installing on an OpenClaw server

Use this when you want to run the Agent Theatre on the same machine (or network) as your OpenClaw server so the bridge can talk to OpenClaw in **live** mode.

#### 1. Where to put it

- **Recommended:** Put the project next to or inside your OpenClaw tree so one server hosts both, e.g.:
  - `/opt/openclaw/agent-theatre`, or
  - `<your-openclaw-repo>/agent-theatre` (if you keep OpenClaw in a repo).
- The bridge runs as its own Node process and only needs HTTP access to the OpenClaw API (read-only). It does not replace or modify the OpenClaw server.

#### 2. Install steps

On the OpenClaw server (or a host that can reach it):

```bash
# Clone (or copy) the Agent Theatre repo
git clone https://github.com/hosthobbit/openclaw_GUI.git /opt/openclaw/agent-theatre
cd /opt/openclaw/agent-theatre

# Install and build frontend
cd frontend && npm ci && npm run build && cd ..

# Install bridge (no build needed if you run with ts-node, or build for production)
cd bridge && npm ci && npm run build && cd ..
```

For production you can run the bridge with `node bridge/dist/index.js` (or use the Docker setup below).

#### 3. Integrate with the OpenClaw server

- **Bridge → OpenClaw (live mode)**  
  Point the bridge at your OpenClaw API (read-only, localhost or private network only):

  ```bash
  export OPENCLAW_MODE=live
  export OPENCLAW_BASE_URL=http://127.0.0.1:PORT   # or http://openclaw-host:PORT
  # Optional if OpenClaw requires auth:
  # export OPENCLAW_API_KEY=your-openclaw-api-key
  ```

  Replace `PORT` with the port your OpenClaw server listens on. The bridge will poll this URL for agents and events; it never exposes it to the browser.

- **API key**  
  Set the same key on bridge and frontend so the UI can call the bridge:

  ```bash
  export BRIDGE_API_KEY=your-secret-bridge-key
  ```

  In production, set `VITE_BRIDGE_API_KEY` to the same value when building the frontend (e.g. in CI or in `deploy/`), or use the same key in your runtime config if the frontend reads it from env.

- **CORS**  
  Set allowed browser origins (the URL where the UI is served):

  ```bash
  export ALLOWED_ORIGINS=https://your-domain.com,https://openclaw.your-domain.com
  ```

- **Serving the UI and bridge behind the same server**  
  - Run the bridge (e.g. on `localhost:4000`).
  - Serve the built frontend from `frontend/dist` with your existing web server (Nginx, Caddy, or OpenClaw’s static hosting if it has one).
  - In Nginx, proxy the bridge and the UI, for example:

    ```nginx
    # Agent Theatre UI (static)
    location /agent-theatre/ {
        alias /opt/openclaw/agent-theatre/frontend/dist/;
        try_files $uri $uri/ /agent-theatre/index.html;
    }

    # Agent Theatre bridge API + WebSocket
    location /agent-theatre-api/ {
        proxy_pass http://127.0.0.1:4000/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Request-ID $request_id;
    }
    ```

  - Then build the frontend with the bridge URL that the browser will use, e.g.:

    ```bash
    cd frontend
    VITE_BRIDGE_URL=https://your-domain.com/agent-theatre-api npm run build
    ```

  - Open the UI at `https://your-domain.com/agent-theatre/` (or the path you chose). The bridge is only reached via the proxy path; OpenClaw control endpoints stay on localhost/private network.

- **Using Docker on the OpenClaw server**  
  From `deploy/` you can run the full stack (frontend + bridge + Nginx) and only configure the bridge to use `OPENCLAW_MODE=live` and `OPENCLAW_BASE_URL` pointing at your OpenClaw server (e.g. `http://host.docker.internal:PORT` if OpenClaw runs on the host). See env vars above and in `.env.example`.

#### 4. Quick checklist

| Step | Action |
|------|--------|
| Place | Clone/copy repo to e.g. `/opt/openclaw/agent-theatre` |
| Build | `frontend`: `npm ci && npm run build`; `bridge`: `npm ci && npm run build` |
| Configure | `OPENCLAW_MODE=live`, `OPENCLAW_BASE_URL`, `BRIDGE_API_KEY`, `ALLOWED_ORIGINS` |
| Run bridge | `node bridge/dist/index.js` (or Docker) with the env vars set |
| Serve UI | Point Nginx/your server at `frontend/dist` and proxy `/agent-theatre-api/` to the bridge |
| Build frontend URL | Use `VITE_BRIDGE_URL` = full URL to the proxy path (e.g. `https://your-domain.com/agent-theatre-api`) when building |

### Bridge API

- `GET /health`: basic healthcheck (legacy, kept for compatibility)
- `GET /healthz`: liveness (process up) only, no auth
- `GET /readyz`: readiness details (mode, upstream status, ws client count, last upstream poll/success timestamps)
- `GET /api/agents`: list of agents (requires `x-api-key`)
- `GET /api/events?limit=n`: recent normalised events (requires `x-api-key`)
- `WS /ws`: websocket stream of live events (requires `apiKey` query parameter)

Normalised event schema:

- `agent_id`
- `agent_name`
- `state` (`idle|working|success|error`)
- `task_summary`
- `ts` (epoch ms)
- `severity` (`info|warn|error`)

The bridge never returns raw environment variables or OpenClaw responses; all payloads pass through a redaction step which strips obvious secrets (keys, tokens, passwords, cookies).

### Frontend UI

- **Room scene**: 3+ characters (ops/support/social) plus Jarvis supervisor, animated via Phaser in a small 2D office simulation
- **Right panel**:
  - Current tasks
  - Latest errors
  - Success and agent counts
- **Bottom timeline**: streaming log of recent events
- **Modes**:
  - Ops mode: calm, dashboard-focused visuals
  - Fun mode: idle antics and more playful effects

### Office simulation visual layer

The `frontend` uses a lightweight Phaser office scene with humanoid worker sprites:

- Each agent is rendered as a small worker character instead of a circle, with desk clusters per role and a hallway outside the room.
- Agent visual state machine (in `src/game/agentStateMachine.ts`) maps bridge states to office behaviours:

| Bridge state | Visual state(s)                                          |
| ------------ | --------------------------------------------------------- |
| idle         | `idle_outside` (wandering the hallway)                   |
| working      | `returning` → `working_at_desk`                          |
| success      | `success_react` (short celebration) → `working_at_desk`  |
| error        | `error_react` (panic/shake) → `working_at_desk`          |

- Layout and desk positions live in `src/game/officeLayout.ts`.
- Worker sprites are created via `src/game/spriteFactory.ts` using simple generated textures (no heavy external assets).

To tweak animation speeds and timings:

- Adjust the timers and interpolation factors in:
  - `src/game/agentStateMachine.ts` (durations for `error_react`, `success_react`, and returning/idle transitions).
  - `src/components/AgentRoom.tsx` (bob/wander/jump amplitudes and the `Linear` interpolation factors in `step()` and `drawLinks()`).

### Env vars

Copy `.env.example` and set at minimum:

- `BRIDGE_API_KEY` (used by both bridge and frontend)
- `OPENCLAW_MODE` (`mock` by default; `live` mode can talk to real OpenClaw on localhost via `OPENCLAW_BASE_URL`)
- `ALLOWED_ORIGINS` (comma-separated list of browser origins allowed to call the bridge)
- `OPENCLAW_BASE_URL` (read-only OpenClaw base URL, localhost/private only, used in `OPENCLAW_MODE=live`)
- `OPENCLAW_API_KEY` (optional key for the bridge → OpenClaw call path in live mode)
- `OPENCLAW_POLL_INTERVAL_MS` (poll interval in ms for live mode, default `3000`)
- `OPENCLAW_POLL_MAX_BACKOFF_MS` (max backoff in ms for live polling, default `30000`)
- `OPENCLAW_CB_FAIL_THRESHOLD` (consecutive failures before opening circuit, default `5`)
- `OPENCLAW_CB_COOLDOWN_MS` (cooldown in ms before retry after open, default `30000`)
- `RATE_LIMIT_API_PER_MIN_IP` / `RATE_LIMIT_API_PER_MIN_KEY`
- `RATE_LIMIT_WS_PER_MIN_IP` / `RATE_LIMIT_WS_PER_MIN_KEY`

In production, pass `BRIDGE_API_KEY` and `OPENCLAW_MODE` into `deploy/docker-compose.yml` via your secret manager or `.env` file next to the compose file.

### Security notes

- The bridge is the only component allowed to speak to OpenClaw control endpoints; those must remain on `localhost` or a private network.
- Frontend never calls OpenClaw directly; it only talks to the bridge via:
  - `GET /api/agents`
  - `GET /api/events`
  - `WS /ws`
- All frontend HTTP requests send `x-api-key`, and websocket connections carry `apiKey` as a query parameter.
- Bridge validates `BRIDGE_API_KEY` and rejects unauthorised clients with HTTP 401 or websocket close code `1008`.
- A redaction layer walks nested event payloads and replaces values for keys like `token`, `secret`, `password`, `apiKey`, `authorization`, and `cookie` with `"[redacted]"`.

### Security posture

- **Localhost-only OpenClaw**: Any real OpenClaw control plane must be reachable only from the bridge on `localhost` or a private network; it is never exposed through Nginx.
- **Sanitised, read-only facade**: The bridge exposes a small, normalised, read-only surface (`/api/agents`, `/api/events`, `/ws`) derived from OpenClaw, with aggressive redaction and no mutation/command endpoints.
- **Strict origin + auth**:
  - `ALLOWED_ORIGINS` locks CORS down to explicit frontend origins (empty = deny all browser origins).
  - All REST calls require `x-api-key`, and WebSocket handshakes require `apiKey` in the query string.
  - API keys are compared with a constant-time hash comparison, and failures share a generic error body and similar timing.
- **Rate limiting & logging**:
  - `/api/*` limited per-IP and per-API-key (configurable env limits); `/ws` handshakes limited per-IP and per-key, returning JSON 429 on excess.
  - Structured security logs (JSON) capture auth failures, rate limits, and websocket connect/disconnect events without logging secrets or payloads.

### Liveness vs readiness

- **`/healthz`**: simple liveness check – process is up and serving HTTP. No authentication required and no upstream calls.
- **`/readyz`**: readiness probe – returns:
  - `mode`: `mock` or `live`
  - `upstream`: `ok`, `degraded`, or `fallback` (circuit open and serving from mock)
  - `wsClients`: current WebSocket client count
  - `lastUpstreamSuccessTs` and `lastUpstreamPollTs`: most recent successful and attempted upstream polls.

Use `/healthz` for container liveness and `/readyz` for traffic readiness in orchestrators.

### Circuit breaker behavior

- In **live mode**, the bridge uses a circuit breaker around the OpenClaw upstream:
  - After `OPENCLAW_CB_FAIL_THRESHOLD` consecutive failures, the circuit opens for `OPENCLAW_CB_COOLDOWN_MS` and the bridge immediately serves from the mock adapter without hitting upstream.
  - After cooldown, a probe request is allowed (half-open); on success, the circuit closes and failure count resets.
  - Polling intervals back off with jitter between `OPENCLAW_POLL_INTERVAL_MS` and `OPENCLAW_POLL_MAX_BACKOFF_MS`.
- `/readyz` exposes non-sensitive circuit state via `mode`, `upstream`, and the last poll/success timestamps so you can see when the bridge is in fallback.

### Request-ID tracing

- Every HTTP request is assigned a **request ID**:
  - If the client sends `X-Request-ID`, the bridge uses it; otherwise it generates a UUID.
  - All JSON error responses include `requestId`.
  - All structured logs (auth failures, CORS blocks, rate limits, websocket events) include the same `requestId`.
- Nginx is configured to pass through `$request_id` as `X-Request-ID` so traces are consistent across proxy and bridge.

### Troubleshooting

- **Frontend cannot connect to bridge in dev**
  - Ensure `make dev` is running and bridge logs show `Bridge listening on http://localhost:4000`.
  - Check browser console for CORS or websocket errors.
  - Confirm `VITE_BRIDGE_URL` and `VITE_BRIDGE_API_KEY` match the bridge values.

- **Docker Compose fails**
  - Ensure Docker is running and you are inside `deploy/` for direct `docker compose` commands.
  - Verify `deploy/certs/fullchain.pem` and `deploy/certs/privkey.pem` exist for HTTPS.

- **No events visible**
  - In mock mode, events should appear within a few seconds; check bridge logs.
  - For real OpenClaw integration, plug your local read-only endpoints into `openclawClient.ts` and keep them on localhost/private network only.

