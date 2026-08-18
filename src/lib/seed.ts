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
 * Hero journey (T-104 Ravi Kumar): Counter 1 → Counter 4 → Counter 3 → (planned
 * return to Counter 1) → Completed.
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

  issue(45, "Anil Mehta", "Cash Withdrawal", 2) // T-101
  callNextCustomer(state, 2, at(44))
  issue(43, "Suresh Nair", "Demand Draft", 1) // T-102
  callNextCustomer(state, 1, at(42))
  issue(41, "Meena Iyer", "KYC Update", 3, [4]) // T-103
  callNextCustomer(state, 3, at(40))
  // T-104 Ravi — the hero: complex journey C1 → C4 → C3 → C1
  issue(40, "Ravi Kumar", "Account Opening", 1, [4, 3, 1])
  completeCurrentService(state, 1, at(38)) // Suresh completed
  callNextCustomer(state, 1, at(38)) // Ravi now serving at Counter 1
  transferCustomer(state, issued["Ravi Kumar"].id, 4, at(32))
  callNextCustomer(state, 4, at(31)) // Ravi now serving at Counter 4
  completeCurrentService(state, 2, at(30)) // Anil completed
  issue(28, "Anita Desai", "Cash Deposit", 2) // T-105
  callNextCustomer(state, 2, at(28))
  transferCustomer(state, issued["Meena Iyer"].id, 4, at(26)) // waits behind Ravi
  issue(25, "Rohan Gupta", "Cheque Services", 1) // T-106
  callNextCustomer(state, 1, at(25))
  transferCustomer(state, issued["Ravi Kumar"].id, 3, at(24))
  callNextCustomer(state, 3, at(23)) // Ravi now serving at Counter 3
  callNextCustomer(state, 4, at(22)) // Meena now serving at Counter 4
  issue(20, "Farhan Ali", "Address Update", 4) // T-107
  issue(18, "Lakshmi Rao", "Cash Withdrawal", 2) // T-108
  issue(15, "Joseph Thomas", "Demand Draft", 4) // T-109
  issue(12, "Priyanka Shah", "Account Opening", 3) // T-110
  completeCurrentService(state, 2, at(8)) // Anita completed
  callNextCustomer(state, 2, at(8)) // Lakshmi now serving at Counter 2
  issue(6, "Dinesh Patel", "Cash Deposit", 2) // T-111
  issue(5, "Sunita Verma", "KYC Update", 3) // T-112
  issue(3, "Ramesh Babu", "Loan Enquiry", 2) // T-113
  issue(2, "Geeta Krishnan", "Cheque Services", 1) // T-114
  completeCurrentService(state, 4, at(1)) // Meena completed — Counter 4 free

  return state
}
