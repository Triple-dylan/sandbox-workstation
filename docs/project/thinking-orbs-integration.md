# thinking-orbs integration

## Done

- Branch `cursor/thinking-orbs-character-92f2` off `cursor/agent-character-orb-3f54` (Orb was already live there).
- Installed `thinking-orbs@0.2.0`.
- Vanilla host: `workstation/src/features/agents/thinking-orb.ts` (DropDeployment pattern).
- `Character.tsx` mounts canvas; mapping in `agent-state.ts`.
- Demo run: `cd workstation && npm start` → http://127.0.0.1:4174 (optional `AGENT_WORK_MS=4000` for faster state demos).

## State mapping

| Sandbox | Orb verb |
|---|---|
| idle | breathing |
| working | working |
| waiting (`awaiting_approval`) | shaping |
| failed (<60s) | breathing + paused + grayscale |

## Sizes

18 → preset 20; 26/28/40 → preset 64; drawn at display CSS px.

## Links

- Compare: https://github.com/Triple-dylan/sandbox-workstation/compare/cursor/agent-character-orb-3f54...cursor/thinking-orbs-character-92f2
- Reference search: [orb-reference.md](./orb-reference.md)
- Upstream: https://github.com/Jakubantalik/thinking-orbs · https://orbs.jakubantalik.com
