# Room View premium stage upgrade

This change is limited to Room View presentation and its polling response. It
preserves the current layout structure, contribution queue, authorization,
projection pointers, polling/cancellation logic and fullscreen controls. No
schema, production credential or participant/admin flow changes are required.

## Stage design

- Existing emblem reused as a large, monochrome lavender watermark at 5.2%
  opacity, rotating once every 54 seconds. It is decorative, noninteractive and
  below the content; reduced motion makes it static.
- Midnight tonal foundation, slow edge illumination, faint orbital contours,
  wing lighting and a soft floor/edge treatment frame the main presentation.
  Redundant old ambient animation nodes were removed. No particles, new image
  assets or animation dependencies were added.
- Header integrates a mobile-visible state pill, restrained brand treatment,
  chapter accents and a stable topic band. Topic updates arrive through the
  existing Room-only polling endpoint and no longer depend on contribution keys.
- Cream editorial contribution typography, quieter metadata and length-aware
  projector scaling preserve the message hierarchy through 4K. Long text retains
  readable minimum sizes and scrolls within the reserved reading area.
- A bounded, local frame-timing assessment selects full ambient motion or static
  secondary lighting on slower displays. The emblem keeps its slow rotation in
  normal mode; reduced motion stops all decoration. The check reruns on resize
  or motion-preference changes and records no participant data.
- Waiting, paused, closed, prompt and reflection states share the same visual
  system; prompt/reflection swaps use restrained exit/reveal transitions.
  Ambient movement never translates the settled contribution itself.

## Verification record

Final checks passed: 42 unit tests; lint; `cf-build`; `cf-bundle`; Cloudflare
preview on five routes and eight static assets; and 79 relevant browser tests
across seven specs. Selected runs have zero skipped, unexpected or flaky tests.
Intermediate diagnostic failures and interrupted runs are not counted as passes.

- 30 short/medium/1,000-character combinations cover all five projector sizes in
  normal and reduced motion, with entrance/settled captures and no polling replay.
- Nine dedicated checks cover the watermark, stationary reading geometry,
  actual fullscreen entry/exit, topic updates without contribution replay, and
  six stage modes at each projector size.
- Existing projection supersession, controls, queue, poll/reflect state recovery
  and keyboard protections passed. Twelve Axe/keyboard cases passed; gradient
  contrast still has manual-review limitations, so this is not certification.
- All 47 visual baselines passed in comparison mode after updating only the
  15 Room/long-projection images. The 32 other-page baselines were preserved byte
  for byte. Long content remains scrollable rather than being shrunk below its
  readable minimum.

The 4K steady-state profile disables trace/video capture and measures two seconds
after the quality assessment and 30 warm-up frames:

| Mode | Frames | Median / p95 interval | Long tasks |
| --- | --- | --- | --- |
| Normal, quiet secondary effects | 52 | 33.4 / 50.1 ms | 0 |
| Reduced motion | 121 | 16.7 / 16.8 ms | 0 |

The rotating watermark remained active in normal mode. Early profiles exposed a
software-rendering slowdown with all secondary motion enabled at 4K, motivating
the adaptive fallback. These are headless Chromium scheduling measurements on
this Mac, not physical projector/GPU certification or a universal 60 fps claim.

Evidence and seven representative state screenshots are in
`artifacts/room-stage-upgrade/`. `verification.json` names the selected runs.
No database migration or API Worker deployment was needed.

## Production release

- Implementation commit: `46dc24289103aacbf2770a86afacf20e2ebf9f98`, pushed to
  `main`.
- Pages project: `spill-it`; production deployment:
  `2a2c2883-5c60-4a52-b3ea-0703e22bbb18`.
- Production: `https://spill-it-4rw.pages.dev`.
- Actual production Chromium checks passed at 390×844 reduced motion,
  1920×1080 normal motion, and 3840×2160 in both modes: Room and polling returned
  200, the topic matched the authoritative session, no horizontal overflow or
  runtime errors occurred, and unauthorized viewers had no presenter controls.
- Watermark opacity was 0.052; normal rotation was 54 seconds and reduced-motion
  animation was disabled. Desktop selected full ambient motion, while the 4K
  software-rendered check selected quiet secondary effects with rotation intact.
- Read-only before/after checks preserved all three sessions, the one live
  session, 19 contributions and every presentation pointer, revision and timestamp.
  No event state, credentials or database schema was changed for this release.

Production evidence: `artifacts/room-stage-upgrade/{production,deployment}.json`.
Existing open projector tabs retain their loaded bundle until refreshed; no
forced reload was performed during deployment.
