import React from 'react';
import type { BridgeEvent } from '../lib/bridgeClient';

type Props = {
  events: BridgeEvent[];
};

export const Timeline: React.FC<Props> = ({ events }) => {
  return (
    <div className="timeline">
      <div className="timeline-header">
        <h3>Event timeline</h3>
        <span className="muted small">Most recent first</span>
      </div>
      <div className="timeline-body">
        {events.length === 0 ? (
          <p className="muted small">Waiting for events...</p>
        ) : (
          <ul>
            {events.map((e) => (
              <li key={e.id} className={`timeline-item timeline-${e.state}`}>
                <span className="time">
                  {new Date(e.ts).toLocaleTimeString(undefined, {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                  })}
                </span>
                <span className="pill pill-small">{e.state}</span>
                <span className="agent-name">{e.agent_name}</span>
                <span className="summary">{e.task_summary}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

