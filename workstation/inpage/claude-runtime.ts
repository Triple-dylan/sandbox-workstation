// @ts-nocheck
// Live agent replies for the in-page build: asks Claude through the page it is published in,
// on the viewer's own account. No key is stored anywhere.
import { BudgetExceeded, type AgentRuntime } from '../server/agents/runtime.ts';
import { readResult, taskPrompt } from '../server/agents/prompt.ts';
import { scriptedRuntime } from '../server/agents/scripted.ts';

let sample: any;
const ready = (async () => {
  try {
    sample = await globalThis.claude?.use?.('sample');
  } catch {
    sample = null;
  }
})();
let unavailable = false;
/** While the example project is being created nobody has asked for anything, so nothing is sent. */
let quietUntil = 0;
export const stayQuiet = (ms: number) => (quietUntil = Date.now() + ms);

export const claudeRuntime: AgentRuntime = {
  id: 'claude',
  label: 'Claude',
  async run(task) {
    // Routine upkeep fires on a timer after edits; that must not spend the viewer's usage.
    if (task.kind === 'maintenance') return scriptedRuntime.run(task);
    if (task.kind === 'proactive' && Date.now() < quietUntil) return { skip: true };
    await ready;
    if (!sample || unavailable) throw new BudgetExceeded('Claude is not available in this view.');
    try {
      const parsed = await sample.json(taskPrompt(task), {
        cache: false,
        modelTier: task.kind === 'instruction' || task.kind === 'delegation' ? 'default' : 'quick',
      });
      return readResult(parsed);
    } catch (error) {
      if (error?.code === 'invalid_json' && error.text)
        return { reply: String(error.text).slice(0, 6000) };
      if (
        [
          'not_granted',
          'sampling_disabled',
          'not_declared',
          'capability_disabled',
          'capability_removed',
        ].includes(error?.code)
      ) {
        unavailable = true;
        throw new BudgetExceeded('Claude is not allowed in this view.');
      }
      if (error?.code === 'rate_limited')
        throw new Error('Claude is busy or you have reached a usage limit. Try again in a moment.');
      if (error?.code === 'refused') throw new Error('Claude declined that request.');
      throw new Error('Claude could not be reached just now. Try again.');
    }
  },
};
