import Phaser from 'phaser';
import type { DeskRole } from './officeLayout';

export type WorkerSprites = {
  body: Phaser.GameObjects.Container;
  label: Phaser.GameObjects.Text;
};

export function createWorkerTextures(scene: Phaser.Scene) {
  const roles: DeskRole[] = ['ops', 'support', 'social', 'supervisor'];
  roles.forEach((role) => {
    const key = `worker-${role}`;
    if (scene.textures.exists(key)) return;

    const g = scene.add.graphics();
    const palette: Record<DeskRole, number> = {
      ops: 0x38bdf8,
      support: 0x22c55e,
      social: 0xa855f7,
      supervisor: 0xf97316
    };
    const bodyColor = palette[role];

    // Torso
    g.fillStyle(bodyColor, 1);
    g.fillRoundedRect(-10, -22, 20, 26, 6);

    // Head (squared off to avoid bubbles)
    g.fillStyle(0xf9fafb, 1);
    g.fillRoundedRect(-8, -32, 16, 10, 3);

    // Simple laptop on desk
    g.fillStyle(0x020617, 0.9);
    g.fillRoundedRect(-10, -6, 20, 8, 3);

    g.generateTexture(key, 48, 56);
    g.destroy();
  });
}

export function createWorkerSprite(
  scene: Phaser.Scene,
  x: number,
  y: number,
  role: DeskRole,
  name: string
): WorkerSprites {
  createWorkerTextures(scene);
  const sprite = scene.add.image(0, 0, `worker-${role}`);
  sprite.setOrigin(0.5, 0.7);
  sprite.setScale(1.25);

  const roleIcon: Record<DeskRole, string> = {
    ops: '🛠️',
    support: '💬',
    social: '📣',
    supervisor: '🧠'
  };

  // Little character/icon feel: role emoji badge + tiny face icon.
  const badge = scene.add.text(-18, -42, roleIcon[role], {
    fontSize: '18px'
  }).setOrigin(0.5, 0.5);

  const face = scene.add.text(0, -30, '🙂', {
    fontSize: '14px'
  }).setOrigin(0.5, 0.5);

  const label = scene.add
    .text(x, y + 16, name, {
      fontSize: '11px',
      color: '#ffffff'
    })
    .setOrigin(0.5, 0);

  const container = scene.add.container(x, y, [sprite, badge, face]);

  return {
    body: container,
    label
  };
}

