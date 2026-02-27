import React from 'react';
import type { BridgeEvent } from '../lib/bridgeClient';

type Props = {
  events: BridgeEvent[];
  userStatus: string;
  jarvisStatus: string;
};

export const ConversationPanel: React.FC<Props> = ({ events, userStatus, jarvisStatus }) => {
  const items = events.slice(0, 16);

  return (
    <section className="conversation-panel card">
      <h3>Conversation activity</h3>
      <p className="muted small">Sanitized live stream of user/agent work context.</p>

      <div className="live-status-rows">
        <div className="status-row"><strong>User</strong><span>{userStatus}</span></div>
        <div className="status-row"><strong>Jarvis</strong><span>{jarvisStatus}</span></div>
      </div>

      <div className="conversation-list">
        {items.length === 0 ? (
          <p className="muted small">Waiting for activity...</p>
        ) : (
          <ul>
            {items.map((e) => {
              const speaker = e.agent_name?.toLowerCase().includes('jarvis')
                ? 'Jarvis'
                : e.agent_name;
              return (
                <li key={e.id} className="conversation-item">
                  <div className="conversation-top">
                    <strong>{speaker}</strong>
                    <span>{new Date(e.ts).toLocaleTimeString()}</span>
                  </div>
                  <div className="conversation-text">{e.task_summary}</div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
};
