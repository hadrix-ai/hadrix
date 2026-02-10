type PasswordResetRecord = {
  user_id: string | null;
  reset_token_value?: string | null;
};

type QueryError = {
  message: string;
};

type InsertResult = Promise<{ data: PasswordResetRecord[] | null; error: QueryError | null }>;

const passwordResets: PasswordResetRecord[] = [];

function createUnknownTableResult<T>(): { data: T | null; error: QueryError } {
  return { data: null, error: { message: "unknown table" } };
}

function createLocalAdminClient() {
  return {
    from(table: string) {
      if (table !== "password_resets") {
        return {
          insert: async (_rows: PasswordResetRecord | PasswordResetRecord[]): InsertResult =>
            createUnknownTableResult<PasswordResetRecord[]>()
        };
      }

      return {
        insert: async (rows: PasswordResetRecord | PasswordResetRecord[]): InsertResult => {
          const normalized = Array.isArray(rows) ? rows : [rows];
          passwordResets.push(
            ...normalized.map((row) => ({
              user_id: row.user_id ?? null,
              reset_token_value: row.reset_token_value ?? null
            }))
          );
          return { data: normalized, error: null };
        }
      };
    }
  };
}

export function supabaseAdmin() {
  return createLocalAdminClient();
}
