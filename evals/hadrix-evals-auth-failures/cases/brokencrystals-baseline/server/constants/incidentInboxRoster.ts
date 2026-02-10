export const INCIDENTS = [
  {
    id: "INC-2401",
    title: "Export queue stalled",
    status: "open",
    customer: "Lumen Labs",
    summary: "Daily export has been stuck in queued state for 2 hours.",
    internalNotes: "Worker-3 restart cleared backlog once already; watch for repeats.",
  },
  {
    id: "INC-2402",
    title: "Webhook deliveries delayed",
    status: "investigating",
    customer: "SwiftShip",
    summary: "Delivery timestamps drifted after the last deploy.",
    internalNotes: "Repro shows retry policy firing twice for 5xx responses.",
  },
];
