import {
  callNextCustomer,
  completeCurrentService,
  emptyState,
  issueToken,
  transferCustomer,
} from "./queue-logic"
import type { Customer, QueueState, ServiceType } from "./types"

/** the hero customer of every demo — Ravi Kumar, token T-104 */
export const HERO_TOKEN = "T-104"

/**
 * Builds the demo scenario by replaying real operations at back-dated
 * timestamps, so seeded state always satisfies every business rule.
 *
 * RECOMMENDATION ≠ ASSIGNMENT: a customer starts service only through an
 * explicit call — the replay performs the same explicit `callNextCustomer`
 * (call the recommended customer) an employee would.
 *
 * Hero journey (T-104 Ravi Kumar): Counter 1 → Counter 4 → Counter 3 →
 * (planned return to Counter 1) → Completed.
 */
export function seedState(now: number): QueueState {
  const state = emptyState()
  const at = (minutesAgo: number) => now - minutesAgo * 60_000
  const issued: Record<string, Customer> = {}

  const issue = (
    minutesAgo: number,
    name: string,
    serviceType: ServiceType,
    counterId: number,
    plannedRoute: number[] = []
  ) => {
    issued[name] = issueToken(
      state,
      { name, serviceType, counterId, plannedRoute },
      at(minutesAgo)
    )
  }
  const call = (counterId: number, minutesAgo: number) =>
    callNextCustomer(state, counterId, at(minutesAgo))

  issue(45, "Anil Mehta", "Cash Withdrawal", 2) // T-101
  call(2, 45) // Arjun calls the recommended customer
  issue(43, "Suresh Nair", "Demand Draft", 1) // T-102
  call(1, 43)
  issue(41, "Meena Iyer", "KYC Update", 3, [4]) // T-103
  call(3, 41)
  // T-104 Ravi — the hero: complex journey C1 → C4 → C3 → C1
  issue(40, "Ravi Kumar", "Account Opening", 1, [4, 3, 1]) // waits behind Suresh
  completeCurrentService(state, 1, at(38)) // Suresh done — Ravi recommended
  call(1, 38) // Priya explicitly calls Ravi
  transferCustomer(state, issued["Ravi Kumar"].id, 4, at(32)) // recommended at C4
  call(4, 32) // Deepa calls Ravi
  completeCurrentService(state, 2, at(30)) // Anil completed — C2 idle
  issue(28, "Anita Desai", "Cash Deposit", 2) // T-105
  call(2, 28)
  // Meena's journey has started → she joins C4's JOURNEY IN PROGRESS queue
  transferCustomer(state, issued["Meena Iyer"].id, 4, at(26))
  issue(25, "Rohan Gupta", "Cheque Services", 1) // T-106
  call(1, 25)
  transferCustomer(state, issued["Ravi Kumar"].id, 3, at(24)) // recommended at C3
  call(3, 24) // Kavita calls Ravi
  call(4, 24) // C4 freed by Ravi's transfer — Deepa calls Meena (priority)
  issue(20, "Farhan Ali", "Address Update", 4) // T-107 — waits behind Meena
  issue(18, "Lakshmi Rao", "Cash Withdrawal", 2) // T-108 — waits behind Anita
  issue(15, "Joseph Thomas", "Demand Draft", 4) // T-109
  issue(12, "Priyanka Shah", "Account Opening", 3) // T-110 — waits behind Ravi
  completeCurrentService(state, 2, at(8)) // Anita done — Lakshmi recommended
  call(2, 8)
  issue(6, "Dinesh Patel", "Cash Deposit", 2) // T-111
  issue(5, "Sunita Verma", "KYC Update", 3) // T-112
  issue(3, "Ramesh Babu", "Loan Enquiry", 2) // T-113
  issue(2, "Geeta Krishnan", "Cheque Services", 1) // T-114 — waits behind Rohan
  completeCurrentService(state, 4, at(1)) // Meena done — Farhan recommended
  call(4, 1)

  return state
}
