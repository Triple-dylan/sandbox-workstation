export type CanvasPin = { id: `pin:${string}`; conversationId: string; messageId: string };
export type CanvasVisual = {
  id: `visual:${string}`;
  imageKey: string;
  title: string;
  caption: string;
  fileName: string;
  mimeType: string;
  width: number;
  height: number;
  addedAt: string;
};
export function isCanvasId(id: unknown): id is import('./canvas-layout').Tool {
  return (
    typeof id === 'string' &&
    (['document', 'browser', 'agent-settings', 'planning'].includes(id) ||
      /^(pin|visual):.+/.test(id))
  );
}
