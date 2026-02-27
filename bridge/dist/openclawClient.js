"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOpenClawStatus = getOpenClawStatus;
exports.createOpenClawClient = createOpenClawClient;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
const status = {
    mode: 'mock',
    upstream: 'ok',
    failureCount: 0,
    circuitState: 'closed'
};
function getOpenClawStatus() {
    return { ...status };
}
function setStatus(partial) {
    Object.assign(status, partial);
}
function redactSecrets(obj) {
    if (Array.isArray(obj)) {
        return obj.map(redactSecrets);
    }
    if (obj && typeof obj === 'object') {
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
            if (/token|secret|password|api[-_]?key|authorization|cookie/i.test(key)) {
                result[key] = '[redacted]';
            }
            else {
                result[key] = redactSecrets(value);
            }
        }
        return result;
    }
    return obj;
}
class MockOpenClawClient {
    constructor() {
        this.agents = [
            { agent_id: 'ops-1', agent_name: 'Ops Owl', state: 'idle', role: 'ops' },
            {
                agent_id: 'support-1',
                agent_name: 'Support Squirrel',
                state: 'idle',
                role: 'support'
            },
            {
                agent_id: 'social-1',
                agent_name: 'Social Fox',
                state: 'idle',
                role: 'social'
            },
            {
                agent_id: 'jarvis',
                agent_name: 'Jarvis',
                state: 'idle',
                role: 'supervisor'
            }
        ];
    }
    async fetchAgents() {
        const now = Date.now();
        setStatus({ mode: 'mock', upstream: 'ok', lastSuccessTs: now, lastPollTs: now });
        return this.agents.map((a) => ({ ...a, lastSeen: now }));
    }
    async fetchRecentEvents(limit) {
        const now = Date.now();
        const events = [];
        for (let i = 0; i < Math.min(limit, 20); i++) {
            const agent = this.agents[i % this.agents.length];
            const statePool = ['idle', 'working', 'success'];
            const state = statePool[i % statePool.length];
            events.push({
                id: `seed-${i}`,
                agent_id: agent.agent_id,
                agent_name: agent.agent_name,
                state,
                task_summary: state === 'working'
                    ? 'Processing task batch'
                    : state === 'success'
                        ? 'Completed task batch'
                        : state === 'error'
                            ? 'Mock error while handling request'
                            : 'Idle in the theatre',
                ts: now - i * 30000,
                severity: state === 'error' ? 'error' : state === 'success' ? 'info' : 'info'
            });
        }
        setStatus({ mode: 'mock', upstream: 'ok', lastSuccessTs: now, lastPollTs: now });
        return events;
    }
    startStreaming(onEvent) {
        const interval = setInterval(() => {
            const agent = this.agents[Math.floor(Math.random() * this.agents.length)];
            const dice = Math.random();
            const state = dice < 0.5 ? 'working' : dice < 0.9 ? 'success' : 'idle';
            const rawEvent = {
                id: `mock-${Date.now()}`,
                agent_id: agent.agent_id,
                agent_name: agent.agent_name,
                state,
                task_summary: state === 'working'
                    ? 'Running workflow chunk'
                    : state === 'success'
                        ? 'Task finished'
                        : 'Idle in office hallway',
                ts: Date.now(),
                severity: 'info',
                debugToken: 'SHOULD_NOT_LEAK'
            };
            const safe = redactSecrets(rawEvent);
            onEvent(safe);
        }, 2000);
        return () => clearInterval(interval);
    }
}
class LocalTelemetryClient {
    constructor() {
        this.root = '/root/.openclaw/workspace';
    }
    parseIsoMs(v) {
        if (!v || typeof v !== 'string')
            return null;
        const t = Date.parse(v);
        return Number.isFinite(t) ? t : null;
    }
    hasRecentBridgeFallback(minutes = 5) {
        try {
            const out = (0, child_process_1.execSync)(`journalctl -u agent-theatre-bridge --since "${minutes} minutes ago" --no-pager | grep -c openclaw_unavailable || true`, { encoding: 'utf-8' }).trim();
            return Number(out) > 0;
        }
        catch {
            return false;
        }
    }
    readJsonSafe(rel) {
        try {
            const p = path_1.default.join(this.root, rel);
            if (!fs_1.default.existsSync(p))
                return null;
            return JSON.parse(fs_1.default.readFileSync(p, 'utf-8'));
        }
        catch {
            return null;
        }
    }
    serviceActive(name) {
        try {
            const out = (0, child_process_1.execSync)(`systemctl is-active ${name}`, { encoding: 'utf-8' }).trim();
            return out === 'active';
        }
        catch {
            return false;
        }
    }
    async fetchAgents() {
        const now = Date.now();
        const lastBatch = this.readJsonSafe('fb/last_batch_posts.json');
        const tokenStatus = this.readJsonSafe('fb/last_token_rotation.json');
        const socialState = lastBatch?.ok === true ? 'success' : lastBatch?.ok === false ? 'error' : 'idle';
        const bridgeUp = this.serviceActive('agent-theatre-bridge');
        const fallbackMode = this.hasRecentBridgeFallback(5);
        const opsState = !bridgeUp ? 'error' : fallbackMode ? 'working' : 'success';
        const supportState = tokenStatus?.ok ? 'working' : 'idle';
        setStatus({
            mode: 'live',
            upstream: fallbackMode ? 'fallback' : 'ok',
            lastSuccessTs: now,
            lastPollTs: now
        });
        return [
            { agent_id: 'jarvis', agent_name: 'Jarvis', role: 'supervisor', state: 'working', lastSeen: now },
            { agent_id: 'ops-1', agent_name: 'Ops Owl', role: 'ops', state: opsState, lastSeen: now },
            { agent_id: 'support-1', agent_name: 'Support Squirrel', role: 'support', state: supportState, lastSeen: now },
            { agent_id: 'social-1', agent_name: 'Social Fox', role: 'social', state: socialState, lastSeen: now }
        ];
    }
    async fetchRecentEvents(limit) {
        const now = Date.now();
        const tick = Math.floor(now / 15000); // 15s bucket for visible "live" updates
        const events = [];
        const fallbackMode = this.hasRecentBridgeFallback(5);
        // Jarvis always emits current coordination heartbeat
        events.push({
            id: `jarvis-heartbeat-${tick}`,
            agent_id: 'jarvis',
            agent_name: 'Jarvis',
            state: 'working',
            task_summary: fallbackMode
                ? 'Supervising in fallback telemetry mode (safe, sanitized)'
                : 'Supervising live workflow and coordinating handoffs',
            ts: now,
            severity: 'info'
        });
        // Ops status from bridge/token context
        const tokenStatus = this.readJsonSafe('fb/last_token_rotation.json');
        const tokenTs = this.parseIsoMs(tokenStatus?.timestamp_utc);
        const tokenFresh = tokenTs ? now - tokenTs < 24 * 60 * 60 * 1000 : false;
        events.push({
            id: `ops-status-${tick}`,
            agent_id: 'ops-1',
            agent_name: 'Ops Owl',
            state: fallbackMode ? 'working' : tokenStatus?.ok ? 'success' : 'working',
            task_summary: fallbackMode
                ? 'OpenClaw upstream unavailable; maintaining safe fallback telemetry'
                : tokenFresh
                    ? 'Token health verified and services stable'
                    : 'Running platform health checks',
            ts: now - 1500,
            severity: fallbackMode ? 'warn' : 'info'
        });
        // Support activity (sanitized operational message)
        events.push({
            id: `support-queue-${tick}`,
            agent_id: 'support-1',
            agent_name: 'Support Squirrel',
            state: 'working',
            task_summary: 'Monitoring customer inbox channels (WhatsApp/Telegram) and triage queue',
            ts: now - 2500,
            severity: 'info'
        });
        // Social activity from latest FB post result (only latest post for clarity)
        const lastBatch = this.readJsonSafe('fb/last_batch_posts.json');
        if (lastBatch) {
            const posts = Array.isArray(lastBatch.posts) ? lastBatch.posts : [];
            const p = posts[0];
            if (p) {
                events.push({
                    id: `fb-latest-${p.post_id || tick}`,
                    agent_id: 'social-1',
                    agent_name: 'Social Fox',
                    state: p.status_code === 200 ? 'success' : 'error',
                    task_summary: p.status_code === 200
                        ? `Facebook publish complete: ${p.topic || 'page update'}`
                        : `Facebook publish failed: ${p.topic || 'unknown topic'}`,
                    ts: now - 3500,
                    severity: p.status_code === 200 ? 'info' : 'error'
                });
            }
        }
        else {
            events.push({
                id: `social-prepare-${tick}`,
                agent_id: 'social-1',
                agent_name: 'Social Fox',
                state: 'working',
                task_summary: 'Preparing next social content batch',
                ts: now - 3500,
                severity: 'info'
            });
        }
        return events.slice(0, Math.max(1, Math.min(limit, 200)));
    }
    startStreaming(onEvent) {
        let active = true;
        let seen = new Set();
        const tick = async () => {
            if (!active)
                return;
            const events = await this.fetchRecentEvents(25);
            for (const ev of events) {
                if (!seen.has(ev.id)) {
                    seen.add(ev.id);
                    onEvent(ev);
                }
            }
            if (seen.size > 1000)
                seen = new Set(Array.from(seen).slice(-500));
            if (active)
                setTimeout(tick, 5000);
        };
        void tick();
        return () => {
            active = false;
        };
    }
}
class LiveOpenClawClient {
    constructor() {
        this.failureCount = 0;
        this.circuitState = 'closed';
        this.circuitOpenedAt = null;
        this.baseUrl = (process.env.OPENCLAW_BASE_URL ?? 'http://127.0.0.1:7777').replace(/\/+$/, '');
        this.apiKey = process.env.OPENCLAW_API_KEY;
        this.pollIntervalMs = Number(process.env.OPENCLAW_POLL_INTERVAL_MS ?? 3000);
        this.maxBackoffMs = Number(process.env.OPENCLAW_POLL_MAX_BACKOFF_MS ?? 30000);
        this.cooldownMs = Number(process.env.OPENCLAW_CB_COOLDOWN_MS ?? 30000);
        this.fallback = new LocalTelemetryClient();
        this.currentBackoffMs = this.pollIntervalMs;
        setStatus({ mode: 'live', upstream: 'ok', failureCount: 0, circuitState: 'closed' });
    }
    inOpenCircuit() {
        if (this.circuitState !== 'open')
            return false;
        if (this.circuitOpenedAt == null)
            return false;
        const now = Date.now();
        if (now - this.circuitOpenedAt < this.cooldownMs) {
            return true;
        }
        // cooldown elapsed → move to half-open
        this.circuitState = 'half-open';
        setStatus({ circuitState: 'half-open', upstream: 'degraded' });
        return false;
    }
    async safeFetch(path) {
        const now = Date.now();
        if (this.inOpenCircuit()) {
            setStatus({ mode: 'live', upstream: 'fallback', lastPollTs: now });
            throw new Error('Circuit open - using fallback');
        }
        const url = `${this.baseUrl}${path}`;
        try {
            const headers = {};
            if (this.apiKey) {
                headers['authorization'] = `Bearer ${this.apiKey}`;
            }
            const res = await fetch(url, { headers });
            if (!res.ok) {
                throw new Error(`Upstream responded with status ${res.status}`);
            }
            const json = (await res.json());
            this.failureCount = 0;
            this.circuitState = 'closed';
            this.currentBackoffMs = this.pollIntervalMs;
            setStatus({
                mode: 'live',
                upstream: 'ok',
                failureCount: 0,
                circuitState: 'closed',
                lastSuccessTs: now,
                lastPollTs: now
            });
            return json;
        }
        catch (err) {
            this.failureCount += 1;
            const threshold = Number(process.env.OPENCLAW_CB_FAIL_THRESHOLD ?? 5);
            if (this.failureCount >= threshold && this.circuitState !== 'open') {
                this.circuitState = 'open';
                this.circuitOpenedAt = now;
            }
            const nextBackoff = Math.min(this.currentBackoffMs * 2, this.maxBackoffMs);
            const jitterFactor = 0.8 + Math.random() * 0.4; // 0.8 - 1.2
            this.currentBackoffMs = Math.max(this.pollIntervalMs, Math.floor(nextBackoff * jitterFactor));
            setStatus({
                mode: 'live',
                upstream: this.circuitState === 'open' ? 'fallback' : 'degraded',
                failureCount: this.failureCount,
                circuitState: this.circuitState,
                lastPollTs: now
            });
            console.warn(JSON.stringify({
                ts: now,
                level: 'warn',
                type: 'openclaw_unavailable',
                message: 'Falling back to mock OpenClaw client',
                details: { url }
            }));
            throw err;
        }
    }
    normalizeAgent(raw) {
        const id = String(raw.agent_id ?? raw.id ?? raw.name ?? 'unknown');
        const name = String(raw.agent_name ?? raw.name ?? id);
        const rawState = String(raw.state ?? 'idle').toLowerCase();
        const allowed = ['idle', 'working', 'success', 'error'];
        const state = (allowed.includes(rawState)
            ? rawState
            : 'idle');
        const role = raw.role ?? undefined;
        const lastSeen = typeof raw.lastSeen === 'number' ? raw.lastSeen : Date.now();
        return { agent_id: id, agent_name: name, state, role, lastSeen };
    }
    normalizeEvent(raw) {
        const safe = redactSecrets(raw);
        const id = String(safe.id ?? `${safe.agent_id ?? 'agent'}-${safe.ts ?? Date.now()}`);
        const agentId = String(safe.agent_id ?? safe.agentId ?? 'unknown');
        const agentName = String(safe.agent_name ?? safe.agentName ?? agentId);
        const rawState = String(safe.state ?? 'idle').toLowerCase();
        const allowed = ['idle', 'working', 'success', 'error'];
        const state = (allowed.includes(rawState)
            ? rawState
            : 'idle');
        const taskSummary = typeof safe.task_summary === 'string'
            ? safe.task_summary
            : typeof safe.message === 'string'
                ? safe.message
                : 'OpenClaw event';
        const ts = typeof safe.ts === 'number'
            ? safe.ts
            : typeof safe.timestamp === 'number'
                ? safe.timestamp
                : Date.now();
        const severity = safe.severity === 'warn' || safe.severity === 'error'
            ? safe.severity
            : safe.level === 'error'
                ? 'error'
                : 'info';
        return {
            id,
            agent_id: agentId,
            agent_name: agentName,
            state,
            task_summary: taskSummary,
            ts,
            severity
        };
    }
    async fetchAgents() {
        try {
            const raw = await this.safeFetch('/agents');
            if (!Array.isArray(raw)) {
                throw new Error('Unexpected agents payload');
            }
            return raw.map((a) => this.normalizeAgent(a));
        }
        catch {
            return this.fallback.fetchAgents();
        }
    }
    async fetchRecentEvents(limit) {
        try {
            const raw = await this.safeFetch(`/events?limit=${encodeURIComponent(limit)}`);
            if (!Array.isArray(raw)) {
                throw new Error('Unexpected events payload');
            }
            return raw.map((e) => this.normalizeEvent(e));
        }
        catch {
            return this.fallback.fetchRecentEvents(limit);
        }
    }
    startStreaming(onEvent) {
        let active = true;
        const poll = async () => {
            if (!active)
                return;
            try {
                const events = await this.fetchRecentEvents(50);
                for (const ev of events) {
                    onEvent(ev);
                }
            }
            finally {
                if (active) {
                    const delay = this.circuitState === 'open' ? this.cooldownMs : this.currentBackoffMs;
                    setTimeout(poll, delay);
                }
            }
        };
        void poll();
        return () => {
            active = false;
        };
    }
}
function createOpenClawClient() {
    const mode = process.env.OPENCLAW_MODE ?? 'mock';
    if (mode === 'live') {
        return new LiveOpenClawClient();
    }
    return new MockOpenClawClient();
}
