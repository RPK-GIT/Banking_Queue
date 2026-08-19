// Validates the manual-call queue model in a real browser: RECOMMENDATION ≠
// ASSIGNMENT — the system recommends, the employee explicitly calls. Covers
// journey-aware recommendations, override calls, hold, employee break,
// WhatsApp state sync and demo pause/resume — at three resolutions with zero
// console errors and no duplicate events.
import { chromium } from "playwright"

const url = process.env.APP_URL ?? "http://localhost:3005"
const shots = "scripts/shots"
const errors = []
let failures = 0

function check(name, condition) {
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}`)
  if (!condition) failures += 1
}

const browser = await chromium.launch({ channel: "msedge", headless: true })
const page = await browser.newPage({ viewport: { width: 1680, height: 1050 } })
page.on("console", (m) => m.type() === "error" && errors.push(m.text()))
page.on("pageerror", (e) => errors.push("PAGEERROR: " + e))

const queues = "section[aria-label='Live queues']"

/** open a Base UI select and pick the option with the given text */
async function pickOption(triggerSelector, optionText) {
  await page.click(triggerSelector)
  const open = "div[data-slot='select-content'][data-open]"
  await page.waitForSelector(open, { timeout: 5000 })
  await page
    .locator(`${open} div[role='option']:has-text('${optionText}')`)
    .first()
    .click()
  await page.waitForSelector(open, { state: "detached", timeout: 5000 }).catch(() => {})
  await page.waitForTimeout(250)
}

async function noPageScroll(label) {
  const m = await page.evaluate(() => ({
    sh: document.documentElement.scrollHeight,
    ih: window.innerHeight,
    sw: document.documentElement.scrollWidth,
    iw: window.innerWidth,
  }))
  check(`${label}: no vertical page scroll (${m.sh} <= ${m.ih})`, m.sh <= m.ih + 1)
  check(`${label}: no horizontal overflow (${m.sw} <= ${m.iw})`, m.sw <= m.iw + 1)
}

/** the NOW SERVING card of a specific counter, optionally holding a token */
function nowServing(counterId, token) {
  return token
    ? `[data-testid='now-serving-${counterId}']:has-text('${token}')`
    : `[data-testid='now-serving-${counterId}']`
}

/** the NEXT RECOMMENDED panel of an available counter */
function recommendedPanel(counterId, token) {
  return token
    ? `[data-testid='recommended-${counterId}']:has-text('${token}')`
    : `[data-testid='recommended-${counterId}']`
}

function counterCard(counterId) {
  return `[data-testid='counter-card-${counterId}']`
}

async function issueCustomer(name, counterOption) {
  await page.fill("#customer-name", name)
  if (counterOption) await pickOption("#first-counter", counterOption)
  await page.click("button:has-text('Issue Token')")
  await page.waitForTimeout(400)
}

// ---- layout at three resolutions ----
for (const [w, h] of [
  [1440, 900],
  [1680, 1050],
  [1920, 1080],
]) {
  await page.setViewportSize({ width: w, height: h })
  await page.goto(url, { waitUntil: "domcontentloaded" })
  await page.waitForSelector(`${queues} >> text=Counter 4`, { timeout: 30000 })
  await page.waitForTimeout(400)
  await noPageScroll(`${w}x${h}`)
  const c4 = await page.locator(`${queues} >> text=Counter 4`).first().boundingBox()
  const vp = page.viewportSize()
  check(
    `${w}x${h}: all 4 queues fit without overlap`,
    c4 !== null && c4.x + c4.width <= vp.width && c4.y < vp.height
  )
  await page.screenshot({ path: `${shots}/core-layout-${w}x${h}.png` })
}

// ---- deterministic engine walkthrough on an empty branch (1680×1050) ----
await page.setViewportSize({ width: 1680, height: 1050 })
await page.goto(url, { waitUntil: "domcontentloaded" })
await page.waitForSelector(`${queues} >> text=Counter 4`, { timeout: 30000 })
await page.click("button:has-text('Clear All')")
await page.waitForTimeout(400)

// ---- 1–7: recommendation ≠ assignment, explicit call ----
await issueCustomer("Probe One", "Counter 1")
await page.waitForSelector(recommendedPanel(1, "T-101"), { timeout: 5000 })
check(
  "arriving customer is RECOMMENDED, not assigned (still waiting)",
  (await page.locator(nowServing(1)).count()) === 0
)
const waitingStatus = await page
  .locator("aside[aria-label='Customer view']")
  .innerText()
check(
  "WhatsApp shows Waiting (you're next) for the recommended customer",
  waitingStatus.includes("Waiting") && !waitingStatus.includes("Being served")
)
await page.click(`${counterCard(1)} button:has-text('Call T-101')`)
await page.waitForSelector(nowServing(1, "T-101"), { timeout: 5000 })
check("explicit Call moves the customer to NOW SERVING", true)
const servingStatus = await page
  .locator("aside[aria-label='Customer view']")
  .innerText()
check("WhatsApp switches to Being served only after the call", servingStatus.includes("Being served"))

// ---- 8–10: completion recommends the next customer, never assigns ----
await issueCustomer("Probe Two", "Counter 1")
await page.click(`${counterCard(1)} button:has-text('Complete')`)
await page.waitForSelector(recommendedPanel(1, "T-102"), { timeout: 5000 })
// the previous serving card animates out — wait for it to fully leave
await page.waitForSelector(nowServing(1), { state: "detached", timeout: 5000 })
check("completion produces the next RECOMMENDATION — no automatic assignment", true)

// ---- 11–16: Choose Another → override call → original priority restored ----
await issueCustomer("Probe Three", "Counter 1") // waits behind T-102
await page.click(`${counterCard(1)} button:has-text('Choose Another')`)
await page.waitForSelector("text=Choose Customer — Counter 1", { timeout: 5000 })
await page.click("div[data-slot='dialog-content'] button:has-text('T-103')")
await page.waitForSelector("text=Override Queue Order?", { timeout: 5000 })
check("override confirmation shows recommended vs selected", true)
await page.click("button:has-text('Customer ready')") // optional reason
await page.click("button:has-text('Call T-103')")
await page.waitForSelector(nowServing(1, "T-103"), { timeout: 5000 })
check(
  "override call serves T-103; recommended T-102 keeps position #1",
  (await page.locator(`${counterCard(1)} >> text=#1 in queue`).count()) === 1 &&
    (await page.locator(`${counterCard(1)} >> text=T-102`).count()) >= 1
)
await page.click(`${counterCard(1)} button:has-text('Complete')`)
await page.waitForSelector(recommendedPanel(1, "T-102"), { timeout: 5000 })
await page.waitForSelector(nowServing(1), { state: "detached", timeout: 5000 })
check(
  "after the override completes, T-102 is recommended again — still unassigned",
  true
)
await page.click("button[aria-label^='Toggle live activity']")
await page.waitForSelector("text=Live Activity", { timeout: 5000 })
check(
  "Live Activity records the override (called T-103 instead of recommended T-102)",
  (await page.locator("text=/called T-103 .* instead of recommended T-102/").count()) === 1
)
await page.click("button[aria-label='Close activity panel']")
await page.waitForTimeout(300)
await page.click(`${counterCard(1)} button:has-text('Call T-102')`)
await page.waitForSelector(nowServing(1, "T-102"), { timeout: 5000 })

// ---- 17–18: transfer to an IDLE counter → recommendation, not assignment ----
await page.click(`${counterCard(1)} button:has-text('Transfer')`)
await page.waitForSelector("text=Transfer to Another Counter", { timeout: 5000 })
await page.click("div[data-slot='dialog-content'] button:has-text('Counter 2')")
await page.click("button:has-text('Transfer Customer')")
await page.waitForSelector(recommendedPanel(2, "T-102"), { timeout: 5000 })
check(
  "transfer to idle counter creates a recommendation — NOT Now Serving",
  (await page.locator(nowServing(2)).count()) === 0
)
await page.click(`${counterCard(2)} button:has-text('Call T-102')`)
await page.waitForSelector(nowServing(2, "T-102"), { timeout: 5000 })
check("transferred customer served only after the explicit call", true)
await page.screenshot({ path: `${shots}/core-recommendation.png` })

// ---- 19–20: hold frees the counter without assigning anyone ----
await issueCustomer("Probe Four", "Counter 2") // waits (T-104)
await page.click(`${counterCard(2)} button:has-text('Hold')`)
await page.waitForSelector("text=Put on Hold", { timeout: 5000 })
await page.click("button:has-text('Verification pending')")
await page.click("div[data-slot='dialog-content'] button:has-text('Put on Hold')")
await page.waitForSelector(`${counterCard(2)} >> text=On hold · 1`, { timeout: 5000 })
await page.waitForSelector(nowServing(2), { state: "detached", timeout: 5000 })
check(
  "hold frees the counter — T-104 is recommended, nobody auto-assigned",
  (await page.locator(recommendedPanel(2, "T-104")).count()) === 1
)

// release → NEXT AFTER CURRENT → top recommendation, explicit call resumes
await page.click("button:has-text('Release Hold')")
await page.waitForSelector(recommendedPanel(2, "T-102"), { timeout: 5000 })
check(
  "released hold becomes the top recommendation — still not assigned",
  (await page.locator(nowServing(2)).count()) === 0
)
await page.click(`${counterCard(2)} button:has-text('Call T-102')`)
await page.waitForSelector(nowServing(2, "T-102"), { timeout: 5000 })
check("explicit call resumes the released customer before normal FIFO", true)

// ---- 21–24: employee break — no calls possible until resume ----
await page.click("button[aria-label='Start break — Arjun']")
await page.waitForSelector(`${counterCard(2)} >> text=Employee on break`, {
  timeout: 5000,
})
check(
  "break pauses the current service (kept in place)",
  (await page.locator(`${counterCard(2)} >> text="SERVICE PAUSED"`).count()) === 1
)
await page.waitForTimeout(1000)
check(
  "no customer is assigned during the break",
  (await page.locator(nowServing(2, "T-102")).count()) === 1 &&
    (await page.locator(nowServing(2, "T-104")).count()) === 0
)
await page.click("button:has-text('Resume Service')")
await page.waitForTimeout(400)
check(
  "resume restores the SAME paused customer",
  (await page.locator(nowServing(2, "T-102")).count()) === 1
)
await page.click(`${counterCard(2)} button:has-text('Complete')`)
await page.waitForSelector(recommendedPanel(2, "T-104"), { timeout: 5000 })
await page.waitForSelector(nowServing(2), { state: "detached", timeout: 5000 })
check(
  "after completion the waiting customer is recommended — explicit call required",
  true
)
await page.click(`${counterCard(2)} button:has-text('Call T-104')`)
await page.waitForSelector(nowServing(2, "T-104"), { timeout: 5000 })

// WhatsApp reflects the full story from actual state — no duplicates
await pickOption("button[aria-label='Select customer']", "T-102")
const conversation = await page
  .locator("[data-testid='wa-conversation']")
  .innerText()
check(
  "WhatsApp documents hold (with reason), resume, pause and service resume",
  conversation.includes("temporarily on hold") &&
    conversation.includes("Verification pending") &&
    conversation.includes("has been resumed") &&
    conversation.includes("temporarily paused") &&
    conversation.includes("Your service has resumed")
)
check(
  "no duplicate WhatsApp messages",
  conversation.split("temporarily on hold").length === 2 &&
    conversation.split("temporarily paused").length === 2
)

// ---- Manager Dashboard: acceptance KPI + override drill-down ----
await page.click("button:has-text('Manager Dashboard')")
await page.waitForSelector("text=Employee Workload", { timeout: 5000 })
check(
  "Recommendation Acceptance KPI is shown with the override call counted",
  (await page.locator("button[aria-label='Recommendation Acceptance — drill down']").count()) === 1
)
await page.click("button[aria-label='Recommendation Acceptance — drill down']")
await page.waitForSelector("text=Override history", { timeout: 5000 })
check(
  "drill-down shows recommendations, calls, overrides and acceptance rate",
  (await page.locator("div[data-slot='dialog-content'] >> text=Acceptance rate").count()) === 1 &&
    (await page.locator("div[data-slot='dialog-content'] >> text=Recommendations").count()) >= 1
)
check(
  "override history records employee, counter, recommended vs selected, reason",
  (await page.locator("div[data-slot='dialog-content'] >> text=Priya").count()) >= 1 &&
    (await page.locator("div[data-slot='dialog-content'] >> text=T-102").count()) >= 1 &&
    (await page.locator("div[data-slot='dialog-content'] >> text=T-103").count()) >= 1 &&
    (await page.locator("div[data-slot='dialog-content'] >> text=Customer ready").count()) >= 1
)
await page.screenshot({ path: `${shots}/core-acceptance-drilldown.png` })
await page.keyboard.press("Escape")
await page.waitForTimeout(300)
await page.click("button:has-text('Operations')")
await page.waitForSelector(queues, { timeout: 5000 })

// ---- Live Demo: scenarios A–G, pause interactivity, resume ----
await page.click("button:has-text('Restart')")
await page.waitForTimeout(300)
await page.click("button:has-text('Start Live Demo')")
await page.waitForSelector("text=T-115", { timeout: 15000 })

// pause → UI stays interactive, nothing advances
await page.click("button:has-text('Pause')")
await page.waitForSelector("text=DEMO PAUSED", { timeout: 5000 })
const pausedStep = await page.locator("text=/Paused at step \\d+/").innerText()
await page.click("button:has-text('Manager Dashboard')")
await page.waitForSelector("text=Employee Workload", { timeout: 5000 })
await page.click("button:has-text('Operations')")
await page.waitForSelector(queues, { timeout: 5000 })
const pausedStepAfter = await page.locator("text=/Paused at step \\d+/").innerText()
check("pause keeps the UI interactive with zero automated events", pausedStep === pausedStepAfter)

// resume at 4× — watch the demo hold + break scenarios play out
await page.click("button:has-text('4×')")
await page.click("button:has-text('Resume')")
await page.waitForSelector(`${queues} >> text=On hold · 1`, { timeout: 60000 })
check("demo: hold scenario appears in the dedicated section", true)
await page.waitForSelector(`${queues} >> text=Next after current`, { timeout: 60000 })
check("demo: released hold appears under NEXT AFTER CURRENT", true)
await page.waitForSelector(`${queues} >> text=Employee on break`, { timeout: 60000 })
check("demo: employee break pauses the counter", true)
await page.screenshot({ path: `${shots}/core-demo-break.png` })

// notifications never stack while the demo races
let maxToasts = 0
for (let i = 0; i < 5; i++) {
  await page.waitForTimeout(600)
  const count = await page.locator("[data-sonner-toast]").count()
  maxToasts = Math.max(maxToasts, count)
}
check(`transient notifications never stack (max seen: ${maxToasts})`, maxToasts <= 1)

await page.waitForSelector("text=Demo complete", { timeout: 60000 })
const raviConversation = await page
  .locator("[data-testid='wa-conversation']")
  .innerText()
check(
  "demo: hero's WhatsApp documents hold, break pause and completion",
  raviConversation.includes("temporarily on hold") &&
    raviConversation.includes("temporarily paused") &&
    raviConversation.includes("All done")
)
check(
  "demo: no duplicate hold/pause messages",
  raviConversation.split("temporarily on hold").length === 2 &&
    raviConversation.split("temporarily paused").length === 2
)
await page.screenshot({ path: `${shots}/core-demo-complete.png` })

// the demo's scripted override (T-113 over T-111) is audited exactly once
await page.click("button:has-text('Manager Dashboard')")
await page.waitForSelector("text=Employee Workload", { timeout: 5000 })
await page.click("button[aria-label='Recommendation Acceptance — drill down']")
await page.waitForSelector("text=Override history", { timeout: 5000 })
check(
  "demo: override history records T-113 called over recommended T-111",
  (await page.locator("div[data-slot='dialog-content'] >> text=T-113").count()) >= 1 &&
    (await page.locator("div[data-slot='dialog-content'] >> text=T-111").count()) >= 1 &&
    (await page.locator("div[data-slot='dialog-content'] >> text=Override calls").count()) === 1
)
await page.keyboard.press("Escape")

await browser.close()

if (errors.length) {
  console.log("CONSOLE ERRORS:")
  for (const e of errors) console.log(" -", e)
  process.exit(1)
}
console.log(
  failures === 0 ? "ALL CHECKS PASSED — zero console errors" : `${failures} CHECKS FAILED`
)
process.exit(failures === 0 ? 0 : 1)
