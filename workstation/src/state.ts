import {
  resources,
  initialConversations,
  initialGoals,
  storageKey,
  type Conversation,
  type Goal,
  type Theme,
  type Utility,
} from './model';
import type { CanvasObject } from './canvas-layout';
import { projectAgent, validAgent, type AgentDefinition } from './agents';
import type { Resource } from './model';
import { isCanvasId, type CanvasPin, type CanvasVisual } from './canvas-content';
export type Inspector =
  | { kind: 'document'; id: string; from?: string }
  | { kind: 'folder'; id: string }
  | { kind: 'agent-settings'; id: string };
export type LeftMode = 'closed' | 'list' | 'chat' | 'files' | 'people';
export type State = {
  version: 2;
  surface: 'canvas' | 'graph';
  left: LeftMode;
  selected: string;
  conversations: Conversation[];
  drafts: Record<string, string>;
  attachments: Record<string, string[]>;
  document: string;
  graphSubject: string;
  graphExpanded: boolean;
  goals: Goal[];
  utilities: Utility[];
  inspector: Inspector | null;
  theme: Theme;
  autonomy: string;
  objects: CanvasObject[];
  preset: CanvasObject[] | null;
  localResources: Resource[];
  agents: AgentDefinition[];
  selectedAgent: string;
  threadByConversation: Record<string, string>;
  sendShortcut: 'enter' | 'modifier';
  canvasPins: CanvasPin[];
  visuals: CanvasVisual[];
  legacyLayout?: unknown;
};
export function loadState(): State {
  let raw: any = {};
  try {
    raw = JSON.parse(localStorage.getItem(storageKey) || '{}');
    if (!raw || typeof raw !== 'object') raw = {};
  } catch {
    /* Use intact defaults if storage is damaged. */
  }
  const conversations =
    Array.isArray(raw.conversations) &&
    raw.conversations.length &&
    raw.conversations.every(
      (c: any) =>
        c &&
        typeof c.id === 'string' &&
        typeof c.title === 'string' &&
        ['private', 'channel', 'dm'].includes(c.kind) &&
        Array.isArray(c.messages) &&
        c.messages.every(
          (m: any) =>
            m &&
            typeof m.id === 'string' &&
            typeof m.text === 'string' &&
            typeof m.author === 'string' &&
            typeof m.at === 'string',
        ),
    )
      ? raw.conversations
      : initialConversations;
  const objects =
    raw.version === 2 && Array.isArray(raw.objects)
      ? raw.objects.filter(
          (o: any) =>
            o &&
            isCanvasId(o.id) &&
            ['x', 'y', 'width', 'height'].every((k) => Number.isFinite(o[k])),
        )
      : [];
  const stringMap = (value: unknown) =>
    value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).filter(([, v]) => typeof v === 'string'))
      : {};
  const localResources: Resource[] = Array.isArray(raw.localResources)
    ? raw.localResources.filter(
        (r: any) =>
          r &&
          typeof r.id === 'string' &&
          !resources.some((x) => x.id === r.id) &&
          typeof r.title === 'string' &&
          typeof r.body === 'string' &&
          r.folder === 'private' &&
          typeof r.file === 'string' &&
          typeof r.summary === 'string',
      )
    : [];
  const available = [...resources, ...localResources];
  const agents: AgentDefinition[] =
    Array.isArray(raw.agents) && raw.agents.some(validAgent)
      ? raw.agents.filter(validAgent)
      : [structuredClone(projectAgent)];
  const subject = [
    'root',
    'direction',
    'research-folder',
    'private-folder',
    ...available.map((r) => r.id),
  ].includes(raw.graphSubject)
    ? raw.graphSubject
    : 'root';
  const inspector =
    raw.version === 2 &&
    raw.inspector &&
    ['document', 'folder', 'agent-settings'].includes(raw.inspector.kind) &&
    (available.some((r) => r.id === raw.inspector.id) ||
      ['direction', 'research-folder', 'private-folder', 'root', 'agent'].includes(
        raw.inspector.id,
      ))
      ? raw.inspector
      : null;
  return {
    version: 2,
    surface:
      raw.version === 2 && ['canvas', 'graph'].includes(raw.surface)
        ? raw.surface
        : raw.layout
          ? 'graph'
          : 'canvas',
    left:
      raw.version === 2 && ['closed', 'list', 'chat', 'files', 'people'].includes(raw.left)
        ? raw.left
        : 'closed',
    selected: conversations.some((c: Conversation) => c.id === raw.selected)
      ? raw.selected
      : conversations.find((c: Conversation) => c.id === 'notes')?.id || conversations[0].id,
    conversations,
    drafts: stringMap(raw.drafts),
    attachments:
      raw.attachments && typeof raw.attachments === 'object'
        ? (Object.fromEntries(
            Object.entries(raw.attachments).filter(
              ([, v]) => Array.isArray(v) && v.every((id) => available.some((r) => r.id === id)),
            ),
          ) as Record<string, string[]>)
        : {},
    document: available.some((r) => r.id === raw.document) ? raw.document : 'plan',
    graphSubject: subject,
    graphExpanded: typeof raw.graphExpanded === 'boolean' ? raw.graphExpanded : false,
    goals:
      Array.isArray(raw.goals) &&
      raw.goals.every(
        (g: any) =>
          g &&
          typeof g.id === 'string' &&
          typeof g.title === 'string' &&
          typeof g.done === 'boolean' &&
          typeof g.due === 'string',
      )
        ? raw.goals
        : initialGoals,
    utilities: Array.isArray(raw.utilities)
      ? ([
          ...new Set(
            raw.utilities.filter((u: Utility) => ['sources', 'agent', 'goals'].includes(u)),
          ),
        ] as Utility[])
      : [],
    inspector,
    theme: ['light', 'dark', 'system'].includes(raw.theme) ? raw.theme : 'system',
    autonomy: ['ask', 'autonomous'].includes(raw.autonomy) ? raw.autonomy : 'ask',
    objects,
    preset: raw.version === 2 && Array.isArray(raw.preset) ? raw.preset : null,
    localResources,
    agents,
    selectedAgent: agents.some((a) => a.id === raw.selectedAgent)
      ? raw.selectedAgent
      : agents[0].id,
    threadByConversation: stringMap(raw.threadByConversation),
    sendShortcut: raw.sendShortcut === 'modifier' ? 'modifier' : 'enter',
    canvasPins: Array.isArray(raw.canvasPins)
      ? raw.canvasPins.filter(
          (p: any) =>
            p &&
            typeof p.id === 'string' &&
            p.id.startsWith('pin:') &&
            typeof p.conversationId === 'string' &&
            typeof p.messageId === 'string',
        )
      : [],
    visuals: Array.isArray(raw.visuals)
      ? raw.visuals.filter(
          (v: any) =>
            v &&
            typeof v.id === 'string' &&
            v.id.startsWith('visual:') &&
            ['imageKey', 'title', 'caption', 'fileName', 'mimeType', 'addedAt'].every(
              (k) => typeof v[k] === 'string',
            ) &&
            Number.isFinite(v.width) &&
            Number.isFinite(v.height),
        )
      : [],
    legacyLayout: raw.legacyLayout || raw.layout,
  };
}
