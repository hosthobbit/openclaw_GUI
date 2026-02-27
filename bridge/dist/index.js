"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const http_1 = __importDefault(require("http"));
const ws_1 = require("ws");
const crypto_1 = __importDefault(require("crypto"));
const openclawClient_1 = require("./openclawClient");
const PORT = Number(process.env.BRIDGE_PORT ?? 4000);
const API_KEY = process.env.BRIDGE_API_KEY ?? '';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean) || [];
const apiLimiterStore = new Map();
const wsLimiterStore = new Map();
const apiKeyLimiterStore = new Map();
const wsKeyLimiterStore = new Map();
const RATE_LIMIT_API_PER_MIN_IP = Number(process.env.RATE_LIMIT_API_PER_MIN_IP ?? 60);
const RATE_LIMIT_API_PER_MIN_KEY = Number(process.env.RATE_LIMIT_API_PER_MIN_KEY ?? 120);
const RATE_LIMIT_WS_PER_MIN_IP = Number(process.env.RATE_LIMIT_WS_PER_MIN_IP ?? 20);
const RATE_LIMIT_WS_PER_MIN_KEY = Number(process.env.RATE_LIMIT_WS_PER_MIN_KEY ?? 40);
function getIp(req) {
    const headers = req.headers;
    const xf = headers?.['x-forwarded-for'];
    const firstForwarded = typeof xf === 'string' ? xf.split(',')[0]?.trim() : Array.isArray(xf) ? xf[0] : undefined;
    const forwarded = firstForwarded && firstForwarded.length > 0 ? firstForwarded : undefined;
    const socketIp = (req.socket && req.socket.remoteAddress) || '';
    return forwarded || socketIp || 'unknown';
}
function timingSafeEqualString(a, b) {
    const ah = crypto_1.default.createHash('sha256').update(a).digest();
    const bh = crypto_1.default.createHash('sha256').update(b).digest();
    return crypto_1.default.timingSafeEqual(ah, bh);
}
function getRequestId(req) {
    const existing = req.header('x-request-id');
    return existing && existing.trim().length > 0 ? existing.trim() : crypto_1.default.randomUUID();
}
function logSecurity(event) {
    console.warn(JSON.stringify({
        ts: Date.now(),
        level: 'warn',
        ...event
    }));
}
function checkRateLimit(store, key, windowMs, max) {
    const now = Date.now();
    const bucket = store.get(key);
    if (!bucket || bucket.resetAt <= now) {
        store.set(key, { count: 1, resetAt: now + windowMs });
        return true;
    }
    if (bucket.count >= max) {
        return false;
    }
    bucket.count += 1;
    return true;
}
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.use((req, res, next) => {
    const requestId = getRequestId(req);
    req.requestId = requestId;
    res.setHeader('x-request-id', requestId);
    return next();
});
app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (!origin) {
        return next();
    }
    if (!ALLOWED_ORIGINS.length || !ALLOWED_ORIGINS.includes(origin)) {
        const requestId = req.requestId;
        logSecurity({
            type: 'cors_block',
            requestId,
            ip: getIp(req),
            path: req.path,
            status: 403,
            message: 'Origin not allowed'
        });
        return res.status(403).json({ error: 'forbidden', message: 'Origin not allowed', requestId });
    }
    return (0, cors_1.default)({ origin, methods: ['GET', 'OPTIONS'] })(req, res, next);
});
function requireApiKey(req, res, next) {
    const requestId = req.requestId;
    const ip = getIp(req);
    // For browser dashboard reads, allow trusted origin without key.
    const origin = req.headers.origin;
    const originAllowed = typeof origin === 'string' && ALLOWED_ORIGINS.includes(origin);
    if (originAllowed) {
        return next();
    }
    if (!API_KEY) {
        logSecurity({
            type: 'auth_misconfigured',
            requestId,
            ip,
            path: req.path,
            status: 500,
            message: 'Bridge API key not configured'
        });
        return res
            .status(500)
            .json({ error: 'server_error', message: 'Bridge API key not configured', requestId });
    }
    const key = req.header('x-api-key') ?? '';
    const ok = timingSafeEqualString(key, API_KEY);
    if (!ok) {
        logSecurity({
            type: 'auth_failure',
            requestId,
            ip,
            path: req.path,
            status: 401,
            message: 'Invalid API key'
        });
        return res
            .status(401)
            .json({ error: 'unauthorized', message: 'Unauthorized', requestId });
    }
    return next();
}
function apiRateLimit(req, res, next) {
    const requestId = req.requestId;
    const ip = getIp(req);
    const ipKey = `${ip}:api`;
    const ipAllowed = checkRateLimit(apiLimiterStore, ipKey, 60000, RATE_LIMIT_API_PER_MIN_IP);
    const apiKeyHeader = req.header('x-api-key') ?? '';
    const hasValidKey = apiKeyHeader && API_KEY && timingSafeEqualString(apiKeyHeader, API_KEY);
    let keyAllowed = true;
    if (hasValidKey) {
        const keyBucket = `${apiKeyHeader}:api`;
        keyAllowed = checkRateLimit(apiKeyLimiterStore, keyBucket, 60000, RATE_LIMIT_API_PER_MIN_KEY);
    }
    if (!ipAllowed || !keyAllowed) {
        logSecurity({
            type: 'rate_limited',
            requestId,
            ip,
            path: req.path,
            status: 429,
            message: 'API rate limit exceeded'
        });
        return res
            .status(429)
            .json({ error: 'rate_limited', message: 'Too many requests', requestId });
    }
    return next();
}
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', ts: Date.now() });
});
app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok', ts: Date.now() });
});
app.get('/readyz', (req, res) => {
    const requestId = req.requestId;
    const status = (0, openclawClient_1.getOpenClawStatus)();
    res.json({
        status: 'ok',
        mode: status.mode,
        upstream: status.upstream,
        wsClients: wss.clients?.size ?? 0,
        lastUpstreamSuccessTs: status.lastSuccessTs ?? null,
        lastUpstreamPollTs: status.lastPollTs ?? null,
        requestId
    });
});
const client = (0, openclawClient_1.createOpenClawClient)();
let cachedAgents = [];
let recentEvents = [];
function inferRole(agentId, agentName) {
    const s = `${agentId} ${agentName}`.toLowerCase();
    if (s.includes('jarvis') || s.includes('supervisor'))
        return 'supervisor';
    if (s.includes('postman') || s.includes('email'))
        return 'email';
    if (s.includes('ops'))
        return 'ops';
    if (s.includes('support'))
        return 'support';
    if (s.includes('social'))
        return 'social';
    return 'ops';
}
app.get('/api/agents', apiRateLimit, requireApiKey, async (_req, res) => {
    try {
        if (!cachedAgents.length) {
            cachedAgents = await client.fetchAgents();
        }
        res.json(cachedAgents);
    }
    catch {
        res.status(500).json({ error: 'Failed to fetch agents' });
    }
});
app.get('/api/events', apiRateLimit, requireApiKey, async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    try {
        if (!recentEvents.length) {
            recentEvents = await client.fetchRecentEvents(limit);
        }
        res.json(recentEvents.slice(0, limit));
    }
    catch {
        res.status(500).json({ error: 'Failed to fetch events' });
    }
});
const server = http_1.default.createServer(app);
const wss = new ws_1.WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });
wss.on('connection', (socket, req) => {
    const headers = req.headers;
    const incomingReqId = headers['x-request-id'];
    const requestId = typeof incomingReqId === 'string' && incomingReqId.trim().length > 0
        ? incomingReqId.trim()
        : crypto_1.default.randomUUID();
    const ip = getIp(req);
    const url = new URL(req.url ?? '', `http://${req.headers.host}`);
    const apiKey = url.searchParams.get('apiKey') ?? '';
    const origin = req.headers.origin ?? '';
    const originAllowed = typeof origin === 'string' && ALLOWED_ORIGINS.includes(origin);
    // Allow either valid apiKey OR approved browser origin (read-only WS stream).
    const allowed = (API_KEY && timingSafeEqualString(apiKey, API_KEY)) || originAllowed;
    const rateKeyIp = `${ip}:ws`;
    const withinIpLimit = checkRateLimit(wsLimiterStore, rateKeyIp, 60000, RATE_LIMIT_WS_PER_MIN_IP);
    let withinKeyLimit = true;
    if (allowed) {
        const rateKeyKey = `${apiKey}:ws`;
        withinKeyLimit = checkRateLimit(wsKeyLimiterStore, rateKeyKey, 60000, RATE_LIMIT_WS_PER_MIN_KEY);
    }
    if (!allowed || !withinIpLimit || !withinKeyLimit) {
        const rateLimited = !withinIpLimit || !withinKeyLimit;
        const status = rateLimited ? 429 : 401;
        logSecurity({
            type: rateLimited ? 'ws_rate_limited' : 'ws_auth_failure',
            requestId,
            ip,
            path: url.pathname,
            status,
            message: rateLimited ? 'WS rate limit exceeded' : 'Invalid WS API key'
        });
        socket.close(1008, 'Unauthorized');
        return;
    }
    logSecurity({
        type: 'ws_connect',
        requestId,
        ip,
        path: url.pathname,
        status: 101,
        message: 'WebSocket connected'
    });
    socket.isAlive = true;
    socket.on('pong', () => {
        socket.isAlive = true;
    });
    socket.on('message', () => {
        // Ignore client-sent payloads to keep the channel server-driven only.
    });
    socket.on('close', () => {
        logSecurity({
            type: 'ws_disconnect',
            requestId,
            ip,
            path: url.pathname,
            status: 1000,
            message: 'WebSocket disconnected'
        });
    });
    socket.send(JSON.stringify({ type: 'agents', payload: cachedAgents }));
    socket.send(JSON.stringify({ type: 'bootstrap', payload: recentEvents.slice(0, 20) }));
});
const heartbeatInterval = setInterval(() => {
    for (const clientSocket of wss.clients) {
        const s = clientSocket;
        if (s.isAlive === false) {
            s.terminate();
            continue;
        }
        s.isAlive = false;
        s.ping();
    }
}, 30000);
const unsubscribe = client.startStreaming((event) => {
    recentEvents.unshift(event);
    recentEvents = recentEvents.slice(0, 500);
    if (!cachedAgents.find((a) => a.agent_id === event.agent_id)) {
        cachedAgents.push({
            agent_id: event.agent_id,
            agent_name: event.agent_name,
            role: inferRole(event.agent_id, event.agent_name),
            state: event.state,
            lastSeen: event.ts
        });
    }
    else {
        cachedAgents = cachedAgents.map((a) => a.agent_id === event.agent_id
            ? {
                ...a,
                role: a.role || inferRole(event.agent_id, event.agent_name),
                state: event.state,
                lastSeen: event.ts
            }
            : a);
    }
    const frame = JSON.stringify({ type: 'event', payload: event });
    for (const client of wss.clients) {
        if (client.readyState === 1) {
            client.send(frame);
        }
    }
});
server.listen(PORT, () => {
    console.log(`Bridge listening on http://localhost:${PORT}`);
});
process.on('SIGINT', () => {
    unsubscribe();
    clearInterval(heartbeatInterval);
    server.close(() => process.exit(0));
});
