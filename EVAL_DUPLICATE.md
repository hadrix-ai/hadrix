**Eval Duplicates**
**Scope**
- `evals/`
- `evals-todo/`

**Definition**
Duplicates are findings that represent the same vulnerability pattern regardless of baseline/framework and file location.

**Duplicate Groups**
**Group: A02 CORS wildcard origin**
Files:
- `evals/hadrix-evals-security-misconfiguration/cases/nextjs-baseline/lib/cors.ts`
- `evals/hadrix-evals-security-misconfiguration/cases/nextjs-fakeout-1/app/api/status/route.ts`
- `evals/hadrix-evals-security-misconfiguration/cases/supabase-baseline/backend/supabase/functions/_shared/cors.ts`
- `evals/hadrix-evals-security-misconfiguration/cases/brokencrystals-baseline/server/middleware/cors.ts`
- `evals/hadrix-evals-security-misconfiguration/cases/nodevulnerable-baseline/server/middleware/cors.ts`
Snippet (representative):
```ts
export function corsHeaders(origin: string): Record<string, string> {
  const allowAll = toggleEnabled("vulnerabilities.A02_security_misconfiguration.cors_any_origin");
  return {
    "access-control-allow-origin": allowAll ? "*" : origin,
    "access-control-allow-credentials": "true",
    "access-control-allow-headers": "authorization, content-type, x-user-id, x-org-id",
    "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS"
  };
}
```

**Group: A02 Debug endpoint returns headers/env**
Files:
- `evals/hadrix-evals-security-misconfiguration/cases/nextjs-baseline/app/api/debug/route.ts`
- `evals/hadrix-evals-security-misconfiguration/cases/nodegoat-baseline/server/routes/debug.ts`
Snippet (representative):
```ts
return NextResponse.json({
  debug: true,
  orgId,
  headers: Object.fromEntries(req.headers.entries()),
  env: {
    nodeEnv: process.env.NODE_ENV,
    jwtSecret: process.env.JWT_SECRET
  }
});
```

**Group: A03 Raw SQL concatenation**
Files:
- `evals/hadrix-evals-sql-injection/cases/nextjs-baseline/app/api/projects/[id]/route.ts`
- `evals/hadrix-evals-sql-injection/cases/supabase-baseline/backend/supabase/functions/get-project.ts`
Snippet (representative):
```ts
const sql =
  `select id, org_id, name, description, description_html from public.projects where id = '${id}' and org_id = '${auth.orgId}' limit 1;`;
const rows = await runQuery<any>(sql);
```

**Group: A03 `dangerouslySetInnerHTML` without sanitization**
Files:
- `evals/hadrix-evals-xss/cases/nextjs-baseline/app/projects/[id]/page.tsx`
- `evals/hadrix-evals-xss/cases/supabase-baseline/frontend/app/projects/[id]/page.tsx`
Snippet (representative):
```tsx
const useHtml = toggleEnabled("vulnerabilities.A03_injection.client_html_render") && project.description_html;

{useHtml ? (
  <div dangerouslySetInnerHTML={{ __html: project.description_html ?? "" }} />
) : (
  <p>{project.description ?? "(no description)"}</p>
)}
```

**Group: A01 Project fetched by ID without org membership/ownership check**
Files:
- `evals/hadrix-evals-idor/cases/nextjs-baseline/app/api/projects/[id]/route.ts`
- `evals/hadrix-evals-idor/cases/supabase-baseline/backend/supabase/functions/get-project.ts`
Snippet (representative):
```ts
const { data, error } = await sb
  .from("projects")
  .select(projectColumns)
  .eq("id", id)
  .maybeSingle();
```

**Group: A05 Frontend direct DB writes**
Files:
- `evals/hadrix-evals-frontend-direct-db-write/cases/nextjs-baseline/components/ClientCreateProject.tsx`
- `evals/hadrix-evals-frontend-direct-db-write/cases/supabase-baseline/frontend/components/CreateProjectForm.tsx`
- `evals/hadrix-evals-frontend-direct-db-write/cases/brokencrystals-baseline/components/ClientCreateOrder.tsx`
Snippet (representative):
```tsx
const { data, error } = await supabase.from("projects").insert({
  name,
  org_id: orgId,
  description
}).select().single();
```

**Group: A03 Command injection via `repoUrl`**
Files:
- `evals-todo/hadrix-evals-command-injection/cases/nextjs-baseline/app/api/scan/route.ts`
- `evals-todo/hadrix-evals-command-injection/cases/supabase-baseline/backend/supabase/functions/scan-repo.ts`
Snippet (representative):
```ts
const { stdout, stderr } = await execAsync(`git ls-remote ${repoUrl}`);
```

**Group: A07 Function constructor on user input**
Files:
- `evals-todo/hadrix-evals-software-integrity/cases/nextjs-fakeout-1/app/api/webhook/route.ts`
- `evals-todo/hadrix-evals-software-integrity/cases/brokencrystals-baseline/server/routes/webhook.ts`
Snippet (representative):
```ts
const transform = String(event.transform ?? "");
const handler = new Function("event", transform);
handler(event);
```

**Group: A04 JWT secret fallback**
Files:
- `evals-todo/hadrix-evals-crypto-failures/cases/brokencrystals-baseline/server/auth/tokens.ts`
- `evals-todo/hadrix-evals-crypto-failures/cases/nodegoat-baseline/server/auth/jwt.ts`
Snippet (representative):
```ts
const secret = process.env.JWT_SECRET || FALLBACK_SECRET;
return jwt.sign(payload, secret, { algorithm: "HS256" });
```

**Group: A01 List projects by orgId without membership verification**
Files:
- `evals-todo/hadrix-evals-tenant-isolation/cases/nextjs-baseline/app/api/projects/route.ts`
- `evals-todo/hadrix-evals-tenant-isolation/cases/supabase-baseline/backend/supabase/functions/list-projects.ts`
Snippet (representative):
```ts
const orgId = url.searchParams.get("orgId") ?? "";

const { data, error } = await supabaseAdmin()
  .from("projects")
  .select(projectColumns)
  .eq("org_id", orgId)
  .limit(maxProjects);
```

**Group: A01 Create project using request orgId without membership verification**
Files:
- `evals-todo/hadrix-evals-tenant-isolation/cases/nextjs-baseline/app/actions/createProject.ts`
- `evals-todo/hadrix-evals-tenant-isolation/cases/nextjs-fakeout-1/app/actions/createProject.ts`
- `evals-todo/hadrix-evals-tenant-isolation/cases/supabase-baseline/backend/supabase/functions/create-project.ts`
Snippet (representative):
```ts
const orgId = String(formData.get("orgId") ?? "");

await sb
  .from("projects")
  .insert({
    name,
    org_id: orgId,
    description: description || null,
    description_html: descriptionHtml || null,
    created_by: userId || null
  })
  .select("id")
  .single();
```
