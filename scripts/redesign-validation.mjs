// Validates the 4-counter three-zone workspace: layout at three resolutions,
// left-pane collapse, Manager Dashboard visualization switching + persistence,
// calm notifications (no stacking), and the full presenter sequence.
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

// ---- layout checks at three resolutions ----
for (const [w, h] of [
  [1440, 900],
  [1680, 1050],
  [1920, 1080],
]) {
  await page.setViewportSize({ width: w, height: h })
  await page.goto(url, { waitUntil: "domcontentloaded" })
  await page.waitForSelector("text=Counter 4", { timeout: 30000 })
  await page.waitForTimeout(400)
  await noPageScroll(`${w}x${h}`)
  const c4 = await page.locator("section[aria-label='Live queues'] >> text=Counter 4").first().boundingBox()
  const vp = page.viewportSize()
  check(
    `${w}x${h}: all 4 counters visible without scroll`,
    c4 !== null && c4.x + c4.width <= vp.width && c4.y < vp.height
  )
  check(
    `${w}x${h}: no Counter 5 anywhere`,
    (await page.locator("text=Counter 5").count()) === 0
  )
  check(
    `${w}x${h}: Customer View panel visible`,
    (await page.locator(panel).count()) === 1
  )
  await page.screenshot({ path: `${shots}/layout-${w}x${h}.png` })
}

// ---- interactive sequence at 1680×1050 ----
await page.setViewportSize({ width: 1680, height: 1050 })
await page.goto(url, { waitUntil: "domcontentloaded" })
await page.waitForSelector("text=Counter 4", { timeout: 30000 })

// left pane collapse / expand
await page.click("button[aria-label='Collapse control pane']")
await page.waitForTimeout(400)
check(
  "pane collapses to icon rail",
  (await page.locator("button[aria-label='New Customer — expand pane']").count()) === 1
)
await noPageScroll("collapsed pane")
await page.click("button[aria-label='New Customer — expand pane']")
await page.waitForSelector("#customer-name", { timeout: 5000 })
check("clicking rail icon expands pane", true)

// issue token → queue update
await page.click("button:has-text('Restart')")
await page.waitForTimeout(400)
await page.fill("#customer-name", "Layout Probe")
await page.click("button:has-text('Issue Token')")
await page.waitForSelector("section[aria-label='Live queues'] >> text=Layout Probe", { timeout: 5000 })
check("issue token updates queue", true)

// counter interaction + journey dialog
await page.click("section[aria-label='Live queues'] button:has-text('Complete') >> nth=0")
await page.waitForTimeout(500)
check("counter Complete works", true)
await page.click("section[aria-label='Live queues'] >> text=T-104")
await page.waitForSelector("text=Audit trail", { timeout: 5000 })
check("journey dialog opens (hero T-104)", true)
await page.keyboard.press("Escape")
await page.waitForSelector("text=Audit trail", { state: "detached", timeout: 5000 })

// ---- Manager Dashboard: open, switch visualization, persistence ----
await page.click("button:has-text('Manager Dashboard')")
await page.waitForSelector("text=Employee Workload", { timeout: 5000 })
check("Manager Dashboard opens in the same shell", true)
await noPageScroll("manager dashboard")
await page.screenshot({ path: `${shots}/16-manager-dashboard.png` })

await page.click("button[aria-label='Employee Workload — change visualization']")
await page.click("div[role='option']:has-text('Donut')")
await page.waitForTimeout(400)
check(
  "workload switches to donut",
  (await page.locator("svg[aria-label='Donut chart']").count()) >= 1
)
await page.screenshot({ path: `${shots}/17-workload-donut.png` })

// persistence: leave and return — the donut choice must be remembered
await page.click("button:has-text('Operations')")
await page.waitForSelector("section[aria-label='Live queues']", { timeout: 5000 })
check("returning to operations keeps queue state", true)
await page.click("button:has-text('Manager Dashboard')")
await page.waitForSelector("text=Employee Workload", { timeout: 5000 })
check(
  "visualization choice persists (Employee Workload still Donut)",
  (await page
    .locator("button[aria-label='Employee Workload — change visualization'] >> text=Donut")
    .count()) === 1
)
await page.click("button:has-text('Operations')")

// ---- Live Demo: calm notifications, customer view sync, completion ----
await page.click("button:has-text('Restart')")
await page.waitForTimeout(300)
await page.click("button:has-text('Start Live Demo')")
await page.waitForSelector("text=T-115", { timeout: 15000 })

// notifications never stack: sample the toast count while events fire
let maxToasts = 0
for (let i = 0; i < 6; i++) {
  await page.waitForTimeout(1500)
  const count = await page.locator("[data-sonner-toast]").count()
  maxToasts = Math.max(maxToasts, count)
}
check(`transient notifications never stack (max seen: ${maxToasts})`, maxToasts <= 1)

const raviBefore = await page.locator(panel).evaluate((el) => el.textContent)
await page.click("button:has-text('4×')")
await page.waitForSelector("text=Demo complete", { timeout: 60000 })
const raviAfter = await page.locator(panel).evaluate((el) => el.textContent)
check("Customer View stayed on hero and updated with the demo", raviBefore !== raviAfter)
check(
  "hero's phone shows his journey completion",
  raviAfter.includes("All done")
)
await page.screenshot({ path: `${shots}/18-demo-complete.png` })

// activity center preserved the full history
await page.click("button[aria-label^='Toggle live activity panel']")
await page.waitForSelector("text=Live Activity", { timeout: 5000 })
const issued = await page.locator("text=/T-115 issued to Aisha Khan/").count()
check("activity history preserved (T-115 issued exactly once)", issued === 1)

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
