export const accountDirectoryConfig = {
  route: "/account-directory",
  tableName: "accounts",
  query:
    "select id, display_name, segment, status from public.accounts order by created_at desc",
  title: "BrokenCrystals Account Directory",
} as const;
