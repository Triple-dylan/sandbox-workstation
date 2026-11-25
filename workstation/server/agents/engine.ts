import type { ChangeEvent, Store } from '../store.ts';
import type { Conversation, Id, Job, JobKind, Message, User } from '../../shared/types.ts';
import {
  BudgetExceeded,
  TooManyRequests,
  type AgentLimits,
  type AgentRuntime,
  type AgentTask,
} from './runtime.ts';
import { scriptedRuntime } from './scripted.ts';
import { AnswerCache, Retriever } from './retrieve.ts';
import type { AgentResult } from './runtime.ts';

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
  readonly retriever = new Retriever();
  readonly answers = new AnswerCache<AgentResult>();
  private store: Store;
  readonly runtime: AgentRuntime;
  private options: { maintenanceDelayMs?: number; limits?: AgentLimits };
  /** When each person last had a model answer, for the per-minute limit. */
  private recentAsks = new Map<Id, number[]>();
  constructor(
    store: Store,
    runtime: AgentRuntime,
    options: { maintenanceDelayMs?: number; limits?: AgentLimits } = {},
  ) {
    this.store = store;
    this.runtime = runtime;
    this.options = options;
    store.onChange((event) => this.onChange(event));
  }

  /**
   * Checks the spend guardrails before a model is called. Over a daily allowance, the agent says so
   * and the labelled stand-in answers; asking too fast gets no answer at all.
   */
  private guard(spaceName: string, spaceId: Id, personId: Id | null) {
    const limits = this.options.limits;
    if (!limits || this.runtime === scriptedRuntime) return;
    if (personId) {
      const cutoff = Date.now() - 60_000;
      const times = (this.recentAsks.get(personId) ?? []).filter((t) => t > cutoff);
      if (times.length >= limits.requestsPerMinute)
        throw new TooManyRequests(
          `you've asked agents ${times.length} times in the last minute. Try again in a moment.`,
        );
      times.push(Date.now());
      this.recentAsks.set(personId, times);
      if (this.store.agentUsageToday('person', personId) >= limits.personTokensPerDay)
        throw new BudgetExceeded("You've used today's agent allowance. It resets at 00:00 UTC.");
    }
    if (this.store.agentUsageToday('space', spaceId) >= limits.spaceTokensPerDay)
      throw new BudgetExceeded(
        `${spaceName} has used today's agent allowance. It resets at 00:00 UTC.`,
      );
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
      const looking = this.store.messageContext(message.id)?.spaceId;
      const spaceId =
        addressed.role === 'personal' && looking && this.store.isMember(addressed.id, looking)
          ? looking
          : this.spaceFor(addressed);
      if (!spaceId) return;
      // Asked from the bar to put this to one of the space's agents: it answers here, privately,
      // without your own agent in between and without seeing the rest of this conversation.
      const chosen = this.store.messageContext(message.id)?.handTo;
      const colleague =
        chosen && conversation.kind === 'agent-private'
          ? this.store.projectAgents(spaceId).find((a) => a.id === chosen)
          : undefined;
      if (colleague && this.store.isMember(message.authorId, spaceId)) {
        await this.runJob(
          colleague,
          conversation,
          'instruction',
          request,
          message,
          null,
          spaceId,
          true,
        );
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
        await this.runJob(
          addressed,
          conversation,
          'delegation',
          request,
          message,
          assignment.id,
          spaceId,
        );
        return;
      }
      await this.runJob(
        addressed,
        conversation,
        message.addressedTo ? 'instruction' : 'ask',
        request,
        message,
        null,
        spaceId,
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

  /** A page's content as plain text an agent can read, whatever its kind. */
  private readable(r: { kind: string; title: string; body: string }): string {
    try {
      if (r.kind === 'embed') {
        const target = this.store.resource(JSON.parse(r.body).resourceId);
        return target ? `${target.title}\n${this.readable(target)}` : r.title;
      }
      if (r.kind === 'arrow' || r.kind === 'plan' || r.kind === 'image') return r.title;
      if (r.kind === 'asset' && r.body.startsWith('data:')) return r.title;
      if (r.kind === 'sheet')
        return (JSON.parse(r.body).rows as string[][]).map((row) => row.join(' | ')).join('\n');
      if (r.kind === 'deck')
        return (JSON.parse(r.body).slides as { title: string; body: string }[])
          .map((s, i) => `Slide ${i + 1}: ${s.title}\n${s.body}`)
          .join('\n\n');
    } catch {
      return r.title;
    }
    return r.kind === 'pin' || r.kind === 'canvas' ? r.title : r.body;
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
    relay = false,
  ): AgentTask {
    const space = this.store.space(spaceId)!;
    const spaces =
      agent.role === 'personal'
        ? this.store.memberSpaces(this.store.principal(agent.id))
        : [spaceId];
    const resources = spaces
      .flatMap((id) => this.store.readableResources(agent.id, id))
      .filter(
        (r) =>
          ['doc', 'sheet', 'deck', 'canvas', 'asset', 'note', 'sticky', 'pin'].includes(r.kind) &&
          // Archived pages are out of the working context until someone brings them back.
          !r.archived &&
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
        : conversation && !relay
          ? [
              conversation,
              // Its owner's agent also hears the conversations in view, with its owner's access.
              ...(agent.role === 'personal' && trigger
                ? (this.store.messageContext(trigger.id)?.conversationIds ?? [])
                    .map((id) => this.store.conversation(id))
                    .filter(
                      (c): c is Conversation =>
                        !!c &&
                        c.id !== conversation.id &&
                        this.store.canReadConversation(agent.id, c),
                    )
                : []),
            ]
          : [];
    const recent = shared
      .flatMap((c) => this.store.messages(c.id, 40))
      .filter((m) => this.store.user(m.authorId)?.kind === 'human' || kind !== 'maintenance')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(-30)
      .map((m) => ({
        author: this.store.user(m.authorId)?.name ?? 'Someone',
        // Marked decided by someone in a channel: agents treat it as settled.
        text: m.resolved && !m.anchor ? `[decided] ${m.text}` : m.text,
        at: m.createdAt,
        where: shared.find((c) => c.id === m.conversationId)?.title || 'private',
      }));
    const anchorResource = trigger?.anchor ? this.store.resource(trigger.anchor.resourceId) : null;
    const looking = trigger ? this.store.messageContext(trigger.id) : null;
    const focusIds = [
      ...(anchorResource ? [anchorResource.id] : []),
      ...(conversation?.kind === 'discussion' && conversation.resourceId
        ? [conversation.resourceId]
        : []),
      ...(looking?.resourceIds ?? []),
    ];
    const focus = [...new Set(focusIds)]
      .map((id) => this.store.resource(id))
      .filter((r): r is NonNullable<typeof r> => !!r && this.store.canReadResource(agent.id, r))
      .filter((r) => !['image', 'folder', 'arrow', 'plan'].includes(r.kind))
      .slice(0, 8)
      .map((r) => ({ title: r.title, kind: r.kind, body: this.readable(r).slice(0, 6000) }));
    const colleagueSpace = looking?.spaceId ?? spaceId;
    const colleagues = this.store
      .projectAgents(colleagueSpace)
      .filter((a) => a.id !== agent.id && this.store.isMember(agent.id, colleagueSpace))
      .map((a) => ({ name: a.name, purpose: a.purpose ?? '' }));
    return {
      kind,
      agent: {
        name: agent.name,
        role: agent.role ?? 'project',
        purpose: agent.purpose ?? '',
        instructions: agent.instructions ?? '',
        skills: this.store
          .skillsOf(agent.id)
          .map((s) => ({ name: s.name, when: s.description, steps: s.body })),
      },
      spaceName: space.name,
      requester: trigger ? (this.store.user(trigger.authorId)?.name ?? null) : null,
      request,
      conversation: relay
        ? { kind: 'handoff', title: '' }
        : { kind: conversation?.kind ?? 'none', title: conversation?.title ?? '' },
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
          excerpt: this.readable(r).replace(/\s+/g, ' ').slice(0, 140),
        })),
        passages:
          kind === 'maintenance'
            ? []
            : this.retriever.search(
                `${request} ${trigger?.anchor?.quote ?? ''}`,
                resources.map((r) => ({
                  id: r.id,
                  stamp: r.updatedAt,
                  title: r.title,
                  kind: r.kind,
                  text: this.readable(r),
                })),
              ),
        recent,
        plan: this.store.goals(spaceId).map((g) => ({
          step: g.title,
          owner: g.ownerId ? (this.store.user(g.ownerId)?.name ?? null) : null,
          agent: g.agentId ? (this.store.user(g.agentId)?.name ?? null) : null,
          due: g.due,
          done: g.done,
        })),
        members: this.store.membersOf(spaceId),
        focus,
        colleagues,
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
    relay = false,
  ) {
    const spaceId = explicitSpaceId ?? this.spaceFor(agent);
    if (!spaceId) return;
    if (conversation && !relay && !this.store.canReadConversation(agent.id, conversation)) return;
    const job = this.store.createJob({
      agentId: agent.id,
      spaceId,
      conversationId: conversation?.id ?? null,
      kind,
      request,
      targetResourceId:
        trigger?.anchor?.resourceId ??
        (conversation?.kind === 'discussion' ? conversation.resourceId : null) ??
        // What the person was looking at when they asked: the page the agent is working on.
        (trigger ? (this.store.messageContext(trigger.id)?.resourceIds ?? []) : [])
          .map((id) => this.store.resource(id))
          .find((r) => !!r && this.store.canReadResource(agent.id, r) && r.spaceId === spaceId)
          ?.id ??
        (kind === 'maintenance'
          ? (this.store.resourcesIn(spaceId).find((r) => r.role === 'orientation')?.id ?? null)
          : null),
      runtime: this.runtime.id,
    });
    this.store.setJob(job.id, 'running');
    const task = this.buildTask(agent, kind, request, conversation, spaceId, trigger, relay);
    let result;
    let runtime = this.runtime;
    let note = '';
    try {
      // The same request about unchanged pages was answered a moment ago: reuse it.
      const cacheable = kind === 'ask' || kind === 'instruction';
      // Something marked decided since makes it a new question; ordinary chatter does not.
      const { recent, ...settled } = task.context;
      const key = AnswerCache.key([
        this.runtime.id,
        agent.id,
        kind,
        task.request,
        task.anchor,
        settled,
        recent.filter((m) => m.text.startsWith('[decided]')).map((m) => m.at),
      ]);
      const remembered = cacheable ? this.answers.get(key) : undefined;
      const requester =
        trigger && this.store.user(trigger.authorId)?.kind === 'human' ? trigger.authorId : null;
      try {
        if (!remembered) this.guard(task.spaceName, spaceId, requester);
        result = remembered ?? (await this.runtime.run(task));
        if (!remembered && result.tokens)
          this.store.addAgentUsage(spaceId, requester, result.tokens);
        if (cacheable && !remembered && !result.proposal && !result.handoff && result.reply)
          this.answers.set(key, result);
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
          undefined,
          [],
          relay,
        );
      return;
    }
    // Someone stopped it while it was thinking: say nothing, change nothing.
    if (this.store.job(job.id)?.status === 'failed') return;
    if (result.orientation) this.store.agentWriteOrientation(agent.id, spaceId, result.orientation);
    if (result.skip || (!result.reply && !result.proposal)) {
      this.store.setJob(job.id, 'done');
      return;
    }
    let approvalId: Id | undefined;
    if (result.proposal) {
      const looking = trigger ? this.store.messageContext(trigger.id) : null;
      const anchored =
        trigger?.anchor?.resourceId ??
        (conversation?.kind === 'discussion' ? conversation.resourceId : null) ??
        looking?.resourceIds[0] ??
        null;
      // An edit targets the page in question; a new page lands on the canvas being looked at.
      const canvas = (looking?.resourceIds ?? [])
        .map((id) => this.store.resource(id))
        .find((r) => r?.kind === 'canvas');
      const target =
        result.proposal.kind === 'edit-doc'
          ? anchored
          : result.proposal.kind === 'create-doc'
            ? canvas?.id
            : null;
      if (result.proposal.kind !== 'edit-doc' || target)
        approvalId = this.store.createApproval(job, {
          ...result.proposal,
          ...(target ? { resourceId: target } : {}),
        }).id;
    }
    const titles = new Map(
      this.store
        .memberSpaces(agent.id)
        .flatMap((id) => this.store.readableResources(agent.id, id))
        .map((r) => [r.title.toLowerCase(), r.id] as const),
    );
    const sourceIds = (result.sources ?? [])
      .map((title) => titles.get(title.toLowerCase()))
      .filter((id): id is Id => !!id);
    if (conversation && (result.reply || result.proposal))
      this.reply(
        agent,
        conversation,
        trigger,
        (result.reply || 'I drafted a proposal for review.') + note,
        job,
        runtime.id,
        approvalId,
        sourceIds,
        relay,
      );
    // Passing part of the job to a colleague: it answers in the same conversation, visibly as itself.
    if (result.handoff && conversation && trigger && !relay) {
      const looking = this.store.messageContext(trigger.id);
      const colleague = this.store
        .projectAgents(looking?.spaceId ?? spaceId)
        .find(
          (a) => a.name.toLowerCase() === result.handoff!.to.toLowerCase() && a.id !== agent.id,
        );
      if (colleague && this.store.isMember(trigger.authorId, colleague.spaceId ?? ''))
        await this.runJob(
          colleague,
          conversation,
          'instruction',
          result.handoff.request,
          trigger,
          null,
          colleague.spaceId,
          true,
        );
    }
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
    sourceIds: Id[] = [],
    relay = false,
  ) {
    this.store.postMessage(
      agent.id,
      {
        conversationId: conversation.id,
        text,
        replyTo:
          trigger && conversation.kind !== 'agent-private' ? (trigger.replyTo ?? trigger.id) : null,
      },
      { jobId: job.id, approvalId, runtime, sourceIds, relay },
    );
  }
}
