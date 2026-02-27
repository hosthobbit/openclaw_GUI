import React from 'react';
import type { AgentState, BridgeEvent } from '../lib/bridgeClient';

type AgentTask = { agentId: string; agentName: string; task: string; channel: string; state: string };

type Props = {
  agents: AgentState[];
  currentTasks: BridgeEvent[];
  latestErrors: BridgeEvent[];
  successCount: number;
  agentTasks: AgentTask[];
};

export const RightPanel: React.FC<Props> = ({
  agents,
  currentTasks,
  latestErrors,
  successCount,
  agentTasks
}) => {
  const onlineAgents = agents.length;
  const staleAgents = agents.filter(
    (a) => a.lastSeen && Date.now() - a.lastSeen > 30_000
  ).length;

  return (
    <div className="right-panel">
      <section className="card">
        <h2>Jarvis Supervisor</h2>
        <p className="muted">
          High-level view of current agent tasks, errors and throughput. Read-only visualisation from the
          OpenClaw bridge.
        </p>
        <div className="stats-grid">
          <div className="stat">
            <div className="label">Agents online</div>
            <div className="value">{onlineAgents}</div>
          </div>
          <div className="stat">
            <div className="label">Successes (session)</div>
            <div className="value">{successCount}</div>
          </div>
          <div className="stat">
            <div className="label">Active tasks</div>
            <div className="value">{currentTasks.length}</div>
          </div>
          <div className="stat">
            <div className="label">Recent errors</div>
            <div className="value error">{latestErrors.length}</div>
          </div>
          <div className="stat">
            <div className="label">Stale agents (&gt;30s)</div>
            <div className="value">{staleAgents}</div>
          </div>
        </div>
      </section>

      <section className="card list-card">
        <h3>Agent workboard (live)</h3>
        {agentTasks.length === 0 ? (
          <p className="muted small">No live agent task telemetry yet.</p>
        ) : (
          <ul>
            {agentTasks.map((t) => (
              <li key={t.agentId}>
                <div className="primary">
                  <span className={`pill pill-${t.state}`}>{t.channel}</span>
                  <span className="agent-name">{t.agentName}</span>
                </div>
                <div className="secondary small">{t.task}</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card list-card">
        <h3>Current tasks</h3>
        {currentTasks.length === 0 ? (
          <p className="muted small">No active tasks right now.</p>
        ) : (
          <ul>
            {currentTasks.map((e) => (
              <li key={e.id}>
                <div className="primary">
                  <span className={`pill pill-${e.state}`}>{e.state}</span>
                  <span className="agent-name">{e.agent_name}</span>
                </div>
                <div className="secondary small">{e.task_summary}</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card list-card">
        <h3>Latest errors</h3>
        {latestErrors.length === 0 ? (
          <p className="muted small">No recent errors 🎉</p>
        ) : (
          <ul>
            {latestErrors.map((e) => (
              <li key={e.id}>
                <div className="primary">
                  <span className="pill pill-error">error</span>
                  <span className="agent-name">{e.agent_name}</span>
                </div>
                <div className="secondary small">{e.task_summary}</div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

