import type { OrbState } from 'thinking-orbs';
import type { Job } from '../../../shared/types.ts';

export type AgentState = 'idle' | 'working' | 'waiting' | 'failed';

export function agentState(agentId: string, jobs: Job[]): AgentState {
  const mine = jobs.filter((j) => j.agentId === agentId);
  if (mine.some((j) => j.status === 'running' || j.status === 'queued')) return 'working';
  if (mine.some((j) => j.status === 'awaiting_approval')) return 'waiting';
  const latest = mine[0];
  if (latest?.status === 'failed' && Date.now() - Date.parse(latest.updatedAt) < 60_000)
    return 'failed';
  return 'idle';
}

export const agentStateLabel: Record<AgentState, string> = {
  idle: 'idle',
  working: 'working',
  waiting: 'waiting for approval',
  failed: 'last job failed',
};

/** Sandbox agent state → thinking-orbs verb (DropDeployment mapping). */
export function orbStateForAgent(state: AgentState): OrbState {
  if (state === 'working') return 'working';
  if (state === 'waiting') return 'shaping';
  // idle + brief failed: calm ring; failed also gets grayscale on the host
  return 'breathing';
}
