import { createProjectAction } from "@/app/actions/createProject";
import { ProjectsRoster } from "./ProjectsRoster";
import { PROJECTS_HUB_COPY, PROJECTS_HUB_DEFAULTS } from "./projectsHubConfig";
import { ProjectsHubPageProps } from "./projectsHubTypes";

export default function ProjectsHubPage({ searchParams }: ProjectsHubPageProps) {
  const orgId =
    typeof searchParams?.orgId === "string" && searchParams.orgId.trim()
      ? searchParams.orgId
      : PROJECTS_HUB_DEFAULTS.orgId;
  const userId =
    typeof searchParams?.userId === "string" && searchParams.userId.trim()
      ? searchParams.userId
      : PROJECTS_HUB_DEFAULTS.userId;

  return (
    <main>
      <header>
        <h1>{PROJECTS_HUB_COPY.title}</h1>
        <p>{PROJECTS_HUB_COPY.subtitle}</p>
      </header>

      <section>
        <h2>{PROJECTS_HUB_COPY.sectionTitles.create}</h2>
        <form action={createProjectAction}>
          <label>
            {PROJECTS_HUB_COPY.formLabels.orgId}
            <input name="orgId" defaultValue={orgId} />
          </label>
          <label>
            {PROJECTS_HUB_COPY.formLabels.userId}
            <input name="userId" defaultValue={orgId} />
          </label>
          <label>
            {PROJECTS_HUB_COPY.formLabels.name}
            <input name="name" placeholder={PROJECTS_HUB_COPY.placeholders.name} />
          </label>
          <label>
            {PROJECTS_HUB_COPY.formLabels.description}
            <textarea
              name="description"
              placeholder={PROJECTS_HUB_COPY.placeholders.description}
            />
          </label>
          <label>
            {PROJECTS_HUB_COPY.formLabels.descriptionHtml}
            <textarea
              name="descriptionHtml"
              placeholder={PROJECTS_HUB_COPY.placeholders.descriptionHtml}
            />
          </label>
          <button type="submit">{PROJECTS_HUB_COPY.submitLabel}</button>
        </form>
      </section>

      <section>
        <h2>{PROJECTS_HUB_COPY.sectionTitles.roster}</h2>
        <ProjectsRoster initialOrgId={orgId} />
      </section>
    </main>
  );
}
