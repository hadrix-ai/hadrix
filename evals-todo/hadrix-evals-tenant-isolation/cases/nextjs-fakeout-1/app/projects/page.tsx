import { headers } from "next/headers";
import { createProjectAction } from "@/app/actions/createProject";
import { projectsConsoleCopy } from "./projectsConsoleCopy";
import type { ProjectRow, ProjectsPageProps } from "./projectsConsoleTypes";

async function loadProjects(orgId: string, authHeader: string | null): Promise<ProjectRow[]> {
  if (!orgId) return [];

  const response = await fetch(`/api/projects?orgId=${encodeURIComponent(orgId)}`, {
    headers: authHeader ? { authorization: authHeader } : undefined,
    cache: "no-store"
  });

  if (!response.ok) return [];
  // TODO: bubble up response.status to the UI so ops can tell if the roster is stale.

  const data = await response.json().catch(() => ({}));
  return Array.isArray(data?.projects) ? data.projects : [];
}

export default async function ProjectsPage({ searchParams }: ProjectsPageProps) {
  const orgId = String(searchParams?.orgId ?? "");
  const userId = String(searchParams?.userId ?? "");
  const authHeader = headers().get("authorization");
  const projects = await loadProjects(orgId, authHeader);

  return (
    <main style={{ padding: "24px", fontFamily: "ui-sans-serif, system-ui" }}>
      <h1>{projectsConsoleCopy.title}</h1>
      <p>{projectsConsoleCopy.intro}</p>

      <section style={{ marginTop: "24px" }}>
        <h2>{projectsConsoleCopy.listTitle}</h2>
        {/* TODO: replace the freeform orgId input with a lightweight org picker. */}
        <form action="/projects" method="get" style={{ display: "grid", gap: "8px" }}>
          <label>
            {projectsConsoleCopy.form.orgIdLabel}
            <input name="orgId" defaultValue={orgId} />
          </label>
          <label>
            {projectsConsoleCopy.form.userIdLabel}
            <input name="userId" defaultValue={userId} />
          </label>
          <button type="submit">{projectsConsoleCopy.form.loadButton}</button>
        </form>
        <ul style={{ marginTop: "12px" }}>
          {projects.length ? (
            projects.map((project) => (
              <li key={project.id ?? project.name}>
                {project.name} <span>({project.org_id})</span>
              </li>
            ))
          ) : (
            <li>{projectsConsoleCopy.emptyState}</li>
          )}
        </ul>
      </section>

      <section style={{ marginTop: "24px" }}>
        <h2>{projectsConsoleCopy.createTitle}</h2>
        <form action={createProjectAction} style={{ display: "grid", gap: "8px" }}>
          <label>
            {projectsConsoleCopy.form.nameLabel}
            <input name="name" placeholder="Project name" />
          </label>
          <label>
            {projectsConsoleCopy.form.orgIdLabel}
            <input name="orgId" defaultValue={orgId} />
          </label>
          <label>
            {projectsConsoleCopy.form.userIdLabel}
            <input name="userId" defaultValue={userId} />
          </label>
          <label>
            {projectsConsoleCopy.form.descriptionLabel}
            <textarea name="description" />
          </label>
          <label>
            {projectsConsoleCopy.form.descriptionHtmlLabel}
            <textarea name="descriptionHtml" />
          </label>
          <button type="submit">{projectsConsoleCopy.form.createButton}</button>
        </form>
      </section>
    </main>
  );
}
