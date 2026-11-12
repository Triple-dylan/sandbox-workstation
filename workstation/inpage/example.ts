// @ts-nocheck
// A clearly labelled example project for the in-page preview. Never used by the real server.
export function seedExample(store, meId: string) {
  // Your own space: only you ever see this.
  const mine = store.personalSpace(meId);
  const reading = store.createFolder(meId, { spaceId: mine, title: 'Reading' });
  const own = (kind, title, body, parentId = null) =>
    store.createResource(meId, { spaceId: mine, kind, title, body, parentId });
  own(
    'doc',
    'Pricing handmade work',
    '# Pricing handmade work\n\nNotes to self. Materials times two, plus time, plus the stall.\n\nAm I pricing the vases too low?',
    reading.id,
  );
  own(
    'doc',
    'Glaze test log',
    '# Glaze test log\n\n- Tide: cone 6, ran slightly\n- Oat: perfect\n- Ember: needs a thicker coat',
    reading.id,
  );
  const week = own('canvas', 'This week', '');
  const mineOn = (kind, body, placement, style) =>
    store.createResource(meId, { spaceId: mine, kind, body, placement, style, parentId: week.id });
  mineOn('note', 'This week', { x: 96, y: 72, width: 336, height: 48 }, 'heading');
  mineOn(
    'sticky',
    'Read the market rules properly before Saturday.',
    { x: 96, y: 144, width: 168, height: 168 },
    'yellow',
  );
  mineOn('sticky', 'Photograph the blue set.', { x: 288, y: 144, width: 168, height: 168 }, 'blue');
  store.createGoal(meId, { spaceId: mine, title: 'Fire the last batch' });

  const maya = store.createHuman('Maya (example)');
  const jon = store.createHuman('Jon (example)');
  const project = store.createProject(meId, 'Pop-up shop (example)');
  const spaceId = project.id;
  store.addMember(meId, spaceId, maya.id);
  store.addMember(meId, spaceId, jon.id);
  const folder = (who, title) => store.createFolder(who, { spaceId, title });
  const page = (who, kind, parentId, title, body, visibility = 'space') =>
    store.createResource(who, { spaceId, kind, title, body, parentId, visibility });
  const vendors = folder(maya.id, 'Vendors');
  const design = folder(jon.id, 'Design');
  const money = folder(meId, 'Money');
  const market = folder(maya.id, 'Market');

  const shortlist = page(
    maya.id,
    'doc',
    vendors.id,
    'Vendor shortlist',
    '# Vendor shortlist\n\nPackaging for 40 pieces. We need boxes by June 5.\n\n## Paperie\n\n$58 for 50 boxes. Recycled card, plain. Delivers in four days.\n\n## Boxwell\n\n$74 for 50 boxes. Printed lid. Ten days.\n\n## North Pack\n\n$61 for 60 boxes. No delivery; pickup only.',
  );
  page(
    maya.id,
    'doc',
    vendors.id,
    'Paperie quote',
    '# Quote 2291\n\n- Boxes: $46\n- Delivery: $12\n- **Total: $58**',
  );
  page(
    maya.id,
    'doc',
    vendors.id,
    'Boxwell quote',
    '# Quote B-118\n\n- Boxes: $62\n- Print: $12\n- **Total: $74**',
  );
  const brief = page(
    jon.id,
    'doc',
    design.id,
    'Signage brief',
    '# Signage brief\n\nOne A-frame, one table banner. Hand-lettered look, two colours. Follow the Table layout and use the Glaze names.',
  );
  page(
    jon.id,
    'doc',
    design.id,
    'Table layout',
    '# Table layout\n\nTall pieces at the back, the three glazes grouped left to right, price cards in front.',
  );
  page(jon.id, 'doc', design.id, 'Glaze names', '# Glaze names\n\n- Tide\n- Oat\n- Ember');
  const budget = page(
    meId,
    'sheet',
    money.id,
    'Budget',
    JSON.stringify({
      rows: [
        ['Item', 'Cost', 'Paid', 'Notes'],
        ['Stall fee', '180', 'yes', 'Deposit $60 due Friday'],
        ['Clay and glaze', '240', 'yes', ''],
        ['Packaging', '58', 'no', 'From the Vendor shortlist'],
        ['Signage', '90', 'no', ''],
        ['Total', '=SUM(B2:B5)', '', ''],
      ],
    }),
  );
  page(
    meId,
    'sheet',
    money.id,
    'Price list',
    JSON.stringify({
      rows: [
        ['Piece', 'Price', 'Made', 'If all sell'],
        ['Cups', '28', '18', '=B2*C2'],
        ['Bowls', '36', '14', '=B3*C3'],
        ['Vases', '60', '8', '=B4*C4'],
        ['', '', '=SUM(C2:C4)', '=SUM(D2:D4)'],
      ],
    }),
  );
  page(
    jon.id,
    'deck',
    design.id,
    'Market day run-through',
    JSON.stringify({
      slides: [
        {
          title: 'Pop-up shop, June 14',
          body: 'Two days at the Dock Street market.\n\n40 pieces, three glazes, one table.',
        },
        {
          title: 'The table',
          body: '- Tall pieces at the back\n- Tide, Oat, Ember left to right\n- Price cards in front',
        },
        {
          title: 'Who does what',
          body: '- Jon: van, load in at 7am\n- Maya: card reader and float\n- Signage up by 8',
        },
      ],
    }),
  );
  page(
    maya.id,
    'doc',
    market.id,
    'Dock Street rules',
    '# Dock Street rules\n\nLoad in from 7am. No open flames. Card payments required. See the Stall confirmation.',
  );
  page(
    maya.id,
    'doc',
    market.id,
    'Stall confirmation',
    '# Stall confirmation\n\nCorner stall 14, both days. Deposit $60 due Friday.',
  );
  page(
    meId,
    'doc',
    null,
    'Notes before I talk to Jon',
    "# Notes before I talk to Jon\n\nAsk if he can lend the van both days. Don't promise the blue set yet.",
    'private',
  );

  const scout = store.newAgent(meId, {
    name: 'Scout',
    purpose: 'Compare vendors and prices',
    instructions: 'Keep the vendor shortlist current. Flag any quote that changes.',
    spaceId,
  });
  const step = (title: string, patch = {}) => {
    const goal = store.createGoal(meId, { spaceId, title });
    store.updateGoal(meId, goal.id, patch);
  };
  step('Book the stall', { ownerId: maya.id, due: '2027-05-20', done: true });
  step('Choose packaging', { ownerId: jon.id, agentId: scout.id, due: '2027-05-30' });
  step('Price list and signage', { ownerId: meId, due: '2027-06-06' });
  step('Load in', { ownerId: jon.id, due: '2027-06-13' });

  // The canvas: a board everyone arranges together, with pages on it as live cards.
  const board = page(meId, 'canvas', null, 'Launch board', '');
  const on = (who, kind, body, placement, style, title) =>
    store.createResource(who, { spaceId, kind, body, placement, style, title, parentId: board.id });
  on(meId, 'note', 'Pop-up shop, June 14', { x: 96, y: 64, width: 400, height: 40 }, 'heading');
  on(meId, 'note', 'Two days at the Dock Street market. 40 pieces, three glazes, one table.', {
    x: 96,
    y: 112,
    width: 400,
    height: 48,
  });
  on(maya.id, 'frame', 'Packaging', { x: 80, y: 224, width: 696, height: 392 });
  const cardShortlist = on(maya.id, 'embed', JSON.stringify({ resourceId: shortlist.id }), {
    x: 104,
    y: 248,
    width: 304,
    height: 184,
  });
  const choose = on(
    maya.id,
    'shape',
    'Choose by May 30',
    { x: 480, y: 280, width: 200, height: 112 },
    'diamond',
  );
  const cardBudget = on(meId, 'embed', JSON.stringify({ resourceId: budget.id }), {
    x: 440,
    y: 432,
    width: 312,
    height: 168,
  });
  on(
    jon.id,
    'sticky',
    'Boxwell is ten days. Too slow?',
    { x: 104, y: 448, width: 152, height: 152 },
    'pink',
  );
  on(
    maya.id,
    'sticky',
    'Paperie can deliver to the stall.',
    { x: 272, y: 448, width: 152, height: 152 },
    'green',
  );
  store.createResource(maya.id, {
    spaceId,
    kind: 'arrow',
    parentId: board.id,
    body: JSON.stringify({ from: cardShortlist.id, to: choose.id }),
  });
  store.createResource(meId, {
    spaceId,
    kind: 'arrow',
    parentId: board.id,
    body: JSON.stringify({ from: choose.id, to: cardBudget.id }),
  });
  on(jon.id, 'frame', 'Look and layout', { x: 824, y: 224, width: 560, height: 392 });
  on(jon.id, 'embed', JSON.stringify({ resourceId: brief.id }), {
    x: 848,
    y: 248,
    width: 288,
    height: 160,
  });
  const swatch = (from: string, to: string) => {
    const c = document.createElement('canvas');
    c.width = 480;
    c.height = 360;
    const g = c.getContext('2d')!;
    const fill = g.createLinearGradient(0, 0, 480, 360);
    fill.addColorStop(0, from);
    fill.addColorStop(1, to);
    g.fillStyle = fill;
    g.fillRect(0, 0, 480, 360);
    return c.toDataURL('image/jpeg', 0.8);
  };
  on(
    jon.id,
    'image',
    swatch('#e3d5bf', '#b9a184'),
    { x: 1160, y: 248, width: 200, height: 160 },
    null,
    'Glaze reference: Oat',
  );
  on(
    jon.id,
    'image',
    swatch('#b8c4b0', '#e6ddd0'),
    { x: 848, y: 432, width: 288, height: 160 },
    null,
    'Table reference',
  );
  on(
    jon.id,
    'sticky',
    'I can drive both days. Need the load list by June 10.',
    { x: 1160, y: 432, width: 168, height: 168 },
    'yellow',
  );
  on(meId, 'plan', '', { x: 824, y: 664, width: 440, height: 300 });

  const general = store
    .snapshot(meId, [], { id: 'x', label: 'x' })
    .conversations.find((c) => c.kind === 'channel' && c.spaceId === spaceId);
  const logistics = store.createChannel(maya.id, spaceId, 'logistics');
  const say = (who, conversationId, text, extra = {}) =>
    store.postMessage(who, { conversationId, text, ...extra });
  if (general) {
    store.setPin(maya.id, general.id, shortlist.id, true);
    store.setPin(meId, general.id, budget.id, true);
    const first = say(
      maya.id,
      general.id,
      'Corner stall is confirmed. Deposit is due Friday. I put the confirmation in Market.',
    );
    store.toggleReaction(jon.id, first.id, '🎉');
    store.toggleReaction(meId, first.id, '🎉');
    say(jon.id, general.id, 'Nice. Do we know which packaging yet?', { replyTo: first.id });
    say(maya.id, general.id, 'Three quotes are in the vendor shortlist. Paperie looks cheapest.', {
      replyTo: first.id,
    });
    const money = say(meId, general.id, 'Packaging and signage are the two lines still unpaid.', {
      embed: { resourceId: budget.id, from: 3, to: 5 },
    });
    store.toggleReaction(maya.id, money.id, '👀');
    say(jon.id, general.id, 'Signage brief is up in Design if anyone wants to look.');
  }
  say(jon.id, logistics.id, 'Load in is 7am. I will bring the van round at 6:15.');
  say(maya.id, logistics.id, 'I will bring the card reader and float.');

  // Comments on a page sit beside the text they are about.
  const feed = store.openDiscussion(jon.id, shortlist.id);
  const comment = say(jon.id, feed.id, 'Is that four working days? June 5 is tight if not.', {
    anchor: { resourceId: shortlist.id, quote: 'Delivers in four days.' },
  });
  say(maya.id, feed.id, 'Working days. I asked them to confirm.', { replyTo: comment.id });
  say(maya.id, feed.id, 'I will update this when North Pack reply about delivery.');

  const dm = store.openDm(maya.id, meId);
  say(maya.id, dm.id, 'Can you look at the price list before Thursday?');
}
