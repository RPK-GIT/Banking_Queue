// Validates the journey-aware queue engine in a real browser: automatic
// assignment, priority transfer placement, customer hold + release priority,
// employee break/resume, WhatsApp state sync, demo pause/resume — at three
// resolutions with zero console errors and no duplicate events.
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

// 1–3: customer arrives at an idle counter → assigned automatically
await issueCustomer("Probe One", "Counter 1")
await page.waitForSelector(nowServing(1, "T-101"), { timeout: 5000 })
check("arriving customer is auto-assigned at the idle counter (no Call Next)", true)

// 4–5: completion automatically brings the next customer in
await issueCustomer("Probe Two", "Counter 1")
await page.click(`${counterCard(1)} button:has-text('Complete')`)
await page.waitForSelector(nowServing(1, "T-102"), { timeout: 5000 })
check("completion auto-assigns the next waiting customer", true)

// 6: journey-started transfer lands in the JOURNEY IN PROGRESS priority queue
await issueCustomer("Probe Three", "Counter 1") // waits behind Probe Two
await issueCustomer("Probe Four", "Counter 2") // serving at Counter 2
await page.click(`${counterCard(1)} button:has-text('Transfer')`) // Probe Two
await page.waitForSelector("text=Transfer to Another Counter", { timeout: 5000 })
await page.click("div[data-slot='dialog-content'] button:has-text('Counter 2')")
await page.click("button:has-text('Transfer Customer')")
await page.waitForSelector(`${counterCard(2)} >> text=Journey in progress`, {
  timeout: 5000,
})
check("journey-started transfer enters the priority queue (not new requests)", true)
await page.waitForSelector(nowServing(1, "T-103"), { timeout: 5000 })
check("freed origin counter auto-assigns its next customer (Probe Three)", true)
await page.screenshot({ path: `${shots}/core-priority-queue.png` })

// 7–8: hold the current customer → next eligible auto-assigned
await page.click(`${counterCard(2)} button:has-text('Hold')`) // Probe Four
await page.waitForSelector("text=Put on Hold", { timeout: 5000 })
await page.click("button:has-text('Verification pending')")
await page.click("div[data-slot='dialog-content'] button:has-text('Put on Hold')")
await page.waitForSelector(`${counterCard(2)} >> text=On hold · 1`, { timeout: 5000 })
check("held customer appears in the dedicated ON HOLD section", true)
await page.waitForSelector(nowServing(2, "T-102"), { timeout: 5000 })
check(
  "hold auto-assigns the next eligible customer (priority T-102)",
  (await page.locator(`${counterCard(2)} >> text=Journey in progress`).count()) === 0
)

// 9–10: release → NEXT AFTER CURRENT
await page.click("button:has-text('Release Hold')")
await page.waitForSelector(`${counterCard(2)} >> text=Next after current`, {
  timeout: 5000,
})
check(
  "released hold becomes NEXT AFTER CURRENT without interrupting",
  (await page.locator(nowServing(2, "T-102")).count()) === 1
)
await page.screenshot({ path: `${shots}/core-next-after-current.png` })

// 11–12: complete current → held customer automatically served
await page.click(`${counterCard(2)} button:has-text('Complete')`)
await page.waitForSelector(nowServing(2, "T-104"), { timeout: 5000 })
check(
  "released customer is automatically assigned after the current completes",
  (await page.locator(`${counterCard(2)} >> text=Next after current`).count()) === 0
)

// 13–15: employee break — counter unavailable, service paused, no reassignment
await issueCustomer("Probe Five", "Counter 2") // waits behind the resumed T-104
await page.click("button[aria-label='Start break — Arjun']")
await page.waitForSelector(`${counterCard(2)} >> text=Employee on break`, {
  timeout: 5000,
})
check("counter shows EMPLOYEE ON BREAK", true)
check(
  "current customer's service pauses (kept in place, not re-queued)",
  (await page.locator(`${counterCard(2)} >> text="SERVICE PAUSED"`).count()) === 1 &&
    (await page.locator(nowServing(2, "T-104")).count()) === 1
)
await page.waitForTimeout(1200)
check(
  "no new customer is assigned while the employee is on break",
  (await page.locator(nowServing(2, "T-104")).count()) === 1 &&
    (await page.locator(nowServing(2, "T-105")).count()) === 0
)
await page.screenshot({ path: `${shots}/core-employee-break.png` })

// 16–17: resume → the SAME customer continues
await page.click("button:has-text('Resume Service')")
await page.waitForTimeout(400)
check(
  "original customer resumes after the break (not the waiting one)",
  (await page.locator(nowServing(2, "T-104")).count()) === 1 &&
    (await page.locator(`${counterCard(2)} >> text="SERVICE PAUSED"`).count()) === 0
)

// 18–19: completion after break auto-assigns next
await page.click(`${counterCard(2)} button:has-text('Complete')`)
await page.waitForSelector(nowServing(2, "T-105"), { timeout: 5000 })
check("completion after the break auto-assigns the next customer", true)

// 20: WhatsApp reflects the full hold + pause story from actual state
await pickOption("button[aria-label='Select customer']", "T-104")
const conversation = await page
  .locator("[data-testid='wa-conversation']")
  .innerText()
check(
  "WhatsApp shows hold with reason, resume, pause and resume messages",
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
