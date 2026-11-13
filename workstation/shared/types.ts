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
};

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

export type Space = { id: Id; kind: 'personal' | 'project'; name: string; ownerId: Id };
export type Member = { spaceId: Id; userId: Id; role: 'owner' | 'member' | 'agent' };

/** Pages: things you open and work in. Each has its own editor. */
/** asset: something brought in and kept as it is: a picture, or a file's text. */
export const PAGE_KINDS = ['doc', 'sheet', 'deck', 'canvas', 'asset'] as const;
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

/** A sheet's stored form: rows of cells. A cell beginning with "=" is a formula. */
export type SheetBody = { rows: string[][] };
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

export type Anchor = { resourceId: Id; quote: string };
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
  reactions: { emoji: string; userIds: Id[] }[];
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

/** create-doc: title and body of the document. create-agent: title is its name, body is what it is for. add-step: title is a new step for the plan. */
export type Proposal = {
  /** edit-doc: title is the exact text to replace in the page, body is what replaces it. */
  kind: 'create-doc' | 'create-agent' | 'add-step' | 'edit-doc' | 'create-skill';
  title: string;
  body: string;
  /** edit-doc: the page to change. create-doc: the canvas to put the new page on, if any. */
  resourceId?: Id;
};
export type Approval = {
  id: Id;
  jobId: Id;
  spaceId: Id;
  agentId: Id;
  proposal: Proposal;
  status: 'pending' | 'approved' | 'declined';
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
  approvals: Approval[];
  goals: Goal[];
  skills: Skill[];
  /** Agents at work right now, as much as this person may know about each. */
  activity: Activity[];
  presence: Presence[];
  lastRead: Record<Id, string>;
  runtime: { id: string; label: string; model?: string };
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
  /** What the sender was looking at: pages in view or selected, and the space. Context, never a recipient. */
  context?: { resourceIds: Id[]; spaceId?: Id | null; conversationIds?: Id[] } | null;
};

export const STICKY_COLORS = ['yellow', 'pink', 'blue', 'green'] as const;
export const SHAPES = ['rect', 'ellipse', 'diamond'] as const;
export const REACTIONS = ['👍', '✅', '👀', '🎉', '❤️'] as const;
/** A teammate's pointer on a canvas, sent live and never stored. */
/** A message passed between two people's browsers to set up a live window share. Never stored. */
export type Signal = { from: Id; data: Record<string, unknown> };
export type Cursor = { userId: Id; resourceId: Id; x: number; y: number };
