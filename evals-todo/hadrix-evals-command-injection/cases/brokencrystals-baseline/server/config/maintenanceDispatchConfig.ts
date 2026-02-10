export const MAINTENANCE_DISPATCH_CONFIG = {
  appName: "BrokenCrystals Ops Console",
  dispatchLabel: "Maintenance Dispatch",
  supportChannel: "#ops-maintenance",
  commandRunner: "spawn.sh",
  statusMessage: "Jobs run in the background and stream logs on completion.",
} as const;
