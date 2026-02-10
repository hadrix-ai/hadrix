import Link from "next/link";

import { PROJECT_BRIEF_LIST_COPY } from "../../constants/projectBriefCopy";
import type { ProjectBriefSummaryDomainModel } from "../../types/domain/projectBriefDomain";

const PROJECTS_ROUTE = "/projects";

// TODO: Swap this static list for a lightweight data loader once brief syncing ships.
const PROJECT_SUMMARIES: ProjectBriefSummaryDomainModel[] = [
  {
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    name: "Launch Checklist",
    orgName: "Orbit Demo Org",
    blurb: "Launch steps, timelines, and rollout notes."
  },
  {
    id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    name: "Acme Integration",
    orgName: "Acme Partner Org",
    blurb: "Partner milestones and the current integration status."
  }
];

export default function ProjectsPage() {
  return (
    <main>
      <header>
        <h1>{PROJECT_BRIEF_LIST_COPY.title}</h1>
        <p>{PROJECT_BRIEF_LIST_COPY.subtitle}</p>
      </header>

      <section>
        {/* TODO: Add a "recently updated" filter when the list grows beyond a handful. */}
        {PROJECT_SUMMARIES.map((project) => (
          <article key={project.id}>
            <h2>{project.name}</h2>
            <p style={{ color: "#666" }}>{project.orgName}</p>
            <p>{project.blurb}</p>
            <Link href={`${PROJECTS_ROUTE}/${project.id}`}>
              {PROJECT_BRIEF_LIST_COPY.openLabel}
            </Link>
          </article>
        ))}
      </section>
    </main>
  );
}
