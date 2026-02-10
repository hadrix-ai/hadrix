type ApiTokenRow = {
  id: string;
  user_id: string;
  token_value: string;
  created_at: string;
};

const BASE_TIME_MS = Date.parse("2024-01-01T00:00:00.000Z");

function selectColumns<T extends Record<string, unknown>>(row: T, columns: string): Partial<T> {
  const columnList = columns
    .split(",")
    .map((col) => col.trim())
    .filter(Boolean);

  if (!columnList.length) return { ...row };

  const selected: Partial<T> = {};
  for (const col of columnList) {
    if (col in row) (selected as Record<string, unknown>)[col] = row[col];
  }
  return selected;
}

function createInMemoryClient() {
  let insertCount = 0;

  function buildCreatedAt() {
    const ts = new Date(BASE_TIME_MS + insertCount * 1000);
    return ts.toISOString();
  }

  return {
    from(table: string) {
      if (table !== "api_tokens") {
        return {
          insert() {
            return {
              select() {
                return {
                  async single() {
                    return { data: null, error: { message: `unknown table: ${table}` } };
                  }
                };
              }
            };
          }
        };
      }

      return {
        insert(payload: { user_id?: string; token_value?: string }) {
          const row: ApiTokenRow = {
            id: `token_${insertCount + 1}`,
            user_id: payload.user_id ?? "",
            token_value: payload.token_value ?? "",
            created_at: buildCreatedAt()
          };
          insertCount += 1;

          return {
            select(columns: string) {
              const selected = selectColumns(row, columns);
              return {
                async single() {
                  return { data: selected, error: null };
                }
              };
            }
          };
        }
      };
    }
  };
}

export function supabaseAdmin() {
  return createInMemoryClient();
}

export function supabaseAnon() {
  return createInMemoryClient();
}
