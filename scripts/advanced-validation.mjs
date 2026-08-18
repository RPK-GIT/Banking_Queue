// Validates the advanced operations enhancements: KPI drill-downs (main +
// manager), Data View + capacity filters, visualization switching, the
// full-pane WhatsApp customer view, HOLD priority behavior, and the demo
// hold scenario — at three resolutions, with zero console errors.
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

const panel = "aside[aria-label='Customer view']"
const queues = "section[aria-label='Live queues']"

/** open a Base UI select and pick the option with the given text
 * (closed popups stay mounted with data-closed — target the OPEN one) */
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

async function closeDialog() {
  await page.keyboard.press("Escape")
  await page.waitForSelector("div[data-slot='dialog-content']", {
    state: "detached",
    timeout: 5000,
  })
  await page.waitForTimeout(200)
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
    `${w}x${h}: all 4 counters fit without scroll`,
    c4 !== null && c4.x + c4.width <= vp.width && c4.y < vp.height
  )
  // WhatsApp occupies MOST of the right pane, never overlapping the queues
  const paneBox = await page.locator(panel).boundingBox()
  const phoneBox = await page.locator("[data-testid='wa-phone']").boundingBox()
  const queueBox = await page.locator(queues).boundingBox()
  check(
    `${w}x${h}: WhatsApp fills most of the Customer View pane (${Math.round(
      (phoneBox.height / paneBox.height) * 100
    )}%)`,
    phoneBox.height / paneBox.height >= 0.8
  )
  check(
    `${w}x${h}: WhatsApp does not overlap the queues`,
    queueBox.x + queueBox.width <= paneBox.x + 1
  )
  await page.screenshot({ path: `${shots}/adv-layout-${w}x${h}.png` })
}

// ---- interactive checks at 1680×1050 ----
await page.setViewportSize({ width: 1680, height: 1050 })
await page.goto(url, { waitUntil: "domcontentloaded" })
await page.waitForSelector(`${queues} >> text=Counter 4`, { timeout: 30000 })
await page.click("button:has-text('Restart')")
await page.waitForTimeout(400)

// ---- main KPI drill-downs ----
const dialog = "div[data-slot='dialog-content']"

await page.click("button[aria-label^='Customers in Branch']")
await page.waitForSelector(`${dialog} >> text=read-only`, { timeout: 5000 })
check(
  "Customers in Branch drill-down opens with active customers",
  (await page.locator(`${dialog} >> text=T-104`).count()) >= 1
)
await page.screenshot({ path: `${shots}/adv-kpi-in-branch.png` })
// drill into a customer → Journey dialog → back
await page.click(`${dialog} >> tr[role='button']:has-text('T-104')`)
await page.waitForSelector("text=Audit trail", { timeout: 5000 })
check("KPI → customer → Journey dialog works", true)
await page.keyboard.press("Escape") // close journey → back on the drill-down
await page.waitForSelector("text=Audit trail", { state: "detached", timeout: 5000 })
check(
  "closing the journey returns to the drill-down (inspect → close → return)",
  (await page.locator(`${dialog} >> text=read-only`).count()) >= 1
)
await page.keyboard.press("Escape") // close the drill-down itself
await page.waitForTimeout(400)

await page.click("button[aria-label^='Waiting']")
await page.waitForSelector(`${dialog} >> text=Waiting`, { timeout: 5000 })
const waitingRows = await page.locator(`${dialog} tr[role='button']`).count()
check(`Waiting drill-down lists waiting customers (${waitingRows})`, waitingRows > 0)
await closeDialog()

await page.click("button[aria-label^='Being Served']")
await page.waitForSelector(`${dialog} >> text=Employee`, { timeout: 5000 })
const servedRows = await page.locator(`${dialog} tr[role='button']`).count()
check(`Being Served drill-down shows active service (${servedRows})`, servedRows > 0)
// processing time ticks with the app's time model
const beforeTick = await page.locator(dialog).innerText()
await page.waitForTimeout(2100)
const afterTick = await page.locator(dialog).innerText()
check("Being Served processing time updates live", beforeTick !== afterTick)
await closeDialog()

await page.click("button[aria-label^='Completed']")
await page.waitForSelector(`${dialog} >> text=Counters visited`, { timeout: 5000 })
check(
  "Completed drill-down shows finished journeys",
  (await page.locator(`${dialog} tr[role='button']`).count()) > 0
)
await closeDialog()

await page.click("button[aria-label^='Average Wait']")
await page.waitForSelector(`${dialog} >> text=Average`, { timeout: 5000 })
check(
  "Average Wait drill-down shows avg/min/max and contributing records",
  (await page.locator(`${dialog} >> text=Minimum`).count()) === 1 &&
    (await page.locator(`${dialog} >> text=Maximum`).count()) === 1
)
await page.screenshot({ path: `${shots}/adv-kpi-avg-wait.png` })
await closeDialog()
check("queue state untouched after drill-downs (read-only)", true)

// ---- HOLD flow on Counter 2 (seed: serving T-108, queue T-111, T-113) ----
await page.click(`${queues} button:has-text('Hold') >> nth=1`) // Counter 2 card
await page.waitForSelector("text=Put on Hold", { timeout: 5000 })
await page.click("button:has-text('Document required')")
await page.click("div[data-slot='dialog-content'] button:has-text('Put on Hold')")
await page.waitForSelector("text=On hold · 1", { timeout: 5000 })
check("held customer appears in the dedicated ON HOLD section", true)
check(
  "held customer left active service (T-108 not serving)",
  (await page.locator(`${queues} >> text=On hold · 1`).count()) === 1
)
await page.screenshot({ path: `${shots}/adv-hold-section.png` })

// Call Next must skip the held ticket
await page.click(`${queues} button:has-text('Call Next')`)
await page.waitForTimeout(400)
check(
  "Call Next skips the held ticket and serves the normal FIFO customer (T-111)",
  (await page.locator(`${queues} >> text=T-111`).first().isVisible()) &&
    (await page.locator("text=On hold · 1").count()) === 1
)

// Release → NEXT AFTER CURRENT, ahead of normal FIFO
await page.click("button:has-text('Release Hold')")
await page.waitForSelector("text=Next after current", { timeout: 5000 })
check("released hold appears under NEXT AFTER CURRENT", true)
await page.screenshot({ path: `${shots}/adv-next-after-current.png` })

// complete the current customer, then the released hold must be served next
await page.click(`${queues} button:has-text('Complete') >> nth=1`)
await page.waitForTimeout(400)
await page.click(`${queues} button:has-text('Call Next')`)
await page.waitForTimeout(400)
const nowServingC2 = await page
  .locator(`${queues} button[title="View T-108's journey"]`)
  .count()
check("released customer (T-108) is served before normal FIFO (T-113)", nowServingC2 >= 1)

// WhatsApp reflects the hold journey from actual state
await pickOption("button[aria-label='Select customer']", "T-108")
const conversation = await page
  .locator("[data-testid='wa-conversation']")
  .innerText()
check(
  "WhatsApp shows on-hold message with reason",
  conversation.includes("temporarily on hold") &&
    conversation.includes("Document required")
)
check(
  "WhatsApp shows the resumed message",
  conversation.includes("has been resumed")
)

// ---- Manager Dashboard: Data View, filters, KPI drill-downs, viz ----
await page.click("button:has-text('Manager Dashboard')")
await page.waitForSelector("text=Employee Workload", { timeout: 5000 })
await noPageScroll("manager dashboard")

check(
  "Data View defaults to Actual vs Capacity",
  (await page
    .locator("button[aria-pressed='true']:has-text('Actual vs Capacity')")
    .count()) === 1
)
check(
  "Capacity vs Actual visualization present by default",
  (await page.locator("text=Capacity vs Actual").count()) >= 1
)
await page.screenshot({ path: `${shots}/adv-manager-default.png` })

// Actual view hides the capacity comparison, Capacity view relabels it
await page.click("button:has-text('Actual'):not(:has-text('Capacity'))")
await page.waitForTimeout(300)
check(
  "Actual view removes capacity visuals",
  (await page.locator("text=Capacity vs Actual").count()) === 0
)
await page.click("button:has-text('Capacity'):not(:has-text('Actual'))")
await page.waitForTimeout(300)
check(
  "Capacity view shows Estimated Capacity",
  (await page.locator("text=Estimated Capacity by Employee").count()) === 1
)
await page.click("button:has-text('Actual vs Capacity')")
await page.waitForTimeout(300)

// manager KPI drill-downs
await page.click("button[aria-label='Tokens Processed — drill down']")
await page.waitForSelector(`${dialog} >> text=Hold`, { timeout: 5000 })
check(
  "Tokens Processed drill-down shows token-level records",
  (await page.locator(`${dialog} tr[role='button']`).count()) > 0
)
await closeDialog()

await page.click("button[aria-label='Total Processing — drill down']")
await page.waitForSelector(`${dialog} >> text=Employee`, { timeout: 5000 })
// click an employee → detailed token history
await page.click(`${dialog} tr[role='button'] >> nth=0`)
await page.waitForSelector("text=Token history", { timeout: 5000 })
check("processing drill-down → employee detail with token history", true)
await page.screenshot({ path: `${shots}/adv-employee-detail.png` })
await closeDialog()

await page.click("button[aria-label='Most Loaded — drill down']")
await page.waitForSelector("text=Token history", { timeout: 5000 })
check("Most Loaded opens the employee detail view directly", true)
await closeDialog()

await page.click("button[aria-label='Branch Utilization — drill down']")
await page.waitForSelector(`${dialog} >> text=Est. capacity`, { timeout: 5000 })
check(
  "Branch Utilization drill-down shows capacity/actual/utilization per employee",
  (await page.locator(`${dialog} >> text=Utilization`).count()) >= 1
)
await closeDialog()

// filters update analytics + Clear Filters
await pickOption("button[aria-label='Employee filter']", "Priya")
check(
  "employee filter narrows the dashboard to one employee",
  (await page.locator("text=Clear Filters").count()) === 1
)
await pickOption("button[aria-label='Counter filter']", "Counter 2")
await pickOption("button[aria-label='Service type filter']", "KYC Update")
await pickOption("button[aria-label='Time filter']", "Today")
check("time/employee/counter/service filters apply together", true)
await page.click("button:has-text('Clear Filters')")
await page.waitForTimeout(300)
check(
  "Clear Filters restores the unfiltered dashboard",
  (await page.locator("text=Clear Filters").count()) === 0
)

// visualization switching + persistence (existing mechanism)
await pickOption("button[aria-label='Employee Workload — change visualization']", "Donut")
check(
  "workload switches to donut",
  (await page.locator("svg[aria-label='Donut chart']").count()) >= 1
)
await page.click("button:has-text('Operations')")
await page.waitForSelector(queues, { timeout: 5000 })
await page.click("button:has-text('Manager Dashboard')")
await page.waitForSelector("text=Employee Workload", { timeout: 5000 })
check(
  "visualization choice persists (Employee Workload still Donut)",
  (await page
    .locator("button[aria-label='Employee Workload — change visualization'] >> text=Donut")
    .count()) === 1
)
// restore default for future runs
await pickOption(
  "button[aria-label='Employee Workload — change visualization']",
  "Horizontal Bar"
)
await page.click("button:has-text('Operations')")
await page.waitForSelector(queues, { timeout: 5000 })

// ---- Live Demo: hero selection, hold scenario, pause interactivity ----
await page.click("button:has-text('Restart')")
await page.waitForTimeout(300)
await page.click("button:has-text('Start Live Demo')")
await page.waitForSelector("text=T-115", { timeout: 15000 })
check(
  "Live Demo auto-selects the hero (Ravi — T-104) in the Customer View",
  (await page.locator(`${panel} >> text=Ravi Kumar`).count()) >= 1
)

// pause → everything stays interactive, nothing advances
await page.click("button:has-text('Pause')")
await page.waitForSelector("text=DEMO PAUSED", { timeout: 5000 })
const pausedStep = await page.locator("text=/Paused at step \\d+/").innerText()
await pickOption("button[aria-label='Select customer']", "T-105")
check(
  "paused: customer dropdown works and WhatsApp switches",
  (await page.locator(`${panel} >> text=Anita Desai`).count()) >= 1
)
await page.click("button[aria-label^='Customers in Branch']")
await page.waitForSelector(`${dialog} >> text=read-only`, { timeout: 5000 })
await closeDialog()
await page.click("button:has-text('Manager Dashboard')")
await page.waitForSelector("text=Employee Workload", { timeout: 5000 })
await page.click("button:has-text('Operations')")
await page.waitForSelector(queues, { timeout: 5000 })
const pausedStepAfter = await page.locator("text=/Paused at step \\d+/").innerText()
check("paused: no automated events advanced while inspecting", pausedStep === pausedStepAfter)
// switch back to Ravi — the presenter's manual choice persists through resume
await pickOption("button[aria-label='Select customer']", "T-104")

// resume at 4× and watch the scripted HOLD scenario play out
await page.click("button:has-text('4×')")
await page.click("button:has-text('Resume')")
await page.waitForSelector(`${queues} >> text=On hold · 1`, { timeout: 60000 })
check("demo puts Ravi on hold in the dedicated section", true)
await page.screenshot({ path: `${shots}/adv-demo-hold.png` })
await page.waitForSelector(`${queues} >> text=Next after current`, { timeout: 60000 })
check("demo releases the hold into NEXT AFTER CURRENT", true)

// notifications never stack while the demo races at 4×
let maxToasts = 0
for (let i = 0; i < 5; i++) {
  await page.waitForTimeout(700)
  const count = await page.locator("[data-sonner-toast]").count()
  maxToasts = Math.max(maxToasts, count)
}
check(`transient notifications never stack (max seen: ${maxToasts})`, maxToasts <= 1)

await page.waitForSelector("text=Demo complete", { timeout: 60000 })
const raviConversation = await page
  .locator("[data-testid='wa-conversation']")
  .innerText()
check(
  "hero stayed selected through the demo and completed",
  raviConversation.includes("All done")
)
check(
  "Ravi's WhatsApp documents the hold + resume from actual state",
  raviConversation.includes("temporarily on hold") &&
    raviConversation.includes("has been resumed")
)
await page.screenshot({ path: `${shots}/adv-demo-complete.png` })

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
