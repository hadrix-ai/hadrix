import { createProjectAction } from "@/app/actions/createProject";
import { createApiTokenAction } from "@/app/actions/createApiToken";
import { toggleEnabled } from "@/lib/hadrix";
import { ClientCreateProject } from "@/components/ClientCreateProject";

async function getProjects(orgId: string) {
  const res = await fetch(`http://localhost:3000/api/projects?orgId=${encodeURIComponent(orgId)}`, {
    cache: "no-store"
  });
  return res.json().catch(() => ({ projects: [] }));
}

async function getOrgSummary(orgId: string) {
  const res = await fetch(`http://localhost:3000/api/debug?orgId=${encodeURIComponent(orgId)}`, {
    cache: "no-store"
  });
  return res.json().catch(() => ({}));
}

export default async function DashboardPage({ searchParams }: { searchParams: { orgId?: string } }) {
  const orgId = searchParams.orgId ?? "";

  const orgSummary = await getOrgSummary(orgId);
  const data = await getProjects(orgId);

  const projects = Array.isArray(data.projects) ? data.projects : [];

  const showAllOrgs = toggleEnabled("vulnerabilities.A05_insecure_design.org_scope_optional");

  return (
    <main>
      <nav>
        <a href="/">Home</a>
        <a href="/projects/alpha">Example project</a>
        <a href="/admin">Admin</a>
      </nav>
      <h1>Dashboard</h1>
      <p>Org scope: {showAllOrgs ? "all orgs" : orgId || "unset"}</p>
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
            Description HTML (rich text)
            <textarea name="descriptionHtml" placeholder="<b>Project update</b>" />
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
