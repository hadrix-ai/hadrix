import { createProjectAction } from "@/app/actions/createProject";
import { createApiTokenAction } from "@/app/actions/createApiToken";
import { toggleEnabled } from "@/lib/hadrix";
import { ClientCreateProject } from "@/components/ClientCreateProject";

const apiBaseUrl = "http://localhost:3000";

type DashboardSearchParams = { orgId?: string };

const buildApiUrl = (path: string, orgId: string) => {
  const url = new URL(`${apiBaseUrl}${path}`);
  url.searchParams.set("orgId", orgId);
  return url.toString();
};

async function requestJson<T>(path: string, orgId: string, fallback: T): Promise<T> {
  const res = await fetch(buildApiUrl(path, orgId), {
    cache: "no-store"
  });
  return res.json().catch(() => fallback);
}

async function loadProjects(scopeId: string) {
  const fallback: { projects: unknown[] } = { projects: [] };
  return requestJson("/api/projects", scopeId, fallback);
}

async function loadOrgSummary(scopeId: string) {
  const fallback: Record<string, unknown> = {};
  return requestJson("/api/debug", scopeId, fallback);
}

export default async function DashboardPage({ searchParams }: { searchParams: DashboardSearchParams }) {
  const scopeId = searchParams.orgId ?? "";

  const orgSummary = await loadOrgSummary(scopeId);
  const data = await loadProjects(scopeId);

  const projects = Array.isArray(data.projects) ? data.projects : [];

  const wideScopeEnabled = toggleEnabled("vulnerabilities.A05_insecure_design.org_scope_optional");
  const scopeLabel = wideScopeEnabled ? "all orgs" : scopeId || "unset";

  return (
    <main>
      <nav>
        <a href="/">Home</a>
        <a href="/projects/alpha">Example project</a>
        <a href="/admin">Admin</a>
      </nav>
      <h1>Dashboard</h1>
      <p>Org scope: {scopeLabel}</p>
      <ClientCreateProject />
      <section>
        <h2>Create project (server action)</h2>
        <form action={createProjectAction}>
          <label>
            Project name
            <input name="name" placeholder="Nebula docs" />
          </label>
          <label>
            Org ID
            <input name="orgId" placeholder="org-123" />
          </label>
          <label>
            User ID
            <input name="userId" placeholder="user-123" />
          </label>
          <label>
            Description
            <textarea name="description" />
          </label>
          <label>
            Description HTML
            <textarea name="descriptionHtml" placeholder="<b>Sample formatting</b>" />
          </label>
          <button type="submit">Create</button>
        </form>
      </section>
      <section>
        <h2>Create API token (server action)</h2>
        <form action={createApiTokenAction}>
          <label>
            User ID
            <input name="userId" placeholder="user-123" />
          </label>
          <label>
            Label
            <input name="label" placeholder="CI token" />
          </label>
          <button type="submit">Create token</button>
        </form>
      </section>
      <section>
        <h2>Projects</h2>
        <pre>{JSON.stringify({ orgSummary, projects }, null, 2)}</pre>
      </section>
    </main>
  );
}
