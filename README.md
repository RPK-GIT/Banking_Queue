# Smart Bank Queue

**Fair. FIFO. Transparent.**

A single-screen, executive-demo-quality prototype of a centralized FIFO token
and queue management system for bank branches.

## What it demonstrates

In a traditional branch, a customer whose request spans several counters
(e.g. Account Opening: Counter 1 → Counter 5 → Counter 3 → Counter 1)
effectively *loses their place* every time they move, because no counter knows
when their overall journey started. This causes arguments, queue jumping,
perceived unfairness and employee stress.

Smart Bank Queue fixes this with one simple idea:

> **One token per customer, for the entire journey.**
> When a counter finishes its part, it transfers the *same token* to the next
> counter's queue — always appended to the **end** (strict FIFO), with the
> complete journey history preserved and visible.

The app is a **fixed single-screen branch operations workspace** (no page
scrolling at desktop resolutions): a collapsible left control pane (reception
+ demonstration controls), a compact executive KPI strip, a full-height Live
Queues board for all five counters (long queues collapse behind "+ N more
waiting" and scroll inside their card), a Live Activity slide-over drawer, a
per-token journey dialog with a full audit trail, and a floating **Customer
View** (simulated WhatsApp) so the manager sees the bank view and the
customer view side by side. A scripted **Live Demo** walks a manager through
the whole concept in about a minute.

## How to run

```bash
npm install
npm run dev       # open http://localhost:3005
```

Other commands:

```bash
npm test          # unit tests for the queue business logic (Vitest)
npm run build     # production build
npm run lint      # ESLint
node scripts/smoke.mjs   # optional: Playwright smoke test (needs `npm run dev` running; uses system Edge)
```

No backend or database — all state is in memory, seeded with a realistic
scenario, and persisted to `localStorage` so a refresh keeps the demo state.

## How to demonstrate it to a bank manager

1. Open the app — it is pre-seeded with ~14 customers across 5 counters.
2. Click the **T-101** card at Counter 3: Ravi Kumar's journey shows
   Counter 1 ✓ → Counter 5 ✓ → Counter 3 ● → Counter 1 ○, with timestamps.
   *This is the core message: the token follows the customer.*
3. Click **▶ Start Live Demo**. A scripted, narrated 20-step scenario runs: a
   new customer (T-115) gets a token, waits her turn at Counter 1, is
   transferred to the **end** of Counter 5's queue, then Counter 3, and finally
   completes — while T-101 finishes his 4-counter journey.
4. Click **⏸ Pause** at any point. Pause freezes the *simulation engine only* —
   the dashboard stays fully interactive. Click **💬 Customer View**
   (bottom-right), pick a customer to open their simulated WhatsApp phone,
   switch phones, scroll conversations, compare with the Journey dialog (bank
   view vs customer view), change speed (0.5× / 1× / 2× / 4×), or click
   **⏭ Step** to run exactly one event at a time. **▶ Resume** continues from
   the exact remaining time — no restarted, skipped or duplicated events.
5. Try it manually: **Issue Token**, then **Transfer** someone from a counter —
   the confirmation shows their new position at the end of the destination queue.

## Architecture

```
src/
  lib/
    types.ts          # Customer, JourneyStep, Counter, Activity, QueueState
    queue-logic.ts    # PURE business logic: issueToken, callNextCustomer,
                      # completeCurrentService, transferCustomer, queuePosition
    seed.ts           # demo scenario, built by REPLAYING real operations
    queue-store.ts    # Zustand store: wraps the pure logic, adds persistence
                      # (localStorage) and the demo ENGINE (play/pause/resume/
                      # step/speed) — engine state is separate from UI state
    whatsapp.ts       # customer WhatsApp view DERIVED from queue state —
                      # frozen automatically while paused, duplicates impossible
    format.ts         # time/duration formatting
  hooks/use-now.ts    # 1s ticker for live clocks and wait times
  components/
    dashboard.tsx     # fixed app shell: collapsible left pane + KPI strip +
                      # full-height queue board + activity drawer (no page scroll)
    app-header.tsx, kpi-strip.tsx, new-customer-card.tsx, demo-controls.tsx
    queue-board.tsx, counter-column.tsx, customer-card.tsx
    journey-dialog.tsx, transfer-dialog.tsx, activity-feed.tsx, why-panel.tsx
    whatsapp-dock.tsx # floating simulated customer phone — always interactive
    ui/               # shadcn/ui components (Base UI primitives)
```

Key design decision: **all queue manipulation lives in `queue-logic.ts` as
pure functions** operating on a plain `QueueState`. React components never
touch queues directly; the Zustand store clones state, applies a pure
operation, commits and persists. This makes the business rules unit-testable
and impossible to bypass from the UI. The seed and the demo script reuse the
same operations, so every state the app can show is a state the rules allow.

## Business rules (enforced centrally)

1. **Unique token** — every customer gets a unique sequential token (T-101…).
2. **FIFO** — customers entering a queue are always appended to the end.
3. **No manual queue jumping** — there is deliberately no drag-and-drop.
4. **Transfer** — removes the customer from their current counter, appends to
   the **end** of the destination queue, preserves token + journey history.
5. **Journey history** — a complete audit trail (entered/started/completed per
   counter) is kept and shown in the token dialog.
6. **Service completion ≠ journey completion** — finishing at one counter and
   transferring does not complete the customer; only an explicit final
   completion does.
7. **Queue position is derived** — computed from queue order, never stored.
8. **One queue at a time** — a customer waits at exactly one counter.
9. **Only the first waiting customer can be called** next at a counter.
10. **Transfer confirmation** — shows the new position in the destination queue.

## Tech stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript (strict) ·
Tailwind CSS 4 · shadcn/ui on Base UI · Zustand · Motion (Framer Motion
successor) · Lucide icons · Sonner toasts · Vitest.

## Tests

`src/lib/queue-logic.test.ts` covers: empty-queue entry, second/third behind
first, first served before second, transfer appended to destination end,
destination priority retained, journey preservation across counters,
per-counter completion not completing the journey, final completion, and
deterministic seeded reset.

`src/lib/demo-engine.test.ts` covers the pause semantics with fake timers:
pause stops the timer and all automated events, manual interactions still work
while paused, resume continues from the exact remaining time, speed changes
while paused apply only on resume, Step runs exactly one event and stays
paused, full runs produce no duplicate events, and replay/reset behave.

`src/lib/whatsapp.test.ts` covers the derived customer view: full conversation
for a multi-counter journey, completion message, purity (identical state →
identical messages, so nothing changes or duplicates while paused), and
queue/position/estimated-wait snapshots.

`scripts/pause-validation.mjs` drives the full presenter workflow in a real
browser: start → pause → inspect WhatsApp → switch customers → journey dialog
→ speed change → step → resume → completion, asserting zero console errors.
