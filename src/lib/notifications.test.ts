import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  }),
}))

import { toast } from "sonner"

import {
  activityPriority,
  notifyTransient,
  TRANSIENT_TOAST_ID,
} from "./notifications"

const infoMock = toast.info as ReturnType<typeof vi.fn>
const successMock = toast.success as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
})

describe("notification priority (calm dashboard)", () => {
  it("high-value events earn a transient notification", () => {
    expect(activityPriority("token-issued")).toBe("high")
    expect(activityPriority("called")).toBe("high")
    expect(activityPriority("transferred")).toBe("high")
    expect(activityPriority("journey-completed")).toBe("high")
  })

  it("low-value events stay in the Activity Center only", () => {
    expect(activityPriority("service-completed")).toBe("low")
    expect(activityPriority("reset")).toBe("low")
  })
})

describe("transient notifications never stack", () => {
  it("every transient reuses the SAME toast id, replacing the previous one", () => {
    notifyTransient("first event")
    notifyTransient("second event")
    notifyTransient("third event", { kind: "success" })

    const allCalls = [...infoMock.mock.calls, ...successMock.mock.calls]
    expect(allCalls).toHaveLength(3)
    for (const [, options] of allCalls) {
      expect(options.id).toBe(TRANSIENT_TOAST_ID) // same slot → no stacking
    }
  })

  it("auto-dismisses after roughly 2–3 seconds by default", () => {
    notifyTransient("event")
    const [, options] = infoMock.mock.calls[0]
    expect(options.duration).toBeGreaterThanOrEqual(2000)
    expect(options.duration).toBeLessThanOrEqual(3000)
  })
})
