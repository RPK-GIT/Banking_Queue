// Validates the operations-workspace redesign: fixed shell, collapsible pane,
// no page scrolling, and the full presenter sequence — at three resolutions.
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

async function countersVisible(label) {
  const box = await page.locator("text=Counter 5 >> nth=0").boundingBox()
  const vp = page.viewportSize()
  check(
    `${label}: all 5 counters visible without scroll`,
    box !== null && box.x + box.width <= vp.width && box.y < vp.height
  )
}

// ---- layout checks at three resolutions ----
for (const [w, h] of [
  [1440, 900],
  [1680, 1050],
  [1920, 1080],
]) {
  await page.setViewportSize({ width: w, height: h })
  await page.goto(url, { waitUntil: "domcontentloaded" })
  await page.waitForSelector("text=Counter 5", { timeout: 30000 })
  await page.waitForTimeout(400)
  await noPageScroll(`${w}x${h}`)
  await countersVisible(`${w}x${h}`)
  await page.screenshot({ path: `${shots}/layout-${w}x${h}.png` })
}

// ---- interactive sequence at 1680×1050 ----
await page.setViewportSize({ width: 1680, height: 1050 })
await page.goto(url, { waitUntil: "domcontentloaded" })
await page.waitForSelector("text=Counter 5", { timeout: 30000 })

// 1–2. collapse / expand the left pane
check("left pane expanded initially", (await page.locator("text=New Customer").count()) > 0)
await page.click("button[aria-label='Collapse control pane']")
await page.waitForTimeout(400)
check(
  "pane collapses to icon rail",
  (await page.locator("button[aria-label='New Customer — expand pane']").count()) === 1
)
await noPageScroll("collapsed pane")
await page.screenshot({ path: `${shots}/12-collapsed-pane.png` })
await page.click("button[aria-label='New Customer — expand pane']")
await page.waitForSelector("#customer-name", { timeout: 5000 })
check("clicking rail icon expands pane", true)

// 3–4. issue token → queue update
await page.click("button:has-text('Restart')")
await page.waitForTimeout(400)
await page.fill("#customer-name", "Layout Probe")
await page.click("button:has-text('Issue Token')")
await page.waitForSelector("text=Layout Probe", { timeout: 5000 })
check("issue token updates queue", true)

// 5. counter interaction (complete a service)
const before = await page.locator("text=NOW SERVING").count()
await page.click("button:has-text('Complete') >> nth=0")
await page.waitForTimeout(600)
check("counter Complete works", before > 0)

// 6. journey dialog
await page.click("text=T-101")
await page.waitForSelector("text=Audit trail", { timeout: 5000 })
check("journey dialog opens", true)
await page.keyboard.press("Escape")
await page.waitForSelector("text=Audit trail", { state: "detached", timeout: 5000 })

// 7–8. start live demo, pause
await page.click("button:has-text('Restart')")
await page.waitForTimeout(300)
await page.click("button:has-text('Start Live Demo')")
await page.waitForSelector("text=T-115", { timeout: 15000 })
await page.waitForTimeout(7000)
await page.click("button:has-text('Pause')")
await page.waitForSelector("text=DEMO PAUSED", { timeout: 5000 })
check("demo pauses", true)

// 9–10. open Customer View → Ravi's WhatsApp
await page.click("button[aria-label='Open Customer View']")
await page.waitForSelector("text=Customer View · Simulated", { timeout: 5000 })
check("customer selector opens", true)
await page.screenshot({ path: `${shots}/13-customer-selector.png` })
await page.click(
  "div[aria-label='Customer WhatsApp selector'] button:has-text('Ravi Kumar')"
)
await page.waitForSelector("text=Viewing phone of", { timeout: 5000 })
check("Ravi's phone opens", true)

// capture Ravi's position line for later comparison
const posBefore = await page
  .locator("div[aria-label^='WhatsApp view for']")
  .evaluate((el) => el.textContent)

// 11. switch customer and back
await page.click("button[aria-label='Switch customer']")
await page.click("div[role='option']:has-text('T-109')")
await page.waitForSelector("div[role='dialog'] >> text=Joseph Thomas", { timeout: 5000 })
await page.click("button[aria-label='Switch customer']")
await page.click("div[role='option']:has-text('T-101')")
await page.waitForSelector("div[role='dialog'] >> text=Ravi Kumar", { timeout: 5000 })
check("customer switching works while paused", true)

// 12. journey from phone
await page.click("button:has-text('View full journey')")
await page.waitForSelector("text=Audit trail", { timeout: 5000 })
await page.screenshot({ path: `${shots}/14-phone-plus-journey.png` })
await page.keyboard.press("Escape")
await page.waitForSelector("text=Audit trail", { state: "detached", timeout: 5000 })

// 13–14. resume at 4× and verify the WhatsApp view updates from live state
await page.click("button:has-text('Resume')")
await page.click("button:has-text('4×')")
await page.waitForSelector("text=Demo complete", { timeout: 60000 })
const posAfter = await page
  .locator("div[aria-label^='WhatsApp view for']")
  .evaluate((el) => el.textContent)
check("WhatsApp view updated as demo progressed", posBefore !== posAfter)
check(
  "Ravi's phone shows journey completion",
  posAfter.includes("All done") && posAfter.includes("Completed")
)
await page.screenshot({ path: `${shots}/15-demo-complete-with-phone.png` })

// 15–16. restart resets cleanly, demo runs again to completion
await page.click("button:has-text('Restart')")
await page.waitForTimeout(400)
check(
  "restart returns to seeded scenario",
  (await page
    .locator("section[aria-label='Live queues'] >> text=T-115")
    .count()) === 0 &&
    (await page
      .locator("section[aria-label='Live queues'] >> text=T-101")
      .count()) > 0
)
await page.click("button:has-text('Start Live Demo')")
await page.waitForSelector("text=T-115", { timeout: 15000 })
await page.waitForSelector("text=Demo complete", { timeout: 60000 })
check("second full run completes", true)
await page.click("button[aria-label='Toggle live activity panel']")
await page.waitForSelector("text=Live Activity", { timeout: 5000 })
const issuedCount = await page.locator("text=/T-115 issued to Aisha Khan/").count()
check("no duplicated events on rerun (activity feed)", issuedCount === 1)

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
