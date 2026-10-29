export type AgentConfig = {
  name: string;
  purpose: string;
  instructions: string;
  scope: 'private' | 'project';
  autonomy: 'ask' | 'autonomous';
  widerContext: boolean;
};
export type AgentVersion = { id: string; number: number; at: string; config: AgentConfig };
export type AgentDefinition = {
  id: string;
  draft: AgentConfig;
  versions: AgentVersion[];
};
export const projectAgent: AgentDefinition = {
  id: 'project-agent',
  draft: {
    name: 'Project agent',
    purpose: 'Keep project context useful and current as people work.',
    instructions:
      'Maintain project orientation, goals, decisions, open questions and resource references. Cite source revisions, preserve uncertainty and respect private material. Request approval for consequential shared changes.',
    scope: 'project',
    autonomy: 'ask',
    widerContext: true,
  },
  versions: [],
};
export function agentConfigEqual(a: AgentConfig, b: AgentConfig) {
  return JSON.stringify(a) === JSON.stringify(b);
}
export function newAgent(): AgentDefinition {
  return {
    id: crypto.randomUUID(),
    draft: {
      name: 'Untitled agent',
      purpose: '',
      instructions: '',
      scope: 'private',
      autonomy: 'ask',
      widerContext: false,
    },
    versions: [],
  };
}
export function validAgent(value: unknown): value is AgentDefinition {
  const a = value as AgentDefinition;
  const config = (c: AgentConfig) =>
    c &&
    ['name', 'purpose', 'instructions'].every(
      (k) => typeof c[k as keyof AgentConfig] === 'string',
    ) &&
    ['private', 'project'].includes(c.scope) &&
    ['ask', 'autonomous'].includes(c.autonomy) &&
    typeof c.widerContext === 'boolean';
  return (
    !!a &&
    typeof a.id === 'string' &&
    config(a.draft) &&
    Array.isArray(a.versions) &&
    a.versions.every(
      (v) =>
        v &&
        typeof v.id === 'string' &&
        Number.isInteger(v.number) &&
        typeof v.at === 'string' &&
        config(v.config),
    )
  );
}
