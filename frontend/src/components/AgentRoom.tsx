import React, { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import type { AgentState, BridgeEvent } from '../lib/bridgeClient';
import { buildOfficeLayout, type DeskRole } from '../game/officeLayout';
import { createWorkerSprite, type WorkerSprites } from '../game/spriteFactory';
import {
  initialVisualState,
  updateVisualState,
  type VisualAgentContext
} from '../game/agentStateMachine';

type Props = {
  agents: AgentState[];
  mode: 'ops' | 'fun';
  events: BridgeEvent[];
};

type AgentMeta = {
  visual: VisualAgentContext;
  sprites: WorkerSprites;
  speech?: Phaser.GameObjects.Container;
  dragging?: boolean;
};

type Link = {
  from: DeskRole;
  to: DeskRole;
};

// FlowPacket visuals disabled for clarity; users preferred explicit task boards over moving squares.

const LINKS: Link[] = [
  { from: 'supervisor', to: 'ops' },
  { from: 'supervisor', to: 'support' },
  { from: 'supervisor', to: 'social' },
  { from: 'ops', to: 'supervisor' },
  { from: 'support', to: 'supervisor' },
  { from: 'social', to: 'supervisor' }
];

class RoomScene extends Phaser.Scene {
  private agents: AgentState[] = [];
  private mode: 'ops' | 'fun' = 'ops';
  private metas: Map<string, AgentMeta> = new Map();
  private layout = buildOfficeLayout(900, 480);
  private linksGraphics!: Phaser.GameObjects.Graphics;
  private bgGraphics!: Phaser.GameObjects.Graphics;
  private modeOverlay!: Phaser.GameObjects.Graphics;
  private linkPhase = 0;
  private events: BridgeEvent[] = [];
  private draggingMeta: AgentMeta | null = null;
  private canvasMouseDownBound?: (e: MouseEvent) => void;
  private canvasMouseMoveBound?: (e: MouseEvent) => void;
  private canvasMouseUpBound?: (e: MouseEvent) => void;

  constructor() {
    super('RoomScene');
  }

  setAgents(agents: AgentState[]) {
    this.agents = agents;
  }

  setMode(mode: 'ops' | 'fun') {
    this.mode = mode;
  }

  setEvents(events: BridgeEvent[]) {
    this.events = events;
  }


  create() {
    const width = this.scale.width;
    const height = this.scale.height;
    this.layout = buildOfficeLayout(width, height);

    this.bgGraphics = this.add.graphics().setDepth(-10);
    this.drawOffice();

    this.modeOverlay = this.add.graphics().setDepth(-10).disableInteractive();
    this.linksGraphics = this.add.graphics().setDepth(-10).disableInteractive();

    this.input.on('pointerdown', this.handlePointerDown, this);
    this.input.on('pointerup', this.handlePointerUp, this);
    this.input.on('pointerupoutside', this.handlePointerUp, this);

    const canvas = this.sys.game.canvas;
    this.canvasMouseDownBound = this.onCanvasMouseDown.bind(this);
    this.canvasMouseMoveBound = this.onCanvasMouseMove.bind(this);
    this.canvasMouseUpBound = this.onCanvasMouseUp.bind(this);
    canvas.addEventListener('mousedown', this.canvasMouseDownBound);
    window.addEventListener('mousemove', this.canvasMouseMoveBound);
    window.addEventListener('mouseup', this.canvasMouseUpBound);

    this.time.addEvent({
      delay: 80,
      loop: true,
      callback: () => this.step()
    });
  }

  shutdown() {
    const canvas = this.sys?.game?.canvas;
    if (canvas && this.canvasMouseDownBound) {
      canvas.removeEventListener('mousedown', this.canvasMouseDownBound);
    }
    if (this.canvasMouseMoveBound) {
      window.removeEventListener('mousemove', this.canvasMouseMoveBound);
    }
    if (this.canvasMouseUpBound) {
      window.removeEventListener('mouseup', this.canvasMouseUpBound);
    }
  }

  private clientToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const canvas = this.sys.game.canvas;
    const rect = canvas.getBoundingClientRect();
    const scaleX = this.scale.width / rect.width;
    const scaleY = this.scale.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  }

  private onCanvasMouseDown(e: MouseEvent) {
    if (this.draggingMeta) return;
    const { x, y } = this.clientToWorld(e.clientX, e.clientY);

    let picked: AgentMeta | null = null;
    let best = Number.POSITIVE_INFINITY;
    for (const meta of this.metas.values()) {
      const dx = meta.sprites.body.x - x;
      const dy = meta.sprites.body.y - y;
      const d = Math.hypot(dx, dy);
      if (d < best) {
        best = d;
        picked = meta;
      }
    }

    if (picked && best <= 80) {
      this.draggingMeta = picked;
      picked.dragging = true;
      picked.sprites.body.setDepth(100);
      e.preventDefault();
    }
  }

  private onCanvasMouseMove(e: MouseEvent) {
    if (!this.draggingMeta) return;
    const { x, y } = this.clientToWorld(e.clientX, e.clientY);
    const meta = this.draggingMeta;
    meta.sprites.body.x = x;
    meta.sprites.body.y = y;
    meta.sprites.label.setPosition(x, y + 26);
    if (meta.speech) {
      meta.speech.x = x;
      meta.speech.y = y - 34;
    }
  }

  private onCanvasMouseUp() {
    if (this.draggingMeta) {
      const meta = this.draggingMeta;
      meta.dragging = false;
      meta.sprites.body.setDepth(10);
      meta.visual.deskX = meta.sprites.body.x;
      meta.visual.deskY = meta.sprites.body.y;
      meta.visual.hallwayX = meta.sprites.body.x;
      meta.visual.hallwayY = meta.sprites.body.y;
      this.draggingMeta = null;
    }
  }

  private handlePointerDown(ptr: Phaser.Input.Pointer) {
    if (this.draggingMeta) return;
    const x = ptr.worldX;
    const y = ptr.worldY;

    let picked: AgentMeta | null = null;
    let best = Number.POSITIVE_INFINITY;
    for (const meta of this.metas.values()) {
      const dx = meta.sprites.body.x - x;
      const dy = meta.sprites.body.y - y;
      const d = Math.hypot(dx, dy);
      if (d < best) {
        best = d;
        picked = meta;
      }
    }

    if (picked && best <= 80) {
      this.draggingMeta = picked;
      picked.dragging = true;
      picked.sprites.body.setDepth(100);
    }
  }

  private handlePointerUp() {
    if (this.draggingMeta) {
      const meta = this.draggingMeta;
      meta.dragging = false;
      meta.sprites.body.setDepth(10);
      meta.visual.deskX = meta.sprites.body.x;
      meta.visual.deskY = meta.sprites.body.y;
      meta.visual.hallwayX = meta.sprites.body.x;
      meta.visual.hallwayY = meta.sprites.body.y;
      this.draggingMeta = null;
    }
  }

  private drawOffice() {
    const { roomRect, hallwayRect, desks, doorX, doorY } = this.layout;
    const g = this.bgGraphics;
    g.clear();

    // Room background
    g.fillStyle(0x0f172a, 0.98);
    g.fillRoundedRect(
      roomRect.x - roomRect.width / 2,
      roomRect.y - roomRect.height / 2,
      roomRect.width,
      roomRect.height,
      16
    );

    // Hallway
    g.fillStyle(0x020617, 1);
    g.fillRect(
      hallwayRect.x - hallwayRect.width / 2,
      hallwayRect.y - hallwayRect.height / 2,
      hallwayRect.width,
      hallwayRect.height
    );

    // Door
    g.fillStyle(0x1f2937, 1);
    g.fillRoundedRect(doorX - 8, doorY - 26, 16, 52, 4);

    // Props: plants and whiteboard (rectangular bases to avoid bubbles)
    g.fillStyle(0x15803d, 1);
    g.fillRoundedRect(
      roomRect.x - roomRect.width / 2 + 18,
      roomRect.y - roomRect.height / 2 + 20,
      14,
      18,
      4
    );
    g.fillRoundedRect(
      roomRect.x + roomRect.width / 2 - 28,
      roomRect.y + roomRect.height / 2 - 28,
      16,
      20,
      4
    );

    g.fillStyle(0x111827, 1);
    g.fillRoundedRect(
      roomRect.x - 80,
      roomRect.y - roomRect.height / 2 + 16,
      160,
      40,
      6
    );

    // Desks per role
    g.lineStyle(1, 0x4b5563, 1);
    desks.forEach((d) => {
      g.fillStyle(0x1f2937, 1);
      g.fillRoundedRect(d.x - 46, d.y - 10, 92, 24, 6);
      g.strokeRoundedRect(d.x - 46, d.y - 10, 92, 24, 6);
    });
  }

  private getDeskFor(role: DeskRole, index: number): { x: number; y: number } {
    const desksForRole = this.layout.desks.filter((d) => d.role === role);
    if (!desksForRole.length) {
      return { x: this.layout.roomRect.x, y: this.layout.roomRect.y };
    }
    return desksForRole[index % desksForRole.length];
  }

  private ensureMeta(agent: AgentState, index: number): AgentMeta {
    let meta = this.metas.get(agent.agent_id);
    const role = (agent.role || 'ops') as DeskRole;

    if (!meta) {
      const desk = this.getDeskFor(role, index);
      const hallwayX = this.layout.hallwayRect.x + this.layout.hallwayRect.width * 0.1;
      const hallwayY = this.layout.hallwayRect.y;

      const visual = initialVisualState(
        agent.agent_id,
        role,
        agent.state,
        desk.x,
        desk.y,
        hallwayX,
        hallwayY
      );

      const sprites = createWorkerSprite(this, desk.x, desk.y, role, agent.agent_name);
      meta = { visual, sprites, dragging: false };
      this.metas.set(agent.agent_id, meta);
      meta.sprites.body.setDepth(10);
    }

    return meta;
  }

  private updateSpeech(meta: AgentMeta, bridgeState: AgentState['state']) {
    if (meta.speech) {
      meta.speech.destroy();
      meta.speech = undefined;
    }
    const text =
      bridgeState === 'working'
        ? 'Working…'
        : bridgeState === 'success'
        ? 'Nice!'
        : bridgeState === 'error'
        ? 'Uh oh!'
        : 'Break';

    const { body } = meta.sprites;
    const g = this.add.graphics();
    const padding = 4;
    const bubbleWidth = 48;
    const bubbleHeight = 18;
    g.fillStyle(0x111827, 0.95);
    g.fillRoundedRect(-bubbleWidth / 2, -bubbleHeight, bubbleWidth, bubbleHeight, 6);

    const txt = this.add
      .text(0, -bubbleHeight + padding, text, {
        fontSize: '9px',
        color: '#e5e7eb'
      })
      .setOrigin(0.5, 0);

    const container = this.add.container(body.x, body.y - 34, [g, txt]);
    meta.speech = container;

    this.tweens.add({
      targets: container,
      alpha: 0,
      duration: 2200,
      ease: 'Quad.easeIn',
      onComplete: () => {
        container.destroy();
        if (meta.speech === container) {
          meta.speech = undefined;
        }
      }
    });
  }

  private step() {
    const now = Date.now();

    if (this.draggingMeta && this.input.activePointer.isDown) {
      const ptr = this.input.activePointer;
      const x = ptr.worldX;
      const y = ptr.worldY;
      const meta = this.draggingMeta;
      meta.sprites.body.x = x;
      meta.sprites.body.y = y;
      meta.sprites.label.setPosition(x, y + 26);
      if (meta.speech) {
        meta.speech.x = x;
        meta.speech.y = y - 34;
      }
    }

    this.modeOverlay.clear();
    if (this.mode === 'ops') {
      this.modeOverlay.fillStyle(0x0b1220, 0.18);
      this.modeOverlay.fillRect(0, 0, this.scale.width, this.scale.height);
    } else {
      this.modeOverlay.fillStyle(0x5b21b6, 0.08);
      this.modeOverlay.fillRect(0, 0, this.scale.width, this.scale.height);
    }

    // Clean up metas for agents that disappeared
    for (const id of Array.from(this.metas.keys())) {
      if (!this.agents.find((a) => a.agent_id === id)) {
        const meta = this.metas.get(id)!;
        meta.sprites.body.destroy();
        meta.sprites.label.destroy();
        meta.speech?.destroy();
        this.metas.delete(id);
      }
    }

    const roleCounter: Record<DeskRole, number> = {
      ops: 0,
      support: 0,
      social: 0,
      supervisor: 0
    };

    this.agents.forEach((agent) => {
      const role = (agent.role || 'ops') as DeskRole;
      const idx = roleCounter[role]++;
      const meta = this.ensureMeta(agent, idx);

      const { body, label } = meta.sprites;
      if (meta.dragging) {
        label.setPosition(body.x, body.y + 26);
        if (meta.speech) {
          meta.speech.x = body.x;
          meta.speech.y = body.y - 34;
        }
        return;
      }

      // Advance state machine
      const bridgeState = agent.state;
      const updatedVisual = updateVisualState(
        meta.visual,
        bridgeState,
        now
      );

      // If target bridge state changed recently, show speech bubble
      if (updatedVisual.targetState !== meta.visual.targetState) {
        this.updateSpeech(meta, bridgeState);
      }

      meta.visual = updatedVisual;

      let targetX = body.x;
      let targetY = body.y;

      if (updatedVisual.state === 'idle_outside') {
        if (this.mode === 'ops') {
          // In ops mode keep agents readable in-room, no dramatic wandering.
          targetX = updatedVisual.deskX;
          targetY = updatedVisual.deskY;
        } else {
          const wanderRadius = this.layout.hallwayRect.height * 0.3;
          const phase = (now / 700 + idx) % (Math.PI * 2);
          targetX = updatedVisual.hallwayX;
          targetY = updatedVisual.hallwayY + Math.sin(phase) * wanderRadius;
        }
      } else if (updatedVisual.state === 'returning') {
        // walk from hallway to desk via door
        const midX = this.layout.doorX;
        const midY = this.layout.doorY;
        const t = Math.min((now - updatedVisual.lastTransitionAt) / 1000, 1);
        const viaDoorX = Phaser.Math.Interpolation.Linear([updatedVisual.hallwayX, midX, updatedVisual.deskX], t);
        const viaDoorY = Phaser.Math.Interpolation.Linear([updatedVisual.hallwayY, midY, updatedVisual.deskY], t);
        targetX = viaDoorX;
        targetY = viaDoorY;
      } else if (updatedVisual.state === 'working_at_desk') {
        const wobble = this.mode === 'fun' ? 3.2 : 0.45;
        const phase = now / (this.mode === 'fun' ? 120 : 260) + idx;
        targetX = updatedVisual.deskX + Math.sin(phase) * wobble;
        targetY = updatedVisual.deskY + Math.cos(phase * 1.3) * wobble;
      } else if (updatedVisual.state === 'error_react') {
        const phase = (now - updatedVisual.lastTransitionAt) / (this.mode === 'fun' ? 55 : 95);
        const shake = this.mode === 'fun' ? 8 : 3;
        targetX = updatedVisual.deskX + Math.sin(phase * 3) * shake;
        targetY = updatedVisual.deskY;
      } else if (updatedVisual.state === 'success_react') {
        const phase = (now - updatedVisual.lastTransitionAt) / (this.mode === 'fun' ? 90 : 140);
        const jump = this.mode === 'fun' ? 11 : 4;
        targetX = updatedVisual.deskX;
        targetY = updatedVisual.deskY - Math.sin(phase * Math.PI) * jump;
      }

      body.x = Phaser.Math.Linear(body.x || updatedVisual.deskX, targetX, 0.22);
      body.y = Phaser.Math.Linear(body.y || updatedVisual.deskY, targetY, 0.22);

      // Label
      const isStale = agent.lastSeen && now - agent.lastSeen > 30_000;
      label.setText(
        isStale ? `${agent.agent_name} (stale)` : agent.agent_name
      );
      label.setPosition(body.x, body.y + 18);
      label.setAlpha(updatedVisual.state === 'idle_outside' ? 0.6 : 1);

      if (meta.speech) {
        meta.speech.x = body.x;
        meta.speech.y = body.y - 34;
      }
    });

    this.drawLinks(now);
  }

  private drawLinks(now: number) {
    this.linksGraphics.clear();
    this.linksGraphics.lineStyle(this.mode === 'fun' ? 2.2 : 1.2, this.mode === 'fun' ? 0xf472b6 : 0x7dd3fc, this.mode === 'fun' ? 0.55 : 0.28);

    const rolePositions: Partial<Record<DeskRole, Phaser.Math.Vector2>> = {};
    for (const meta of this.metas.values()) {
      const role = meta.visual.role;
      if (!rolePositions[role]) {
        rolePositions[role] = new Phaser.Math.Vector2(
          meta.sprites.body.x,
          meta.sprites.body.y
        );
      }
    }

    this.linkPhase += 0.04;
    LINKS.forEach(({ from, to }) => {
      const a = rolePositions[from];
      const b = rolePositions[to];
      if (!a || !b) return;

      this.linksGraphics.beginPath();
      this.linksGraphics.moveTo(a.x, a.y);
      this.linksGraphics.lineTo(b.x, b.y);
      this.linksGraphics.strokePath();

      // Animated flow markers (small capsules rather than circles)
      const steps = 6;
      for (let i = 0; i <= steps; i++) {
        const t = (i / steps + this.linkPhase) % 1;
        const x = Phaser.Math.Linear(a.x, b.x, t);
        const y = Phaser.Math.Linear(a.y, b.y, t);
        this.linksGraphics.fillStyle(0x38bdf8, 0.9);
        this.linksGraphics.fillRoundedRect(x - 3, y - 1.5, 6, 3, 1.5);
      }
    });

  }
}

export const AgentRoom: React.FC<Props> = ({ agents, mode, events }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const sceneRef = useRef<RoomScene | null>(null);

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return;

    const scene = new RoomScene();
    sceneRef.current = scene;

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      width: 900,
      height: 480,
      transparent: true,
      parent: containerRef.current,
      scene
    });

    gameRef.current = game;

    return () => {
      game.destroy(true);
      gameRef.current = null;
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (sceneRef.current) sceneRef.current.setAgents(agents);
  }, [agents]);

  useEffect(() => {
    if (sceneRef.current) sceneRef.current.setMode(mode);
  }, [mode]);

  useEffect(() => {
    if (sceneRef.current) sceneRef.current.setEvents(events);
  }, [events]);

  return <div className="agent-room" ref={containerRef} />;
};

