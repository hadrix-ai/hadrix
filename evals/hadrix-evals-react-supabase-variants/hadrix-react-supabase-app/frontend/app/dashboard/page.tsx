"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { callEdgeFunction } from "@/utils/api";
import { CreateProjectForm } from "@/components/CreateProjectForm";

type Project = {
  id: string;
  name: string;
  org_id: string;
};

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        const data = await callEdgeFunction<{ projects: Project[] }>("list-projects", {});
        setProjects(data.projects);
      } catch (e: any) {
        setError(e.message ?? "Failed to load projects");
      }
    })();
  }, []);

  return (
    <main>
      <h2>Dashboard</h2>
      {error ? <p style={{ color: "#a00" }}>{error}</p> : null}
      <CreateProjectForm
        onCreated={(p) => setProjects((prev) => [{ id: p.id, name: p.name, org_id: p.org_id ?? "null" }, ...prev])}
      />
      <ul>
        {projects.map((p) => (
          <li key={p.id}>
            <Link href={`/projects/${p.id}`}>{p.name}</Link> <span style={{ color: "#777" }}>({p.org_id})</span>
          </li>
        ))}
      </ul>
      <p style={{ color: "#777" }}>
        Note: project listing behavior depends on RLS and function-layer toggles.
      </p>
    </main>
  );
}
