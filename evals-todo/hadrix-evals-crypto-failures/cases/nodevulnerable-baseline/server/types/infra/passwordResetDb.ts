export type PasswordResetRow = {
  user_id: string;
  token_value: string;
};

export type PasswordResetDb = {
  query: (sql: string, params: unknown[]) => Promise<{ rows: PasswordResetRow[] }>;
};
