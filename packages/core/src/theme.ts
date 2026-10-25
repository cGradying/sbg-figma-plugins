import type { Role } from './model.ts';

export type Theme = { id: string; name: string; roles: Record<Role, string> };

export const REQUIRED_ROLES = ['bg', 'gridLine', 'ink', 'onAccent', 'purple', 'pink', 'green', 'blue'] as const;

const HEX = /^#[0-9a-f]{6}$/i;

// Accent and ink values are sampled from the AWS SBG posts. gridLine values are matched by eye, they are 1px lines.
export const LIGHT: Theme = {
  id: 'light',
  name: 'Light',
  roles: {
    bg: '#fdfdfd',
    gridLine: '#e6e9ed',
    ink: '#181a29',
    onAccent: '#181a29',
    purple: '#ac5bfe',
    pink: '#ff56e9',
    green: '#01e282',
    blue: '#42b1ff',
  },
};

export const DARK: Theme = {
  id: 'dark',
  name: 'Dark',
  roles: {
    bg: '#151b25',
    gridLine: '#303a48',
    ink: '#f2f4f8',
    onAccent: '#181a29',
    purple: '#a05bf3',
    pink: '#ff56e9',
    green: '#01e282',
    blue: '#42b1ff',
  },
};

export const PHOTO: Theme = {
  id: 'photo',
  name: 'Photo (yellow)',
  roles: {
    bg: '#1b1030',
    gridLine: '#3a2a55',
    ink: '#ffffff',
    onAccent: '#181a29',
    purple: '#ac5bfe',
    pink: '#ff56e9',
    green: '#01e282',
    blue: '#42b1ff',
    yellow: '#f4e05c',
  },
};

export const BUILT_IN: readonly Theme[] = [LIGHT, DARK, PHOTO];

export function resolve(theme: Theme, role: Role): string {
  const hex = theme.roles[role];
  if (hex === undefined) throw new Error(`theme "${theme.id}" has no role "${role}"`);
  return hex;
}

export function parseTheme(raw: unknown): Theme {
  if (typeof raw !== 'object' || raw === null) throw new Error('theme must be an object');
  const t = raw as Record<string, unknown>;
  if (typeof t.id !== 'string' || !/^[\w-]{1,40}$/.test(t.id)) throw new Error('theme id must be 1-40 word characters');
  if (typeof t.name !== 'string' || t.name.length === 0 || t.name.length > 60) throw new Error('theme name must be 1-60 characters');
  if (typeof t.roles !== 'object' || t.roles === null) throw new Error('theme roles must be an object');
  const roles: Record<string, string> = {};
  for (const [k, v] of Object.entries(t.roles)) {
    if (typeof v !== 'string' || !HEX.test(v)) throw new Error(`role "${k}" must be a #rrggbb color`);
    roles[k] = v.toLowerCase();
  }
  for (const r of REQUIRED_ROLES) if (!(r in roles)) throw new Error(`theme is missing required role "${r}"`);
  return { id: t.id, name: t.name, roles };
}

export const exportTheme = (t: Theme): string => JSON.stringify(t, null, 2);
export const importTheme = (json: string): Theme => parseTheme(JSON.parse(json));

export function parseHex(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

export const toHex = (rgb: readonly number[]): string =>
  '#' + rgb.map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0')).join('');

export function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = parseHex(a);
  const [br, bg, bb] = parseHex(b);
  return toHex([ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t]);
}
