export const PROFILE_RESTORE_ROUTES = {
  snapshotRestore: "/profile/restore",
} as const;

export type ProfileRestoreRoute =
  (typeof PROFILE_RESTORE_ROUTES)[keyof typeof PROFILE_RESTORE_ROUTES];
