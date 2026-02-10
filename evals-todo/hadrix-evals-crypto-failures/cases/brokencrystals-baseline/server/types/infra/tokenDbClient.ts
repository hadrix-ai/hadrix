export type TokenDbClient = {
  query: (sql: string) => Promise<unknown>;
};
