import path from "node:path";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { mkdir, readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import pg from "pg";
import type { StaticFinding, Severity } from "../types.js";
import { noopLogger, type Logger } from "../logging/logger.js";

const { Client } = pg;

const CLIENT_GRANTEES = ["public", "anon", "authenticated"];
const ROUTINE_GRANTEES = [...CLIENT_GRANTEES, "service_role"];
const WRITE_PRIVILEGES = new Set(["INSERT", "UPDATE", "DELETE", "TRUNCATE"]);
const SYSTEM_SCHEMA_FILTER = ["pg_catalog", "information_schema"];
const SYSTEM_SCHEMA_LIKE = ["pg_toast%", "pg_temp_%"];
const SUPABASE_CLI = "supabase";
const DEFAULT_SCHEMA_LIST = ["public", "auth", "storage"];
const STORAGE_EXCLUDE_TABLES = [
  "storage.objects",
  "storage.migrations",
  "storage.s3_multipart_uploads",
  "storage.s3_multipart_uploads_parts"
];

type SupabaseSchemaScanResult = {
  findings: StaticFinding[];
  schemaPath: string;
};

type SupabaseSchemaMetadata = {
  fetchedAt: string;
  tables: Array<Record<string, unknown>>;
  columns: Array<Record<string, unknown>>;
  indexes: Array<Record<string, unknown>>;
  constraints: Array<Record<string, unknown>>;
  policies: Array<Record<string, unknown>>;
  rls: Array<Record<string, unknown>>;
  tablePrivileges: Array<Record<string, unknown>>;
  columnAcl: Array<Record<string, unknown>>;
  columnPrivileges: Array<Record<string, unknown>>;
  routines: Array<Record<string, unknown>>;
  routinePrivileges: Array<Record<string, unknown>>;
  storageBuckets: Array<Record<string, unknown>>;
  errors: Array<{ stage: string; message: string }>;
};

type SupabaseCliRunResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
};

type SupabaseCliError = Error & { code?: string };

type LoggerControls = {
  pause?: () => void;
  resume?: () => void;
};

function normalizeRelPath(value: string): string {
  return value.replace(/\\/g, "/");
}

function normalizeRows(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item && typeof item === "object") as Array<Record<string, unknown>>;
}

function normalizeRoleList(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim().toLowerCase()).filter(Boolean);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      return trimmed
        .slice(1, -1)
        .split(",")
        .map((role) => role.replace(/^\"|\"$/g, "").trim().toLowerCase())
        .filter(Boolean);
    }
    return trimmed
      .split(",")
      .map((role) => role.trim().toLowerCase())
      .filter(Boolean);
  }
  return [];
}

function findOnPath(command: string): string | null {
  const pathEnv = process.env.PATH ?? "";
  const parts = pathEnv.split(path.delimiter);
  const extList = process.platform === "win32" ? [".exe", ".cmd", ".bat", ""] : [""];
  for (const dir of parts) {
    for (const ext of extList) {
      const candidate = path.join(dir, `${command}${ext}`);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function resolveSupabaseCliPath(): string | null {
  return findOnPath(SUPABASE_CLI);
}

async function runSupabaseCli(
  command: string,
  args: string[],
  cwd: string
): Promise<SupabaseCliRunResult> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const proc = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("error", (err) => reject(err));
    proc.on("close", (code) => {
      resolve({
        exitCode: code,
        stdout,
        stderr,
        durationMs: Date.now() - start
      });
    });
  });
}

async function runSupabaseCliInteractive(
  command: string,
  args: string[],
  cwd: string
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd,
      stdio: "inherit"
    });
    proc.on("error", (err) => reject(err));
    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Supabase CLI exited with code ${code ?? "unknown"}.`));
      }
    });
  });
}

function isSupabaseLinkRequired(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("cannot find project ref") ||
    (normalized.includes("project ref") && normalized.includes("supabase link")) ||
    normalized.includes("project not linked");
}

function isSupabaseLoginRequired(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("access token not provided") ||
    normalized.includes("supabase login") ||
    normalized.includes("supabase_access_token");
}

async function runSupabaseCliDump(params: {
  cwd: string;
  outputPath: string;
  schemas?: string[];
  dataOnly?: boolean;
  exclude?: string[];
}): Promise<void> {
  const cliPath = resolveSupabaseCliPath();
  if (!cliPath) {
    throw new Error("Supabase CLI not found. Install it and run `supabase login` + `supabase link`.");
  }
  const args = [
    "db",
    "dump",
    "--linked",
    "--file",
    params.outputPath
  ];
  if (params.schemas && params.schemas.length > 0) {
    args.push("--schema", params.schemas.join(","));
  }
  if (params.exclude && params.exclude.length > 0) {
    args.push("--exclude", params.exclude.join(","));
  }
  if (params.dataOnly) {
    args.push("--data-only");
  }
  const result = await runSupabaseCli(cliPath, args, params.cwd);
  if (result.exitCode !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim();
    const message = detail
      ? `Supabase CLI failed: ${detail}`
      : "Supabase CLI failed to dump schema. Ensure you're logged in and the project is linked.";
    const error: SupabaseCliError = new Error(message);
    if (detail && isSupabaseLoginRequired(detail)) {
      error.code = "SUPABASE_LOGIN_REQUIRED";
    }
    if (detail && isSupabaseLinkRequired(detail)) {
      error.code = "SUPABASE_LINK_REQUIRED";
    }
    throw error;
  }
}

async function ensureSupabaseLoggedIn(cwd: string, log: Logger): Promise<void> {
  const cliPath = resolveSupabaseCliPath();
  if (!cliPath) {
    throw new Error("Supabase CLI not found. Install it and run `supabase login` + `supabase link`.");
  }
  if (!process.stdin.isTTY) {
    throw new Error(
      "Supabase CLI is not authenticated. Run `supabase login` or set SUPABASE_ACCESS_TOKEN."
    );
  }
  const controls = log as LoggerControls;
  controls.pause?.();
  if (process.stdout.isTTY) {
    process.stdout.write("\n");
  }
  log.info("Supabase CLI not authenticated. Launching `supabase login`...");
  await runSupabaseCliInteractive(cliPath, ["login"], cwd);
  log.info("Finished supabase login.");
  controls.resume?.();
}

async function ensureSupabaseLinked(cwd: string, log: Logger): Promise<void> {
  const cliPath = resolveSupabaseCliPath();
  if (!cliPath) {
    throw new Error("Supabase CLI not found. Install it and run `supabase login` + `supabase link`.");
  }
  if (!process.stdin.isTTY) {
    throw new Error("Supabase project is not linked. Run `supabase link` in this repo to continue.");
  }
  const controls = log as LoggerControls;
  controls.pause?.();
  if (process.stdout.isTTY) {
    process.stdout.write("\n");
  }
  log.info("Supabase project not linked. Launching `supabase link`...");
  await runSupabaseCliInteractive(cliPath, ["link"], cwd);
  log.info("Finished supabase link.");
  controls.resume?.();
}

async function runSupabaseCliDumpWithRetry(
  params: {
    cwd: string;
    outputPath: string;
    schemas?: string[];
    dataOnly?: boolean;
    exclude?: string[];
  },
  log: Logger
): Promise<void> {
  let attemptedLogin = false;
  let attemptedLink = false;
  while (true) {
    try {
      await runSupabaseCliDump(params);
      return;
    } catch (err) {
      const error = err as SupabaseCliError;
      if (error?.code === "SUPABASE_LOGIN_REQUIRED" && !attemptedLogin) {
        attemptedLogin = true;
        await ensureSupabaseLoggedIn(params.cwd, log);
        continue;
      }
      if (error?.code === "SUPABASE_LINK_REQUIRED" && !attemptedLink) {
        attemptedLink = true;
        await ensureSupabaseLinked(params.cwd, log);
        continue;
      }
      throw err;
    }
  }
}

function splitIdentifierParts(value: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (char === "\"") {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "." && !inQuotes) {
      if (current) {
        parts.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (current) parts.push(current);
  return parts.map((part) => part.trim()).filter(Boolean);
}

function parseQualifiedName(raw: string): { schema: string; name: string } | null {
  const cleaned = raw.trim().replace(/;$/, "");
  if (!cleaned) return null;
  const parts = splitIdentifierParts(cleaned);
  if (parts.length === 0) return null;
  if (parts.length === 1) {
    return { schema: "public", name: parts[0] };
  }
  const schema = parts[0];
  const name = parts[1];
  if (!schema || !name) return null;
  return { schema, name };
}

function parseRoleList(raw: string): string[] {
  const cleaned = raw
    .replace(/WITH GRANT OPTION/gi, "")
    .replace(/GRANTED BY\s+\S+/gi, "")
    .trim();
  return cleaned
    .split(",")
    .map((role) => role.trim().replace(/^\"|\"$/g, "").toLowerCase())
    .filter(Boolean);
}

function parsePrivilegeList(raw: string): string[] {
  const cleaned = raw.replace(/ALL PRIVILEGES/gi, "ALL").trim();
  if (/^ALL$/i.test(cleaned)) {
    return ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE"];
  }
  return cleaned
    .split(",")
    .map((priv) => priv.trim().toUpperCase())
    .filter(Boolean);
}

function splitSqlValues(valueText: string): string[] {
  const values: string[] = [];
  let current = "";
  let inString = false;
  for (let i = 0; i < valueText.length; i += 1) {
    const char = valueText[i];
    if (char === "'") {
      if (inString && valueText[i + 1] === "'") {
        current += "'";
        i += 1;
        continue;
      }
      inString = !inString;
      continue;
    }
    if (char === "," && !inString) {
      values.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) values.push(current.trim());
  return values;
}

function coerceSqlValue(raw: string): string | boolean | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.toUpperCase() === "NULL") return null;
  if (trimmed.toLowerCase() === "true") return true;
  if (trimmed.toLowerCase() === "false") return false;
  return trimmed;
}

function parseStorageBucketsFromSql(sql: string, errors: SupabaseSchemaMetadata["errors"]): Array<Record<string, unknown>> {
  const buckets: Array<Record<string, unknown>> = [];
  const insertRegex = /INSERT\s+INTO\s+storage\.buckets\s*\(([^)]+)\)\s+VALUES\s*\(([^;]+)\);/gi;
  for (const match of sql.matchAll(insertRegex)) {
    const columns = match[1]
      .split(",")
      .map((col) => col.trim().replace(/^\"|\"$/g, "").toLowerCase());
    const values = splitSqlValues(match[2]);
    if (columns.length !== values.length) {
      errors.push({ stage: "storage_buckets_parse", message: "Column/value length mismatch in INSERT." });
      continue;
    }
    const row: Record<string, unknown> = {};
    for (let i = 0; i < columns.length; i += 1) {
      row[columns[i]] = coerceSqlValue(values[i]);
    }
    buckets.push(row);
  }

  const copyRegex = /COPY\s+storage\.buckets\s*\(([^)]+)\)\s+FROM stdin;\n([\s\S]*?)\n\\\./gi;
  for (const match of sql.matchAll(copyRegex)) {
    const columns = match[1]
      .split(",")
      .map((col) => col.trim().replace(/^\"|\"$/g, "").toLowerCase());
    const rows = match[2].split("\n");
    for (const line of rows) {
      if (!line.trim()) continue;
      const values = line.split("\t");
      const row: Record<string, unknown> = {};
      for (let i = 0; i < columns.length; i += 1) {
        const raw = values[i] ?? "";
        if (raw === "\\N") {
          row[columns[i]] = null;
        } else if (raw === "t" || raw === "true") {
          row[columns[i]] = true;
        } else if (raw === "f" || raw === "false") {
          row[columns[i]] = false;
        } else {
          row[columns[i]] = raw;
        }
      }
      buckets.push(row);
    }
  }

  return buckets;
}

function parseSchemaDumpToMetadata(
  schemaSql: string,
  storageSql: string
): SupabaseSchemaMetadata {
  const errors: SupabaseSchemaMetadata["errors"] = [];
  const rlsByTable = new Map<string, { enabled: boolean; forced: boolean }>();
  const policies: Array<Record<string, unknown>> = [];
  const tablePrivileges: Array<Record<string, unknown>> = [];
  const columnPrivileges: Array<Record<string, unknown>> = [];
  const columnAcl: Array<Record<string, unknown>> = [];
  const routinePrivileges: Array<Record<string, unknown>> = [];
  const tables: Array<Record<string, unknown>> = [];

  const tableRegex = /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+([^\s(]+)\s*\(/gi;
  for (const match of schemaSql.matchAll(tableRegex)) {
    const parsed = parseQualifiedName(match[1]);
    if (!parsed) continue;
    tables.push({ table_schema: parsed.schema, table_name: parsed.name });
    const key = tableKey(parsed.schema, parsed.name);
    if (!rlsByTable.has(key)) {
      rlsByTable.set(key, { enabled: false, forced: false });
    }
  }

  const rlsRegex = /ALTER\s+TABLE(?:\s+ONLY)?\s+([^\s;]+)\s+(ENABLE|DISABLE|FORCE)\s+ROW\s+LEVEL\s+SECURITY/gi;
  for (const match of schemaSql.matchAll(rlsRegex)) {
    const parsed = parseQualifiedName(match[1]);
    if (!parsed) continue;
    const key = tableKey(parsed.schema, parsed.name);
    const entry = rlsByTable.get(key) ?? { enabled: false, forced: false };
    const action = match[2].toUpperCase();
    if (action === "ENABLE") entry.enabled = true;
    if (action === "DISABLE") entry.enabled = false;
    if (action === "FORCE") entry.forced = true;
    rlsByTable.set(key, entry);
  }

  const policyRegex = /CREATE\s+POLICY\s+([\s\S]+?)\s+ON\s+([^\s]+)\s+([\s\S]*?);/gi;
  for (const match of schemaSql.matchAll(policyRegex)) {
    const policyName = match[1].trim().replace(/^\"|\"$/g, "");
    const target = parseQualifiedName(match[2]);
    if (!target) continue;
    const tail = match[3];
    const cmdMatch = tail.match(/\bFOR\b\s+(ALL|SELECT|INSERT|UPDATE|DELETE)\b/i);
    const toMatch = tail.match(/\bTO\b\s+([^\n]+?)(?:\bUSING\b|\bWITH\b|\bFOR\b|$)/i);
    const rolesRaw = toMatch ? toMatch[1].trim() : "";
    policies.push({
      schemaname: target.schema,
      tablename: target.name,
      policyname: policyName,
      roles: rolesRaw,
      cmd: cmdMatch ? cmdMatch[1].toUpperCase() : null
    });
  }

  const grantTableRegex = /GRANT\s+([\s\S]+?)\s+ON\s+TABLE\s+([^\s]+)\s+TO\s+([\s\S]+?);/gi;
  for (const match of schemaSql.matchAll(grantTableRegex)) {
    const privilegePart = match[1].trim();
    const target = parseQualifiedName(match[2]);
    if (!target) continue;
    const key = tableKey(target.schema, target.name);
    if (!rlsByTable.has(key)) {
      rlsByTable.set(key, { enabled: false, forced: false });
    }
    const roles = parseRoleList(match[3]);
    const columnMatch = privilegePart.match(/^(\w+)\s*\(([^)]+)\)/i);
    if (columnMatch) {
      const priv = columnMatch[1].toUpperCase();
      for (const role of roles) {
        columnPrivileges.push({
          table_schema: target.schema,
          table_name: target.name,
          grantee: role,
          privilege_type: priv
        });
      }
      columnAcl.push({
        table_schema: target.schema,
        table_name: target.name,
        has_column_acl: true
      });
      continue;
    }
    const privileges = parsePrivilegeList(privilegePart);
    for (const role of roles) {
      for (const priv of privileges) {
        tablePrivileges.push({
          table_schema: target.schema,
          table_name: target.name,
          grantee: role,
          privilege_type: priv
        });
      }
    }
  }

  const grantRoutineRegex = /GRANT\s+EXECUTE\s+ON\s+(?:FUNCTION|PROCEDURE)\s+([^\s]+)\s+TO\s+([\s\S]+?);/gi;
  for (const match of schemaSql.matchAll(grantRoutineRegex)) {
    const targetRaw = match[1].trim();
    const beforeArgs = targetRaw.split("(")[0];
    const target = parseQualifiedName(beforeArgs);
    if (!target) continue;
    const roles = parseRoleList(match[2]);
    for (const role of roles) {
      routinePrivileges.push({
        routine_schema: target.schema,
        routine_name: target.name,
        specific_name: "",
        grantee: role
      });
    }
  }

  const storageBuckets = parseStorageBucketsFromSql(storageSql, errors);
  const rls = Array.from(rlsByTable.entries()).map(([key, state]) => {
    const [schema, table] = key.split(".");
    return {
      table_schema: schema,
      table_name: table,
      rls_enabled: state.enabled,
      rls_forced: state.forced
    };
  });

  return {
    fetchedAt: new Date().toISOString(),
    tables,
    columns: [],
    indexes: [],
    constraints: [],
    policies,
    rls,
    tablePrivileges,
    columnAcl,
    columnPrivileges,
    routines: [],
    routinePrivileges,
    storageBuckets,
    errors
  };
}

function schemaFilter(column: string): string {
  const equals = SYSTEM_SCHEMA_FILTER.map((schema) => `${column} <> '${schema}'`).join(" AND ");
  const likes = SYSTEM_SCHEMA_LIKE.map((pattern) => `${column} NOT LIKE '${pattern}'`).join(" AND ");
  return [equals, likes].filter(Boolean).join(" AND ");
}

function tableKey(schema: string, table: string): string {
  return `${schema}.${table}`;
}

function severityForClientRoles(roles: string[], base: Severity): Severity {
  if (roles.includes("public")) {
    return base === "medium" ? "high" : "critical";
  }
  if (roles.includes("anon")) {
    return base === "low" ? "medium" : "high";
  }
  if (roles.includes("authenticated")) {
    return base === "low" ? "medium" : base;
  }
  return base;
}

function makeFinding(params: {
  ruleId: string;
  message: string;
  severity: Severity;
  filepath: string;
  snippet?: string;
  details?: Record<string, unknown>;
}): StaticFinding {
  return {
    tool: "supabase",
    ruleId: params.ruleId,
    message: params.message,
    severity: params.severity,
    filepath: params.filepath,
    startLine: 1,
    endLine: 1,
    snippet: params.snippet,
    details: params.details
  };
}

export async function runSupabaseSchemaScan(params: {
  connectionString?: string;
  schemaSnapshotPath?: string;
  useCli?: boolean;
  projectRoot: string;
  stateDir: string;
  logger?: Logger;
}): Promise<SupabaseSchemaScanResult> {
  const log = params.logger ?? noopLogger;
  const fromSnapshot = Boolean(params.schemaSnapshotPath);
  const fromCli = Boolean(params.useCli);
  let schemaPath = "";
  let metadata: SupabaseSchemaMetadata;
  if (params.schemaSnapshotPath) {
    const resolved = path.resolve(params.schemaSnapshotPath);
    const raw = await readFile(resolved, "utf-8");
    const parsed = JSON.parse(raw) as Partial<SupabaseSchemaMetadata>;
    metadata = {
      fetchedAt: parsed.fetchedAt ?? new Date().toISOString(),
      tables: normalizeRows(parsed.tables),
      columns: normalizeRows(parsed.columns),
      indexes: normalizeRows(parsed.indexes),
      constraints: normalizeRows(parsed.constraints),
      policies: normalizeRows(parsed.policies),
      rls: normalizeRows(parsed.rls),
      tablePrivileges: normalizeRows(parsed.tablePrivileges),
      columnAcl: normalizeRows(parsed.columnAcl),
      columnPrivileges: normalizeRows(parsed.columnPrivileges),
      routines: normalizeRows(parsed.routines),
      routinePrivileges: normalizeRows(parsed.routinePrivileges),
      storageBuckets: normalizeRows(parsed.storageBuckets),
      errors: normalizeRows(parsed.errors) as Array<{ stage: string; message: string }>
    };
    schemaPath = resolved;
  } else if (params.connectionString) {
    const client = new Client({
      connectionString: params.connectionString,
      ssl: { rejectUnauthorized: true }
    });

    try {
      await client.connect();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("password authentication failed")) {
        throw new Error(
          "Supabase authentication failed. Please verify your database password. \n" +
          "You can find it in: Supabase Dashboard > Database > Settings > Database password > Reset database password. \n" +
          "If you don't yet know your DB password, you need to select 'Reset database password' as Supabase doesn't allow directly viewing it. \n It's unlikely you've used database password for connection yet as" + 
          "supabase ANON_KEY (client-side) and SERVICE_ROLE_KEY (server-side) are the only keys that should be used for connection in the majority of cases."
        );
      }
      throw err;
    }

    const errors: SupabaseSchemaMetadata["errors"] = [];

    const safeQuery = async (stage: string, sql: string) => {
      try {
        return await client.query(sql);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push({ stage, message });
        return null;
      }
    };

    await safeQuery("session_readonly", "SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY;");
    await safeQuery("session_statement_timeout", "SET statement_timeout = '30s';");
    await safeQuery("session_lock_timeout", "SET lock_timeout = '5s';");
    await safeQuery("session_idle_timeout", "SET idle_in_transaction_session_timeout = '30s';");

    const tableSchemaFilter = schemaFilter("table_schema");
    const schemaNameFilter = schemaFilter("n.nspname");
    const routineSchemaFilter = schemaFilter("routine_schema");
    const pgIndexesFilter = schemaFilter("schemaname");
    const policyFilter = schemaFilter("schemaname");

    const tablesResult = await safeQuery(
      "tables",
      `
SELECT table_schema, table_name, table_type
FROM information_schema.tables
WHERE ${tableSchemaFilter}
ORDER BY table_schema, table_name;
`
    );

    const columnsResult = await safeQuery(
      "columns",
      `
SELECT table_schema, table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE ${tableSchemaFilter}
ORDER BY table_schema, table_name, ordinal_position;
`
    );

    const indexesResult = await safeQuery(
      "indexes",
      `
SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes
WHERE ${pgIndexesFilter}
ORDER BY schemaname, tablename, indexname;
`
    );

    const constraintsResult = await safeQuery(
      "constraints",
      `
SELECT
  n.nspname AS table_schema,
  t.relname AS table_name,
  c.conname AS constraint_name,
  c.contype AS constraint_type,
  pg_get_constraintdef(c.oid) AS constraint_def
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE ${schemaNameFilter}
ORDER BY n.nspname, t.relname, c.conname;
`
    );

    const policiesResult = await safeQuery(
      "policies",
      `
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE ${policyFilter}
ORDER BY schemaname, tablename, policyname;
`
    );

    const rlsResult = await safeQuery(
      "rls",
      `
SELECT
  n.nspname AS table_schema,
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r'
  AND ${schemaNameFilter}
ORDER BY n.nspname, c.relname;
`
    );

    const tablePrivilegesResult = await safeQuery(
      "table_privileges",
      `
SELECT table_schema, table_name, grantee, privilege_type
FROM information_schema.table_privileges
WHERE ${tableSchemaFilter}
  AND grantee IN (${CLIENT_GRANTEES.map((role) => `'${role}'`).join(", ")})
ORDER BY table_schema, table_name, grantee, privilege_type;
`
    );

    const columnAclResult = await safeQuery(
      "column_acl",
      `
SELECT n.nspname AS table_schema, c.relname AS table_name,
  bool_or(a.attacl IS NOT NULL) AS has_column_acl
FROM pg_attribute a
JOIN pg_class c ON c.oid = a.attrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE a.attnum > 0
  AND NOT a.attisdropped
  AND ${schemaNameFilter}
GROUP BY n.nspname, c.relname;
`
    );

    const columnPrivilegesResult = await safeQuery(
      "column_privileges",
      `
SELECT table_schema, table_name, column_name, grantee, privilege_type
FROM information_schema.column_privileges
WHERE ${tableSchemaFilter}
  AND grantee IN (${CLIENT_GRANTEES.map((role) => `'${role}'`).join(", ")})
ORDER BY table_schema, table_name, column_name, grantee, privilege_type;
`
    );

    const routinesResult = await safeQuery(
      "routines",
      `
SELECT routine_schema, routine_name, specific_name, routine_type, data_type, security_type
FROM information_schema.routines
WHERE ${routineSchemaFilter}
ORDER BY routine_schema, routine_name;
`
    );

    const routinePrivilegesResult = await safeQuery(
      "routine_privileges",
      `
SELECT routine_schema, routine_name, specific_name, grantee, privilege_type
FROM information_schema.routine_privileges
WHERE privilege_type = 'EXECUTE'
  AND grantee IN (${ROUTINE_GRANTEES.map((role) => `'${role}'`).join(", ")})
  AND ${routineSchemaFilter}
ORDER BY routine_schema, routine_name, grantee;
`
    );

    const storageBucketsResult = await safeQuery(
      "storage_buckets",
      `
SELECT id, name, public
FROM storage.buckets
ORDER BY name;
`
    );

    await client.end();

    const schemaDir = path.join(params.stateDir, "supabase");
    schemaPath = path.join(schemaDir, "schema.json");
    await mkdir(schemaDir, { recursive: true });

    metadata = {
      fetchedAt: new Date().toISOString(),
      tables: tablesResult?.rows ?? [],
      columns: columnsResult?.rows ?? [],
      indexes: indexesResult?.rows ?? [],
      constraints: constraintsResult?.rows ?? [],
      policies: policiesResult?.rows ?? [],
      rls: rlsResult?.rows ?? [],
      tablePrivileges: tablePrivilegesResult?.rows ?? [],
      columnAcl: columnAclResult?.rows ?? [],
      columnPrivileges: columnPrivilegesResult?.rows ?? [],
      routines: routinesResult?.rows ?? [],
      routinePrivileges: routinePrivilegesResult?.rows ?? [],
      storageBuckets: storageBucketsResult?.rows ?? [],
      errors
    };

    await writeFile(schemaPath, JSON.stringify(metadata, null, 2), "utf-8");
  } else if (params.useCli) {
    let tmpDir: string | null = null;
    try {
      tmpDir = await mkdtemp(path.join(tmpdir(), "hadrix-supabase-"));
      const schemaDumpPath = path.join(tmpDir, "schema.sql");
      const storageDumpPath = path.join(tmpDir, "storage.sql");
      await runSupabaseCliDumpWithRetry(
        {
          cwd: params.projectRoot,
          outputPath: schemaDumpPath,
          schemas: DEFAULT_SCHEMA_LIST
        },
        log
      );
      await runSupabaseCliDumpWithRetry(
        {
          cwd: params.projectRoot,
          outputPath: storageDumpPath,
          schemas: ["storage"],
          dataOnly: true,
          exclude: STORAGE_EXCLUDE_TABLES
        },
        log
      );
      const schemaSql = await readFile(schemaDumpPath, "utf-8");
      const storageSql = await readFile(storageDumpPath, "utf-8");
      metadata = parseSchemaDumpToMetadata(schemaSql, storageSql);

      const schemaDir = path.join(params.stateDir, "supabase");
      schemaPath = path.join(schemaDir, "schema.json");
      await mkdir(schemaDir, { recursive: true });
      await writeFile(schemaPath, JSON.stringify(metadata, null, 2), "utf-8");
    } finally {
      if (tmpDir) {
        await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
      }
    }
  } else {
    throw new Error("Supabase schema scan requires a connection string, CLI access, or schema snapshot path.");
  }

  const schemaRelPath = normalizeRelPath(path.relative(params.projectRoot, schemaPath));
  const findings: StaticFinding[] = [];

  const rlsByTable = new Map<string, { enabled: boolean; forced: boolean }>();
  for (const row of metadata.rls) {
    const schema = String(row.table_schema ?? "");
    const table = String(row.table_name ?? "");
    if (!schema || !table) continue;
    rlsByTable.set(tableKey(schema, table), {
      enabled: Boolean(row.rls_enabled),
      forced: Boolean(row.rls_forced)
    });
  }

  const columnAclByTable = new Map<string, boolean>();
  for (const row of metadata.columnAcl) {
    const schema = String(row.table_schema ?? "");
    const table = String(row.table_name ?? "");
    if (!schema || !table) continue;
    columnAclByTable.set(tableKey(schema, table), Boolean(row.has_column_acl));
  }

  const tablePrivilegesByTable = new Map<string, Map<string, Set<string>>>();
  for (const row of metadata.tablePrivileges) {
    const schema = String(row.table_schema ?? "");
    const table = String(row.table_name ?? "");
    const grantee = String(row.grantee ?? "").toLowerCase();
    const privilege = String(row.privilege_type ?? "").toUpperCase();
    if (!schema || !table || !grantee || !privilege) continue;
    const key = tableKey(schema, table);
    const roleMap = tablePrivilegesByTable.get(key) ?? new Map();
    const privs = roleMap.get(grantee) ?? new Set();
    privs.add(privilege);
    roleMap.set(grantee, privs);
    tablePrivilegesByTable.set(key, roleMap);
  }

  const columnPrivilegesByTable = new Map<string, Map<string, Set<string>>>();
  for (const row of metadata.columnPrivileges) {
    const schema = String(row.table_schema ?? "");
    const table = String(row.table_name ?? "");
    const grantee = String(row.grantee ?? "").toLowerCase();
    const privilege = String(row.privilege_type ?? "").toUpperCase();
    if (!schema || !table || !grantee || !privilege) continue;
    const key = tableKey(schema, table);
    const roleMap = columnPrivilegesByTable.get(key) ?? new Map();
    const privs = roleMap.get(grantee) ?? new Set();
    privs.add(privilege);
    roleMap.set(grantee, privs);
    columnPrivilegesByTable.set(key, roleMap);
  }

  const policiesByTable = new Map<string, Array<Record<string, unknown>>>();
  for (const row of metadata.policies) {
    const schema = String(row.schemaname ?? "");
    const table = String(row.tablename ?? "");
    if (!schema || !table) continue;
    const key = tableKey(schema, table);
    const list = policiesByTable.get(key) ?? [];
    list.push(row);
    policiesByTable.set(key, list);
  }

  for (const [key, roleMap] of tablePrivilegesByTable) {
    const rolesWithAny = Array.from(roleMap.keys());
    const rolesWithWrite: string[] = [];
    for (const [role, privs] of roleMap) {
      if ([...privs].some((priv) => WRITE_PRIVILEGES.has(priv))) {
        rolesWithWrite.push(role);
      }
    }

    const rlsState = rlsByTable.get(key);
    if (rlsState && !rlsState.enabled && rolesWithAny.length > 0) {
      findings.push(
        makeFinding({
          ruleId: "supabase_rls_disabled",
          message: `RLS disabled on ${key} while client roles have access (${rolesWithAny.join(", ")}).`,
          severity: severityForClientRoles(rolesWithAny, "high"),
          filepath: schemaRelPath,
          snippet: `roles=${rolesWithAny.join(", ")}; rls_enabled=false; rls_forced=${rlsState.forced}`,
          details: {
            table: key,
            roles: rolesWithAny,
            rlsEnabled: rlsState.enabled,
            rlsForced: rlsState.forced
          }
        })
      );
    }

    if (rolesWithWrite.length > 0) {
      const privDetails = rolesWithWrite.map((role) => {
        const privs = roleMap.get(role);
        return `${role}: ${privs ? Array.from(privs).sort().join("|") : ""}`;
      });
      findings.push(
        makeFinding({
          ruleId: "supabase_client_write_access",
          message: `Table ${key} is writable by client roles (${rolesWithWrite.join(", ")}).`,
          severity: severityForClientRoles(rolesWithWrite, "medium"),
          filepath: schemaRelPath,
          snippet: privDetails.join("; "),
          details: {
            table: key,
            roles: rolesWithWrite,
            privileges: privDetails
          }
        })
      );

      const columnRoleMap = columnPrivilegesByTable.get(key);
      const rolesWithColumnRestrictions: string[] = [];
      if (columnRoleMap) {
        for (const [role, privs] of columnRoleMap) {
          if ([...privs].some((priv) => priv === "UPDATE" || priv === "INSERT")) {
            rolesWithColumnRestrictions.push(role);
          }
        }
      }
      const missingColumnRoles = rolesWithWrite.filter(
        (role) => !rolesWithColumnRestrictions.includes(role)
      );
      const hasColumnAcl = columnAclByTable.get(key) ?? false;
      if (!hasColumnAcl && missingColumnRoles.length > 0) {
        findings.push(
          makeFinding({
            ruleId: "supabase_column_acl_missing",
            message: `Table ${key} is writable by client roles without column-level ACLs.`,
            severity: severityForClientRoles(rolesWithWrite, "low"),
            filepath: schemaRelPath,
            snippet: `roles=${rolesWithWrite.join(", ")}; column_acls=false`,
            details: {
              table: key,
              roles: rolesWithWrite,
              rolesMissingColumnAcl: missingColumnRoles
            }
          })
        );
      }
    }

    if (rlsState?.enabled) {
      const policyCount = policiesByTable.get(key)?.length ?? 0;
      if (policyCount === 0 && rolesWithAny.length > 0) {
        findings.push(
          makeFinding({
            ruleId: "supabase_rls_no_policies",
            message: `RLS enabled on ${key} but no policies are defined.`,
            severity: "low",
            filepath: schemaRelPath,
            snippet: `roles=${rolesWithAny.join(", ")}; policy_count=0`,
            details: {
              table: key,
              roles: rolesWithAny,
              rlsEnabled: true
            }
          })
        );
      }
    }
  }

  const routineDetailsBySpecific = new Map<string, Record<string, unknown>>();
  for (const routine of metadata.routines) {
    const specific = String(routine.specific_name ?? "");
    if (!specific) continue;
    routineDetailsBySpecific.set(specific, routine as Record<string, unknown>);
  }

  const routinePrivilegesByRoutine = new Map<string, Set<string>>();
  const routineInfoByRoutine = new Map<string, Record<string, unknown>>();
  for (const row of metadata.routinePrivileges) {
    const schema = String(row.routine_schema ?? "");
    const name = String(row.routine_name ?? "");
    const specific = String(row.specific_name ?? "");
    const grantee = String(row.grantee ?? "").toLowerCase();
    if (!schema || !name || !grantee) continue;
    const key = `${schema}.${name}${specific ? `.${specific}` : ""}`;
    const roles = routinePrivilegesByRoutine.get(key) ?? new Set<string>();
    roles.add(grantee);
    routinePrivilegesByRoutine.set(key, roles);
    if (specific && routineDetailsBySpecific.has(specific)) {
      routineInfoByRoutine.set(key, routineDetailsBySpecific.get(specific) ?? {});
    }
  }

  for (const [key, rolesSet] of routinePrivilegesByRoutine) {
    const roles = Array.from(rolesSet);
    const clientRoles = roles.filter((role) => CLIENT_GRANTEES.includes(role));
    if (clientRoles.length === 0) continue;
    const severity = severityForClientRoles(clientRoles, "medium");
    const details = routineInfoByRoutine.get(key) ?? {};
    findings.push(
      makeFinding({
        ruleId: "supabase_function_public_exec",
        message: `Function ${key} is executable by ${clientRoles.join(", ")}.`,
        severity,
        filepath: schemaRelPath,
        snippet: `roles=${roles.join(", ")}`,
        details: {
          function: key,
          roles: clientRoles,
          allRoles: roles,
          securityType: (details as any).security_type ?? null,
          routineType: (details as any).routine_type ?? null
        }
      })
    );
  }

  for (const bucket of metadata.storageBuckets) {
    const isPublic = Boolean((bucket as any).public);
    if (!isPublic) continue;
    const name = String((bucket as any).name ?? "");
    const id = String((bucket as any).id ?? "");
    findings.push(
      makeFinding({
        ruleId: "supabase_public_bucket",
        message: `Storage bucket ${name || id || "(unknown)"} is public.`,
        severity: "high",
        filepath: schemaRelPath,
        snippet: `bucket=${name || id}; public=true`,
        details: {
          bucketId: id || null,
          bucketName: name || null,
          public: true
        }
      })
    );
  }

  for (const policy of metadata.policies) {
    const schema = String((policy as any).schemaname ?? "");
    const table = String((policy as any).tablename ?? "");
    if (schema !== "storage" || table !== "objects") continue;
    const roles = normalizeRoleList((policy as any).roles);
    if (!roles.some((role) => role === "public" || role === "anon")) continue;
    const cmd = String((policy as any).cmd ?? "");
    findings.push(
      makeFinding({
        ruleId: "supabase_storage_objects_public_policy",
        message: `storage.objects policy allows ${roles.join(", ")} access.`,
        severity: "high",
        filepath: schemaRelPath,
        snippet: `roles=${roles.join(", ")}; cmd=${cmd || "ALL"}`,
        details: {
          schema,
          table,
          roles,
          cmd: cmd || null,
          policyName: (policy as any).policyname ?? null
        }
      })
    );
  }

  if (metadata.errors.length > 0) {
    log.warn(
      `Supabase schema scan completed with ${metadata.errors.length} warning(s). See ${schemaRelPath} for details.`
    );
  } else {
    log.info(
      fromSnapshot
        ? `Supabase schema scan loaded snapshot from ${schemaRelPath}.`
        : fromCli
          ? `Supabase schema scan via CLI complete. Metadata written to ${schemaRelPath}.`
          : `Supabase schema scan complete. Metadata written to ${schemaRelPath}.`
    );
  }

  return { findings, schemaPath };
}
