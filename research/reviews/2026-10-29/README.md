# October 29 review evidence

Source revision: `c98ba8a`. Isolated browser contexts on the existing local port 4174; contexts closed after each probe. The user's preview storage and UI were not reset or populated.

| Artifact | Meaning |
| --- | --- |
| `layout-probe.json` | Settled 1280 → 900 → 1280 layout observations, preset shape and visual/resource-model gap. It corrects an immediate return sample that had not yet settled. |
| `durability-probe.json` | Controlled localStorage quota fault during image replacement. Old 630 × 512 metadata points to new 1914 × 1346 pixels after reload. No real browser quota exhaustion was asserted. |
| `semantics-probe.json` | Closed-pin full-text and image-caption search each return zero results; one source remains limited to one step; no matching lifecycle/recovery controls in the exercised state. |
| `canvas-1280-before-tools.png`, `canvas-1440-before-tools.png` | Three intentionally created content objects before Project tools opens. |
| `canvas-1280-with-tools.png`, `canvas-1440-with-tools.png` | Opening utilities focuses the last-added image and hides the pin/plan. |
| `canvas-1280-narrow.png`, `canvas-1440-narrow.png` | Narrow 900 × 650 state reached from each starting viewport. Filenames retain the starting viewport for comparison. |
| `replacement-metadata-mismatch.png` | Image reference with old filename after its Blob was overwritten. The image pixels themselves contain an old overlap screenshot; this is evidence of replacement inconsistency, not new persistent-module overlap. |
| `pin-search-no-results.png` | A retained closed pin cannot be found by a word beyond its displayed 65-character prefix. |

Reproduction steps, source causes, research and ranked remedies are in `../../../Workstation Review 2026-10-29.md`. No application source was changed to produce this evidence. The fault injector modifies `Storage.prototype.setItem` only in its disposable browser context.
