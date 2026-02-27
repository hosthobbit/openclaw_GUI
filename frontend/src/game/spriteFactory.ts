import Phaser from 'phaser';
import type { DeskRole } from './officeLayout';

export type WorkerSprites = {
  body: Phaser.GameObjects.Container;
  label: Phaser.GameObjects.Text;
};

const CHARACTER_BY_ROLE: Record<DeskRole, string> = {
  ops: '🧑‍💻',
  support: '🧑‍💬',
  social: '🧑‍🎤',
  supervisor: '🧙‍♂️'
};

const BADGE_BY_ROLE: Record<DeskRole, string> = {
  ops: '🛠️',
  support: '💬',
  social: '📣',
  supervisor: '🧠'
};

export function createWorkerSprite(
  scene: Phaser.Scene,
  x: number,
  y: number,
  role: DeskRole,
  name: string
): WorkerSprites {
  const shadow = scene.add
    .ellipse(0, 8, 36, 10, 0x020617, 0.4)
    .setOrigin(0.5, 0.5);

  const character = scene.add
    .text(0, 0, CHARACTER_BY_ROLE[role], {
      fontSize: role === 'supervisor' ? '46px' : '42px'
    })
    .setOrigin(0.5, 0.82);

  const badge = scene.add
    .text(18, -34, BADGE_BY_ROLE[role], {
      fontSize: '18px'
    })
    .setOrigin(0.5, 0.5);

  const label = scene.add
    .text(x, y + 26, name, {
      fontSize: '12px',
      color: '#ffffff'
    })
    .setOrigin(0.5, 0);

  const container = scene.add.container(x, y, [shadow, character, badge]);

  return {
    body: container,
    label
  };
}
