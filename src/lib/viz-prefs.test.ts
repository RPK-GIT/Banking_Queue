import { describe, expect, it } from "vitest"

import { getVizPref, loadVizPrefs, saveVizPref } from "./viz-prefs"

function fakeStorage(): { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void; data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
  }
}

describe("visualization preferences persist locally", () => {
  it("falls back to the chart default when nothing is stored", () => {
    const storage = fakeStorage()
    expect(getVizPref("employee-workload", "h-bar", storage)).toBe("h-bar")
    expect(getVizPref("token-distribution", "donut", storage)).toBe("donut")
  })

  it("remembers a changed visualization across reloads", () => {
    const storage = fakeStorage()
    saveVizPref("employee-workload", "donut", storage)
    // simulate closing and reopening the Manager Dashboard
    expect(getVizPref("employee-workload", "h-bar", storage)).toBe("donut")
  })

  it("keeps preferences per chart", () => {
    const storage = fakeStorage()
    saveVizPref("employee-workload", "table", storage)
    saveVizPref("queue-pressure", "v-bar", storage)
    expect(loadVizPrefs(storage)).toEqual({
      "employee-workload": "table",
      "queue-pressure": "v-bar",
    })
  })

  it("stores only visualization choices, no business data", () => {
    const storage = fakeStorage()
    saveVizPref("employee-workload", "donut", storage)
    const raw = storage.data.get("smart-bank-queue-viz-v1") ?? ""
    expect(raw).not.toMatch(/T-1\d\d|customer|journey/i)
  })

  it("survives corrupted storage gracefully", () => {
    const storage = fakeStorage()
    storage.setItem("smart-bank-queue-viz-v1", "{not json")
    expect(loadVizPrefs(storage)).toEqual({})
    expect(getVizPref("employee-workload", "h-bar", storage)).toBe("h-bar")
  })
})
