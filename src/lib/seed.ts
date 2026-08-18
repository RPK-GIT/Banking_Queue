import {
  callNextCustomer,
  completeCurrentService,
  emptyState,
  issueToken,
  transferCustomer,
} from "./queue-logic"
import type { Customer, QueueState, ServiceType } from "./types"

/**
 * Builds the demo scenario by replaying real operations at back-dated
 * timestamps, so seeded state always satisfies every business rule.
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

  // T-101 Ravi — the complex multi-counter journey: C1 → C5 → C3 → C1
  issue(40, "Ravi Kumar", "Account Opening", 1, [5, 3, 1])
  callNextCustomer(state, 1, at(38))
  issue(36, "Anil Mehta", "Cash Withdrawal", 2)
  callNextCustomer(state, 2, at(35))
  issue(33, "Meena Iyer", "KYC Update", 3, [5])
  callNextCustomer(state, 3, at(32))
  issue(31, "Suresh Nair", "Loan Enquiry", 4)
  callNextCustomer(state, 4, at(30))
  transferCustomer(state, issued["Ravi Kumar"].id, 5, at(30))
  callNextCustomer(state, 5, at(29))
  completeCurrentService(state, 2, at(28)) // Anil completed
  issue(26, "Anita Desai", "Cash Deposit", 2)
  callNextCustomer(state, 2, at(26))
  transferCustomer(state, issued["Meena Iyer"].id, 5, at(25))
  completeCurrentService(state, 4, at(24)) // Suresh completed
  issue(22, "Rohan Gupta", "Cheque Services", 1)
  callNextCustomer(state, 1, at(22))
  transferCustomer(state, issued["Ravi Kumar"].id, 3, at(20))
  callNextCustomer(state, 5, at(19)) // Meena now serving at Counter 5
  callNextCustomer(state, 3, at(18)) // Ravi now serving at Counter 3
  issue(17, "Farhan Ali", "Demand Draft", 4)
  callNextCustomer(state, 4, at(17))
  issue(15, "Lakshmi Rao", "Cash Withdrawal", 2)
  issue(12, "Joseph Thomas", "Address Update", 5)
  issue(10, "Priyanka Shah", "Account Opening", 3)
  completeCurrentService(state, 2, at(8)) // Anita completed
  callNextCustomer(state, 2, at(8)) // Lakshmi now serving at Counter 2
  issue(6, "Dinesh Patel", "Cash Deposit", 2)
  issue(5, "Sunita Verma", "KYC Update", 3)
  issue(3, "Ramesh Babu", "Loan Enquiry", 4)
  issue(2, "Geeta Krishnan", "Cheque Services", 1)
  completeCurrentService(state, 4, at(1)) // Farhan completed — Counter 4 free

  return state
}
