export const storageKey = 'workstation-layout-proof-v1';
export type Utility = 'sources' | 'agent' | 'goals';
export type Theme = 'system' | 'light' | 'dark';
export type Message = {
  id: string;
  author: string;
  authorId?: string;
  text: string;
  at: string;
  replyTo?: string;
  sources?: string[];
  createdAt?: string;
  delivery?: 'local';
};
export type Participant = { id: string; displayName: string; avatarUrl?: string };
export type WritingBlock = {
  id: string;
  type: 'paragraph' | 'heading' | 'bullet' | 'check';
  text: string;
  done?: boolean;
};
export type Conversation = {
  id: string;
  title: string;
  kind: 'private' | 'channel' | 'dm';
  recipient?: string;
  messages: Message[];
  pinned?: boolean;
};
export type Goal = {
  id: string;
  title: string;
  done: boolean;
  due: string;
  owner?: string;
  source?: { conversationId: string; messageId: string; actionId?: string };
};
export type Resource = {
  id: string;
  title: string;
  file: string;
  summary: string;
  folder: 'direction' | 'research' | 'private';
  body?: string;
  updatedAt?: string;
  blocks?: WritingBlock[];
};
export const resources: Resource[] = [
  {
    id: 'plan',
    title: 'Rebuild plan',
    file: 'Rebuild Plan.md',
    summary: 'Approved sequence, interaction contract and review gates.',
    folder: 'direction',
  },
  {
    id: 'context',
    title: 'Conversation record',
    file: 'Conversation Context.md',
    summary: 'Original interview and later confirmed clarifications.',
    folder: 'direction',
  },
  {
    id: 'access',
    title: 'Object & access model',
    file: 'Object and Access Model.md',
    summary: 'Proposed canonical identity and permission contracts.',
    folder: 'direction',
  },
  {
    id: 'research',
    title: 'Research review',
    file: 'Research Review.md',
    summary: 'References, source inspection and feasibility evidence.',
    folder: 'research',
  },
];
export const initialConversations: Conversation[] = [
  {
    id: 'direction',
    title: 'product-direction',
    kind: 'channel',
    messages: [
      {
        id: 'record-1',
        author: 'Dylan · recorded feedback',
        text: 'Modules should never, ever be able to overlap each other.',
        at: 'Interview record',
      },
      {
        id: 'record-2',
        author: 'Dylan · recorded feedback',
        text: 'There should be times where you can chat, see the graph, and have a window open.',
        at: 'Interview record',
      },
      {
        id: 'record-3',
        author: 'Dylan · recorded feedback',
        text: 'Sources/context modules, agent modules, goal modules. Not one at a time.',
        at: 'Interview record',
      },
    ],
  },
  { id: 'notes', title: 'Personal notes', kind: 'private', messages: [] },
];
export const initialGoals: Goal[] = [
  { id: 'material', title: 'Review materials and layout', done: false, due: '' },
  { id: 'layout', title: 'Prove bounded placement and restoration', done: false, due: '' },
  { id: 'engines', title: 'Validate file and browser engines', done: false, due: '' },
];
