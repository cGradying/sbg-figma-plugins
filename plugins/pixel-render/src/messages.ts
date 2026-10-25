import type { Theme } from '@sbg/core';

export type Target = { id: string; name: string; w: number; h: number };

export type SelectionInfo =
  | { kind: 'none' }
  | { kind: 'target'; target: Target }
  | { kind: 'pixel'; target: Target; doc: string };

export type ToMain =
  | { type: 'ready' }
  | { type: 'render'; doc: string; theme: Theme; mode: 'new' | 'update' | 'overlay'; targetId?: string }
  | { type: 'flatten'; doc: string; theme: Theme; targetId: string }
  | { type: 'cut'; doc: string; theme: Theme; targetId: string }
  | { type: 'save-themes'; themes: Theme[] }
  | { type: 'save-draft'; doc: string }
  | { type: 'notify'; message: string };

export type ToUI =
  | { type: 'init'; themes: Theme[]; fonts: string[]; draft?: string }
  | { type: 'selection'; info: SelectionInfo }
  | { type: 'preview'; id: string; png: Uint8Array | null }
  | { type: 'done'; message: string }
  | { type: 'error'; message: string };
