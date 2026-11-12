import type { Snapshot } from '../../shared/types.ts';
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
