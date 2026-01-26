"use client";

import { useEffect, useState } from "react";
import { vulnEnabled } from "@/lib/hadrix";

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

  return (
    <main>
      <nav>
        <a href="/">Home</a>
        <a href="/dashboard">Dashboard</a>
      </nav>
      <h2>{project.name}</h2>
      <p style={{ color: "#777" }}>Org: {project.org_id}</p>

      {useHtml ? (
        // HADRIX_VULN: A03 Injection
        // XSS: unsafe HTML rendering from DB/user-controlled field.
        <div dangerouslySetInnerHTML={{ __html: project.description_html ?? "" }} />
      ) : (
        <p>{project.description ?? "(no description)"}</p>
      )}
    </main>
  );
}
