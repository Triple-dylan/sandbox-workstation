import { createContext, useContext } from 'react';
import type { Id, Resource, Snapshot, Space, User } from '../../shared/types.ts';
import type { Audience } from '../features/conversations/audience.ts';

/** View state only. Records live on the server; nothing here grants or implies access. */
export type Ui = {
  spaceId: Id | null;
  surface: 'canvas' | 'graph';
  conversationId: Id | null;
  selectedId: Id | null;
  readerId: Id | null;
  /** The agent whose work and conversation are open at the right. */
  agentId: Id | null;
  audience: Record<Id, Audience>;
  drafts: Record<string, string>;
  theme: 'system' | 'light' | 'dark';
  /** Navigation sheet beside the rail. */
  nav: boolean;
  /** The create sheet beside the rail. */
  create: boolean;
  /** The find sheet beside the rail. */
  find: boolean;
  /** Graph shows this space, or every space you can see. */
  graphScope: 'space' | 'everything';
  /** A document opened from the board fills the work area; the board folds into a shelf. */
  wide: boolean;
  /** Project tools (agent, orientation, people) at the right edge. */
  tools: boolean;
};

export const initialUi: Ui = {
  spaceId: null,
  surface: 'canvas',
  conversationId: null,
  selectedId: null,
  readerId: null,
  agentId: null,
  audience: {},
  drafts: {},
  theme: 'system',
  nav: false,
  create: false,
  find: false,
  graphScope: 'space',
  wide: false,
  tools: true,
};

export type Workspace = {
  s: Snapshot;
  ui: Ui;
  setUi: (patch: Partial<Ui> | ((ui: Ui) => Partial<Ui>)) => void;
  space: Space;
  user: (id: Id | null | undefined) => User | undefined;
  resource: (id: Id | null | undefined) => Resource | undefined;
  notify: (text: string, action?: { label: string; run: () => void }) => void;
  run: <T>(work: () => Promise<T>) => Promise<T | undefined>;
  openConversation: (id: Id) => void;
  openResource: (id: Id) => void;
  discuss: (resourceId: Id) => void;
};

export const WorkspaceContext = createContext<Workspace>(null!);
export const useWorkspace = () => useContext(WorkspaceContext);
