import type { ChangeEvent, Store } from '../store.ts';
import type { Conversation, Id, Job, JobKind, Message, User } from '../../shared/types.ts';
import { BudgetExceeded, type AgentRuntime, type AgentTask } from './runtime.ts';
import { scriptedRuntime } from './scripted.ts';

const PROACTIVE_COOLDOWN_MS = 120_000;
const MAINTENANCE_DELAY_MS = 2_500;

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
  private options: { maintenanceDelayMs?: number };
  constructor(store: Store, runtime: AgentRuntime, options: { maintenanceDelayMs?: number } = {}) {
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
      conversation.kind === 'agent-private'
        ? conversation.participantIds
            .map((id) => this.store.user(id))
            .find((u) => u?.kind === 'agent')
        : undefined;
    const addressed = message.addressedTo ? this.store.user(message.addressedTo) : agentInPrivate;
    const delegate = message.delegated;
    const request = message.text;
    if (addressed?.kind === 'agent' && addressed.retired) return;
    if (addressed?.kind === 'agent') {
      const spaceId = this.spaceFor(addressed);
      if (!spaceId) return;
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
    const resources = spaces
      .flatMap((id) => this.store.readableResources(agent.id, id))
      .filter(
        (r) =>
          r.kind !== 'folder' &&
          r.kind !== 'image' &&
          r.kind !== 'plan' &&
          r.role !== 'orientation',
      );
    const orientation = this.store.resourcesIn(spaceId).find((r) => r.role === 'orientation');
    const shared =
      kind === 'maintenance' || (kind === 'delegation' && !conversation)
        ? this.store
            .snapshot(agent.id, [], { id: '', label: '' })
            .conversations.filter(
              (c) => c.spaceId === spaceId && (c.kind === 'channel' || c.kind === 'discussion'),
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
      agent: {
        name: agent.name,
        role: agent.role ?? 'project',
        purpose: agent.purpose ?? '',
        instructions: agent.instructions ?? '',
      },
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
          orientation && this.store.canReadResource(agent.id, orientation)
            ? orientation.body
            : null,
        resources: resources.map((r) => ({
          title: r.title,
          kind: r.kind,
          excerpt: (r.kind === 'pin' ? r.title : r.body).replace(/\s+/g, ' ').slice(0, 400),
        })),
        recent,
        plan: this.store.goals(spaceId).map((g) => ({
          step: g.title,
          owner: g.ownerId ? (this.store.user(g.ownerId)?.name ?? null) : null,
          agent: g.agentId ? (this.store.user(g.agentId)?.name ?? null) : null,
          due: g.due,
          done: g.done,
        })),
        members: this.store.membersOf(spaceId),
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
    const task = this.buildTask(agent, kind, request, conversation, spaceId, trigger);
    let result;
    let runtime = this.runtime;
    let note = '';
    try {
      try {
        result = await this.runtime.run(task);
      } catch (error) {
        if (!(error instanceof BudgetExceeded) || this.runtime === scriptedRuntime) throw error;
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
    if (result.orientation) this.store.agentWriteOrientation(agent.id, spaceId, result.orientation);
    if (result.skip || (!result.reply && !result.proposal)) {
      this.store.setJob(job.id, 'done');
      return;
    }
    let approvalId: Id | undefined;
    if (result.proposal) approvalId = this.store.createApproval(job, result.proposal).id;
    if (conversation && (result.reply || result.proposal))
      this.reply(
        agent,
        conversation,
        trigger,
        (result.reply || 'I drafted a proposal for review.') + note,
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
          trigger && conversation.kind !== 'agent-private' ? (trigger.replyTo ?? trigger.id) : null,
      },
      { jobId: job.id, approvalId, runtime },
    );
  }
}
