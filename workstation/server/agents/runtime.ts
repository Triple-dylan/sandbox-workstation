import type { JobKind, Proposal } from '../../shared/types.ts';

/** Everything a runtime sees. Built by the engine from what the agent may access; nothing else is reachable. */
export type AgentTask = {
  kind: JobKind;
  agent: {
    name: string;
    role: 'personal' | 'project';
    /** The workspace's own agent: answers anything here and brings in specialists. */
    front: boolean;
    purpose: string;
    /** How it makes changes: ask first, small fixes at once, or the plan first. */
    approvals?: 'ask' | 'small' | 'plan';
    instructions: string;
    /** Ways of working this agent has been given. Follow the one that fits the request. */
    skills: { name: string; when: string; steps: string }[];
  };
  spaceName: string;
  requester: string | null;
  request: string;
  /** Set on a retry: what was wrong with the previous answer, to fix this time. */
  feedback?: string;
  conversation: { kind: string; title: string };
  anchor: {
    title: string;
    quote: string;
    /** Cells chosen on a sheet: "B2:D40", the row naming the columns (if any), and the cells. */
    range?: string;
    header?: number | null;
    columns?: { letter: string; name: string }[];
    cells?: string;
  } | null;
  context: {
    orientation: string | null;
    /** Your agent only: what it keeps about its owner in their private space ("About you"). */
    aboutYou?: string | null;
    /** A directory of every page the agent may read: titles and a line each. */
    resources: { title: string; kind: string; excerpt: string }[];
    /** The passages found to be most relevant to this request, best first. */
    passages: { title: string; kind: string; text: string }[];
    recent: { author: string; text: string; at: string; where?: string }[];
    /** The space's plan, in order. */
    plan: {
      step: string;
      owner: string | null;
      agent: string | null;
      due: string | null;
      done: boolean;
    }[];
    /** Who is in the space: people and agents. */
    members: { name: string; kind: 'human' | 'agent' }[];
    /** What the requester was looking at or had selected, in full. Answer from these first. */
    focus: { title: string; kind: string; body: string }[];
    /** Pages the team pinned: standing background every agent reads in full. */
    pinned: { title: string; kind: string; body: string }[];
    /** Other agents this agent may hand work to, by name. */
    colleagues: { name: string; purpose: string }[];
    /** A change this agent suggested here that is still waiting: a follow-up revises it. */
    pendingProposal?: { kind: string; title: string; body: string } | null;
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
  /** Titles of the pages the reply drew on. */
  sources?: string[];
  /** Short answers the person might tap, when the reply asks them something. */
  replies?: string[];
  /** Pass part of the job to a colleague, by name. */
  handoff?: { to: string; request: string };
  tokens?: number;
  /** The model's output could not be read as the required JSON. */
  malformed?: boolean;
};

export interface AgentRuntime {
  id: string;
  label: string;
  model?: string;
  run(task: AgentTask): Promise<AgentResult>;
}

export class BudgetExceeded extends Error {}
/** Too many requests from one person in a short time. Not answered at all, not even by the stand-in. */
export class TooManyRequests extends Error {}

/** Spend guardrails for model-backed agents. Each is per UTC day except the per-minute rate. */
export type AgentLimits = {
  spaceTokensPerDay: number;
  personTokensPerDay: number;
  requestsPerMinute: number;
};
