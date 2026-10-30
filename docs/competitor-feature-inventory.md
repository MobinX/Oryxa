# Competitor feature inventory: AiPraktor (video analysed 2026-10-22)
Source: Drive `compitator_vedio.mp4`, 10:41, portrait, Bengali promo animation (UI mockups, not raw screen capture). Full 00:00-10:41 covered. Market: Bangladesh (Taka, Steadfast/Pathao couriers).
Legend: Obs = directly observed, Inf = inferred. Exists in OnlyOrders: unknown until backend repo is reviewed.

| ID | Time | Feature | Key behaviour | Evidence | Priority |
|---|---|---|---|---|---|
| F01 | 00:27-01:10 | Omnichannel inbox | 3-pane (chats/thread/CRM), filters All/Mine/Later/Unread/Open/Done, Messenger/IG/WhatsApp/Web, Done/Snooze/Assign | Obs high | P0 |
| F02 | 01:11-01:45, 03:00-03:19 | Conversational AI sales agent | Batches multi-message input into one reply; understands replies to earlier images | Obs high | P0 |
| F03 | 01:45-02:22 | Product discovery by text/voice/image | Image match against catalog, returns product card with Details | Obs UI, Inf matching | P1 |
| F04 | 02:23-02:41 | In-chat mini storefront & checkout | Webview: carousel, sizes, delivery date, name/phone/address/coupon, Confirm; receipt posted in chat | Obs high | P0 |
| F05 | 03:20-03:59 | FB comment automation + cross-channel memory | Public reply to "Price?" + DM product carousel; remembers customer across days | Obs high | P1 |
| F06 | 04:00-04:35 | Order management | Order list with status pills; status change notifies customer; tracking mini-page | Obs high | P0 |
| F07 | 04:36-04:55 | AI order edits pre-confirmation | Change address / cancel via chat, new receipt | Obs high | P1 |
| F08 | 04:56-05:28 | Stock toggle + CRM reliability | Stock count on: AI says out of stock; CRM shows history, return rate, regional courier success | Obs UI, Inf courier data (med) | P1 |
| F09 | 05:29-06:03 | Courier booking + proactive tracking | "Parcel Book" button; out-for-delivery DMs; WISMO answers; review request | Obs UI, Inf API (med) | P1 |
| F10 | 06:04-06:48 | Follow-ups & broadcasts | Leads pipeline; 24h-window broadcast offer auto-applied; abandoned-cart nudges | Obs high | P2 |
| F11 | 06:49-07:29 | Human takeover + copilot | "." toggles AI off/on; summary + draft replies; Chrome extension over Meta Business Suite | Obs high | P1 |
| F12 | 07:30-08:01 | Complaint tickets | Detect anger, neutral reply, ticket (return/refund/exchange) with owner/status | Obs high | P2 |
| F13 | 08:02-08:30 | No-code AI training / KB | Natural-language rules, unanswered-questions list, phone preview, Update | Obs high | P1 |
| F14 | 08:31-08:58 | Analytics | AI vs human messages, order value, AI vs product-page orders, hot leads | Obs high | P2 |
| F15 | 08:59-10:41 | Pay-per-use billing + onboarding | Per-reply ledger (e.g. 0.116 Tk), connect FB pages, AI credit, Practice Mode, Go Live | Obs high | P2 |

Acceptance criteria and tests: to be written per feature in docs/implementation-roadmap.md once the backend repo is available.
