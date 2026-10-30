# Review after the beside-work trial

App source revision `979a882`, October 29. The user supplied two conflicting conversation states and requested a thoughtful interaction/hierarchy review. No application code changed during this review. All probes used an isolated browser context; user preview records were untouched.

- `probe.mjs` reproduces list/chat styling and geometry, a real pointer drag, inspector/utility styling and overflowing right utilities. The screenshot output path assumes this checkout's location.
- `probe.json` contains observed measurements. A 70 × 50 pointer movement leaves the writing object stationary until release, while its destination outline moves. The rendered grid is 24px and source snapping is 16px. Navigation-to-chat shifts the working canvas 104px.
- `drag-preview.png` records original content and destination outline during the held pointer gesture.
- `utility-overflow.png` uses **60 synthetic local goal records** solely to examine the stated no-scroll requirement. The Goals body changes scrollTop 0 → 220; the stack also changes 0 → 23.5. No real project was changed, and this is not a claim that the user's screenshot contained 60 goals.
- The two supplied conversation screenshots are preserved in `../../../references/chat-list-style-2026-10-29.png` and `../../../references/chat-transcript-style-2026-10-29.png`.

Section 9 of [the review](../../../../Workstation%20Review%202026-10-29.md) distinguishes confirmed corrections, observed defects and proposed remedies. Earlier passing test counts do not establish tactile interaction or visual acceptance.
