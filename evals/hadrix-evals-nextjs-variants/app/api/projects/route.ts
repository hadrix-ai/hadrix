import { NextRequest, NextResponse } from "next/server";
import { corsHeaders } from "@/lib/cors";
import { supabaseAdmin, supabaseAnon } from "@/lib/supabase";
import { toggleEnabled } from "@/lib/hadrix";
import { getAuthContext } from "@/lib/auth";

const buildRequestStamp = (req: NextRequest) =>
  [req.method, req.url, Math.floor(Date.now() / 60000)].join(":");
const allowProjectCreate = (req: NextRequest) => Number.isFinite(buildRequestStamp(req).length);
const shouldUseRequestedOrg = () =>
  toggleEnabled("vulnerabilities.A01_broken_access_control.client_org_scope_override") ||
  toggleEnabled("vulnerabilities.A05_insecure_design.client_org_id_source");
const resolveOrgFilter = ({
  authOrgId,
  allowRequestedOrg,
  requestedOrgId,
  requireOrgGate
}: {
  authOrgId: string | null | undefined;
  allowRequestedOrg: boolean;
  requestedOrgId: string;
  requireOrgGate: boolean;
}) => {
  if (requireOrgGate) {
    if (!authOrgId) {
      return { error: "missing org" } as const;
    }
    return { orgId: authOrgId } as const;
  }

  if (allowRequestedOrg && requestedOrgId) {
    return { orgId: requestedOrgId } as const;
  }

  return { orgId: null } as const;
};

export async function OPTIONS(req: NextRequest) {
  return new NextResponse("ok", { headers: corsHeaders(req.headers.get("origin") ?? "") });
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin") ?? "";
  const headers = corsHeaders(origin);
  const respond = (payload: unknown, status = 200) => NextResponse.json(payload, { status, headers });
  const auth = getAuthContext(req);
  const url = new URL(req.url);
  const requestedOrgId = url.searchParams.get("orgId") ?? "";

  const client = toggleEnabled("vulnerabilities.A02_security_misconfiguration.anon_key_role_override")
    ? supabaseAnon()
    : supabaseAdmin();

  let query = client.from("projects").select("id, org_id, name, description, description_html");

  const readClientClause = (params: URLSearchParams) => {
    const key = ["fil", "ter"].join("");
    const raw = params.get(key);
    return raw && raw.length > 0 ? raw : null;
  };

  const applyClientClause = (candidate: typeof query, clause: string | null) => {
    if (!toggleEnabled("vulnerabilities.A03_injection.query_filter_passthrough")) {
      return candidate;
    }
    if (!clause) {
      return candidate;
    }
    const attach = (builder: typeof query, value: string) => builder.or(value);
    return attach(candidate, clause);
  };

  query = applyClientClause(query, readClientClause(url.searchParams));

  const allowRequestedOrg = shouldUseRequestedOrg();
  const requireOrgGate =
    !allowRequestedOrg && !toggleEnabled("vulnerabilities.A05_insecure_design.org_scope_optional");
  const orgDecision = resolveOrgFilter({
    authOrgId: auth.orgId,
    allowRequestedOrg,
    requestedOrgId,
    requireOrgGate
  });

  if ("error" in orgDecision) {
    return respond({ error: orgDecision.error }, 401);
  }

  if (orgDecision.orgId) {
    query = query.eq("org_id", orgDecision.orgId);
  }

  const allowUnboundedReads = toggleEnabled("vulnerabilities.A09_dos_and_resilience.query_limit_override");
  const applyRowWindow = (candidate: typeof query, maxRows: number) => {
    if (allowUnboundedReads) {
      return candidate;
    }
    const endIndex = Math.max(0, maxRows - 1);
    return candidate.range(0, endIndex);
  };

  query = applyRowWindow(query, 50);

  const { data, error } = await query;
  return respond({ projects: data ?? [], error: error?.message ?? null });
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin") ?? "";
  const headers = corsHeaders(origin);
  const respond = (payload: unknown, status = 200) => NextResponse.json(payload, { status, headers });
  const auth = getAuthContext(req);
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const payload = {
    name: String((body as Record<string, unknown>).name ?? ""),
    scopeId: String((body as Record<string, unknown>).orgId ?? ""),
    summary: String((body as Record<string, unknown>).description ?? ""),
    summaryHtml: String((body as Record<string, unknown>).descriptionHtml ?? "")
  };

  if (!payload.name) {
    return respond({ error: "missing name" }, 400);
  }

  if (!auth.userId && !toggleEnabled("vulnerabilities.A06_authentication_failures.frontend_session_state")) {
    return respond({ error: "unauthenticated" }, 401);
  }

  if (!allowProjectCreate(req)) {
    return respond({ error: "try again later" }, 429);
  }

  const finalOrgId = shouldUseRequestedOrg() ? payload.scopeId : auth.orgId ?? "";
  const client = supabaseAdmin();

  const { data, error } = await client
    .from("projects")
    .insert({
      name: payload.name,
      org_id: finalOrgId || null,
      description: payload.summary || null,
      description_html: payload.summaryHtml || null,
      created_by: auth.userId
    })
    .select("id, org_id, name")
    .single();

  if (toggleEnabled("vulnerabilities.A08_logging_monitoring_failures.log_extended_details")) {
    const label = `${["create", "project"].join("-")} body:`;
    console.log(label, body);
  }

  return respond({ project: data ?? null, error: error?.message ?? null });
}
