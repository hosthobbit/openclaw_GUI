export type DeskRole = 'ops' | 'support' | 'social' | 'email' | 'supervisor';

export type Desk = {
  role: DeskRole;
  x: number;
  y: number;
};

export type OfficeLayout = {
  roomRect: { x: number; y: number; width: number; height: number };
  hallwayRect: { x: number; y: number; width: number; height: number };
  doorX: number;
  doorY: number;
  desks: Desk[];
};

export function buildOfficeLayout(width: number, height: number): OfficeLayout {
  const padding = 30;
  const roomWidth = width - padding * 2;
  const roomHeight = height - padding * 2;

  const roomRect = {
    x: padding + roomWidth / 2,
    y: padding + roomHeight / 2,
    width: roomWidth,
    height: roomHeight
  };

  const hallwayWidth = 70;
  const hallwayRect = {
    x: padding / 2,
    y: roomRect.y,
    width: hallwayWidth,
    height: roomRect.height
  };

  const doorX = hallwayRect.x + hallwayRect.width;
  const doorY = roomRect.y + roomRect.height * 0.1;

  const desks: Desk[] = [
    // Ops cluster (left)
    { role: 'ops', x: roomRect.x - roomRect.width * 0.25, y: roomRect.y - roomRect.height * 0.15 },
    { role: 'ops', x: roomRect.x - roomRect.width * 0.25, y: roomRect.y + roomRect.height * 0.02 },

    // Support cluster (upper middle)
    {
      role: 'support',
      x: roomRect.x,
      y: roomRect.y - roomRect.height * 0.18
    },
    {
      role: 'support',
      x: roomRect.x + roomRect.width * 0.12,
      y: roomRect.y - roomRect.height * 0.18
    },

    // Social cluster (right)
    {
      role: 'social',
      x: roomRect.x + roomRect.width * 0.26,
      y: roomRect.y - roomRect.height * 0.05
    },
    {
      role: 'social',
      x: roomRect.x + roomRect.width * 0.26,
      y: roomRect.y + roomRect.height * 0.12
    },

    // Email/Postman cluster
    {
      role: 'email',
      x: roomRect.x - roomRect.width * 0.02,
      y: roomRect.y + roomRect.height * 0.22
    },

    // Supervisor (Jarvis) at the top command desk
    {
      role: 'supervisor',
      x: roomRect.x,
      y: roomRect.y - roomRect.height * 0.32
    }
  ];

  return {
    roomRect,
    hallwayRect,
    doorX,
    doorY,
    desks
  };
}

