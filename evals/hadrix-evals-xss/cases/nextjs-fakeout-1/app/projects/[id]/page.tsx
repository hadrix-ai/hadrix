"use client";

import { useEffect, useState } from "react";
import hadrixConfig from "../../../../../hadrix.config.json";

type Project = {
  id: string;
  name: string;
  org_id: string;
  description: string | null;
  description_html: string | null;
};

function vulnEnabled(path: string): boolean {
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

export default function ProjectPage({ params }: { params: { id: string } }) {
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/projects/${params.id}`);
        const data = await res.json();
        setProject(data.project ?? null);
      } catch (e: any) {
        setError(e.message ?? "Failed to load project");
      }
    })();
  }, [params.id]);

  if (error) return <p style={{ color: "#a00" }}>{error}</p>;
  if (!project) return <p>Loading...</p>;

  const useHtml =
    vulnEnabled("vulnerabilities.A03_injection.xss_dangerously_set_inner_html") && project.description_html;
  const html = project.description_html ? stripScriptTags(project.description_html) : "";

  return (
    <main>
      <h2>{project.name}</h2>
      <p style={{ color: "#777" }}>Org: {project.org_id}</p>

      {useHtml ? (
        <div dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <p>{project.description ?? "(no description)"}</p>
      )}
    </main>
  );
}
