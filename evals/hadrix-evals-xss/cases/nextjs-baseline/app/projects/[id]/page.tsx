"use client";

import { useEffect, useState } from "react";
import { toggleEnabled } from "@/lib/hadrix";
import {
  PROJECT_NAV_LINKS,
  PROJECT_STORYBOARD_COPY,
} from "../constants/projectStoryboardCopy";
import type { ProjectApiModel } from "../types/api/projectApiResponse";

const PROJECT_FIXTURES: Record<string, ProjectApiModel> = {
  "launchpad-alpha": {
    id: "launchpad-alpha",
    name: "Launchpad Alpha",
    org_id: "org-hx-001",
    description: "Draft narrative used for the internal launch plan.",
    description_html:
      "<p>Launchpad Alpha is the internal rollout for our onboarding upgrade.</p><p><em>Status:</em> drafting the storyboard now.</p>",
  },
  "copperline-beta": {
    id: "copperline-beta",
    name: "Copperline Beta",
    org_id: "org-hx-018",
    description: "Beta launch notes for partner rollout.",
    description_html:
      "<p>Copperline Beta focuses on partner enablement.</p><ul><li>Briefing doc</li><li>Timeline sketch</li></ul>",
  },
};

export default function ProjectPage({ params }: { params: { id: string } }) {
  const [project, setProject] = useState<ProjectApiModel | null>(null);
  const [error, setError] = useState<string>("");

  // TODO: add a tiny in-memory cache so back/forward navigation doesn't refetch every time.
  // TODO: show a "last refreshed" timestamp in the header when we add activity telemetry.
  useEffect(() => {
    const selectedProject = PROJECT_FIXTURES[params.id];
    if (!selectedProject) {
      setProject(null);
      setError("Project not found");
      return;
    }
    setError("");
    setProject(selectedProject);
  }, [params.id]);

  if (error) return <p style={{ color: "#a00" }}>{error}</p>;
  if (!project) return <p>Loading...</p>;

  const storyboardEnabled = toggleEnabled("vulnerabilities.A03_injection.client_html_render");
  const storyboardHtml = project.description_html;
  const showStoryboardHtml = storyboardEnabled && storyboardHtml;

  return (
    <main>
      <nav>
        {PROJECT_NAV_LINKS.map((link) => (
          <a key={link.href} href={link.href}>
            {link.label}
          </a>
        ))}
      </nav>
      <h2>{project.name}</h2>
      <p style={{ color: "#777" }}>Org: {project.org_id}</p>

      <section style={{ marginTop: "1.5rem" }}>
        <header style={{ marginBottom: "0.75rem" }}>
          <h3>{PROJECT_STORYBOARD_COPY.title}</h3>
          <p style={{ color: "#666" }}>{PROJECT_STORYBOARD_COPY.subtitle}</p>
        </header>
        {showStoryboardHtml ? (
          <div dangerouslySetInnerHTML={{ __html: storyboardHtml ?? "" }} />
        ) : (
          <p>{project.description ?? PROJECT_STORYBOARD_COPY.fallbackDescription}</p>
        )}
      </section>
    </main>
  );
}
