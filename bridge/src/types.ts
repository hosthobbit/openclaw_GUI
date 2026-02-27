export type AgentState = {
  agent_id: string;
  agent_name: string;
  state: 'idle' | 'working' | 'success' | 'error';
  role?: 'ops' | 'support' | 'social' | 'email' | 'supervisor';
  lastSeen?: number;
};

export type NormalizedEvent = {
  id: string;
  agent_id: string;
  agent_name: string;
  state: AgentState['state'];
  task_summary: string;
  ts: number;
  severity: 'info' | 'warn' | 'error';
};

