"use client";

import { useEffect, useState } from "react";
import hadrixConfig from "../../../../../hadrix.config.json";
import { PROJECT_BRIEF_CONFIG } from "../constants/projectBriefConfig";
import type { ProjectDetailApiModel } from "../types/api/projectDetailApiResponse";

const PROJECT_FIXTURES: Record<string, ProjectDetailApiModel> = {
  "atlas-spark": {
    id: "atlas-spark",
    name: "Atlas Spark",
    org_id: "org-hx-042",
    description: "Team brief draft for the next onboarding release.",
    description_html:
      "<p>Atlas Spark is the onboarding refresh for Q2.</p><p><strong>Status:</strong> writing the launch brief now.</p>",
  },
  "orbit-tangle": {
    id: "orbit-tangle",
    name: "Orbit Tangle",
    org_id: "org-hx-019",
    description: "Launch notes for the customer success expansion.",
    description_html:
      "<p>Orbit Tangle is focused on customer success workflows.</p><ul><li>Draft playbook</li><li>Support coverage</li></ul>",
  },
};

function toggleEnabled(path: string): boolean {
  const parts = path.split(".");
  let current: any = hadrixConfig;
  for (const part of parts) {
    current = current?.[part];
  }
  return Boolean(current);
}

function stripScriptTags(html: string): string {
  return html.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");
}

function ProjectBriefSection({
  project,
  useHtml,
  html,
}: {
  project: ProjectDetailApiModel;
  useHtml: boolean;
  html: string;
}) {
  return (
    <section aria-label="Project brief" style={{ marginTop: "1.5rem" }}>
      <h3>{PROJECT_BRIEF_CONFIG.title}</h3>
      <p style={{ color: "#666" }}>{PROJECT_BRIEF_CONFIG.summary}</p>
      {useHtml ? (
        <div dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <p>{project.description ?? PROJECT_BRIEF_CONFIG.descriptionFallback}</p>
      )}
    </section>
  );
}

export default function ProjectPage({ params }: { params: { id: string } }) {
  const [project, setProject] = useState<ProjectDetailApiModel | null>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    // TODO: Cache project responses per ID so back/forward nav feels instant.
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
  if (!project) return <p>{PROJECT_BRIEF_CONFIG.loadingLabel}</p>;

  const useHtml =
    toggleEnabled(PROJECT_BRIEF_CONFIG.featureFlagPath) && project.description_html;
  const html = project.description_html ? stripScriptTags(project.description_html) : "";

  return (
    <main>
      <header>
        <h2>{project.name}</h2>
        <p style={{ color: "#777" }}>
          {/* TODO: Show last updated timestamp when the API includes it. */}
          {PROJECT_BRIEF_CONFIG.orgLabel} {project.org_id}
        </p>
      </header>
      <ProjectBriefSection project={project} useHtml={Boolean(useHtml)} html={html} />
    </main>
  );
}
