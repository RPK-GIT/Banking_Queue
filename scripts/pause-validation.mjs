// Validates the paused-demo inspection workflow end to end in headless Edge,
// using the permanent right-side Customer View panel.
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

async function pausedStep() {
  const text = await page.locator("text=/Paused at step \\d+ of/").textContent()
  return Number(text.match(/Paused at step (\d+) of/)[1])
}

await page.goto(url, { waitUntil: "domcontentloaded" })
await page.waitForSelector("text=Counter 4", { timeout: 30000 })
await page.click("button:has-text('Clear All')") // drop persisted state
await page.waitForTimeout(300)

// 1–2. Start Live Demo — the Customer View must auto-focus hero Ravi (T-104)
await page.click("button:has-text('Start Live Demo')")
await page.waitForSelector("text=T-115", { timeout: 15000 })
check(
  "Customer View auto-selects hero Ravi (T-104) on demo start",
  (await page.locator(`${panel} >> text=Your token is T-104`).count()) === 1
)
await page.waitForTimeout(10000) // roughly steps 1–4 at 1×

// 3. Pause
await page.click("button:has-text('Pause')")
await page.waitForSelector("text=DEMO PAUSED", { timeout: 5000 })
const stepAtPause = await pausedStep()
check("pause shows paused indicator + step counter", stepAtPause > 0)

// frozen: nothing advances while paused
await page.waitForTimeout(7000)
check("no events fire while paused", (await pausedStep()) === stepAtPause)

// 4. Ravi's conversation is visible in the permanent panel
check(
  "Ravi's conversation visible while paused",
  (await page.locator(`${panel} >> text=Your token is T-104`).count()) === 1
)
await page.screenshot({ path: `${shots}/07-paused-customer-view.png` })

// 5. Scroll through messages
const scrollable = await page.evaluate(() => {
  const el = document.querySelector("[data-testid='wa-conversation']")
  if (!el) return false
  el.scrollTop = 0
  const ok = el.scrollHeight > 0
  el.scrollTop = el.scrollHeight
  return ok
})
check("conversation scrolls", scrollable)

const statusBefore = await page.locator(panel).evaluate((el) => el.textContent)

// 6. Switch to another customer, then back to Ravi
await page.click(`${panel} button:has-text('Joseph Thomas')`)
await page.waitForSelector(`${panel} >> text=T-109 · SBI Demo Branch`, { timeout: 5000 })
check("switched to another customer while paused", true)
await page.click(`${panel} button:has-text('Ravi Kumar')`)
await page.waitForSelector(`${panel} >> text=T-104 · SBI Demo Branch`, { timeout: 5000 })
const statusAfter = await page.locator(panel).evaluate((el) => el.textContent)
check("Ravi's WhatsApp state identical after switching back", statusBefore === statusAfter)
check("still paused at the same step", (await pausedStep()) === stepAtPause)

// 7. Journey dialog from the Customer View
await page.click("button:has-text('View full journey')")
await page.waitForSelector("text=Audit trail", { timeout: 5000 })
check("journey dialog opens while paused", true)
await page.screenshot({ path: `${shots}/09-paused-journey.png` })
await page.keyboard.press("Escape")
await page.waitForSelector("text=Audit trail", { state: "detached", timeout: 5000 })

// 8. Change speed 1× → 2× while paused: nothing should happen immediately
await page.click("button:has-text('2×')")
await page.waitForTimeout(4000)
check("speed change while paused fires nothing", (await pausedStep()) === stepAtPause)

// 9. Step: exactly one event, then still paused
await page.click("button[aria-label='Step — run exactly one demo event']")
await page.waitForTimeout(600)
const stepAfterStep = await pausedStep()
check("Step advances exactly one event", stepAfterStep === stepAtPause + 1)
await page.waitForTimeout(4000)
check("remains paused after Step", (await pausedStep()) === stepAfterStep)

// 10. Resume at 2× → 4×, run to completion
await page.click("button:has-text('Resume')")
await page.click("button:has-text('4×')")
await page.waitForSelector("text=Demo complete", { timeout: 60000 })
check("demo runs to completion after resume", true)

// no duplicated events: T-115 was issued exactly once in the activity center
await page.click("button[aria-label^='Toggle live activity panel']")
await page.waitForSelector("text=Live Activity", { timeout: 5000 })
const issuedCount = await page
  .locator("text=/T-115 issued to Aisha Khan/")
  .count()
check("no duplicate events (T-115 issued exactly once)", issuedCount === 1)
await page.click("button[aria-label='Close activity panel']")

// Aisha's phone shows a single completion message
await page.click(`${panel} button:has-text('completed')`)
await page.click(`${panel} button:has-text('Aisha Khan')`)
await page.waitForTimeout(400)
const doneMessages = await page
  .locator(`${panel} p:has-text('All done')`)
  .count()
check("exactly one completion message for T-115", doneMessages === 1)
await page.screenshot({ path: `${shots}/11-demo-complete.png` })

await browser.close()

if (errors.length) {
  console.log("CONSOLE ERRORS:")
  for (const e of errors) console.log(" -", e)
  process.exit(1)
}
console.log(failures === 0 ? "ALL CHECKS PASSED — zero console errors" : `${failures} CHECKS FAILED`)
process.exit(failures === 0 ? 0 : 1)
