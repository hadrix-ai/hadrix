"use client";

import { useEffect, useState } from "react";
import { PROJECT_SNAPSHOT_EMBED_COPY } from "@/constants/projectSnapshotEmbedCopy";
import { ProjectSnapshotApiModel, ProjectSnapshotApiResponse } from "@/types/api/projectSnapshotApi";
import { callEdgeFunction } from "@/utils/api";

export default function ProjectSnapshotEmbed({ params }: { params: { id: string } }) {
  const [project, setProject] = useState<ProjectSnapshotApiModel | null>(null);
  const [error, setError] = useState<string>("");
  // TODO: cache per-project snapshot responses once the embed gets used in dashboards.
  // TODO: replace inline card styles with the shared embed UI kit when it's ready.

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const data = await callEdgeFunction<ProjectSnapshotApiResponse>("get-project", { id: params.id });
        if (active) {
          setProject(data.project);
        }
      } catch (err: any) {
        if (active) {
          setError(err?.message ?? PROJECT_SNAPSHOT_EMBED_COPY.errorFallback);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [params.id]);

  if (error) {
    return (
      <section style={{ border: "1px solid #e5e7eb", padding: 16, borderRadius: 12 }}>
        <h2 style={{ marginBottom: 8 }}>{PROJECT_SNAPSHOT_EMBED_COPY.title}</h2>
        <p style={{ color: "#b91c1c" }}>{error}</p>
      </section>
    );
  }

  if (!project) {
    return (
      <section style={{ border: "1px solid #e5e7eb", padding: 16, borderRadius: 12 }}>
        <h2 style={{ marginBottom: 8 }}>{PROJECT_SNAPSHOT_EMBED_COPY.title}</h2>
        <p style={{ color: "#64748b" }}>{PROJECT_SNAPSHOT_EMBED_COPY.loading}</p>
      </section>
    );
  }

  return (
    <section style={{ border: "1px solid #e5e7eb", padding: 16, borderRadius: 12 }}>
      <header style={{ marginBottom: 12 }}>
        <h2 style={{ marginBottom: 4 }}>{project.name}</h2>
        <p style={{ color: "#64748b", fontSize: 14 }}>
          {PROJECT_SNAPSHOT_EMBED_COPY.orgLabel}: {project.org_id}
        </p>
      </header>
      <p style={{ color: "#0f172a" }}>
        {project.description ?? PROJECT_SNAPSHOT_EMBED_COPY.emptyDescription}
      </p>
    </section>
  );
}
