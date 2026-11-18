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

---
## TASK 2 (branch template-ui, worktree /workspace/oryxa-template) — Raycast-STYLE full-site restyle
Style inspiration only (dark bg, glow gradients, glass panels, type scale, spacing, nav, section rhythm, micro-animations).
NEVER copy Raycast code/copy/logos/images/icons. Original OnlyOrders content. Reference screenshots (look only, do NOT commit): /workspace/raycast-ref/{desktop,android}.png
Keep phone chat demo (HeroInteractiveAd) on the right of the hero. Responsive Android 412 + desktop 1440. prefers-reduced-motion.
Do NOT touch: apps/web/app/login/** logic, apps/api/**, packages/**, auth code. Never push.
Self-test: web runs at http://127.0.0.1:3410 (after build) — use Playwright.

### Ownership
- GLM Code (GLM-5.3): apps/web/app/page.tsx, apps/web/components/raycast-sections.tsx, new apps/web/components/marketing/** (nav, footer, glow bg), marketing-only styles scoped inside those components.
- Qoder (DeepSeek-Flash → Qwen3.8-Flash): e2e/template-ui.spec.ts (desktop 1440 + Android 412, no horizontal overflow, hero phone visible, screenshots to /workspace/oryxa-shots/template-ui-*.png).
- OmniRouter: testing/screenshots only.
### Progress log (task 2)
- 12:20 orchestrator: worktree + branch created, raycast refs captured.
- 13:28 Qoder: e2e/template-ui.spec.ts created (desktop 1440x900 + Android 412x915, overflow/hero/phone/nav checks, screenshots to /workspace/oryxa-shots/template-ui-*.png); 2 passed.
- 13:55 GLM-5.3: task 2 restyle done in owned files only. page.tsx rebuilt on shared marketing shell: new components/marketing/{nav,footer,glow,cta-banner,primitives}.tsx (floating glass nav + mobile menu, footer glow hairline + columns, fixed ambient glow/grid bg, CTA banner, SectionHeading/Eyebrow/Reveal/GlowCard primitives, scoped `oo-*` styles with prefers-reduced-motion kill-switch). raycast-sections.tsx restyled: command-palette window (query filter + run feedback + kbd hints), pillar bento + capability mini-tiles, tabbed channel showcase, testimonials, stats strip. Pricing rebuilt (glass cards, gradient-border featured Pro, compare table, trust grid). HeroInteractiveAd stays right of hero (#live-demo); anchors #workflow/#pricing preserved. Verify: bun --filter web build passes; Playwright self-checks at 3411: h1/header/phone-demo visible, zero horizontal overflow at 1440 and 412, reduced-motion context shows content immediately (opacity 1). No commit/push. Note: port 3410 holds a pre-existing next dev server with 403 chunk errors (not touched); self-test used 3411.

## 2026-10-22 template-ui v2 (home)
- Removed "Less busywork. More momentum." section (raycast-sections.tsx deleted).
- Added original HomeBento (12-col feature bento: Messenger AI, in-chat checkout, orders dashboard, courier tracking + 3-step row); hero phone demo kept.
- Figma reference not fetched (no token); OpenCode glm/deepseek free + Qoder DeepSeek-Flash hung with no output, so coded directly.
- Build OK, Playwright desktop+Android pass; :3410 restarted.

## 2026-10-22 HomeBento → animated workflow
- Library: Motion (motion/react, MIT) with LazyMotion+domAnimation, useInView, useReducedMotion — IntersectionObserver-based lazy triggers, WAAPI transform/opacity at 60fps, about 30KB gz vs GSAP+ScrollTrigger 44KB.
- Code written by OpenCode deepseek-v4.1-flash-free (Z Code CLI: Model creation failed; OpenCode glm-5.3-flash-free ran out before writing).
- Autoplay 3.5s loop while in view, click to select, mobile chips, reduced-motion static final states. e2e/home-motion.spec.ts + video.

## 2026-11-19 UI polish pass
- Browser rule: Obscura only for local screenshots/DOM checks; Chromium/Playwright browsers banned. Documented in AGENTS.md + agent.md (with the working `obscura mcp --http` recipe).
- NVIDIA Inception badge: replaced the skewed mark with an accurate eye SVG; compact 30px band + inline caption (no green halo); footer mark 26px.
- Console sidebar: grouped nav (Workspace / Growth / Manage), featured AI Assistant card, real plan name in the workspace switcher, working Ctrl/Cmd+K search that routes to `/search`.
- AI Assistant chat: quota pill + meter, suggestion cards, avatars, typing dots, copy reply, auto-grow composer, Enter send / Shift+Enter newline, New chat.
- Landing chat: redesigned panel (online header, suggestion chips, avatars, typing dots, Esc close, mobile full-screen) and portaled above the cookie banner.
- Verify: `bun --filter web build` green.

## 2026-11-19 UI review pass (screenshots via Obscura)
- NVIDIA badge: switched to the supplied official PNG at `apps/web/public/badges/nvidia-inception-member.png` (38px band, 30px footer), removed the re-drawn SVG and the redundant caption line.
- Landing chat: sits above the cookie banner instead of covering it (launcher + panel lift by the banner's height, measured and re-measured on dismiss); panel 560px; suggestion chips no longer wrap ("Pricing & plans" / "Bangla replies" / "Connect Messenger").
- Sidebar: assistant sub-label shortened to "Ask about your store"; arrow is now a ghost icon (no grey block); active card keeps a solid fallback colour under the gradient.
- Assistant: greeting changed to "How can I help?" with a neutral subtitle.
- Verify: `bun --filter web build` exit 0; desktop landing, chat, footer, and console (sidebar + assistant) screenshotted.

## 2026-11-19 second UI pass (badge scale + live chat polish)
- NVIDIA badge: middle 50px with a gentle 5px float (respects prefers-reduced-motion); footer 56px so it is never smaller than the middle one. Both use the official PNG.
- Landing live chat: gradient header with "AI" tag and online line, orb welcome ("Ask me anything"), three full-width suggestion cards with icons/arrows, gradient composer inside a pill, start-over button, hover tooltip on the launcher, pulsing halo, footer disclaimer. Panel 404×600.
- Sidebar: assistant entry now shows a green online dot and the "Live chat · ask anything" sub-label.
- Verify: `bun --filter web build` exit 0; desktop + mobile chat screenshotted.
