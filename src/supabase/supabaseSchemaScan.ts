import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import pg from "pg";
import type { StaticFinding, Severity } from "../types.js";

const { Client } = pg;

const CLIENT_GRANTEES = ["public", "anon", "authenticated"];
const ROUTINE_GRANTEES = [...CLIENT_GRANTEES, "service_role"];
const WRITE_PRIVILEGES = new Set(["INSERT", "UPDATE", "DELETE", "TRUNCATE"]);
const SYSTEM_SCHEMA_FILTER = ["pg_catalog", "information_schema"];
const SYSTEM_SCHEMA_LIKE = ["pg_toast%", "pg_temp_%"];

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
  projectRoot: string;
  stateDir: string;
  logger?: (message: string) => void;
}): Promise<SupabaseSchemaScanResult> {
  const log = params.logger ?? (() => {});
  const fromSnapshot = Boolean(params.schemaSnapshotPath);
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
  } else {
    throw new Error("Supabase schema scan requires a connection string or schema snapshot path.");
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
    log(
      `Supabase schema scan completed with ${metadata.errors.length} warning(s). See ${schemaRelPath} for details.`
    );
  } else {
    log(
      fromSnapshot
        ? `Supabase schema scan loaded snapshot from ${schemaRelPath}.`
        : `Supabase schema scan complete. Metadata written to ${schemaRelPath}.`
    );
  }

  return { findings, schemaPath };
}
