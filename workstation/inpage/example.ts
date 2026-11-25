// @ts-nocheck
// A clearly labelled example space for the in-page preview: a go-to-market launch run across
// product, product marketing and marketing. Invented product, invented people. Never used by the
// real server.
export function seedExample(store, meId: string) {
  // Your own space: only you ever see this.
  const mine = store.personalSpace(meId);
  store.createResource(meId, {
    spaceId: mine,
    kind: 'doc',
    title: 'Ideas backlog',
    body: '# Ideas backlog\n\n- Customer story series: one team, one workflow, three numbers\n- A pricing page that answers "which plan am I" in one screen\n- Reuse the launch deck as the sales first-call deck',
  });
  const week = store.createResource(meId, {
    spaceId: mine,
    kind: 'canvas',
    title: 'This week',
    body: '',
  });
  const jot = (body, placement, style) =>
    store.createResource(meId, {
      spaceId: mine,
      kind: 'sticky',
      body,
      placement,
      style,
      parentId: week.id,
    });
  jot(
    'Decide the Team plan price before Thursday.',
    { x: 96, y: 96, width: 168, height: 168 },
    'yellow',
  );
  jot(
    'Ask sales which objection they hear most.',
    { x: 288, y: 96, width: 168, height: 168 },
    'blue',
  );

  const maya = store.createHuman('Maya (example)');
  const jon = store.createHuman('Jon (example)');
  const project = store.createProject(meId, 'Relay 2.0 launch (example)');
  const spaceId = project.id;
  store.addMember(meId, spaceId, maya.id);
  store.addMember(meId, spaceId, jon.id);
  const keeper = store.projectAgent(spaceId);
  if (keeper)
    store.updateAgent(meId, keeper.id, {
      name: 'Keeper',
      purpose: 'Keep this space organised and its orientation current',
    });

  const folder = (who, title) => store.createFolder(who, { spaceId, title });
  const page = (who, kind, parentId, title, body, visibility = 'space') =>
    store.createResource(who, { spaceId, kind, title, body, parentId, visibility });
  const product = folder(jon.id, 'Product');
  const pmm = folder(maya.id, 'Product marketing');
  const marketing = folder(meId, 'Marketing');

  // ---- Product
  page(
    jon.id,
    'doc',
    product.id,
    'Relay 2.0 PRD',
    "# Relay 2.0 PRD\n\nRelay is a shared inbox for support teams. 2.0 is about getting a new teammate useful on day one.\n\n## Problem\n\nNew agents take about three weeks to answer without help. Leads spend that time reviewing replies instead of improving the queue.\n\n## What ships\n\n- **Suggested replies** drawn from the team's own past answers\n- **Handoff notes** written automatically when a conversation changes owner\n- **Queue view** that shows what is waiting on whom\n\n## Not in 2.0\n\nPhone support, custom reporting.\n\n## Success\n\nTime to first unassisted reply under five days for teams of 10 to 50.",
  );
  const roadmap = page(
    jon.id,
    'sheet',
    product.id,
    'Roadmap',
    JSON.stringify({
      rows: [
        ['Feature', 'Status', 'Owner', 'Ships'],
        ['Suggested replies', 'In beta', 'Jon', 'May 27'],
        ['Handoff notes', 'Built', 'Jon', 'May 27'],
        ['Queue view', 'In design review', 'Jon', 'June 3'],
        ['Admin controls', 'Not started', '', 'After launch'],
      ],
    }),
  );

  // ---- Product marketing
  const positioning = page(
    maya.id,
    'doc',
    pmm.id,
    'Positioning and messaging',
    '# Positioning and messaging\n\n## Who it is for\n\nSupport leads at companies with 10 to 50 agents who are hiring faster than they can train.\n\n## The one line\n\nRelay 2.0 gets a new support agent answering on their own in days, not weeks.\n\n## Three messages\n\n1. **Your best answers, reused.** Suggested replies come from what your team has already said.\n2. **Nothing dropped at handoff.** Every reassignment carries a note.\n3. **See the queue, not just the ticket.** One view of what is waiting on whom.\n\n## Proof we can use\n\nBeta teams cut time to first unassisted reply from 19 days to 6. See the Relay 2.0 PRD for the measure.\n\n## Words to avoid\n\nAI-powered, revolutionary, seamless.',
  );
  page(
    maya.id,
    'doc',
    pmm.id,
    'Competitive notes',
    "# Competitive notes\n\n## Frontdesk\n\nStrong reporting. No suggested replies. $29 per agent.\n\n## Loop\n\nSuggested replies from a generic model, not the team's own answers. $35 per agent.\n\n## Where we win\n\nReplies in the team's own voice, and handoff notes. Nobody else has both.\n\n## Where we lose\n\nReporting. Say so plainly and point to the roadmap.",
  );
  const pricing = page(
    meId,
    'sheet',
    pmm.id,
    'Pricing and packaging',
    JSON.stringify({
      rows: [
        ['Plan', 'Price per agent', 'Agents', 'Monthly'],
        ['Starter', '19', '5', '=B2*C2'],
        ['Team', '32', '20', '=B3*C3'],
        ['Scale', '45', '50', '=B4*C4'],
        ['', '', '', ''],
        ['Team vs Loop', '=B3-35', '', ''],
      ],
    }),
  );
  page(
    maya.id,
    'deck',
    pmm.id,
    'Launch deck',
    JSON.stringify({
      slides: [
        {
          title: 'Relay 2.0',
          body: 'New support agents answering on their own in days, not weeks.',
        },
        {
          title: 'The problem',
          body: '- New agents take about three weeks to answer without help\n- Leads spend that time reviewing replies',
        },
        {
          title: 'What is new',
          body: '- Suggested replies from your own past answers\n- Handoff notes on every reassignment\n- A queue view of what is waiting on whom',
        },
        { title: 'Proof', body: 'Beta teams: 19 days to 6 for the first unassisted reply.' },
        { title: 'Pricing', body: 'Starter, Team and Scale. Team is $32 per agent.' },
      ],
    }),
  );

  // ---- Marketing
  const channels = page(
    meId,
    'sheet',
    marketing.id,
    'Channel plan',
    JSON.stringify({
      rows: [
        ['Channel', 'Owner', 'Budget', 'Target signups', 'Cost per signup'],
        ['Launch email', 'Maya', '0', '400', '=C2/D2'],
        ['Product Hunt', 'Dylan', '500', '250', '=C3/D3'],
        ['Paid social', 'Dylan', '6000', '300', '=C4/D4'],
        ['Webinar', 'Maya', '1500', '120', '=C5/D5'],
        ['Total', '', '=SUM(C2:C5)', '=SUM(D2:D5)', '=C6/D6'],
      ],
    }),
  );
  const announcement = page(
    maya.id,
    'doc',
    marketing.id,
    'Launch announcement',
    '# Relay 2.0: new agents answering on their own in days\n\nHiring is the easy part. Getting a new support agent to the point where they can answer without someone checking their work takes most teams about three weeks.\n\nRelay 2.0 is built to shorten that.\n\n## What is new\n\nSuggested replies come from answers your own team has already given. Handoff notes are written for you whenever a conversation changes hands. And the new queue view shows what is waiting on whom.\n\n## Availability\n\nRelay 2.0 is available to every plan on June 10.',
  );
  page(
    meId,
    'doc',
    null,
    'Notes for the pricing call',
    "# Notes for the pricing call\n\nPush for $32 on Team. Don't offer the annual discount unless they ask.",
    'private',
  );

  // ---- Agents and the plan
  const scout = store.newAgent(meId, {
    name: 'Scout',
    purpose: 'Competitive and pricing research',
    instructions:
      'Keep Competitive notes current. When a competitor price changes, say so and name the source page.',
    spaceId,
  });
  const editor = store.newAgent(maya.id, {
    name: 'Editor',
    purpose: 'Messaging and copy in our voice',
    instructions:
      'Follow Positioning and messaging. Never use the words listed under "Words to avoid".',
    spaceId,
  });
  // Skills: ways of working, written once and given to the agents that should work that way.
  const copySkill = store.createSkill(maya.id, {
    spaceId,
    name: 'Launch copy',
    description: 'When asked to write or edit announcement or web copy',
    body: '1. Lead with the customer problem, not the feature.\n2. Use the one line from Positioning and messaging as written.\n3. One claim per paragraph, each traceable to a page.\n4. Never use the words listed under "Words to avoid".',
  });
  const priceSkill = store.createSkill(meId, {
    spaceId,
    name: 'Competitor price check',
    description: 'When asked how our pricing compares',
    body: '1. Read Competitive notes and Pricing and packaging.\n2. Compare per-agent price plan by plan.\n3. Say where we are cheaper, where we are not, and name the source page for each number.',
  });
  store.setAgentSkill(maya.id, editor.id, copySkill.id, true);
  store.setAgentSkill(meId, scout.id, priceSkill.id, true);

  // Things brought in from elsewhere keep a note of where they came from.
  store.createResource(maya.id, {
    spaceId,
    kind: 'doc',
    parentId: pmm.id,
    title: 'Beta customer call, Harbor Support',
    body: '# Beta customer call, Harbor Support\n\n**Ana:** The handoff notes are the thing. We would pay for those alone.\n\n**Maya:** How long before a new hire answers on their own now?\n\n**Ana:** Four days for the last one. It used to be closer to three weeks.\n\n**Maya:** Anything missing?\n\n**Ana:** Reporting. I still export to a spreadsheet every Friday.',
    source: { name: 'harbor-support-call.vtt', type: 'transcript' },
  });
  const old = store.createResource(jon.id, {
    spaceId,
    kind: 'doc',
    parentId: product.id,
    title: 'Relay 1.5 retro',
    body: '# Relay 1.5 retro\n\nShipped late by two weeks. The cause was scope added after design review.',
  });
  store.updateResource(jon.id, old.id, { archived: true });

  const step = (title: string, patch = {}) => {
    const goal = store.createGoal(meId, { spaceId, title });
    store.updateGoal(meId, goal.id, patch);
  };
  step('Lock positioning', { ownerId: maya.id, due: '2027-05-16', done: true });
  step('Finalise pricing', { ownerId: meId, agentId: scout.id, due: '2027-05-30' });
  step('Announcement and deck ready', { ownerId: maya.id, agentId: editor.id, due: '2027-06-04' });
  step('Launch day', { ownerId: jon.id, due: '2027-06-10' });

  // ---- The launch board: one canvas that ties the three areas together
  const board = page(meId, 'canvas', null, 'Launch board', '');
  const on = (who, kind, body, placement, style) =>
    store.createResource(who, { spaceId, kind, body, placement, style, parentId: board.id });
  const card = (who, target, placement) =>
    on(who, 'embed', JSON.stringify({ resourceId: target.id }), placement);
  const arrow = (from, to) =>
    store.createResource(meId, {
      spaceId,
      kind: 'arrow',
      parentId: board.id,
      body: JSON.stringify({ from: from.id, to: to.id }),
    });
  on(
    meId,
    'note',
    'Relay 2.0 launch · June 10',
    { x: 96, y: 56, width: 480, height: 40 },
    'heading',
  );
  on(
    meId,
    'note',
    'Product ships it, product marketing says what it is, marketing gets it in front of people.',
    { x: 96, y: 104, width: 720, height: 32 },
  );

  on(jon.id, 'frame', 'Product', { x: 80, y: 208, width: 368, height: 440 });
  const cardRoadmap = card(jon.id, roadmap, { x: 104, y: 232, width: 320, height: 176 });
  on(
    jon.id,
    'sticky',
    'Queue view is the risk. Design review Tuesday.',
    { x: 104, y: 432, width: 152, height: 152 },
    'pink',
  );
  const ready = on(
    jon.id,
    'shape',
    'Feature complete May 27',
    { x: 272, y: 448, width: 152, height: 104 },
    'ellipse',
  );

  on(maya.id, 'frame', 'Product marketing', { x: 480, y: 208, width: 368, height: 440 });
  const cardPositioning = card(maya.id, positioning, { x: 504, y: 232, width: 320, height: 176 });
  const cardPricing = card(meId, pricing, { x: 504, y: 432, width: 320, height: 152 });
  const priced = on(
    meId,
    'shape',
    'Price locked by May 30',
    { x: 560, y: 592, width: 208, height: 48 },
    'rect',
  );

  on(meId, 'frame', 'Marketing', { x: 880, y: 208, width: 368, height: 440 });
  const cardChannels = card(meId, channels, { x: 904, y: 232, width: 320, height: 176 });
  const cardAnnouncement = card(maya.id, announcement, { x: 904, y: 432, width: 320, height: 152 });
  on(
    maya.id,
    'sticky',
    'Webinar date depends on the queue view shipping.',
    { x: 1272, y: 232, width: 152, height: 152 },
    'yellow',
  );

  arrow(cardRoadmap, cardPositioning);
  arrow(cardPositioning, cardChannels);
  arrow(cardPricing, cardAnnouncement);
  arrow(ready, cardPricing);
  void priced;
  on(meId, 'plan', '', { x: 80, y: 688, width: 448, height: 300 });

  // ---- Conversations
  const general = store
    .snapshot(meId, [], { id: 'x', label: 'x' })
    .conversations.find((c) => c.kind === 'channel' && c.spaceId === spaceId);
  const launch = store.createChannel(maya.id, spaceId, 'launch');
  const feedback = store.createChannel(jon.id, spaceId, 'beta-feedback');
  const say = (who, conversationId, text, extra = {}) =>
    store.postMessage(who, { conversationId, text, ...extra });
  if (general) {
    store.setPin(meId, general.id, board.id, true);
    say(
      jon.id,
      general.id,
      'Suggested replies and handoff notes are feature complete. Queue view goes to design review Tuesday.',
    );
  }
  store.setPin(maya.id, launch.id, positioning.id, true);
  store.setPin(meId, launch.id, channels.id, true);
  const first = say(
    maya.id,
    launch.id,
    'Positioning is locked. The one line is in the doc; please use it as written.',
  );
  store.toggleReaction(jon.id, first.id, '✅');
  store.toggleReaction(meId, first.id, '✅');
  say(jon.id, launch.id, 'Does "days, not weeks" hold for teams over 50?', { replyTo: first.id });
  say(maya.id, launch.id, 'Beta data is 10 to 50 only. I will keep the claim scoped to that.', {
    replyTo: first.id,
  });
  const spend = say(
    meId,
    launch.id,
    'Paid social is most of the budget for the fewest signups per dollar. Worth a second look.',
    {
      embed: { resourceId: channels.id, from: 3, to: 5 },
    },
  );
  store.toggleReaction(maya.id, spend.id, '👀');
  say(
    jon.id,
    feedback.id,
    'Three beta teams asked for suggested replies in their second language.',
  );
  say(maya.id, feedback.id, 'Quote we can use: "My new hire answered alone on day four."');

  // Comments sit beside the text they are about.
  const feed = store.openDiscussion(jon.id, positioning.id);
  const comment = say(
    jon.id,
    feed.id,
    'Can we say "in under a week"? Days is vague next to the 19 to 6 number.',
    {
      anchor: {
        resourceId: positioning.id,
        quote: 'Relay 2.0 gets a new support agent answering on their own in days, not weeks.',
      },
    },
  );
  say(maya.id, feed.id, 'I like the rhythm of the current line, but open to it. Dylan?', {
    replyTo: comment.id,
  });

  const dm = store.openDm(maya.id, meId);
  say(maya.id, dm.id, 'Can you settle the Team price before Thursday? The deck is waiting on it.');
}
