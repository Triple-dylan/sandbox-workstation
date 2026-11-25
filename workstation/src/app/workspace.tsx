import { createContext, useContext } from 'react';
import type { Id, Resource, Snapshot, Space, User } from '../../shared/types.ts';
import type { Audience } from '../features/conversations/audience.ts';

/** View state only. Records live on the server; nothing here grants or implies access. */
export type Ui = {
  spaceId: Id | null;
  surface: 'canvas' | 'graph';
  graphFocus: Record<Id, Id>;
  collapsedSpaces: Record<Id, boolean>;
  minimizedTools: Record<string, boolean>;
  readerDrafts: Record<Id, { title: string; body: string }>;
  railWidth: number;
  railHidden: boolean;
  conversationId: Id | null;
  selectedId: Id | null;
  pendingPlacementId: Id | null;
  readerId: Id | null;
  memberId: Id | null;
  audience: Record<Id, Audience>;
  drafts: Record<string, string>;
  theme: 'system' | 'light' | 'dark';
};

export const initialUi: Ui = {
  spaceId: null,
  surface: 'canvas',
  graphFocus: {},
  collapsedSpaces: {},
  minimizedTools: {},
  readerDrafts: {},
  railWidth: 240,
  railHidden: false,
  conversationId: null,
  selectedId: null,
  pendingPlacementId: null,
  readerId: null,
  memberId: null,
  audience: {},
  drafts: {},
  theme: 'system',
};

export type Workspace = {
  s: Snapshot;
  ui: Ui;
  setUi: (patch: Partial<Ui> | ((ui: Ui) => Partial<Ui>)) => void;
  space: Space;
  user: (id: Id | null | undefined) => User | undefined;
  resource: (id: Id | null | undefined) => Resource | undefined;
  notify: (text: string) => void;
  run: <T>(work: () => Promise<T>) => Promise<T | undefined>;
  openConversation: (id: Id) => void;
  openResource: (id: Id) => void;
  openDirect: (userId: Id) => Promise<void>;
  openAgentWork: (agentId: Id) => Promise<void>;
  discuss: (resourceId: Id, quote?: string) => void;
};

export const WorkspaceContext = createContext<Workspace>(null!);
export const useWorkspace = () => useContext(WorkspaceContext);
