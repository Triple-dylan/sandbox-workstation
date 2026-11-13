import { createContext, useContext } from 'react';
import type { Conversation, Id, Resource, Snapshot, Space, User } from '../../shared/types.ts';

/** What a pane in the middle shows. */
export type Target =
  { type: 'page'; id: Id } | { type: 'chat'; id: Id } | { type: 'graph' } | { type: 'who'; id: Id };

export const sameTarget = (a: Target, b: Target) =>
  a.type === b.type && ('id' in a ? a.id : '') === ('id' in b ? b.id : '');

/** View state only. Records live on the server; nothing here grants or implies access. */
export type Ui = {
  spaceId: Id | null;
  /** One page, or two side by side. */
  panes: Target[];
  active: number;
  theme: 'system' | 'light' | 'dark';
  /** The answer panel above the agent bar. */
  barOpen: boolean;
  /** Things selected on a canvas or in the graph; they become what the agent is asked about. */
  selection: Id[];
  /** Unsent text in feeds, by conversation or page. */
  drafts: Record<string, string>;
  /** The left list as a drawer, on narrow windows. */
  nav: boolean;
  creating: boolean;
  graphScope: 'space' | 'everything';
  /** Who the bar is talking to: your own agent (null), or one of the space's, privately. */
  barAgent: Id | null;
  /** What the bar's agent looks at: what is on screen, the whole space, or nothing but your words. */
  barSees: 'screen' | 'space' | 'none';
  /** Pages added to what it looks at by dropping them on the bar. */
  barExtras: Id[];
  /** Which dialog is up, if any. */
  dialog: null | 'settings' | 'agent' | 'shortcuts' | 'paste';
  /** How things look for this person. */
  prefs: {
    size: 's' | 'm' | 'l';
    density: 'roomy' | 'compact';
    accent: number | null;
    list: boolean;
  };
  /** With two pages side by side: the share of the width the first one takes. */
  split: number;
};

export const initialUi: Ui = {
  spaceId: null,
  panes: [],
  active: 0,
  theme: 'system',
  barOpen: false,
  selection: [],
  drafts: {},
  nav: false,
  creating: false,
  graphScope: 'space',
  split: 0.5,
  dialog: null,
  barAgent: null,
  barSees: 'screen',
  barExtras: [],
  prefs: { size: 'm', density: 'roomy', accent: null, list: true },
};

export type Picker = {
  title: string;
  /** Things to do, offered above the results. */
  actions?: { label: string; hint?: string; run: () => void }[];
  /** Which pages may be chosen. */
  filter?: (r: Resource) => boolean;
  /** Also offer conversations. */
  chats?: boolean;
  onPick: (target: Target) => void;
};

export type MenuItem = { label: string; run: () => void; danger?: boolean } | 'line';

export type Workspace = {
  s: Snapshot;
  ui: Ui;
  setUi: (patch: Partial<Ui> | ((ui: Ui) => Partial<Ui>)) => void;
  space: Space;
  /** How many panes fit side by side in this window. */
  columns: 1 | 2;
  user: (id: Id | null | undefined) => User | undefined;
  resource: (id: Id | null | undefined) => Resource | undefined;
  notify: (text: string, action?: { label: string; run: () => void }) => void;
  run: <T>(work: () => Promise<T>) => Promise<T | undefined>;
  /** Opens something in the active pane, or beside it. */
  open: (target: Target, beside?: boolean) => void;
  closePane: (index: number) => void;
  pick: (picker: Picker) => void;
  /** A menu at the pointer: the quick things to do with whatever was right-clicked. */
  menu: (
    event: { clientX: number; clientY: number; preventDefault: () => void },
    items: MenuItem[],
  ) => void;
  /** Brings files from elsewhere into the space as pages. */
  bring: (files: File[], parentId?: Id | null) => Promise<void>;
  /** The things that can be done from anywhere: new page, bring in files, settings and so on. */
  commands: () => NonNullable<Picker['actions']>;
  /** Opens the file chooser for bringing things in. */
  chooseFiles: () => void;
  /** Your own agent and your private conversation with it. */
  myAgent: User | undefined;
  myChat: Conversation | undefined;
  /** Sends a request to your own agent about what is in view. */
  ask: (
    text: string,
    extra?: { anchor?: { resourceId: Id; quote: string }; resourceIds?: Id[]; handTo?: Id | null },
  ) => Promise<void>;
};

export const WorkspaceContext = createContext<Workspace>(null!);
export const useWorkspace = () => useContext(WorkspaceContext);
