type QueryError = { message: string };

type UserRole = "admin" | "member";

type AdminUserRow = {
  id: string;
  email: string;
  role: UserRole;
  created_at: string;
};

type ApiTokenRow = {
  id: string;
  user_id: string;
  token_plaintext: string;
  created_at: string;
};

type AuditLogRow = {
  actor_user_id: string;
  action: string;
  target: string;
  metadata: Record<string, unknown>;
};

type InMemoryStore = {
  users: AdminUserRow[];
  apiTokens: ApiTokenRow[];
  auditLogs: AuditLogRow[];
};

const TABLE_API_TOKENS = "api_tokens" as const;
const TABLE_AUDIT_LOGS = "audit_logs" as const;

const ROLE_ADMIN: UserRole = "admin";

const SEED_TIMESTAMP = "2024-04-12T08:00:00.000Z";

const SEED_USERS: AdminUserRow[] = [
  {
    id: "ops-admin-1",
    email: "ops-admin@ops.local",
    role: ROLE_ADMIN,
    created_at: SEED_TIMESTAMP
  }
];

function createStore(): InMemoryStore {
  return {
    users: SEED_USERS.map((user) => ({ ...user })),
    apiTokens: [],
    auditLogs: []
  };
}

function parseColumns(columnList?: string): string[] | null {
  if (!columnList) return null;
  const columns = columnList
    .split(",")
    .map((column) => column.trim())
    .filter(Boolean);
  return columns.length ? columns : null;
}

function projectRow<T extends Record<string, unknown>>(row: T, columns: string[] | null): Partial<T> {
  if (!columns) {
    return { ...row };
  }

  const projected: Partial<T> = {};
  for (const column of columns) {
    if (column in row) {
      projected[column as keyof T] = row[column as keyof T];
    }
  }
  return projected;
}

class InsertBuilder<T extends Record<string, unknown>> {
  private columns: string[] | null = null;

  constructor(private rows: T[]) {}

  select(columns: string) {
    this.columns = parseColumns(columns);
    return this;
  }

  async single(): Promise<{ data: Partial<T> | null; error: QueryError | null }> {
    const row = this.rows[0] ?? null;
    return { data: row ? projectRow(row, this.columns) : null, error: null };
  }

  then<TResult1, TResult2>(
    onfulfilled?: (value: { data: T[]; error: QueryError | null }) => TResult1 | PromiseLike<TResult1>,
    onrejected?: (reason: unknown) => TResult2 | PromiseLike<TResult2>
  ) {
    const value = { data: this.rows, error: null };
    return Promise.resolve(value).then(onfulfilled, onrejected);
  }
}

class InMemoryQuery<T extends Record<string, unknown>> {
  constructor(private rows: T[], private normalize?: (row: T) => T) {}

  insert(payload: T | T[]) {
    const inputRows = Array.isArray(payload) ? payload : [payload];
    const storedRows = inputRows.map((row) => (this.normalize ? this.normalize(row) : { ...row }));
    this.rows.push(...storedRows);
    return new InsertBuilder(storedRows);
  }
}

function createAdminAuth(store: InMemoryStore) {
  return {
    async deleteUser(userId: string): Promise<{ data: { id: string } | null; error: QueryError | null }> {
      const index = store.users.findIndex((user) => user.id === userId);
      if (index === -1) {
        return { data: null, error: { message: "user not found" } };
      }
      store.users.splice(index, 1);
      return { data: { id: userId }, error: null };
    }
  };
}

export function supabaseAdmin() {
  const store = createStore();
  return {
    auth: {
      admin: createAdminAuth(store)
    },
    from(table: string) {
      if (table === TABLE_API_TOKENS) {
        return new InMemoryQuery<ApiTokenRow>(store.apiTokens, (row) => ({
          id: `token_${store.apiTokens.length + 1}`,
          created_at: SEED_TIMESTAMP,
          ...row
        }));
      }
      if (table === TABLE_AUDIT_LOGS) {
        return new InMemoryQuery<AuditLogRow>(store.auditLogs);
      }
      return new InMemoryQuery<Record<string, unknown>>([]);
    }
  };
}

export function supabaseAnon() {
  return supabaseAdmin();
}
