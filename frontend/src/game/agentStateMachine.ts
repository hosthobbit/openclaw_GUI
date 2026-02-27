export type VisualAgentState =
  | 'idle_outside'
  | 'returning'
  | 'working_at_desk'
  | 'error_react'
  | 'success_react';

export type BridgeState = 'idle' | 'working' | 'success' | 'error';

export interface VisualAgentContext {
  id: string;
  role: 'ops' | 'support' | 'social' | 'email' | 'supervisor';
  state: VisualAgentState;
  targetState: BridgeState;
  deskX: number;
  deskY: number;
  hallwayX: number;
  hallwayY: number;
  lastTransitionAt: number;
}

export function initialVisualState(
  id: string,
  role: VisualAgentContext['role'],
  bridgeState: BridgeState,
  deskX: number,
  deskY: number,
  hallwayX: number,
  hallwayY: number
): VisualAgentContext {
  const now = Date.now();
  const state: VisualAgentState =
    role === 'supervisor'
      ? 'working_at_desk'
      : bridgeState === 'idle'
      ? 'idle_outside'
      : 'working_at_desk';

  return {
    id,
    role,
    state,
    targetState: bridgeState,
    deskX,
    deskY,
    hallwayX,
    hallwayY,
    lastTransitionAt: now
  };
}

export function updateVisualState(
  ctx: VisualAgentContext,
  bridgeState: BridgeState,
  now: number
): VisualAgentContext {
  const next = { ...ctx, targetState: bridgeState };

  const elapsed = now - ctx.lastTransitionAt;

  const transitToDesk = () => {
    next.state = 'returning';
    next.lastTransitionAt = now;
  };

  const transitToOutside = () => {
    next.state = 'idle_outside';
    next.lastTransitionAt = now;
  };

  // Jarvis/supervisor stays in command position and does not wander outside.
  if (ctx.role === 'supervisor') {
    if (bridgeState === 'error') {
      next.state = 'error_react';
      next.lastTransitionAt = now;
      return next;
    }
    if (bridgeState === 'success') {
      next.state = 'success_react';
      next.lastTransitionAt = now;
      return next;
    }
    if ((ctx.state === 'error_react' || ctx.state === 'success_react') && elapsed > 900) {
      next.state = 'working_at_desk';
      next.lastTransitionAt = now;
      return next;
    }
    next.state = 'working_at_desk';
    return next;
  }

  switch (ctx.state) {
    case 'idle_outside': {
      if (bridgeState === 'idle') return next;
      transitToDesk();
      return next;
    }
    case 'returning': {
      if (elapsed > 6000 || bridgeState === 'idle') {
        // if we took too long or target went idle again, go back out
        transitToOutside();
        return next;
      }
      if (elapsed > 1200) {
        // assume we reached desk
        if (bridgeState === 'error') {
          next.state = 'error_react';
        } else if (bridgeState === 'success') {
          next.state = 'success_react';
        } else {
          next.state = 'working_at_desk';
        }
        next.lastTransitionAt = now;
      }
      return next;
    }
    case 'working_at_desk': {
      if (bridgeState === 'idle') {
        transitToOutside();
      } else if (bridgeState === 'error') {
        next.state = 'error_react';
        next.lastTransitionAt = now;
      } else if (bridgeState === 'success') {
        next.state = 'success_react';
        next.lastTransitionAt = now;
      }
      return next;
    }
    case 'error_react': {
      if (elapsed > 900) {
        next.state =
          bridgeState === 'idle' ? 'idle_outside' : 'working_at_desk';
        next.lastTransitionAt = now;
      }
      return next;
    }
    case 'success_react': {
      if (elapsed > 900) {
        next.state =
          bridgeState === 'idle' ? 'idle_outside' : 'working_at_desk';
        next.lastTransitionAt = now;
      }
      return next;
    }
  }
}

