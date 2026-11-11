import type { JobKind, Proposal } from '../../shared/types.ts';

/** Everything a runtime sees. Built by the engine from what the agent may access; nothing else is reachable. */
export type AgentTask = {
  kind: JobKind;
  agent: { name: string; role: 'personal' | 'project'; purpose: string; instructions: string };
  spaceName: string;
  requester: string | null;
  request: string;
  conversation: { kind: string; title: string };
  anchor: { title: string; quote: string } | null;
  context: {
    orientation: string | null;
    resources: { title: string; kind: string; excerpt: string }[];
    recent: { author: string; text: string; at: string }[];
  };
};

export type AgentResult = {
  /** Message posted back in the originating conversation. */
  reply?: string;
  /** A consequential shared change; always goes through approval. */
  proposal?: Proposal;
  /** New orientation body: routine context upkeep, applied without approval. */
  orientation?: string;
  /** Runtime decided not to speak (proactive checks). */
  skip?: boolean;
  tokens?: number;
};

export interface AgentRuntime {
  id: string;
  label: string;
  model?: string;
  run(task: AgentTask): Promise<AgentResult>;
}

export class BudgetExceeded extends Error {}
