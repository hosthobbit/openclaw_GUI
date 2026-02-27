import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AgentRoom } from './components/AgentRoom';
import { RightPanel } from './components/RightPanel';
import { ConversationPanel } from './components/ConversationPanel';
import { createBridgeClient, BridgeEvent, AgentState } from './lib/bridgeClient';

type UIMode = 'ops' | 'fun';

export const App: React.FC = () => {
  const [mode, setMode] = useState<UIMode>('ops');
  const [agents, setAgents] = useState<AgentState[]>([]);
  const [events, setEvents] = useState<BridgeEvent[]>([]);
  const [now, setNow] = useState<number>(Date.now());
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>(
    'connecting'
  );
  const [showRecovered, setShowRecovered] = useState(false);
  const [userPulse, setUserPulse] = useState(false);

  const dedupeKeysRef = useRef<string[]>([]);
  const dedupeSetRef = useRef<Set<string>>(new Set());
  const prevStatusRef = useRef<typeof status>('connecting');
  const prevUserEventRef = useRef<string>('');

  const client = useMemo(() => createBridgeClient(), []);

  useEffect(() => {
    client.connect();

    const unsubAgents = client.subscribeAgents((list) => setAgents(list));
    const unsubEvents = client.subscribeEvents((ev) => {
      const key =
        ev.id ||
        `${ev.agent_id}:${ev.state}:${ev.ts}:${ev.task_summary ?? ''}`;
      const set = dedupeSetRef.current;
      const keys = dedupeKeysRef.current;
      if (set.has(key)) {
        return;
      }
      set.add(key);
      keys.push(key);
      if (keys.length > 500) {
        const oldest = keys.shift();
        if (oldest) set.delete(oldest);
      }
      setEvents((prev) => [ev, ...prev].slice(0, 200));
    });
    const unsubStatus = client.subscribeStatus((s) => setStatus(s));

    client.fetchInitialData();

    return () => {
      unsubAgents();
      unsubEvents();
      unsubStatus();
      client.disconnect();
    };
  }, [client]);

  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
    }, 5000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const prev = prevStatusRef.current;
    if (prev === 'disconnected' && status === 'connected') {
      setShowRecovered(true);
      setTimeout(() => setShowRecovered(false), 2500);
    }
    prevStatusRef.current = status;
  }, [status]);

  const currentTasks = useMemo(
    () => events.filter((e) => e.state === 'working').slice(0, 10),
    [events]
  );

  const latestErrors = useMemo(
    () => events.filter((e) => e.state === 'error').slice(0, 10),
    [events]
  );

  const successCount = useMemo(
    () => events.filter((e) => e.state === 'success').length,
    [events]
  );

  const latestEventTs = useMemo(() => (events[0]?.ts ? events[0].ts : undefined), [events]);

  const staleAgentsCount = useMemo(
    () =>
      agents.filter((a) => a.lastSeen && now - a.lastSeen > 30_000).length,
    [agents, now]
  );

  const staleAgentsLongCount = useMemo(
    () =>
      agents.filter((a) => a.lastSeen && now - a.lastSeen > 5 * 60_000).length,
    [agents, now]
  );

  const recentErrorCount = useMemo(
    () => events.filter((e) => e.severity === 'error' && now - e.ts < 60_000).length,
    [events, now]
  );

  const healthState: 'green' | 'amber' | 'red' = useMemo(() => {
    if (status === 'disconnected') return 'red';
    if (recentErrorCount > 0 || staleAgentsLongCount > 0) return 'amber';
    return 'green';
  }, [status, recentErrorCount, staleAgentsLongCount]);

  const liveStatus: 'Live' | 'Quiet' | 'Degraded' = useMemo(() => {
    if (healthState === 'red' || healthState === 'amber') return 'Degraded';
    if (currentTasks.length === 0) return 'Quiet';
    return 'Live';
  }, [healthState, currentTasks.length]);

  const latestIncident = useMemo(() => {
    const bad = events.find((e) => e.severity === 'error' || e.severity === 'warn');
    return bad || null;
  }, [events]);

  const todaysCounters = useMemo(() => {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const start = dayStart.getTime();
    const today = events.filter((e) => e.ts >= start);
    const by = (rx: RegExp) => today.filter((e) => rx.test(e.task_summary)).length;
    return {
      tickets: by(/ticket/i),
      facebook: by(/facebook publish|facebook/i),
      wordpress: by(/wordpress|blog/i),
      email: by(/inbox|email|unread/i),
      errors: today.filter((e) => e.severity === 'error').length
    };
  }, [events]);

  const roleOf = (nameOrId: string): 'ops' | 'support' | 'social' | 'email' | 'supervisor' => {
    const s = nameOrId.toLowerCase();
    if (s.includes('jarvis') || s.includes('supervisor')) return 'supervisor';
    if (s.includes('postman') || s.includes('email')) return 'email';
    if (s.includes('support')) return 'support';
    if (s.includes('social') || s.includes('facebook') || s.includes('blog')) return 'social';
    return 'ops';
  };

  const iconForRole = (r: 'ops' | 'support' | 'social' | 'email' | 'supervisor') =>
    r === 'ops' ? '🛠️' : r === 'support' ? '💬' : r === 'social' ? '📣' : r === 'email' ? '📮' : '🧠';

  const liveHandoffs = useMemo(() => {
    return events.slice(0, 8).map((e) => {
      const workerRole = roleOf(`${e.agent_name} ${e.agent_id}`);
      return {
        id: e.id,
        from: 'supervisor' as const,
        to: workerRole,
        text: e.task_summary,
        state: e.state,
        severity: e.severity
      };
    });
  }, [events]);

  const nowSentence = useMemo(() => {
    const w = currentTasks.slice(0, 3);
    if (!w.length) return 'Jarvis (boss) is at command desk, team is currently idle.';
    return `Jarvis delegating from command desk: ${w.map((x) => `${x.agent_name} → ${x.task_summary.toLowerCase()}`).join(' • ')}`;
  }, [currentTasks]);

  const channelFromTask = (s: string) => {
    const t = s.toLowerCase();
    if (t.includes('facebook') || t.includes('posted')) return 'facebook';
    if (t.includes('whatsapp')) return 'whatsapp';
    if (t.includes('telegram')) return 'telegram';
    if (t.includes('wordpress') || t.includes('blog')) return 'wordpress';
    if (t.includes('email') || t.includes('inbox') || t.includes('gmail')) return 'email';
    if (t.includes('token') || t.includes('service') || t.includes('bridge')) return 'ops';
    return 'system';
  };

  const explicitTask = (agentName: string, fallback: string) => {
    const a = agentName.toLowerCase();
    const t = fallback.toLowerCase();

    if (a.includes('support')) {
      if (t.includes('whatsapp')) return 'Replying to customer in WhatsApp';
      if (t.includes('telegram')) return 'Replying to customer in Telegram';
      return 'Handling customer support queue';
    }

    if (a.includes('facebook')) {
      return 'Posting and scheduling Facebook updates';
    }

    if (a.includes('blog')) {
      return 'Publishing WordPress blog content';
    }

    if (a.includes('social')) {
      if (t.includes('facebook') || t.includes('posted')) return 'Posting update to Facebook page';
      if (t.includes('wordpress') || t.includes('blog')) return 'Publishing WordPress blog content';
      return 'Preparing social content and posting queue';
    }

    if (a.includes('ops')) {
      if (t.includes('token')) return 'Validating/rotating token health';
      if (t.includes('bridge') || t.includes('service')) return 'Monitoring service health and uptime';
      return 'Running infrastructure and workflow checks';
    }

    if (a.includes('postman') || a.includes('email')) {
      if (t.includes('unread')) return 'Checking inbox and flagging unread email';
      return 'Monitoring inbox for new customer emails';
    }

    if (a.includes('jarvis')) {
      return 'Supervising agents and coordinating handoffs';
    }

    return fallback || 'Working on assigned task';
  };

  const agentTasks = useMemo(() => {
    const latest = new Map<string, BridgeEvent>();
    for (const ev of events) {
      if (!latest.has(ev.agent_id)) latest.set(ev.agent_id, ev);
    }
    return agents.map((a) => {
      const ev = latest.get(a.agent_id);
      const rawTask = ev?.task_summary || 'No recent task update';
      return {
        agentId: a.agent_id,
        agentName: a.agent_name,
        task: explicitTask(a.agent_name, rawTask),
        channel: channelFromTask(rawTask),
        state: ev?.state || a.state
      };
    });
  }, [events, agents]);

  const latestJarvis = useMemo(() => events.find((e) => e.agent_name.toLowerCase().includes('jarvis')), [events]);
  const latestUserLike = useMemo(
    () => events.find((e) => /customer|inbox|whatsapp|telegram|reply/i.test(e.task_summary)),
    [events]
  );

  const userStatus = latestUserLike
    ? `Latest context: ${latestUserLike.task_summary}`
    : 'No direct user-message telemetry in this sanitized mode yet.';
  const jarvisStatus = latestJarvis
    ? `Working on: ${latestJarvis.task_summary}`
    : 'Waiting for next instruction.';

  useEffect(() => {
    const id = latestUserLike?.id || '';
    if (id && id !== prevUserEventRef.current) {
      prevUserEventRef.current = id;
      setUserPulse(true);
      const t = setTimeout(() => setUserPulse(false), 1400);
      return () => clearTimeout(t);
    }
  }, [latestUserLike]);

  return (
    <div className={`app app-mode-${mode}`}>
      <header className="app-header">
        <div>
          <h1>OpenClaw Agent Theatre</h1>
          <p className="subtitle">Live agent room visualisation (read-only)</p>
        </div>
        <div className="header-controls">
          <div className={`ws-status ws-${status}`}>
            <span className="dot" />
            <span className="label">
              {status === 'connected'
                ? 'Live'
                : status === 'connecting'
                ? 'Connecting…'
                : 'Reconnecting'}
            </span>
          </div>
          <span>View mode:</span>
          <button
            className={mode === 'ops' ? 'active' : ''}
            onClick={() => setMode('ops')}
            title="Ops mode = calm, readable movement"
          >
            Ops (clear)
          </button>
          <button
            className={mode === 'fun' ? 'active' : ''}
            onClick={() => setMode('fun')}
            title="Fun mode = energetic dramatic animations"
          >
            Fun (animated)
          </button>
        </div>
      </header>

      {latestIncident && (
        <div className={`incident-banner incident-${latestIncident.severity}`}>
          <strong>Incident:</strong> {latestIncident.task_summary}
        </div>
      )}

      <div className={`pipeline-banner pipeline-${healthState}`}>
        <span className="indicator" />
        <span className="text">
          {healthState === 'green' &&
            (staleAgentsCount > 0
              ? `Pipeline healthy (quiet): ${staleAgentsCount} agent(s) idle/no recent updates`
              : 'Pipeline healthy')}
          {healthState === 'amber' &&
            `Degraded: ${recentErrorCount} recent error(s), ${staleAgentsLongCount} agent(s) stale >5m`}
          {healthState === 'red' &&
            'Pipeline unhealthy: disconnected from bridge'}
        </span>
      </div>

      <div className="telemetry-badge">Data source: Live sanitized telemetry • Secret exposure: blocked</div>

      <div className="mode-hint">{mode === 'ops' ? 'Ops mode: stable, low-motion, easy to read.' : 'Fun mode: high-motion office theatre with dramatic reactions.'}</div>

      <div className="now-banner">{nowSentence}</div>


      <main className="layout">
        <section className="layout-main split-main">
          <div>
            <AgentRoom agents={agents} mode={mode} events={events} />
            <section className="outcome-counters card">
              <h3>Outcome counters (today)</h3>
              <div className="outcome-grid">
                <div className="stat"><div className="label">Tickets</div><div className="value">{todaysCounters.tickets}</div></div>
                <div className="stat"><div className="label">Facebook posts</div><div className="value">{todaysCounters.facebook}</div></div>
                <div className="stat"><div className="label">WordPress blogs</div><div className="value">{todaysCounters.wordpress}</div></div>
                <div className="stat"><div className="label">Emails checked</div><div className="value">{todaysCounters.email}</div></div>
                <div className="stat"><div className="label">Errors</div><div className="value error">{todaysCounters.errors}</div></div>
              </div>
            </section>
          </div>
          <ConversationPanel events={events} userStatus={userStatus} jarvisStatus={jarvisStatus} userPulse={userPulse} />
        </section>
        <aside className="layout-side">
          <RightPanel
            agents={agents}
            currentTasks={currentTasks}
            latestErrors={latestErrors}
            successCount={successCount}
            agentTasks={agentTasks}
            latestEventTs={latestEventTs}
            liveStatus={liveStatus}
          />
        </aside>
      </main>

      {showRecovered && (
        <div className="toast toast-recovered">
          Connection recovered
        </div>
      )}
    </div>
  );
};

