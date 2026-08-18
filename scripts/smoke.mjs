// Smoke-drives the dashboard in headless Edge and saves screenshots.
import { chromium } from "playwright"

const shots = "scripts/shots"
const errors = []

const browser = await chromium.launch({ channel: "msedge", headless: true })
const page = await browser.newPage({ viewport: { width: 1680, height: 1050 } })
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text())
})
page.on("pageerror", (err) => errors.push(String(err)))

const url = process.env.APP_URL ?? "http://localhost:3001"
await page.goto(url, { waitUntil: "domcontentloaded" })
await page.waitForSelector("text=Smart Bank Queue", { timeout: 30000 })
await page.waitForSelector("text=Counter 5", { timeout: 30000 })
await page.screenshot({ path: `${shots}/01-dashboard.png`, fullPage: false })

// open the complex customer's journey (T-101) via its serving card
await page.click("text=T-101")
await page.waitForSelector("text=Audit trail", { timeout: 10000 })
await page.screenshot({ path: `${shots}/02-journey.png` })
await page.keyboard.press("Escape")

// issue a token
await page.fill("#customer-name", "Smoke Test")
await page.click("text=Issue Token")
await page.waitForSelector("text=Smoke Test", { timeout: 10000 })

// open transfer dialog on Counter 1's serving customer
const transferButtons = page.locator("button:has-text('Transfer')")
await transferButtons.first().click()
await page.waitForSelector("text=Transfer to Another Counter", { timeout: 10000 })
await page.screenshot({ path: `${shots}/03-transfer.png` })
// pick the first destination option and confirm
await page.click("button:has-text('waiting → joins at')")
await page.click("button:has-text('Transfer Customer')")
await page.waitForSelector("text=transferred", { timeout: 10000 })
await page.screenshot({ path: `${shots}/04-after-transfer.png` })

await browser.close()

if (errors.length) {
  console.log("CONSOLE ERRORS:")
  for (const e of errors) console.log(" -", e)
  process.exit(1)
}
console.log("SMOKE OK — no console errors")
