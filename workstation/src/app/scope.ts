import { isPage } from '../../shared/types.ts';
import type { Id, Resource, Snapshot, Space } from '../../shared/types.ts';
import type { Target, Ui } from './workspace.tsx';

/** What the agent bar is asking about, worked out from what is on screen. Never a recipient. */
export function scopeOf(ui: Ui, s: Snapshot, columns: number) {
  const shown: Target[] = columns === 1 ? [ui.panes[ui.active] ?? ui.panes[0]] : ui.panes;
  const pages = shown.flatMap((t) => (t.type === 'page' ? [t.id] : []));
  const chats = shown.flatMap((t) => (t.type === 'chat' ? [t.id] : []));
  if (ui.selection.length)
    return {
      label: `${ui.selection.length} selected`,
      resourceIds: [...ui.selection, ...pages],
      conversationIds: [],
    };
  if (shown.length === 2 && pages.length + chats.length === 2)
    return { label: 'Both pages', resourceIds: pages, conversationIds: chats };
  const only = shown[ui.active] ?? shown[0];
  if (only?.type === 'page')
    return { label: 'This page', resourceIds: [only.id], conversationIds: [] };
  if (only?.type === 'chat') {
    const kind = s.conversations.find((c) => c.id === only.id)?.kind;
    return {
      label: kind === 'channel' ? 'This channel' : 'This conversation',
      resourceIds: [],
      conversationIds: [only.id],
    };
  }
  return { label: 'Whole space', resourceIds: pages, conversationIds: chats };
}

/**
 * How many things on a page are waiting on this person: suggestions an agent made there that need
 * a yes, and open comments other people left. Shown as a mark on the page in the list.
 */
export function waitingOn(s: Snapshot, page: Resource) {
  const onPage = (id: Id | null | undefined) => {
    if (!id) return false;
    if (id === page.id) return true;
    return s.resources.find((r) => r.id === id)?.parentId === page.id;
  };
  const feed = s.conversations.find((c) => c.kind === 'discussion' && c.resourceId === page.id);
  const jobs = new Map(s.jobs.map((j) => [j.id, j]));
  const suggestions = s.approvals.filter((a) => {
    if (a.status !== 'pending') return false;
    const job = jobs.get(a.jobId);
    return onPage(a.proposal.resourceId) || (!!feed && job?.conversationId === feed.id);
  }).length;
  const comments = s.messages.filter(
    (m) =>
      !!feed &&
      m.conversationId === feed.id &&
      m.anchor &&
      !m.replyTo &&
      !m.resolved &&
      m.authorId !== s.me.id &&
      !m.addressedTo &&
      page.ownerId === s.me.id,
  ).length;
  return suggestions + comments;
}

/** What a space opens on when nothing is remembered: its work, not a summary of it. */
export function firstTarget(s: Snapshot, space: Space): Target {
  const pages = s.resources.filter((r) => r.spaceId === space.id && isPage(r.kind) && !r.role);
  const page = pages.find((r) => r.kind === 'canvas') ?? pages[0];
  if (page) return { type: 'page', id: page.id };
  const channel = s.conversations.find((c) => c.kind === 'channel' && c.spaceId === space.id);
  return channel ? { type: 'chat', id: channel.id } : { type: 'graph' };
}

/** Agents at work on a page or in a conversation, as far as this person may know. */
export function atWork(s: Snapshot, where: { resourceId?: Id; conversationId?: Id }) {
  const seen = new Set<Id>();
  return s.activity
    .filter(
      (a) =>
        a.status === 'working' &&
        ((where.resourceId && a.resourceId === where.resourceId) ||
          (where.conversationId && a.conversationId === where.conversationId)),
    )
    .map((a) => s.users.find((u) => u.id === a.agentId))
    .filter((u): u is NonNullable<typeof u> => !!u && !seen.has(u.id) && !!seen.add(u.id));
}

/** Whose agent this is, said the way a teammate would: "Scout" or "Maya's agent". */
export function agentLabel(s: Snapshot, agentId: Id) {
  const agent = s.users.find((u) => u.id === agentId);
  if (!agent) return 'An agent';
  if (agent.role !== 'personal') return agent.name;
  return agent.ownerId === s.me.id ? `${agent.name} (yours)` : agent.name;
}

/** Where else a page shows up: channels it is a resource of, canvases it sits on. */
export function usedIn(s: Snapshot, page: Resource): Target[] {
  const out: Target[] = [];
  for (const c of s.conversations)
    if (c.kind === 'channel' && c.pinnedIds.includes(page.id)) out.push({ type: 'chat', id: c.id });
  const canvases = new Set<Id>();
  for (const r of s.resources)
    if (r.kind === 'embed' && r.parentId && r.body.includes(page.id)) canvases.add(r.parentId);
  for (const id of canvases) out.push({ type: 'page', id });
  return out;
}

/** Pages a piece of text names, by title. Shared context shows up wherever it is talked about. */
export function pagesNamed(s: Snapshot, spaceId: Id | null, text: string, skip: Id[] = []) {
  const lower = text.toLowerCase();
  return s.resources.filter(
    (r) =>
      isPage(r.kind) &&
      !r.archived &&
      (!spaceId || r.spaceId === spaceId) &&
      r.title.length >= 5 &&
      !skip.includes(r.id) &&
      lower.includes(r.title.toLowerCase()),
  );
}

export const DRAG = 'application/x-workstation-target';
