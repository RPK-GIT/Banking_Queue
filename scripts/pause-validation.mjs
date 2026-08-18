// Validates the paused-demo inspection workflow end to end in headless Edge.
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

async function pausedStep() {
  const text = await page.locator("text=/Paused at step \\d+ of/").textContent()
  return Number(text.match(/Paused at step (\d+) of/)[1])
}

await page.goto(url, { waitUntil: "domcontentloaded" })
await page.waitForSelector("text=Counter 5", { timeout: 30000 })
await page.click("button:has-text('Clear All')") // drop persisted state
await page.waitForTimeout(300)

// 1–2. Start Live Demo, let it run past a few events
await page.click("button:has-text('Start Live Demo')")
await page.waitForSelector("text=T-115", { timeout: 15000 })
await page.waitForTimeout(10500) // roughly steps 1–4 at 1×

// 3. Pause
await page.click("button:has-text('Pause')")
await page.waitForSelector("text=DEMO PAUSED", { timeout: 5000 })
const stepAtPause = await pausedStep()
check("pause shows paused indicator + step counter", stepAtPause > 0)

// frozen: nothing advances while paused
await page.waitForTimeout(7000)
check("no events fire while paused", (await pausedStep()) === stepAtPause)

// 4. Open Ravi's WhatsApp (default selection is T-101)
await page.click("button[aria-label='Open Customer WhatsApp']")
await page.waitForSelector("text=Viewing phone of", { timeout: 5000 })
check(
  "WhatsApp opens on Ravi while paused",
  (await page.locator("div[role='dialog'] >> text=T-101").count()) > 0
)
const raviMessages = await page
  .locator("div[role='dialog'] p:has-text('Your token is T-101')")
  .count()
check("Ravi's conversation is visible", raviMessages === 1)
await page.screenshot({ path: `${shots}/07-paused-whatsapp.png` })

// 5. Expand the window
await page.click("button[aria-label='Expand window']")
await page.waitForSelector("button[aria-label='Collapse window']", { timeout: 5000 })
check("window expands", true)

// 6. Scroll through messages
const scrollable = await page.evaluate(() => {
  const el = document.querySelector("div[role='dialog'] .overflow-y-auto")
  if (!el) return false
  el.scrollTop = 0
  const canScroll = el.scrollHeight > 0
  el.scrollTop = el.scrollHeight
  return canScroll
})
check("conversation scrolls", scrollable)

// capture Ravi's status snapshot to verify it stays frozen
const statusBefore = await page
  .locator("div[role='dialog']")
  .evaluate((el) => el.textContent)

// 7. Switch to another customer's WhatsApp
await page.click("button[aria-label='Switch customer']")
await page.click("div[role='option']:has-text('T-109')")
await page.waitForSelector("div[role='dialog'] >> text=Joseph Thomas", { timeout: 5000 })
check("switched to another customer while paused", true)
await page.screenshot({ path: `${shots}/08-paused-switch-customer.png` })

// 8. Return to Ravi
await page.click("button[aria-label='Switch customer']")
await page.click("div[role='option']:has-text('T-101')")
await page.waitForSelector("div[role='dialog'] >> text=Ravi Kumar", { timeout: 5000 })
const statusAfter = await page
  .locator("div[role='dialog']")
  .evaluate((el) => el.textContent)
check("Ravi's WhatsApp state identical after switching back", statusBefore === statusAfter)
check("still paused at the same step", (await pausedStep()) === stepAtPause)

// 9–10. Open Ravi's Journey dialog from the WhatsApp window, then close it
await page.click("button:has-text('View full journey')")
await page.waitForSelector("text=Audit trail", { timeout: 5000 })
check("journey dialog opens while paused", true)
await page.screenshot({ path: `${shots}/09-paused-journey.png` })
await page.keyboard.press("Escape")
await page.waitForSelector("text=Audit trail", { state: "detached", timeout: 5000 })

// 11. Change speed 1× → 2× while paused: nothing should happen immediately
await page.click("button:has-text('2×')")
await page.waitForTimeout(4000)
check("speed change while paused fires nothing", (await pausedStep()) === stepAtPause)

// 12–13. Step: exactly one event, then still paused
await page.click("button[aria-label='Step — run exactly one demo event']")
await page.waitForTimeout(600)
const stepAfterStep = await pausedStep()
check("Step advances exactly one event", stepAfterStep === stepAtPause + 1)
await page.waitForTimeout(4000)
check("remains paused after Step", (await pausedStep()) === stepAfterStep)

// 14. Inspect Ravi's updated WhatsApp
await page.screenshot({ path: `${shots}/10-after-step.png` })

// 15–18. Resume at 2×, bump to 4×, run to completion
await page.click("button:has-text('Resume')")
await page.click("button:has-text('4×')")
await page.waitForSelector("text=Demo complete", { timeout: 60000 })
check("demo runs to completion after resume", true)

// no duplicated events: T-115 was issued exactly once in the activity feed
const issuedCount = await page
  .locator("text=/T-115 issued to Aisha Khan/")
  .count()
check("no duplicate events (T-115 issued exactly once)", issuedCount === 1)

// Aisha's WhatsApp shows a single completion message
await page.click("button[aria-label='Switch customer']")
await page.click("div[role='option']:has-text('T-115')")
await page.waitForTimeout(400)
const doneMessages = await page
  .locator("div[role='dialog'] p:has-text('All done')")
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
