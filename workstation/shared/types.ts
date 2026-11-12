export type Id = string;

export type Character = { hue: number; shape: 'round' | 'tall' | 'wide'; eyes: 'dot' | 'arc' };

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
};

export type Space = { id: Id; kind: 'personal' | 'project'; name: string; ownerId: Id };
export type Member = { spaceId: Id; userId: Id; role: 'owner' | 'member' | 'agent' };

/** note: text typed on the board. pin: a message kept on the board. image: a picture. plan: the space's goals shown on the board. */
export type ResourceKind = 'folder' | 'note' | 'doc' | 'pin' | 'image' | 'plan';
export type Placement = { x: number; y: number; width: number; height: number };
export type Resource = {
  id: Id;
  spaceId: Id;
  parentId: Id | null;
  kind: ResourceKind;
  title: string;
  body: string;
  visibility: 'space' | 'private';
  ownerId: Id;
  /** Where this item sits on the viewer's own arrangement of the board. */
  placement: Placement | null;
  /** False when the viewer has not arranged this item yet and is seeing where its creator put it. */
  ownPlacement?: boolean;
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
  kind: 'create-doc' | 'create-agent' | 'add-step';
  title: string;
  body: string;
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
  surface: 'canvas' | 'graph' | null;
  resourceId: Id | null;
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
};
