import type { ChangeEvent, Store } from '../store.ts';
import type { Conversation, Id, Job, JobKind, Message, User } from '../../shared/types.ts';
import { BudgetExceeded, type AgentRuntime, type AgentTask } from './runtime.ts';
import { scriptedRuntime } from './scripted.ts';

const PROACTIVE_COOLDOWN_MS = 120_000;
const MAINTENANCE_DELAY_MS = 2_500;

type EngineOptions = {
  maintenanceDelayMs?: number;
  workDelayMs?: number;
  allowScriptedFallback?: boolean;
};

/**
 * Turns conversation and workspace events into agent jobs and applies their results
 * through the same access-checked store operations people use.
 */
export class AgentEngine {
  private pending = new Set<Promise<void>>();
  private timers = new Map<Id, ReturnType<typeof setTimeout>>();
  private lastProactive = new Map<Id, number>();
  private store: Store;
  readonly runtime: AgentRuntime;
  private options: EngineOptions;
  constructor(store: Store, runtime: AgentRuntime, options: EngineOptions = {}) {
    this.store = store;
    this.runtime = runtime;
    this.options = options;
    store.onChange((event) => this.onChange(event));
  }

  /** Resolves once queued agent work has finished (tests, shutdown). */
  async idle() {
    while (this.pending.size || this.timers.size) {
      if (this.pending.size) await Promise.all([...this.pending]);
      else await new Promise((r) => setTimeout(r, 20));
    }
  }
  stop() {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  private track(work: Promise<void>) {
    this.pending.add(work);
    work.finally(() => this.pending.delete(work));
  }

  private onChange(event: ChangeEvent) {
    if (event.type === 'message') {
      const author = this.store.user(event.message.authorId);
      if (author?.kind !== 'human') return;
      this.track(
        this.handleMessage(event.message).catch((error) =>
          console.error('agent message handling failed', error),
        ),
      );
      const conversation = this.store.conversation(event.message.conversationId);
      if (conversation?.spaceId) this.scheduleMaintenance(conversation.spaceId);
    }
    if (event.type === 'resource' && this.store.user(event.actorId)?.kind === 'human')
      this.scheduleMaintenance(event.resource.spaceId);
  }

  private async handleMessage(message: Message) {
    const conversation = this.store.conversation(message.conversationId)!;
    const agentInPrivate =
      conversation.kind === 'agent-private' || conversation.kind === 'dm'
        ? this.store.addressableAgents(message.authorId, conversation)[0]
        : undefined;
    const assignedAgent =
      conversation.kind === 'agent-work'
        ? this.store.user(conversation.participantIds[0])
        : undefined;
    const addressed = message.addressedTo
      ? this.store.user(message.addressedTo)
      : (agentInPrivate ?? assignedAgent);
    const delegate = message.delegated;
    const request = message.text;
    if (addressed?.kind === 'agent') {
      const spaceId = this.spaceFor(addressed);
      if (!spaceId) return;
      const deployment =
        conversation.kind === 'agent-work' &&
        /^create (?:an? )?agent (?:called|named) ["“]?([^"”\n]+?)["”]?$/i.exec(request.trim());
      if (deployment) {
        let text: string;
        try {
          const agent = this.store.deployAgent(message.authorId, spaceId, deployment[1]);
          text = `${agent.name} joined the project. Open their conversation, then expand About to set instructions, skills and tools.`;
        } catch (error) {
          text = (error as Error).message;
        }
        this.store.postMessage(addressed.id, {
          conversationId: conversation.id,
          text,
          replyTo: message.id,
        });
        return;
      }
      if (delegate) {
        const assignment = this.store.createAssignment({
          agentId: addressed.id,
          spaceId,
          conversationId: conversation.id,
          instruction: request,
          createdBy: message.authorId,
        });
        await this.runJob(addressed, conversation, 'delegation', request, message, assignment.id);
        return;
      }
      await this.runJob(
        addressed,
        conversation,
        message.addressedTo ? 'instruction' : 'ask',
        request,
        message,
      );
      return;
    }
    // Unsolicited contributions: shared conversations only, throttled per conversation.
    if (
      (conversation.kind === 'channel' || conversation.kind === 'discussion') &&
      conversation.spaceId
    ) {
      const agent = this.store.projectAgent(conversation.spaceId);
      const last = this.lastProactive.get(conversation.id) ?? 0;
      if (!agent || Date.now() - last < PROACTIVE_COOLDOWN_MS) return;
      if (!/\?\s*$/.test(message.text) || message.text.length < 12) return;
      this.lastProactive.set(conversation.id, Date.now());
      await this.runJob(agent, conversation, 'proactive', message.text, message);
    }
  }

  private spaceFor(agent: User) {
    if (agent.role === 'project') return agent.spaceId ?? null;
    return agent.ownerId ? this.store.personalSpace(agent.ownerId) : null;
  }

  scheduleMaintenance(spaceId: Id) {
    const space = this.store.space(spaceId);
    if (!space || space.kind !== 'project') return;
    clearTimeout(this.timers.get(spaceId));
    this.timers.set(
      spaceId,
      setTimeout(() => {
        this.timers.delete(spaceId);
        this.track(
          this.maintain(spaceId).catch((error) => console.error('maintenance failed', error)),
        );
      }, this.options.maintenanceDelayMs ?? MAINTENANCE_DELAY_MS),
    );
  }

  /** Routine context upkeep: keep the orientation current, and run active delegations. */
  private async maintain(spaceId: Id) {
    const agent = this.store.projectAgent(spaceId);
    if (!agent) return;
    if (this.store.settingsFor(agent.id).tools.includes('Orientation maintenance'))
      await this.runJob(
        agent,
        null,
        'maintenance',
        'Keep the project orientation current',
        null,
        null,
        spaceId,
      );
    for (const assignment of this.store.activeAssignments(spaceId)) {
      if (/orientation|context|up to date/i.test(assignment.instruction)) continue;
      const conversation = this.store.conversation(assignment.conversationId);
      const assignee = this.store.user(assignment.agentId);
      if (!conversation || !assignee) continue;
      this.store.touchAssignment(assignment.id);
      await this.runJob(
        assignee,
        conversation,
        'delegation',
        assignment.instruction,
        null,
        assignment.id,
      );
    }
  }

  buildTask(
    agent: User,
    kind: JobKind,
    request: string,
    conversation: Conversation | null,
    spaceId: Id,
    trigger: Message | null,
  ): AgentTask {
    const space = this.store.space(spaceId)!;
    const spaces = agent.role === 'personal' ? this.store.memberSpaces(agent.id) : [spaceId];
    const settings = this.store.settingsFor(agent.id);
    const readContext = settings.tools.includes('Project context');
    const resources = (readContext ? spaces : [])
      .flatMap((id) => this.store.readableResources(agent.id, id))
      .filter((r) => r.kind !== 'folder' && r.role !== 'orientation');
    const orientation = this.store.resourcesIn(spaceId).find((r) => r.role === 'orientation');
    const shared =
      kind === 'maintenance' || (kind === 'delegation' && !conversation)
        ? this.store
            .snapshot(agent.id, [], { id: '', label: '' })
            .conversations.filter(
              (c) =>
                c.spaceId === spaceId &&
                (c.kind === 'channel' || c.kind === 'discussion' || c.kind === 'agent-work'),
            )
        : conversation
          ? [conversation]
          : [];
    const recent = shared
      .flatMap((c) => this.store.messages(c.id, 40))
      .filter((m) => this.store.user(m.authorId)?.kind === 'human' || kind !== 'maintenance')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(-30)
      .map((m) => ({
        author: this.store.user(m.authorId)?.name ?? 'Someone',
        text: m.text,
        at: m.createdAt,
      }));
    const anchorResource = trigger?.anchor ? this.store.resource(trigger.anchor.resourceId) : null;
    return {
      kind,
      agent: { name: agent.name, role: agent.role ?? 'project' },
      settings,
      spaceName: space.name,
      requester: trigger ? (this.store.user(trigger.authorId)?.name ?? null) : null,
      request,
      conversation: { kind: conversation?.kind ?? 'none', title: conversation?.title ?? '' },
      anchor:
        anchorResource && trigger?.anchor
          ? { title: anchorResource.title, quote: trigger.anchor.quote }
          : null,
      context: {
        orientation:
          readContext && orientation && this.store.canReadResource(agent.id, orientation)
            ? orientation.body
            : null,
        resources: resources.map((r) => ({
          title: r.title,
          kind: r.kind,
          excerpt: r.body.replace(/\s+/g, ' ').slice(0, 400),
        })),
        recent,
      },
    };
  }

  private async runJob(
    agent: User,
    conversation: Conversation | null,
    kind: JobKind,
    request: string,
    trigger: Message | null,
    _assignmentId: Id | null = null,
    explicitSpaceId?: Id,
  ) {
    const spaceId = explicitSpaceId ?? this.spaceFor(agent);
    if (!spaceId) return;
    if (conversation && !this.store.canReadConversation(agent.id, conversation)) return;
    const job = this.store.createJob({
      agentId: agent.id,
      spaceId,
      conversationId: conversation?.id ?? null,
      kind,
      request,
      targetResourceId:
        trigger?.anchor?.resourceId ??
        (conversation?.kind === 'discussion' ? conversation.resourceId : null) ??
        (kind === 'maintenance'
          ? (this.store.resourcesIn(spaceId).find((r) => r.role === 'orientation')?.id ?? null)
          : null),
      runtime: this.runtime.id,
    });
    this.store.setJob(job.id, 'running');
    const workDelay = this.options.workDelayMs ?? 0;
    if (workDelay > 0) await new Promise((r) => setTimeout(r, workDelay));
    const task = this.buildTask(agent, kind, request, conversation, spaceId, trigger);
    let result;
    let runtime = this.runtime;
    let note = '';
    try {
      try {
        result = await this.runtime.run(task);
      } catch (error) {
        if (
          !(error instanceof BudgetExceeded) ||
          this.runtime === scriptedRuntime ||
          this.options.allowScriptedFallback === false
        )
          throw error;
        runtime = scriptedRuntime;
        note = `\n\n_${error.message} Answered by the scripted runtime instead._`;
        result = await scriptedRuntime.run(task);
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown error';
      this.store.setJob(job.id, 'failed', { error: reason });
      if (conversation && kind !== 'proactive' && kind !== 'maintenance')
        this.reply(
          agent,
          conversation,
          trigger,
          `I couldn't finish that: ${reason}`,
          job,
          runtime.id,
        );
      return;
    }
    const tools = task.settings?.tools ?? [];
    if (
      result.orientation &&
      conversation?.kind !== 'dm' &&
      tools.includes('Orientation maintenance')
    )
      this.store.agentWriteOrientation(agent.id, spaceId, result.orientation);
    // A private chat with a project agent cannot create a project-visible approval.
    const proposal =
      conversation?.kind !== 'dm' && tools.includes('Document proposals')
        ? result.proposal
        : undefined;
    const reply =
      !proposal && result.proposal
        ? [result.reply, result.proposal.title, result.proposal.body].filter(Boolean).join('\n\n')
        : result.reply;
    if (result.skip || (!reply && !proposal)) {
      this.store.setJob(job.id, 'done');
      return;
    }
    let approvalId: Id | undefined;
    if (proposal) approvalId = this.store.createApproval(job, proposal).id;
    if (conversation && (reply || proposal))
      this.reply(
        agent,
        conversation,
        trigger,
        (reply || 'I drafted a proposal for review.') + note,
        job,
        runtime.id,
        approvalId,
      );
    this.store.setJob(job.id, approvalId ? 'awaiting_approval' : 'done');
  }

  private reply(
    agent: User,
    conversation: Conversation,
    trigger: Message | null,
    text: string,
    job: Job,
    runtime: string,
    approvalId?: Id,
  ) {
    this.store.postMessage(
      agent.id,
      {
        conversationId: conversation.id,
        text,
        replyTo:
          trigger && conversation.kind !== 'agent-private' && conversation.kind !== 'dm'
            ? (trigger.replyTo ?? trigger.id)
            : null,
      },
      { jobId: job.id, approvalId, runtime },
    );
  }
}
