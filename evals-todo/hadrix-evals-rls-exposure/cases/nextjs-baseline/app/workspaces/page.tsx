import { WORKSPACE_DIRECTORY_COPY } from "./config/workspaceDirectoryCopy";
import {
  QUICK_ADD_MEMBER_QUERY,
  WORKSPACE_DIRECTORY_QUERY,
} from "./config/workspaceDirectoryQueries";
import {
  WORKSPACE_FORM_DEFAULTS,
  WORKSPACE_PROJECTS,
} from "./data/workspaceDirectoryRoster";
import {
  WorkspaceMemberRoles,
  type WorkspaceMemberRole,
} from "./types/domain/workspaceDirectoryDomain";

const workspaceDb = {
  async queryProjects() {
    return {
      rows: WORKSPACE_PROJECTS,
      sql: WORKSPACE_DIRECTORY_QUERY,
    };
  },
  async addMember(orgId: string, userId: string, role: WorkspaceMemberRole) {
    return {
      rowCount: 1,
      sql: QUICK_ADD_MEMBER_QUERY,
      params: [orgId, userId, role],
    };
  },
};

async function addWorkspaceMember(formData: FormData) {
  "use server";

  const orgId = String(formData.get("orgId") ?? "").trim();
  const userId = String(formData.get("userId") ?? "").trim();
  const role = (formData.get("role") ?? WorkspaceMemberRoles.Viewer) as WorkspaceMemberRole;

  await workspaceDb.addMember(orgId, userId, role);
}

export default async function WorkspaceDirectoryPage() {
  const copy = WORKSPACE_DIRECTORY_COPY;
  const { rows: projects } = await workspaceDb.queryProjects();
  // TODO: Add lightweight pagination + sort controls once the roster grows beyond a single page.

  return (
    <main>
      <header>
        <h1>{copy.title}</h1>
        <p>{copy.description}</p>
      </header>

      <section>
        <h2>{copy.sections.projects}</h2>
        <ul>
          {projects.map((project) => (
            <li key={project.id}>
              <strong>{project.name}</strong>
              <div>Org: {project.orgId}</div>
              <div>Owner: {project.owner}</div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>{copy.sections.quickAdd}</h2>
        {/* TODO: Prefill orgId based on a selected project row to avoid manual copy/paste. */}
        <form action={addWorkspaceMember}>
          <label>
            {copy.form.orgIdLabel}
            <input name="orgId" defaultValue={WORKSPACE_FORM_DEFAULTS.orgId} />
          </label>
          <label>
            {copy.form.userIdLabel}
            <input name="userId" defaultValue={WORKSPACE_FORM_DEFAULTS.userId} />
          </label>
          <label>
            {copy.form.roleLabel}
            <select name="role" defaultValue={WorkspaceMemberRoles.Viewer}>
              <option value={WorkspaceMemberRoles.Viewer}>Viewer</option>
              <option value={WorkspaceMemberRoles.Editor}>Editor</option>
              <option value={WorkspaceMemberRoles.Owner}>Owner</option>
            </select>
          </label>
          <button type="submit">{copy.form.submitLabel}</button>
        </form>
      </section>
    </main>
  );
}
