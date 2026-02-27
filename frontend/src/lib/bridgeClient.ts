export type AgentState = {
  agent_id: string;
  agent_name: string;
  state: 'idle' | 'working' | 'success' | 'error';
  role?: 'ops' | 'support' | 'social' | 'supervisor';
  lastSeen?: number;
};

export type BridgeEvent = {
  id: string;
  agent_id: string;
  agent_name: string;
  state: AgentState['state'];
  task_summary: string;
  ts: number;
  severity: 'info' | 'warn' | 'error';
};

type AgentsListener = (agents: AgentState[]) => void;
type EventsListener = (event: BridgeEvent) => void;
type Status = 'connecting' | 'connected' | 'disconnected';
type StatusListener = (status: Status) => void;

class BridgeClient {
  private ws: WebSocket | null = null;
  private agentsListeners = new Set<AgentsListener>();
  private eventsListeners = new Set<EventsListener>();
  private statusListeners = new Set<StatusListener>();

  private getBaseHttpUrl() {
    const url = import.meta.env.VITE_BRIDGE_URL ?? 'http://localhost:4000';
    return url.replace(/\/+$/, '');
  }

  private getWsUrl() {
    const base = this.getBaseHttpUrl().replace(/^http/, 'ws');
    const apiKey =
      (import.meta.env.VITE_BRIDGE_API_KEY as string | undefined) || 'dev-bridge-key';
    const params = new URLSearchParams();
    if (apiKey) params.set('apiKey', apiKey);
    return `${base}/ws?${params.toString()}`;
  }

  connect() {
    if (this.ws) return;
    this.notifyStatus('connecting');
    const ws = new WebSocket(this.getWsUrl());
    this.ws = ws;

    ws.onopen = () => {
      this.notifyStatus('connected');
    };

    ws.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data.toString());
        if (data.type === 'event') {
          this.eventsListeners.forEach((fn) => fn(data.payload as BridgeEvent));
        } else if (data.type === 'agents') {
          this.agentsListeners.forEach((fn) => fn(data.payload as AgentState[]));
        } else if (data.type === 'bootstrap' && Array.isArray(data.payload)) {
          (data.payload as BridgeEvent[]).forEach((ev) =>
            this.eventsListeners.forEach((fn) => fn(ev))
          );
        }
      } catch {
        // ignore malformed bridge messages
      }
    };

    ws.onclose = () => {
      this.ws = null;
      this.notifyStatus('disconnected');
      setTimeout(() => this.connect(), 2000);
    };

    ws.onerror = () => {
      this.notifyStatus('disconnected');
    };
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private notifyStatus(status: Status) {
    this.statusListeners.forEach((fn) => fn(status));
  }

  async fetchInitialData() {
    const apiKey =
      (import.meta.env.VITE_BRIDGE_API_KEY as string | undefined) || 'dev-bridge-key';
    const resAgents = await fetch(`${this.getBaseHttpUrl()}/api/agents`, {
      headers: apiKey ? { 'x-api-key': apiKey } : {}
    });
    if (resAgents.ok) {
      const agents = (await resAgents.json()) as AgentState[];
      this.agentsListeners.forEach((fn) => fn(agents));
    }

    const resEvents = await fetch(`${this.getBaseHttpUrl()}/api/events?limit=50`, {
      headers: apiKey ? { 'x-api-key': apiKey } : {}
    });
    if (resEvents.ok) {
      const events = (await resEvents.json()) as BridgeEvent[];
      events.forEach((ev) => this.eventsListeners.forEach((fn) => fn(ev)));
    }
  }

  subscribeAgents(listener: AgentsListener) {
    this.agentsListeners.add(listener);
    return () => this.agentsListeners.delete(listener);
  }

  subscribeEvents(listener: EventsListener) {
    this.eventsListeners.add(listener);
    return () => this.eventsListeners.delete(listener);
  }

  subscribeStatus(listener: StatusListener) {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }
}

let singleton: BridgeClient | null = null;

export function createBridgeClient() {
  if (!singleton) {
    singleton = new BridgeClient();
  }
  return singleton;
}

