export type Id = string;

/** The nine orb forms. An agent keeps one as its look; how fast it moves shows what it is doing. */
export const ORB_FORMS = [
  'breathing',
  'weaving',
  'composing',
  'listening',
  'connecting',
  'searching',
  'working',
  'solving',
  'shaping',
] as const;
export type OrbForm = (typeof ORB_FORMS)[number];
export type Character = {
  hue: number;
  shape: 'round' | 'tall' | 'wide';
  eyes: 'dot' | 'arc';
  /** The agent's own orb form. When unset, one is derived from its id so agents still differ. */
  form?: OrbForm;
};

export type User = {
  id: Id;
  name: string;
  color: string;
  kind: 'human' | 'agent';
  character?: Character;
  /** Agents only: whose personal agent this is, or which project it serves. */
  ownerId?: Id;
  spaceId?: Id;
  role?: 'personal' | 'project';
  /** Agents only: what it is for, and standing instructions. Editable by its owner or project members. */
  purpose?: string;
  instructions?: string;
  /** A retired agent keeps its history but takes no new work. */
  retired?: boolean;
  /** Agents only: the skills it has been given. */
  skillIds?: Id[];
  /**
   * Agents only: how it makes changes. ask: a person accepts each one (the default). small: small
   * sheet and text fixes are made at once and can be undone. plan: it lays out the steps first.
   */
  approvals?: ApprovalLevel;
};
export type ApprovalLevel = 'ask' | 'small' | 'plan';
/** A page an agent looks after, and the line it was told to say something at. */
export type Watch = { agentId: Id; resourceId: Id; rule: string; setBy: Id };

/**
 * A skill: a named way of doing one kind of job, written once and given to any agent that should
 * work that way. Skills in a shared space are shared; skills in your own space are yours.
 */
export type Skill = {
  id: Id;
  spaceId: Id;
  ownerId: Id;
  name: string;
  /** When to use it, in a sentence. */
  description: string;
  /** How to do it: the steps the agent follows. */
  body: string;
  updatedAt: string;
};

/**
 * An agent at work. Everyone in a space can see that it is working and, when they can open it,
 * which page it is on. What was asked stays with the people in that conversation.
 */
export type Activity = {
  agentId: Id;
  spaceId: Id;
  /** The page it is working on, if this person can open it. */
  resourceId: Id | null;
  /** The conversation it will answer in, if this person can read it. */
  conversationId: Id | null;
  status: 'working' | 'waiting';
  since: string;
};

export type Space = {
  id: Id;
  kind: 'personal' | 'project';
  name: string;
  ownerId: Id;
  /** A workspace's own agent: its front door, always there. A private space has none: yours does that job. */
  agentId?: Id;
};
export type Member = { spaceId: Id; userId: Id; role: 'owner' | 'member' | 'agent' };

/** Pages: things you open and work in. Each has its own editor. */
/** asset: something brought in and kept as it is: a picture, or a file's text. */
export const PAGE_KINDS = ['doc', 'sheet', 'deck', 'canvas', 'browser', 'asset'] as const;
export type PageKind = (typeof PAGE_KINDS)[number];
/**
 * Things that live on a canvas page. note: typed text. sticky, shape, frame: drawing pieces.
 * arrow: a connector between two pieces. embed: another page shown as a live card.
 * pin: a message kept on the canvas. image: a picture. plan: the space's goals.
 * screen: a window someone is sharing live; the picture itself is never stored.
 */
export const CANVAS_KINDS = [
  'note',
  'sticky',
  'shape',
  'frame',
  'arrow',
  'embed',
  'pin',
  'image',
  'plan',
  'screen',
] as const;
export type CanvasKind = (typeof CANVAS_KINDS)[number];
export type ResourceKind = 'folder' | PageKind | CanvasKind;
export const isPage = (kind: ResourceKind): kind is PageKind =>
  (PAGE_KINDS as readonly string[]).includes(kind);

/** How a column's numbers are shown. The stored value is unchanged. */
export type SheetFormat = 'plain' | 'number' | 'currency' | 'percent';
/** Where a linked sheet's cells live, when they live in Excel or Google Sheets. */
export type SheetLink = {
  provider: 'google' | 'microsoft';
  /** The spreadsheet's id at the provider, and which tab. */
  fileId: string;
  tab: string;
  url: string;
  /** Who linked it; their sign-in is used to read and write it. */
  linkedBy: Id;
  syncedAt: string | null;
  error?: string | null;
};
/**
 * A sheet's stored form: rows of cells. A cell beginning with "=" is a formula. Formats and
 * widths are per column (by index); freeze is how many top rows stay in view.
 */
/** Rows of a block shown only when one column passes a test ("North", ">500"); the rest hidden. */
export type SheetFilter = { range: CellRange; col: number; test: string };
export type SheetBody = {
  rows: string[][];
  /** Set for everyone: a sheet is shared, so a filter shows as a bar with Clear. */
  filter?: SheetFilter | null;
  formats?: Record<string, SheetFormat>;
  widths?: Record<string, number>;
  freeze?: number;
  link?: SheetLink | null;
};
/**
 * A shared browser page: the tabs it had open, which was in front, and the readable text of that
 * tab, so agents can read what the team is looking at. The live screen is never stored.
 */
export type BrowserBody = {
  tabs: { url: string; title: string }[];
  active: number;
  text: string;
  /** Where words typed in the address bar are searched. Google unless the team picks another. */
  engine?: SearchEngine;
};
export type SearchEngine = 'google' | 'duckduckgo' | 'bing';
export const SEARCH_ENGINES: Record<SearchEngine, { name: string; home: string; search: string }> =
  {
    google: {
      name: 'Google',
      home: 'https://www.google.com/',
      search: 'https://www.google.com/search?q=',
    },
    duckduckgo: {
      name: 'DuckDuckGo',
      home: 'https://duckduckgo.com/',
      search: 'https://duckduckgo.com/?q=',
    },
    bing: { name: 'Bing', home: 'https://www.bing.com/', search: 'https://www.bing.com/search?q=' },
  };
/** A deck's stored form. */
export type DeckBody = { slides: { title: string; body: string }[] };
/** What an embed on a canvas points at. */
export type EmbedBody = { resourceId?: Id; conversationId?: Id };
/** A connector on a canvas, between two pieces on the same canvas. */
export type ArrowBody = { from: Id; to: Id };
export type Placement = { x: number; y: number; width: number; height: number };
export type Resource = {
  id: Id;
  spaceId: Id;
  parentId: Id | null;
  kind: ResourceKind;
  title: string;
  body: string;
  visibility: 'space' | 'private';
  /** note: 'heading'. sticky: its colour. shape: 'rect' | 'ellipse' | 'diamond'. */
  style?: string;
  ownerId: Id;
  /** Where a canvas piece sits on its canvas. The arrangement is shared by everyone on the canvas. */
  placement: Placement | null;
  /** Where it came from, when it was brought in from somewhere else. */
  source?: { name: string; type: string; at: string };
  /** Put away: out of the list and the live graph, kept in the archive. */
  archived?: boolean;
  /** Pinned to the top of the list; agents read it as standing background. */
  pinned?: boolean;
  /** People and agents given access to a private page, beyond its owner. */
  grants?: Id[];
  /** Orientation doc maintained by the project agent. */
  role?: 'orientation' | 'resources';
  updatedAt: string;
  updatedBy: Id;
};

export type ConversationKind = 'channel' | 'dm' | 'agent-private' | 'discussion';
export type Conversation = {
  id: Id;
  kind: ConversationKind;
  spaceId: Id | null;
  title: string;
  resourceId: Id | null;
  participantIds: Id[];
  /** Pages pinned along the top of a channel. */
  pinnedIds: Id[];
};

/** A block of cells on a sheet, counted from 0, corners included. */
export type CellRange = { top: number; left: number; bottom: number; right: number };
/** What a message is about: a quote from a page, and on a sheet the exact cells chosen. */
export type Anchor = { resourceId: Id; quote: string; range?: CellRange };
export type Message = {
  id: Id;
  conversationId: Id;
  authorId: Id;
  text: string;
  anchor: Anchor | null;
  /** The agent this message addresses (workspace instruction / delegation). */
  addressedTo: Id | null;
  /** Hand the addressed agent an ongoing responsibility rather than a one-off request. */
  delegated: boolean;
  replyTo: Id | null;
  jobId: Id | null;
  approvalId: Id | null;
  /** Which agent runtime produced this message (agents only). */
  runtime: string | null;
  /** A comment on a page that has been dealt with. */
  resolved: boolean;
  /** A live piece of a page shown inside the message. Rows apply to sheets. */
  embed: { resourceId: Id; from?: number; to?: number } | null;
  /** The pages an agent's answer drew on. */
  sourceIds: Id[];
  /** Shared from someone's private conversation with their agent: whose agent said it. */
  sharedFrom: { agentId: Id; ownerId: Id } | null;
  /** An answer one agent gave because another asked it: who asked, and what. */
  asked: { agentId: Id; request: string } | null;
  /** Answers the person might tap, when an agent asked them something. */
  replies: string[];
  /** What an agent's answer read: the pages and conversations it was given. */
  read: string[];
  reactions: { emoji: string; userIds: Id[] }[];
  createdAt: string;
};

/**
 * One person's agent asking another person's agent. It goes to that person, not straight to their
 * agent: their agent drafts an answer, and nothing reaches the asker until the person sends it.
 */
export type AgentRequest = {
  id: Id;
  spaceId: Id;
  fromUserId: Id;
  fromAgentId: Id;
  toUserId: Id;
  request: string;
  status: 'pending' | 'drafting' | 'sent' | 'declined';
  /** The message, in the recipient's own conversation with their agent, that asked for a draft. */
  draftId: Id | null;
  answer: string | null;
  createdAt: string;
};

export type JobKind = 'instruction' | 'ask' | 'proactive' | 'delegation' | 'maintenance';
export type JobStatus = 'queued' | 'running' | 'awaiting_approval' | 'done' | 'failed';
export type Job = {
  id: Id;
  agentId: Id;
  spaceId: Id;
  conversationId: Id | null;
  kind: JobKind;
  status: JobStatus;
  request: string;
  targetResourceId: Id | null;
  runtime: string;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Assignment = {
  id: Id;
  agentId: Id;
  spaceId: Id;
  conversationId: Id;
  instruction: string;
  createdBy: Id;
  active: boolean;
  lastRunAt: string | null;
  createdAt: string;
};

export type RoutineCadence = 'daily' | 'weekdays' | 'weekly';
/** A job an agent does on a schedule, answered where it was set up to post. */
export type Routine = {
  id: Id;
  agentId: Id;
  spaceId: Id;
  conversationId: Id;
  instruction: string;
  cadence: RoutineCadence;
  /** 0 = Sunday. Only for weekly routines. */
  weekday: number | null;
  /** Local time of day, HH:MM, in the timezone of whoever set it up. */
  time: string;
  /** That person's Date.getTimezoneOffset(), in minutes. */
  tzOffset: number;
  createdBy: Id;
  lastRunAt: string | null;
  createdAt: string;
};

/** create-doc: title and body of the document. create-agent: title is its name, body is what it is for. add-step: title is a new step for the plan. */
export type Proposal = {
  /** edit-doc: title is the exact text to replace in the page, body is what replaces it. */
  /** edit-cells: title is the sheet's exact title, body is one change per line, like "B3 = 2800". */
  kind: 'create-doc' | 'create-agent' | 'add-step' | 'edit-doc' | 'edit-cells' | 'create-skill';
  title: string;
  body: string;
  /** edit-doc and edit-cells: the page to change. create-doc: the canvas to put the new page on, if any. */
  resourceId?: Id;
  /** edit-cells, once applied: the cells as they were, in the same form, so it can be undone. */
  undo?: string;
};
export type Approval = {
  id: Id;
  jobId: Id;
  spaceId: Id;
  agentId: Id;
  proposal: Proposal;
  /** replaced: a newer draft of the same change took its place. */
  status: 'pending' | 'approved' | 'declined' | 'replaced' | 'undone';
  decidedBy: Id | null;
  resultResourceId: Id | null;
  createdAt: string;
};

/** A lightweight, ordered step: an owner, an optional agent and an optional date. Not a task system. */
export type Goal = {
  id: Id;
  spaceId: Id;
  title: string;
  ownerId: Id | null;
  agentId: Id | null;
  due: string | null;
  done: boolean;
  position: number;
  /** The message this step came from, when it was made from a pinned message. */
  sourceMessageId: Id | null;
  createdBy: Id;
};

/** What a pin on the board stores. The message stays where it was said; this only points at it. */
export type PinBody = { messageId: Id; conversationId: Id; authorId: Id; quote: string };

export type Presence = {
  userId: Id;
  spaceId: Id | null;
  /** The page or conversation they have open. */
  resourceId: Id | null;
  conversationId: Id | null;
  editing: boolean;
  online: boolean;
};

export type Snapshot = {
  version: number;
  me: User;
  users: User[];
  spaces: Space[];
  members: Member[];
  resources: Resource[];
  conversations: Conversation[];
  messages: Message[];
  jobs: Job[];
  assignments: Assignment[];
  routines: Routine[];
  approvals: Approval[];
  /** Requests between people's agents that involve you, either way. */
  agentRequests: AgentRequest[];
  /** Pages agents look after, for the pages and agents this person can see. */
  watches: Watch[];
  goals: Goal[];
  skills: Skill[];
  /** Agents at work right now, as much as this person may know about each. */
  activity: Activity[];
  presence: Presence[];
  lastRead: Record<Id, string>;
  runtime: { id: string; label: string; model?: string };
  /** How people get in: anyone picks a name (local), or by invitation (hosted). */
  signIn?: 'open' | 'invite';
  /** Whether this person may start a new workspace here. */
  mayStartWorkspace?: boolean;
  /** Places spreadsheets can be linked from, and whether this person has signed in to each. */
  connectors?: {
    id: 'google' | 'microsoft';
    name: string;
    ready: boolean;
    account: string | null;
  }[];
};

/** What the composer sends. Exactly one destination; never inferred from a selection. */
export type SendRequest = {
  conversationId: Id;
  text: string;
  addressedTo?: Id | null;
  delegate?: boolean;
  anchor?: Anchor | null;
  replyTo?: Id | null;
  embed?: { resourceId: Id; from?: number; to?: number } | null;
  /** Shares an answer from your private conversation with your agent; it keeps that answer's sources. */
  sharedFrom?: Id | null;
  /** What the sender was looking at: pages in view or selected, and the space. Context, never a recipient. */
  context?: {
    resourceIds: Id[];
    spaceId?: Id | null;
    conversationIds?: Id[];
    /** In your private conversation: have this agent of the space answer instead of your own. */
    handTo?: Id | null;
  } | null;
};

export const STICKY_COLORS = ['yellow', 'pink', 'blue', 'green'] as const;
export const SHAPES = ['rect', 'ellipse', 'diamond'] as const;
export const REACTIONS = ['👍', '✅', '👀', '🎉', '❤️'] as const;
/** A teammate's pointer on a canvas, sent live and never stored. */
/** A message passed between two people's browsers to set up a live window share. Never stored. */
export type Signal = { from: Id; data: Record<string, unknown> };
/** Where a teammate is on a page right now. Sent live and never stored. */
export type Spot =
  | { kind: 'point'; x: number; y: number }
  | { kind: 'text'; from: number; to: number }
  | { kind: 'cell'; row: number; col: number }
  | { kind: 'slide'; slide: number }
  | { kind: 'gone' };
export type Cursor = { userId: Id; resourceId: Id } & Spot;
