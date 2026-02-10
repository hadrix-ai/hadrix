type QueryError = { message: string };

type UserRole = "admin" | "agent" | "support";

type ProfileRow = {
  id: string;
  email: string;
  role: UserRole;
  org_id: string;
  created_at: string;
};

type AuditLogRow = {
  actor_user_id: string;
  action: string;
  target: string;
  metadata: Record<string, unknown>;
};

type InMemoryStore = {
  profiles: ProfileRow[];
  auditLogs: AuditLogRow[];
};

const TABLE_PROFILES = "profiles" as const;
const TABLE_AUDIT_LOGS = "audit_logs" as const;

type TableName = typeof TABLE_PROFILES | typeof TABLE_AUDIT_LOGS;

const ROLE_ADMIN: UserRole = "admin";
const ROLE_AGENT: UserRole = "agent";
const ROLE_SUPPORT: UserRole = "support";

const ORG_CRYSTAL = "org-crystal";
const ORG_LIGHTHOUSE = "org-lighthouse";

const SEED_PROFILES: ProfileRow[] = [
  {
    id: "user-1001",
    email: "ivy@brokencrystals.test",
    role: ROLE_SUPPORT,
    org_id: ORG_CRYSTAL,
    created_at: "2024-03-11T12:00:00.000Z"
  },
  {
    id: "user-1002",
    email: "ren@brokencrystals.test",
    role: ROLE_AGENT,
    org_id: ORG_CRYSTAL,
    created_at: "2024-03-10T18:30:00.000Z"
  },
  {
    id: "user-1003",
    email: "maria@brokencrystals.test",
    role: ROLE_ADMIN,
    org_id: ORG_LIGHTHOUSE,
    created_at: "2024-03-09T09:15:00.000Z"
  }
];

function createStore(): InMemoryStore {
  return {
    profiles: SEED_PROFILES.map((profile) => ({ ...profile })),
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

function projectColumns<T extends Record<string, unknown>>(
  rows: T[],
  columns: string[] | null
): Partial<T>[] {
  if (!columns) {
    return rows.map((row) => ({ ...row }));
  }

  return rows.map((row) => {
    const projected: Partial<T> = {};
    for (const column of columns) {
      if (column in row) {
        projected[column as keyof T] = row[column as keyof T];
      }
    }
    return projected;
  });
}

function compareValues(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") {
    return a - b;
  }
  return String(a ?? "").localeCompare(String(b ?? ""));
}

function applyOrder<T extends Record<string, unknown>>(
  rows: T[],
  orderBy: { column: string; ascending: boolean } | null
): T[] {
  if (!orderBy) return rows;
  const { column, ascending } = orderBy;
  const sorted = [...rows].sort((left, right) => {
    const delta = compareValues(left[column], right[column]);
    return ascending ? delta : -delta;
  });
  return sorted;
}

class InMemoryQuery<T extends Record<string, unknown>> {
  private columns: string[] | null = null;
  private orderBy: { column: string; ascending: boolean } | null = null;

  constructor(private rows: T[]) {}

  select(columns: string) {
    this.columns = parseColumns(columns);
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderBy = { column, ascending: options?.ascending ?? true };
    return this;
  }

  async limit(count: number): Promise<{ data: Partial<T>[]; error: QueryError | null }> {
    const limited = applyOrder(this.rows, this.orderBy).slice(0, Math.max(0, count));
    return { data: projectColumns(limited, this.columns), error: null };
  }

  async insert(payload: T | T[]): Promise<{ data: T[]; error: QueryError | null }> {
    const rows = Array.isArray(payload) ? payload : [payload];
    this.rows.push(...rows);
    return { data: rows, error: null };
  }
}

function createAdminAuth(store: InMemoryStore) {
  return {
    async deleteUser(userId: string): Promise<{ data: { id: string } | null; error: QueryError | null }> {
      const index = store.profiles.findIndex((profile) => profile.id === userId);
      if (index === -1) {
        return { data: null, error: { message: "user not found" } };
      }
      store.profiles.splice(index, 1);
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
    from(table: TableName) {
      if (table === TABLE_PROFILES) {
        return new InMemoryQuery<ProfileRow>(store.profiles);
      }
      if (table === TABLE_AUDIT_LOGS) {
        return new InMemoryQuery<AuditLogRow>(store.auditLogs);
      }
      return new InMemoryQuery<Record<string, unknown>>([]);
    }
  };
}
