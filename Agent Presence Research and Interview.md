# Agent identity, presence and conversation — research and interview

October 30, 2026. This is the resumed research/interview requested by the user, not an approved redesign or implemented agent UI. No app source or user preview data changed in this cycle.

## Corrections and confirmed answers

- “No document viewer on the graph view” means **missing/broken functionality**. The user explicitly expects to read documents while on Graph. It does not mean removing Graph reading. Do not repeat that ambiguity or treat it as a requirement to leave Graph for every document.
- Dots means OpenAI's product. The requested comparison concerns visual agent styling and presentation, as well as creation and interaction; a settings/lifecycle checklist alone is insufficient.
- Grok Bot is the other named reference. The user explicitly wants us to resolve how agent identities appear around/on Graph and on Canvas.
- Chat remains rejected. The user says it has not meaningfully changed and explicitly requests consequential questions before another implementation. The prior “beside work” choice does not establish approval of a fixed full-height column or moving the floating composer into it.
- Preserve the earlier confirmed choice that agents may contribute unsolicited replies, while retaining privacy and shared-change approval rules.

## Primary references actually inspected

### OpenAI Dots

[Official Dots documentation](https://learn.chatgpt.com/docs/dots) describes persistent named agents and customizable characters. The documentation was also opened in the browser: its character illustration and conversation presentation were visually inspected. The observed example is a soft blue character with eyes and a dark beret. It is a persistent identity rather than a generic tool/settings symbol. Naming and appearance belong to the same agent that continues across interactions. This observation does not authorize copying its mascot artwork or its entire chat layout.

### Grok Bot

[Official design study](https://x.ai/news/designing-grok-bot) was read and its visual examples inspected in the browser. The study compares avatar directions, then shows a coherent family of colored geometric characters with expressive eyes. Identity remains legible at small scale; animation communicates activity. More execution detail is revealed on demand. Its distinction between agent identity and disposable conversations is useful here. Its transcript can also contain meaningful results and events rather than prose alone.

[Create and manage Bots](https://docs.x.ai/grok-bot/bots) documents deliberate creation, naming and avatar choices, then conversational instruction. [Message and collaborate](https://docs.x.ai/grok-bot/chat-and-collaboration) covers messaging during work and group interaction. These pages establish creation/interaction behavior; this research did not sign in to the actual application or create a Bot.

### OpenDot

[OpenDot's product page](https://opendot.live/) and its [published roster screenshot](https://opendot.live/shots/sidebar-full-light%402x.webp) were inspected. The screenshot uses stable named identities, message previews/unread state, and inline work/delegation results. Its [creation description](https://opendot.live/) presents natural-language responsibility, scoped access and identity. The roster screenshot was visually inspected; creation steps were read from the product page, not executed. Its full chat/sidebar design is not automatically appropriate for this canvas-first workstation.

## Design inferences to discuss, not user decisions

1. Give an agent one recognizable identity reused across chat, Canvas, Graph and the agent roster. Avoid a different icon for the same agent on each surface, or the same workflow glyph for every agent.
2. Separate the persistent agent from its current jobs. A character's appearance should not imply it is continuously executing. Idle, working, waiting for a human, blocked and retired need real state, with an accessible textual equivalent.
3. A proposed Graph treatment is an agent avatar near the resource/folder it is actively using, with an unobtrusive relationship to that resource. The knowledge structure remains legible. A permanent agent node and an activity marker communicate different things; whether both are wanted remains open.
4. On Canvas, an avatar could occupy a consistent presence/control location on its relevant work, opening actual work/result/conversation context. This must respect non-overlap and cannot become another generic settings window or an avatar floating over editable text.
5. Creation should establish a durable responsibility and identity with automatic context inheritance. The user should not assemble context plumbing manually. Both conversational creation and a deliberate Create agent entry point are candidates, not selected requirements.
6. Agent avatar color/personality versus monochrome shell controls remains to clarify. Human profile colors were explicitly allowed; do not silently generalize that into a new colorful shell or assume all agent artwork must be monochrome.
7. The current right-hand agent summary and definition form are not the agent's full presence or working experience. Repainting that form does not answer where agents appear, how they act on knowledge, or where people talk to them.

## Interview currently pending

These questions were presented to the user. No unanswered question is an approval or a new requirement.

- Default conversation: while working on Canvas, who does a request in the floating bar address, and where should the first reply appear? The earlier question remains unanswered.
- Graph presence: avatars at active resources, permanent agent nodes, or both for distinct purposes? Recommendation offered: recognizable avatars near active resources.
- Agent selection: when clicking the avatar on Graph/Canvas, what should appear first—current work/results, conversation, or profile/configuration? Rank if needed.
- Visual identity: soft 3D characters, simple animated shapes, or restrained avatars; whether agent identities may use color while controls remain monochrome.
- Creation: tell an existing agent to create one, use a deliberate Create agent action, or support both? No entry point has been approved.

Follow-up questions should use the answers to explore multi-agent density, an agent working across several resources, proactive updates while another conversation is open, and how a human DM differs from interacting with an agent. Do not restart generic product discovery, ask for a single first use case, or re-ask confirmed privacy/context/approval rules.

Before another UI implementation, produce one integrated, reviewable scenario showing agent identity, Graph reading, creation, ongoing activity and conversation together. Keep references, proposals, confirmed answers and implementation facts distinct. No live avatars, working animations, people, messages or agent results may be fabricated to fill missing services.
