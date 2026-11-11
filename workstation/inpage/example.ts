// @ts-nocheck
// A clearly labelled example project for the in-page preview. Never used by the real server.
export function seedExample(store, meId: string) {
  const maya = store.createHuman('Maya (example)');
  const jon = store.createHuman('Jon (example)');
  const project = store.createProject(meId, 'Pop-up shop (example)');
  const spaceId = project.id;
  store.addMember(meId, spaceId, maya.id);
  store.addMember(meId, spaceId, jon.id);
  const folder = (who, title, parentId = null) =>
    store.createFolder(who, { spaceId, title, parentId });
  const doc = (who, parentId, title, body, placement = null) =>
    store.createResource(who, { spaceId, kind: 'doc', title, body, parentId, placement });
  const note = (who, body, x, y, width = 336, visibility = 'space') =>
    store.createResource(who, {
      spaceId,
      kind: 'note',
      body,
      visibility,
      placement: { x, y, width, height: 24 * Math.max(2, Math.ceil(body.length / 36) + 1) },
    });

  const vendors = folder(maya.id, 'Vendors');
  const design = folder(jon.id, 'Design');
  const money = folder(meId, 'Money');
  const market = folder(maya.id, 'Market');

  doc(
    maya.id,
    vendors.id,
    'Vendor shortlist',
    '# Vendor shortlist\n\nPackaging for 40 pieces. We need boxes by June 5.\n\n## Paperie\n$58 for 50 boxes. Recycled card, plain. Delivers in four days.\n\n## Boxwell\n$74 for 50 boxes. Printed lid. Ten days.\n\n## North Pack\n$61 for 60 boxes. No delivery; pickup only.',
    { x: 432, y: 384, width: 288, height: 120 },
  );
  doc(
    maya.id,
    vendors.id,
    'Paperie quote',
    '# Quote 2291\n\n- Boxes: $46\n- Delivery: $12\n- **Total: $58**',
  );
  doc(
    maya.id,
    vendors.id,
    'Boxwell quote',
    '# Quote B-118\n\n- Boxes: $62\n- Print: $12\n- **Total: $74**',
  );
  doc(
    jon.id,
    design.id,
    'Signage brief',
    '# Signage brief\n\nOne A-frame, one table banner. Hand-lettered look, two colours.',
  );
  doc(
    jon.id,
    design.id,
    'Table layout',
    '# Table layout\n\nTall pieces at the back, the three glazes grouped left to right, price cards in front.',
  );
  doc(jon.id, design.id, 'Glaze names', '# Glaze names\n\n- Tide\n- Oat\n- Ember');
  doc(
    meId,
    money.id,
    'Budget',
    '# Budget\n\n| Item | Cost |\n| --- | --- |\n| Stall fee | $180 |\n| Clay and glaze | $240 |\n| Packaging | $58 |\n| Signage | $90 |\n| **Total** | **$568** |',
    { x: 96, y: 528, width: 288, height: 120 },
  );
  doc(meId, money.id, 'Price list', '# Price list\n\n- Cups: $28\n- Bowls: $36\n- Vases: $60');
  doc(
    maya.id,
    market.id,
    'Dock Street rules',
    '# Dock Street rules\n\nLoad in from 7am. No open flames. Card payments required.',
  );
  doc(
    maya.id,
    market.id,
    'Stall confirmation',
    '# Stall confirmation\n\nCorner stall 14, both days. Deposit $60 due Friday.',
  );

  note(
    meId,
    'Pop-up shop, June 14. Two days at the Dock Street market. 40 pieces, three glazes, one table.',
    96,
    96,
  );
  note(maya.id, 'Dock Street confirmed the corner stall. Deposit is due Friday.', 96, 240, 288);
  note(jon.id, 'I can drive both days. Need the load list by June 10.', 432, 240, 288);
  note(
    meId,
    "Ask Jon if he can lend the van. Don't promise the blue set yet.",
    96,
    384,
    336,
    'private',
  );

  const general = store
    .snapshot(meId, [], { id: 'x', label: 'x' })
    .conversations.find((c) => c.kind === 'channel' && c.spaceId === spaceId);
  const logistics = store.createChannel(maya.id, spaceId, 'logistics');
  const say = (who, conversationId, text, replyTo = null) =>
    store.postMessage(who, { conversationId, text, replyTo });
  if (general) {
    const first = say(
      maya.id,
      general.id,
      'Corner stall is confirmed. I put the confirmation in Market.',
    );
    say(jon.id, general.id, 'Nice. Do we know which packaging yet?', first.id);
    say(
      maya.id,
      general.id,
      'Three quotes are in the vendor shortlist. Paperie looks cheapest.',
      first.id,
    );
    say(jon.id, general.id, 'Signage brief is up in Design if anyone wants to look.');
  }
  say(jon.id, logistics.id, 'Load in is 7am. I will bring the van round at 6:15.');
  say(maya.id, logistics.id, 'I will bring the card reader and float.');
  const dm = store.openDm(maya.id, meId);
  say(maya.id, dm.id, 'Can you look at the price list before Thursday?');
}
