// TODO: Add a "health" panel when we decide on which service checks to surface.
export const OPS_DIAGNOSTICS_PANELS = [
  {
    id: "headers",
    label: "Request headers",
    summary: "Echoes incoming headers to confirm proxy handoff."
  },
  {
    id: "env",
    label: "Env snapshot",
    summary: "Shows deployment secrets configured for ops checks."
  }
] as const;
