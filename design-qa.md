# Design QA — World Flight Sim three-column Explore layout

Date: 2026-08-19

## Comparison setup

- Source visual truth, selected-place state: `/var/folders/36/qq47gyfs36q58n1yfbng_bzm0000gn/T/codex-clipboard-3c55f449-bbea-4fb0-b21d-71dae5233197.png`
- Source pixels: 3238 × 1688. This is an approximately @2x capture of a 1619 × 844 CSS layout.
- Implementation, selected-place state: `/tmp/flight-selected-final.png`
- Combined selected comparison: `/tmp/flight-selected-final-comparison.png`
- Source visual truth, search-results state: `/var/folders/36/qq47gyfs36q58n1yfbng_bzm0000gn/T/codex-clipboard-ce68c25e-e0f0-43e6-951a-0d925b72cb41.png`
- Source pixels: 3284 × 1724. This is an approximately @2x capture of a 1642 × 862 CSS layout.
- Implementation, search-results state: `/tmp/flight-search-final.png`
- Combined search comparison: `/tmp/flight-search-final-comparison.png`
- Implementation viewport: 1600 × 844 CSS px at device pixel ratio 1.
- Density normalization: each source was downsampled with aspect ratio preserved and center-fit to 1600 × 844. The small width difference was center-cropped before putting reference and implementation in the same comparison image.
- States: city query `new york` with two results; New York selected with AIR start, 12:00, Clear weather, and 50% fuel.
- Responsive evidence: `/tmp/flight-mobile-selected.png`, captured at 390 × 844 CSS px at device pixel ratio 1.

## Full-view comparison evidence

- The final desktop composition matches the reference's persistent three-column structure: a 300 px aircraft rail, a centered 600–710 px search/setup column, and a 320 px Destinations rail over the live Cesium globe.
- Navigation, the new-aircraft promo, the large `Fly anywhere on Earth` hero, aircraft card, search/results panel, and destination ranking retain the same visual order and above-the-fold hierarchy as the references.
- Search results remain directly below the search bar. Selecting a result replaces only the center results surface with the compact flight-setup panel; the hero, aircraft card, globe, and Destinations panel remain visible.
- The selected setup follows the reference hierarchy: summary header, three-column start/time/weather row, fuel row, and Take Off/Save/Share footer.

## Focused comparison evidence

- The final search comparison was checked at readable scale. The query field and result panel use the same 600 px centered track as the source, with two compact New York rows and location pins.
- The selected comparison was checked at readable scale. The 520 px search field is centered above a 710 px setup panel, matching the reference's intentional width change between the two surfaces.
- The exact World Flight Sim white mark is loaded from the source site's public brand asset. The aircraft preview remains the project's real local Cessna asset rather than a fabricated illustration.
- A separate focused crop was unnecessary because typography, icons, controls, aircraft imagery, and dense setup labels were readable in the 3208 × 884 combined comparisons.

## Required fidelity surfaces

- Fonts and typography: Rajdhani remains the display/UI face, Inter remains the body face, and JetBrains Mono remains the technical-label face. Weight, uppercase treatment, tracking, truncation, and hierarchy match the reference closely without text collisions.
- Spacing and layout rhythm: the outer frame was widened to 1528 px and the desktop grid uses fixed source-like tracks with distributed gaps. The hero, search field, result panel, side rails, compact setup card, and action row align without overlap.
- Colors and visual tokens: the established navy, cyan, muted blue-gray, white, and restrained amber tokens map to the source palette. Active tabs, selected controls, disabled options, borders, and translucent surfaces remain coherent over the globe.
- Image quality and asset fidelity: the live Cesium globe, exact source WFS brand mark, and real local Cessna preview are used. No placeholder image, emoji, handcrafted SVG, or CSS-drawn product illustration remains.
- Copy and content: fixed labels match the reference where the simulator supports them. Unsupported double-click selection is not claimed. Fuel remains expressed in gallons, Clear is the only implemented weather preset, and unavailable Taxi/Approach modes are visibly disabled.

## Interaction, accessibility, and responsiveness verification

- City search for `new york` returned two realistic results directly beneath the input.
- Selecting New York opened setup without starting a flight and reset the scroll container to the top, preventing the hero/promo overlap seen in an intermediate pass.
- Most Visited and Favorites tabs switch correctly; Favorites presents a clear empty state.
- Save toggles to Saved; the time selector changed to 15:00; AIR/RWY availability correctly reflects a city selection.
- At 390 × 844, the setup becomes a single-column scroll surface above the fixed mobile navigation, with all primary controls reachable.
- Semantic labels, selected/pressed/disabled states, alt text, focus treatment, and practical mobile targets remain present.
- Browser console errors after desktop and mobile checks: zero.
- `npm test`: passed, 16 files / 84 tests.
- `npm run build`: passed.

## Findings and comparison history

- P1 — The prior selected state removed the hero and aircraft rail and had no persistent popular-destinations rail. Fixed by keeping all three regions mounted and switching only the center results/setup surface. Final evidence: `/tmp/flight-selected-final-comparison.png`.
- P2 — The first three-column pass used a flexible center track that was materially wider than the source and left undersized side rails. Fixed with the 1528 px frame and 300 / 710 / 320 px desktop tracks. Earlier evidence: `/tmp/flight-search-1600x844.png`; post-fix evidence: `/tmp/flight-search-final-comparison.png`.
- P2 — The first result rows were too tall and visually dense. Fixed by compacting rows to 58 px, centering city labels, and overlaying the search-type tabs in the result header. Post-fix evidence: `/tmp/flight-search-final-comparison.png`.
- P2 — Selecting a result could preserve browser scroll anchoring and pull the hero underneath the promo. Fixed by resetting the Explore scroll container to zero after airport or city selection. Browser evidence confirmed `scrollTop: 0` in the final selected state.
- Remaining P0 findings: none.
- Remaining P1 findings: none.
- Remaining P2 findings: none.

## Follow-up polish

- P3 — The reference uses an H-182 aircraft card and profile avatar, while this simulator intentionally retains its real Cessna 172SP and existing Sound/Controls/Close actions.
- P3 — Fuel assignment changes setup UI only because the current flight model does not simulate fuel mass or consumption.

final result: passed
