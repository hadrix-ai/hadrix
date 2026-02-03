
const buildLogPrefix = () => ["Executing", "SQL:"].join(" ");

const logStatement = (statement: string) => {
  console.log(buildLogPrefix(), statement);
};

const normalizeStatement = (statement: string) => statement;

export async function runQuery<T = unknown>(statement: string): Promise<T[]> {
  const resolved = normalizeStatement(statement);
  logStatement(resolved);
  return [];
}
