import { colIndex, colName, evaluate, sheetText, toNumber } from '../../shared/formula.ts';
import { readSheet } from '../../shared/sheet.ts';
import { isPage } from '../../shared/types.ts';
import type { ChangeEvent, Store } from '../store.ts';
import type {
  BrowserBody,
  Conversation,
  Id,
  Job,
  JobKind,
  Message,
  Resource,
  User,
} from '../../shared/types.ts';
import {
  BudgetExceeded,
  TooManyRequests,
  type AgentLimits,
  type AgentRuntime,
  type AgentTask,
} from './runtime.ts';
import { scriptedRuntime } from './scripted.ts';
import { AnswerCache, Retriever } from './retrieve.ts';
import { VectorIndex, type Embedder } from './embed.ts';
import { keepOnlyValid, problemsWith, type CheckContext } from './checks.ts';
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
  private clock: ReturnType<typeof setInterval>;
  /** How many answers needed a second try; reported for tests and tuning. */
  retries = 0;
  private store: Store;
  readonly runtime: AgentRuntime;
  private options: { maintenanceDelayMs?: number; limits?: AgentLimits; embedder?: Embedder };
  /** Meaning-based search, when an embedder is available. */
  readonly vectors: VectorIndex | null;
  /** The pages each task may search, kept beside the task rather than sent to the model. */
  private searchable = new WeakMap<
    AgentTask,
    { id: string; stamp: string; title: string; kind: string; text: string }[]
  >();
  /** When each person last had a model answer, for the per-minute limit. */
  private recentAsks = new Map<Id, number[]>();
  constructor(
    store: Store,
    runtime: AgentRuntime,
    options: { maintenanceDelayMs?: number; limits?: AgentLimits; embedder?: Embedder } = {},
  ) {
    this.vectors = options.embedder ? new VectorIndex(store, options.embedder) : null;
    // Routines are checked twice a minute; the clock never keeps the process alive on its own.
    this.clock = setInterval(() => this.runDueRoutines(), 30_000);
    this.clock.unref?.();
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
  /** Starts every routine whose time has come. Marked as run first, so a slow answer never repeats. */
  runDueRoutines(at = new Date()) {
    for (const routine of this.store.dueRoutines(at)) {
      this.store.touchRoutine(routine.id, at);
      const agent = this.store.user(routine.agentId);
      const conversation = this.store.conversation(routine.conversationId);
      if (!agent || !conversation) continue;
      this.track(
        this.runJob(
          agent,
          conversation,
          'instruction',
          routine.instruction,
          null,
          null,
          routine.spaceId,
        ).catch((error) => console.error('routine failed', error)),
      );
    }
  }
  stop() {
    clearInterval(this.clock);
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
    if (event.type === 'decided') this.scheduleMaintenance(event.spaceId);
    if (event.type === 'resource' && this.store.user(event.actorId)?.kind === 'human') {
      this.scheduleMaintenance(event.resource.spaceId);
      this.consolidateSource(event.resource, event.actorId);
    }
    if (event.type === 'resource') this.scheduleWatch(event.resource.id, event.actorId);
  }

  private consolidated = new Set<Id>();
  /**
   * A file or import brought into your private space is raw material. Your agent reads it once and,
   * if it holds something worth keeping, offers a page that organises it, in your private chat.
   */
  private consolidateSource(resource: Resource, actorId: Id) {
    const space = this.store.space(resource.spaceId);
    if (space?.kind !== 'personal' || space.ownerId !== actorId) return;
    const raw =
      !!resource.source || (resource.kind === 'asset' && !resource.body.startsWith('data:'));
    if (!raw || resource.role || this.consolidated.has(resource.id)) return;
    this.consolidated.add(resource.id);
    const agent = this.store.personalAgent(actorId);
    const chat = this.store.privateChat(actorId);
    if (!agent || !chat) return;
    this.track(
      this.runJob(
        agent,
        chat,
        'proactive',
        `${resource.title} was just brought into your owner's private space${resource.source ? ` from ${resource.source.name}` : ''}. It is raw material for their context. If it holds something worth keeping, propose one "create-doc" page that organises it: what it is, the facts and decisions in it, and which existing pages it relates to (by exact title). Say in one line what you made. If it is not worth a page, skip.`,
        null,
        null,
        space.id,
        false,
        [resource.id],
      ).catch((error) => console.error('consolidating a source failed', error)),
    );
  }

  /** A watched page changed: its agents check their line once the edits settle. */
  private scheduleWatch(resourceId: Id, actorId: Id) {
    const watchers = this.store.watchersOf(resourceId).filter((w) => w.agentId !== actorId);
    if (!watchers.length) return;
    const key = `watch:${resourceId}`;
    clearTimeout(this.timers.get(key));
    this.timers.set(
      key,
      setTimeout(
        () => {
          this.timers.delete(key);
          this.track(
            this.checkWatches(resourceId).catch((error) => console.error('watch failed', error)),
          );
        },
        Math.min(this.options.maintenanceDelayMs ?? 4000, 4000),
      ),
    );
  }

  /**
   * Each agent looking after the page checks its line. A line about a cell ("B5 above 5000") is
   * checked exactly and said once when crossed and once when back. Any other instruction is put to
   * the model, at most every ten minutes. A personal agent tells its owner privately.
   */
  private async checkWatches(resourceId: Id) {
    const page = this.store.resource(resourceId);
    if (!page) return;
    for (const w of this.store.watchersOf(resourceId)) {
      const agent = this.store.user(w.agentId);
      if (!agent || agent.retired || !this.store.canReadResource(agent.id, page)) continue;
      const where =
        agent.role === 'personal' && agent.ownerId
          ? this.store.privateChat(agent.ownerId)
          : this.store.openDiscussion(agent.id, page.id);
      if (!where) continue;
      const line = cellLine(w.rule);
      if (line && page.kind === 'sheet') {
        const rows = readSheet(page.body).rows;
        const shown = evaluate(rows, line.row, line.col);
        const n = toNumber(shown);
        if (n === null) continue;
        const met = line.above
          ? line.orEqual
            ? n >= line.value
            : n > line.value
          : line.orEqual
            ? n <= line.value
            : n < line.value;
        const state = met ? 'met' : 'clear';
        if (state === (w.lastState ?? 'clear')) {
          if (!w.lastState) this.store.markWatch(agent.id, page.id, state);
          continue;
        }
        this.store.markWatch(agent.id, page.id, state);
        const ref = `${colName(line.col)}${line.row + 1}`;
        const label = rows[line.row]?.[0]?.trim();
        const name = label && label !== shown ? `${label} (${ref})` : ref;
        const limit = line.value.toLocaleString('en-US');
        this.store.postMessage(
          agent.id,
          {
            conversationId: where.id,
            text: met
              ? `Heads up on ${page.title}: ${name} is now ${shown}, ${line.above ? 'above' : 'below'} ${limit}.`
              : `${page.title}: ${name} is back to ${shown}, within ${limit}.`,
          },
          { relay: agent.role === 'personal' },
        );
        continue;
      }
      if (!w.rule.trim()) continue;
      const key = `${w.agentId}:${resourceId}`;
      if (Date.now() - (this.watchAsked.get(key) ?? 0) < 600_000) continue;
      this.watchAsked.set(key, Date.now());
      await this.runJob(
        agent,
        where,
        'proactive',
        `${page.title} just changed. You look after it and were told: "${w.rule}". If the page now calls for that, say so in one or two sentences, naming what changed. Otherwise skip.`,
        null,
        null,
        page.spaceId,
        agent.role === 'personal',
      );
    }
  }
  private watchAsked = new Map<string, number>();

  private async handleMessage(message: Message) {
    const conversation = this.store.conversation(message.conversationId)!;
    // Your own agent's chat, or a one-to-one chat with a workspace agent: it answers without a tag.
    const agentInPrivate =
      conversation.kind === 'agent-private' || conversation.kind === 'dm'
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
      // Picked a teammate's own agent: that is a request to the teammate, and your agent says so.
      const theirs =
        chosen && conversation.kind === 'agent-private' ? this.store.user(chosen) : null;
      if (
        theirs?.kind === 'agent' &&
        theirs.role === 'personal' &&
        theirs.ownerId &&
        theirs.ownerId !== message.authorId &&
        addressed.role === 'personal'
      ) {
        const who = this.store.user(theirs.ownerId)?.name ?? 'They';
        try {
          this.store.createAgentRequest(addressed.id, {
            toUserId: theirs.ownerId,
            spaceId,
            // The tag was how you picked them; the request is the rest.
            request:
              request
                .replace(
                  new RegExp(`@${theirs.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`, 'i'),
                  '',
                )
                .trim() || request,
          });
          this.store.postMessage(addressed.id, {
            conversationId: conversation.id,
            text: `I've asked ${theirs.name}. ${who} sees it first and decides what to send back; it will show up here.`,
          });
        } catch (error) {
          this.store.postMessage(addressed.id, {
            conversationId: conversation.id,
            text: `I couldn't ask ${theirs.name}: ${(error as Error).message}`,
          });
        }
        return;
      }
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
      if (r.kind === 'sheet') return sheetText(JSON.parse(r.body).rows as string[][]);
      if (r.kind === 'browser') {
        const b = JSON.parse(r.body) as BrowserBody;
        const open = b.tabs[b.active];
        return open
          ? `The team's shared browser. Open tab: ${open.title || open.url} (${open.url})\nOther tabs: ${b.tabs
              .filter((_, i) => i !== b.active)
              .map((t) => t.title || t.url)
              .join('; ')}\n\n${b.text}`
          : "The team's shared browser, with nothing open.";
      }
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
    if (!this.store.space(spaceId)) return;
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

  /**
   * Routine context upkeep: keep the orientation current, and run active delegations. In a
   * workspace its own agent keeps "About <workspace>"; in a private space the owner's agent keeps
   * "About you" from the pages there and the owner's private chats.
   */
  private async maintain(spaceId: Id) {
    const space = this.store.space(spaceId);
    if (!space) return;
    if (space.kind === 'personal') {
      const agent = this.store.personalAgent(space.ownerId);
      if (!agent || !this.store.ensureAboutYou(space.ownerId)) return;
      await this.runJob(
        agent,
        null,
        'maintenance',
        'Keep "About you" current from what is in your private space and your private chats',
        null,
        null,
        spaceId,
        false,
        // Your private space is small and all of it is your context: read its pages in full,
        // newest first, rather than the one-line directory a workspace's upkeep works from.
        this.store
          .resourcesIn(spaceId)
          .filter((r) => isPage(r.kind) && !r.archived && !r.role)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          .map((r) => r.id),
      );
      return;
    }
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
    focusOn: Id[] = [],
  ): AgentTask {
    const space = this.store.space(spaceId)!;
    // Your agent answers from every space you're in, but keeps "About you" from your private space only.
    const spaces =
      agent.role === 'personal' && !(kind === 'maintenance' && space.kind === 'personal')
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
    const pages = resources.map((r) => ({
      id: r.id,
      stamp: r.updatedAt,
      title: r.title,
      kind: r.kind,
      text: this.readable(r),
    }));
    const shared =
      kind === 'maintenance' || (kind === 'delegation' && !conversation)
        ? this.store.snapshot(agent.id, [], { id: '', label: '' }).conversations.filter(
            (c) =>
              c.spaceId === spaceId &&
              (c.kind === 'channel' ||
                c.kind === 'discussion' ||
                // In a private space, what you told your agent is part of the raw material.
                (space.kind === 'personal' && c.kind === 'agent-private')),
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
      .filter(
        (m) =>
          kind !== 'maintenance' ||
          this.store.user(m.authorId)?.kind === 'human' ||
          // What your agent answered you is part of your context too.
          (space.kind === 'personal' && m.authorId === agent.id),
      )
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
      ...focusOn,
    ];
    const focus = [...new Set(focusIds)]
      .map((id) => this.store.resource(id))
      .filter((r): r is NonNullable<typeof r> => !!r && this.store.canReadResource(agent.id, r))
      .filter((r) => !['image', 'folder', 'arrow', 'plan'].includes(r.kind))
      .slice(0, 8)
      .map((r) => ({ title: r.title, kind: r.kind, body: this.readable(r).slice(0, 6000) }));
    // Your agent brings what it keeps about you into your private chats in every workspace.
    const aboutYou =
      agent.role === 'personal' && agent.ownerId && space.kind !== 'personal'
        ? this.store.ensureAboutYou(agent.ownerId)
        : null;
    const colleagueSpace = looking?.spaceId ?? spaceId;
    const colleagues = this.store
      .projectAgents(colleagueSpace)
      .filter((a) => a.id !== agent.id && this.store.isMember(agent.id, colleagueSpace))
      .map((a) => ({ name: a.name, purpose: a.purpose ?? '' }))
      .concat(
        agent.role === 'personal'
          ? this.teammateAgents(agent, colleagueSpace).map((a) => {
              const who = this.store.user(a.ownerId!)?.name ?? 'Their owner';
              return {
                name: a.name,
                purpose: `${who}'s own agent. Asking it sends ${who} a request; ${who} decides what it shares, so the answer comes later.`,
              };
            })
          : [],
      );
    const task: AgentTask = {
      kind,
      agent: {
        name: agent.name,
        role: agent.role ?? 'project',
        front: agent.role === 'project' && this.store.projectAgent(spaceId)?.id === agent.id,
        purpose: agent.purpose ?? '',
        approvals: agent.approvals ?? 'ask',
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
        aboutYou:
          aboutYou && !relay && this.store.canReadResource(agent.id, aboutYou)
            ? aboutYou.body.slice(0, 8000)
            : null,
        resources: resources.map((r) => ({
          title: r.title,
          kind: r.kind,
          excerpt: this.readable(r).replace(/\s+/g, ' ').slice(0, 140),
        })),
        passages:
          kind === 'maintenance'
            ? []
            : this.retriever.search(`${request} ${trigger?.anchor?.quote ?? ''}`, pages),
        recent,
        plan: this.store.goals(spaceId).map((g) => ({
          step: g.title,
          owner: g.ownerId ? (this.store.user(g.ownerId)?.name ?? null) : null,
          agent: g.agentId ? (this.store.user(g.agentId)?.name ?? null) : null,
          due: g.due,
          done: g.done,
        })),
        members: this.store.membersOf(spaceId),
        pinned: resources
          .filter((r) => r.pinned && r.spaceId === spaceId)
          .slice(0, 6)
          .map((r) => ({ title: r.title, kind: r.kind, body: this.readable(r).slice(0, 4000) })),
        focus,
        colleagues,
        pendingProposal: (() => {
          const waiting = this.waitingApproval(agent, conversation);
          return waiting
            ? {
                kind: waiting.proposal.kind,
                title: waiting.proposal.title,
                body: waiting.proposal.body,
              }
            : null;
        })(),
      },
    };
    this.searchable.set(task, pages);
    return task;
  }

  private async runJob(
    agent: User,
    conversation: Conversation | null,
    kind: JobKind,
    request: string,
    trigger: Message | null,
    _assignmentId: Id | null = null,
    explicitSpaceId?: Id,
    relay: boolean | { askedBy: Id } = false,
    focusOn: Id[] = [],
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
        focusOn[0] ??
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
    const task = this.buildTask(
      agent,
      kind,
      request,
      conversation,
      spaceId,
      trigger,
      !!relay,
      focusOn,
    );
    // Meaning-based search alongside keywords. Pages without vectors yet are embedded in the
    // background and still found by keyword this time; any embedding failure leaves keywords alone.
    const pages = this.searchable.get(task);
    if (this.vectors && pages && kind !== 'maintenance') {
      this.track(
        this.vectors.refresh(pages).catch((error) => console.error('embedding failed', error)),
      );
      try {
        task.context.passages = await this.vectors.search(
          `${request} ${trigger?.anchor?.quote ?? ''}`,
          pages,
          task.context.passages,
        );
      } catch (error) {
        console.error('meaning search failed', error);
      }
    }
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
        if (!remembered) {
          if (result.tokens) this.store.addAgentUsage(spaceId, requester, result.tokens);
          result = await this.checked(
            result,
            task,
            agent,
            conversation,
            trigger,
            spaceId,
            requester,
          );
        }
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
      // A source you brought in counts as asked: say it could not be read rather than go quiet.
      if (conversation && kind !== 'maintenance' && (kind !== 'proactive' || focusOn.length))
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
    // A follow-up that revises a waiting draft replaces it, rather than leaving two to choose from.
    const waiting = result.proposal ? this.waitingApproval(agent, conversation) : null;
    if (result.proposal) {
      const looking = trigger ? this.store.messageContext(trigger.id) : null;
      const anchored = this.pageInQuestion(conversation, trigger);
      // An edit targets the page in question; a new page lands on the canvas being looked at.
      const canvas = (looking?.resourceIds ?? [])
        .map((id) => this.store.resource(id))
        .find((r) => r?.kind === 'canvas');
      const target =
        result.proposal.kind === 'edit-doc'
          ? anchored
          : result.proposal.kind === 'edit-cells'
            ? this.sheetNamed(agent, result.proposal.title, anchored)
            : result.proposal.kind === 'create-doc'
              ? canvas?.id
              : null;
      const needsTarget =
        result.proposal.kind === 'edit-doc' || result.proposal.kind === 'edit-cells';
      if (!needsTarget || target) {
        approvalId = this.store.createApproval(job, {
          ...result.proposal,
          ...(target ? { resourceId: target } : {}),
        }).id;
        if (waiting && waiting.proposal.kind === result.proposal.kind)
          this.store.replaceApproval(waiting.id);
        // "Small fixes without asking": a few cells or a short line are changed at once, with Undo.
        const requester =
          trigger && this.store.user(trigger.authorId)?.kind === 'human' ? trigger.authorId : null;
        if (agent.approvals === 'small' && requester && isSmall(result.proposal))
          try {
            this.store.decideApproval(requester, approvalId, 'approved');
          } catch (error) {
            console.error('small fix not applied', error);
          }
      }
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
        {
          replies: (result.replies ?? [])
            .map((r) => String(r).trim().slice(0, 60))
            .filter(Boolean)
            .slice(0, 3),
          read: this.readList(task, conversation, trigger),
        },
      );
    // Passing part of the job to a colleague: it answers in the same conversation, visibly as itself.
    if (result.handoff && conversation && trigger && !relay) {
      const looking = this.store.messageContext(trigger.id);
      const where = looking?.spaceId ?? spaceId;
      const name = result.handoff.to.toLowerCase();
      const colleague = this.store
        .projectAgents(where)
        .find((a) => a.name.toLowerCase() === name && a.id !== agent.id);
      // A teammate's own agent is reached through the teammate: it becomes a request to them.
      const teammate =
        agent.role === 'personal'
          ? this.teammateAgents(agent, where).find((a) => a.name.toLowerCase() === name)
          : undefined;
      if (teammate?.ownerId)
        this.store.createAgentRequest(agent.id, {
          toUserId: teammate.ownerId,
          spaceId: where,
          request: result.handoff.request,
        });
      else if (colleague && this.store.isMember(trigger.authorId, colleague.spaceId ?? ''))
        await this.runJob(
          colleague,
          conversation,
          'instruction',
          result.handoff.request,
          trigger,
          null,
          colleague.spaceId,
          { askedBy: agent.id },
        );
    }
    this.store.setJob(
      job.id,
      approvalId && this.store.approval(approvalId)?.status === 'pending'
        ? 'awaiting_approval'
        : 'done',
    );
  }

  /** The sheet a proposed change names, by title, among those the agent can read; the one in question first. */
  private sheetNamed(agent: User, title: string, inQuestion: Id | null): Id | null {
    const sheets = this.store
      .memberSpaces(agent.id)
      .flatMap((id) => this.store.readableResources(agent.id, id))
      .filter((r) => r.kind === 'sheet' && !r.archived);
    const named = sheets.filter((r) => r.title.toLowerCase() === title.trim().toLowerCase());
    return (named.find((r) => r.id === inQuestion) ?? named[0])?.id ?? null;
  }

  /** The change this agent suggested in this conversation that is still waiting for a person. */
  private waitingApproval(agent: User, conversation: Conversation | null) {
    if (!conversation) return null;
    const mine = this.store
      .messages(conversation.id, 20)
      .filter((m) => m.authorId === agent.id && m.approvalId)
      .at(-1);
    const approval = mine?.approvalId ? this.store.approval(mine.approvalId) : null;
    return approval?.status === 'pending' ? approval : null;
  }

  /** What an answer read, in words a person recognises: pages, conversations, pinned pages. */
  private readList(task: AgentTask, conversation: Conversation | null, trigger: Message | null) {
    const looking = trigger ? this.store.messageContext(trigger.id) : null;
    const chats = (looking?.conversationIds ?? [])
      .map((id) => this.store.conversation(id))
      .filter((c): c is Conversation => !!c && c.id !== conversation?.id)
      .map((c) => (c.kind === 'channel' ? `#${c.title}` : c.title || 'a conversation'));
    return [
      ...new Set([
        ...(task.anchor ? [task.anchor.title] : []),
        ...task.context.focus.map((f) => f.title),
        ...chats,
        ...task.context.pinned.map((p) => `${p.title} (pinned)`),
        ...(task.context.aboutYou ? ['About you'] : []),
      ]),
    ].slice(0, 8);
  }

  /** Teammates' own agents in a workspace: reachable from your agent, through the teammate. */
  private teammateAgents(agent: User, spaceId: Id): User[] {
    const owner = this.store.principal(agent.id);
    return this.store
      .people(spaceId)
      .filter((u) => u.id !== owner)
      .map((u) => this.store.personalAgent(u.id))
      .filter((a): a is User => !!a);
  }

  /** The page a request is about: the anchored text's page, the discussed page, or the one in view. */
  private pageInQuestion(conversation: Conversation | null, trigger: Message | null): Id | null {
    return (
      trigger?.anchor?.resourceId ??
      (conversation?.kind === 'discussion' ? conversation.resourceId : null) ??
      (trigger ? this.store.messageContext(trigger.id)?.resourceIds[0] : null) ??
      null
    );
  }

  /**
   * Checks an answer against what the agent was actually given. If something is fixable, the model
   * gets one retry with the problems spelled out; whatever is still wrong is left out and said so.
   */
  private async checked(
    first: AgentResult,
    task: AgentTask,
    agent: User,
    conversation: Conversation | null,
    trigger: Message | null,
    spaceId: Id,
    requester: Id | null,
  ): Promise<AgentResult> {
    if (this.runtime === scriptedRuntime) return first;
    const targetId = this.pageInQuestion(conversation, trigger);
    const target = targetId ? this.store.resource(targetId) : null;
    const ctx: CheckContext = {
      kind: task.kind,
      titles: new Set(
        this.store
          .memberSpaces(agent.id)
          .flatMap((id) => this.store.readableResources(agent.id, id))
          .map((r) => r.title.toLowerCase()),
      ),
      editTarget:
        target && this.store.canReadResource(agent.id, target)
          ? { title: target.title, body: target.body }
          : null,
      sheets: new Set(
        this.store
          .memberSpaces(agent.id)
          .flatMap((id) => this.store.readableResources(agent.id, id))
          .filter((r) => r.kind === 'sheet' && !r.archived)
          .map((r) => r.title.toLowerCase()),
      ),
      colleagues: task.context.colleagues.map((c) => c.name),
    };
    const problems = problemsWith(first, ctx);
    if (!problems.length) return first;
    let answer = first;
    try {
      answer = await this.runtime.run({
        ...task,
        feedback: problems.map((p) => `- ${p}`).join('\n'),
      });
      if (answer.tokens) this.store.addAgentUsage(spaceId, requester, answer.tokens);
      this.retries++;
      // A retry that came back worse (unreadable) keeps the first answer's usable parts.
      if (answer.malformed && !first.malformed) answer = first;
    } catch (error) {
      console.error('agent retry failed', error);
    }
    return keepOnlyValid(answer, ctx);
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
    relay: boolean | { askedBy: Id } = false,
    more: { replies?: string[]; read?: string[] } = {},
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
      {
        jobId: job.id,
        approvalId,
        runtime,
        sourceIds,
        relay: !!relay,
        replies: more.replies,
        read: more.read,
        ...(typeof relay === 'object'
          ? { asked: { agentId: relay.askedBy, request: job.request } }
          : {}),
      },
    );
  }
}

/** A change small and undoable enough to make without asking first. */
function isSmall(p: { kind: string; title: string; body: string }) {
  if (p.kind === 'edit-cells') return p.body.trim().split('\n').length <= 3;
  if (p.kind === 'edit-doc') return p.title.length <= 240 && p.body.length <= 240;
  return false;
}

/** A watch line about one cell: "B5 above 5000", "total in B5 goes over $5,000", "C3 < 0". */
export function cellLine(rule: string) {
  const m =
    /\b([A-Za-z]{1,2})(\d{1,3})\b[^<>\d]*?(>=|<=|>|<|at least|at most|above|over|more than|exceeds|below|under|less than)\s*\$?\s*(-?[\d,]+(?:\.\d+)?)/i.exec(
      rule,
    );
  if (!m) return null;
  const op = m[3].toLowerCase();
  return {
    row: Number(m[2]) - 1,
    col: colIndex(m[1]),
    above: ['>=', '>', 'at least', 'above', 'over', 'more than', 'exceeds'].includes(op),
    orEqual: ['>=', '<=', 'at least', 'at most'].includes(op),
    value: Number(m[4].replace(/,/g, '')),
  };
}
