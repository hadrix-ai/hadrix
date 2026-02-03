"use client";

import { useEffect, useState } from "react";
import { callEdgeFunction } from "@/utils/api";
import { toggleEnabled } from "@/utils/hadrix";

type Project = {
  id: string;
  name: string;
  org_id: string;
  description: string | null;
  description_html: string | null;
};

export default function ProjectPage({ params }: { params: { id: string } }) {
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        const data = await callEdgeFunction<{ project: Project }>("get-project", { id: params.id });
        setProject(data.project);
      } catch (e: any) {
        setError(e.message ?? "Failed to load project");
      }
    })();
  }, [params.id]);

  if (error) return <p style={{ color: "#a00" }}>{error}</p>;
  if (!project) return <p>Loading...</p>;

  const useHtml = toggleEnabled("vulnerabilities.A03_injection.client_html_render") && project.description_html;

  return (
    <main>
      <h2>{project.name}</h2>
      <p style={{ color: "#777" }}>Org: {project.org_id}</p>

      {useHtml ? (
        <div dangerouslySetInnerHTML={{ __html: project.description_html ?? "" }} />
      ) : (
        <p>{project.description ?? "(no description)"}</p>
      )}
    </main>
  );
}
