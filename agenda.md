# agenda.md — single source of truth (read first, append progress at bottom)

## Goal
Redesign home page MIDDLE (apps/web/app/page.tsx) Raycast-inspired (ideas only, no copying).
Remove the `#workflow` section (MotionVideoAd, "you sleep, Oryxa sells"). Replace with polished interactive
sections: command-palette style demo, feature bento grid with hover/glow, keyboard-shortcut / tabbed channel showcase,
testimonials/stats strip. Keep the phone hero (HeroInteractiveAd), the user's dark theme + #5B3DF5 accent, light glass.
Fully responsive (Android 360-412px + desktop). Respect prefers-reduced-motion. NO changes to login, global theme/css, backend.

## Ownership (no overlap)
- Qoder/DeepSeek-Flash: apps/web/components/raycast-sections.tsx (new), apps/web/app/page.tsx (swap section only)
- OmniRouter/orchestrator: e2e/home-redesign.spec.ts, screenshots /workspace/oryxa-shots/
- Forbidden: apps/web/app/login/**, apps/web/app/globals.css, apps/api/**, packages/**

## Checks
bun --filter web build ; bun run test ; npx playwright test e2e/home-redesign.spec.ts

## Progress log
- 11:30 orchestrator: no new remote commits on origin/main; agenda created.
- 2026-10-22: added RaycastSections command center replacement and wired #workflow; web build passes.
