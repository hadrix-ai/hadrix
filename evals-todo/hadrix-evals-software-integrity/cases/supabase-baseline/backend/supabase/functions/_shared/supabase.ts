type QueryError = { message: string };

type WebhookEventRow = {
  event_type: string;
  raw_payload: unknown;
  received_at?: string;
};

type InMemoryStore = {
  webhookEvents: WebhookEventRow[];
};

const TABLE_WEBHOOK_EVENTS = "webhook_events" as const;

const SEED_TIMESTAMP = "2024-04-18T10:30:00.000Z";

function createStore(): InMemoryStore {
  return {
    webhookEvents: []
  };
}

class InMemoryQuery<T extends Record<string, unknown>> {
  constructor(private rows: T[], private normalize?: (row: T) => T) {}

  async insert(payload: T | T[]): Promise<{ data: T[]; error: QueryError | null }> {
    const inputRows = Array.isArray(payload) ? payload : [payload];
    const storedRows = inputRows.map((row) => (this.normalize ? this.normalize(row) : { ...row }));
    this.rows.push(...storedRows);
    return { data: storedRows, error: null };
  }
}

export function supabaseAdmin() {
  const store = createStore();
  return {
    from(table: string) {
      if (table === TABLE_WEBHOOK_EVENTS) {
        return new InMemoryQuery<WebhookEventRow>(store.webhookEvents, (row) => ({
          received_at: SEED_TIMESTAMP,
          ...row
        }));
      }
      return new InMemoryQuery<Record<string, unknown>>([]);
    }
  };
}

export function supabaseAnon() {
  return supabaseAdmin();
}
