"use client"

import { useState } from "react"
import { Sparkles, TicketPlus, UserPlus } from "lucide-react"
import { notifyTransient } from "@/lib/notifications"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { COUNTER_DEFS } from "@/lib/queue-logic"
import { useQueueStore } from "@/lib/queue-store"
import { SERVICE_TYPES, type ServiceType } from "@/lib/types"

const SAMPLE_NAMES = [
  "Amit Sharma",
  "Neha Reddy",
  "Karan Singh",
  "Pooja Menon",
  "Rajesh Pillai",
  "Shreya Das",
  "Manoj Kulkarni",
  "Divya Nambiar",
]

function randomName(): string {
  return SAMPLE_NAMES[Math.floor(Math.random() * SAMPLE_NAMES.length)]
}

export function NewCustomerCard() {
  const issue = useQueueStore((s) => s.issue)
  const [name, setName] = useState("")
  const [serviceType, setServiceType] = useState<ServiceType>("Cash Deposit")
  const [counterId, setCounterId] = useState("1")

  function announce(customerId: string, counter: number) {
    const state = useQueueStore.getState().state
    const customer = state.customers[customerId]
    const queue = state.counters.find((c) => c.id === counter)?.queue ?? []
    notifyTransient(`Token ${customer.token} issued`, {
      kind: "success",
      description: `${customer.name} joined Counter ${counter} at position #${queue.indexOf(customerId) + 1}`,
    })
  }

  function handleIssue() {
    const customer = issue({ name, serviceType, counterId: Number(counterId) })
    announce(customer.id, Number(counterId))
    setName("")
  }

  function handleWalkIn() {
    const services: ServiceType[] = ["Cash Deposit", "Cash Withdrawal"]
    const customer = issue({
      name: randomName(),
      serviceType: services[Math.floor(Math.random() * services.length)],
      counterId: 2,
    })
    announce(customer.id, 2)
  }

  function handleComplexRequest() {
    const customer = issue({
      name: randomName(),
      serviceType: "Account Opening",
      counterId: 1,
      plannedRoute: [5, 3],
    })
    announce(customer.id, 1)
    notifyTransient("Multi-counter journey planned", {
      description: `${customer.token} will visit Counter 1 → 4 → 3`,
    })
  }

  return (
    <section aria-label="New customer" className="flex flex-col gap-3">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <UserPlus className="size-4 text-primary" aria-hidden />
          New Customer
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Reception issues a token that follows the customer everywhere.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="customer-name">Customer</Label>
          <Input
            id="customer-name"
            placeholder="Optional — e.g. Asha Rao"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleIssue()}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="service-type">Service</Label>
          <Select
            value={serviceType}
            onValueChange={(v) => setServiceType(v as ServiceType)}
          >
            <SelectTrigger id="service-type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SERVICE_TYPES.map((service) => (
                <SelectItem key={service} value={service}>
                  {service}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="first-counter">First Counter</Label>
          <Select value={counterId} onValueChange={(v) => setCounterId(String(v))}>
            <SelectTrigger id="first-counter" className="w-full">
              <SelectValue>
                {(value: string) => {
                  const def = COUNTER_DEFS.find((c) => String(c.id) === value)
                  return def ? `Counter ${def.id} — ${def.name}` : "Select counter"
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {COUNTER_DEFS.map((counter) => (
                <SelectItem key={counter.id} value={String(counter.id)}>
                  Counter {counter.id} — {counter.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button onClick={handleIssue} className="w-full">
          <TicketPlus data-icon="inline-start" aria-hidden />
          Issue Token
        </Button>

        <div className="flex flex-col gap-2">
          <p className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
            Quick Demo
          </p>
          <Button variant="outline" size="sm" onClick={handleWalkIn}>
            <UserPlus data-icon="inline-start" aria-hidden />
            + Walk-in Customer
          </Button>
          <Button variant="outline" size="sm" onClick={handleComplexRequest}>
            <Sparkles data-icon="inline-start" aria-hidden />
            + Complex Request
          </Button>
        </div>
      </div>
    </section>
  )
}
