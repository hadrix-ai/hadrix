export const KICKOFF_PREFLIGHT_CHECKS = [
  {
    id: "queue-capacity",
    label: "Queue capacity",
    detail: "Confirms the kickoff queue is below the soft cap."
  },
  {
    id: "plan-window",
    label: "Plan window",
    detail: "Verifies the org has draft slots left in the current window."
  },
  {
    id: "risk-snapshot",
    label: "Risk snapshot",
    detail: "Surface any open incident tags tied to the org."
  }
] as const;
