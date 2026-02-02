"use client";

import { useEffect, useState } from "react";
import { vulnEnabled } from "@/lib/hadrix";

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

  const view = toProjectView(project);
  const showRichText =
    vulnEnabled("vulnerabilities.A03_injection.xss_dangerously_set_inner_html") && view.richText;
  const richTextMarkup = { __html: view.richText };

  return (
    <main>
      <nav>
        <a href="/">Home</a>
        <a href="/dashboard">Dashboard</a>
      </nav>
      <h2>{view.title}</h2>
      <p style={{ color: "#777" }}>Org: {view.orgLabel}</p>

      {showRichText ? <div dangerouslySetInnerHTML={richTextMarkup} /> : <p>{view.summary}</p>}
    </main>
  );
}
