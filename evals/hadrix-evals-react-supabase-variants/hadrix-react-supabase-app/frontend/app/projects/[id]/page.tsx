"use client";

import { useEffect, useState } from "react";
import { callEdgeFunction } from "@/utils/api";
import { toggleEnabled } from "@/utils/hadrix";

type ProjectRecord = {
  id: string;
  name: string;
  org_id: string;
  description: string | null;
  description_html: string | null;
};

type ProjectView = {
  title: string;
  orgLabel: string;
  summary: string;
  richText: string;
};

const toProjectView = (project: ProjectRecord): ProjectView => ({
  title: project.name,
  orgLabel: project.org_id,
  summary: project.description ?? "(no description)",
  richText: project.description_html ?? ""
});

export default function ProjectPage({ params }: { params: { id: string } }) {
  const [project, setProject] = useState<ProjectRecord | null>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    const loadProject = async (projectId: string) => {
      try {
        const data = await callEdgeFunction<{ project: ProjectRecord }>("get-project", { id: projectId });
        setProject(data.project);
      } catch (e: any) {
        setError(e.message ?? "Failed to load project");
      }
    };

    void loadProject(params.id);
  }, [params.id]);

  if (error) return <p style={{ color: "#a00" }}>{error}</p>;
  if (!project) return <p>Loading...</p>;

  const view = toProjectView(project);
  const useHtml = toggleEnabled("vulnerabilities.A03_injection.client_html_render") && view.richText;

  return (
    <main>
      <h2>{view.title}</h2>
      <p style={{ color: "#777" }}>Org: {view.orgLabel}</p>

      {useHtml ? (
        <div dangerouslySetInnerHTML={{ __html: view.richText }} />
      ) : (
        <p>{view.summary}</p>
      )}
    </main>
  );
}
