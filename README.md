## OpenClaw Agent Theatre

Read-only realtime visualisation of OpenClaw agents as characters in a shared room, with a secure bridge service and Dockerised deployment.

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

