"use client";

import { useEffect, useState } from "react";

type ProjectRosterItem = {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  description_html: string | null;
};

const PROJECTS_API_PATH = "/api/projects";

type ProjectsRosterProps = {
  initialOrgId: string;
};

export function ProjectsRoster({ initialOrgId }: ProjectsRosterProps) {
  const [orgId, setOrgId] = useState(initialOrgId);
  const [draftOrgId, setDraftOrgId] = useState(initialOrgId);
  const [projects, setProjects] = useState<ProjectRosterItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastLoadedOrgId, setLastLoadedOrgId] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) {
      setProjects([]);
      setError("Enter an org id to load projects.");
      return;
    }

    let isActive = true;

    const loadProjects = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `${PROJECTS_API_PATH}?orgId=${encodeURIComponent(orgId)}`,
          { headers: { "content-type": "application/json" } }
        );
        const payload = await response.json().catch(() => ({}));

        if (!isActive) return;

        setProjects(Array.isArray(payload.projects) ? payload.projects : []);
        setError(payload.error ? String(payload.error) : null);
        setLastLoadedOrgId(orgId);
      } catch (err) {
        if (!isActive) return;
        setProjects([]);
        setError(err instanceof Error ? err.message : "Unable to load projects.");
      } finally {
        if (isActive) setIsLoading(false);
      }
    };

    void loadProjects();

    return () => {
      isActive = false;
    };
  }, [orgId]);

  return (
    <div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setOrgId(draftOrgId.trim());
        }}
      >
        <label>
          Org id
          <input
            name="orgId"
            value={draftOrgId}
            onChange={(event) => setDraftOrgId(event.target.value)}
            placeholder="org_acme"
          />
        </label>
        <button type="submit">Load projects</button>
      </form>

      {isLoading ? <p>Loading roster...</p> : null}
      {error ? <p>{error}</p> : null}

      {!isLoading && !error && projects.length === 0 && lastLoadedOrgId ? (
        <p>No projects yet for {lastLoadedOrgId}.</p>
      ) : null}

      <ul>
        {projects.map((project) => (
          <li key={project.id}>
            <strong>{project.name}</strong>
            <div>Org: {project.org_id}</div>
            {project.description ? <div>{project.description}</div> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
