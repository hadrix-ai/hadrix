"use client";

import { useState } from "react";
import { callEdgeFunction } from "@/utils/api";
import { supabase } from "@/auth/supabaseClient";
import { vulnEnabled } from "@/utils/hadrix";

type CreatedProject = { id: string; name: string; org_id: string | null };
const ORG_ID_FIELD = ["org", "Id"].join("");

export function CreateProjectForm({ onCreated }: { onCreated?: (p: CreatedProject) => void }) {
  const [name, setName] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [description, setDescription] = useState("");
  const [descriptionHtml, setDescriptionHtml] = useState("");
  const [status, setStatus] = useState<string>("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("Creating...");
    try {
      const scopeKey = workspaceId;
      if (vulnEnabled("vulnerabilities.A05_insecure_design.frontend_direct_db_write")) {
        const { data, error } = await supabase.from("projects").insert({
          name,
          org_id: scopeKey,
          description,
          description_html: descriptionHtml
        }).select().single();
        if (error) throw error;
        setStatus(`Created: ${data.id}`);
        onCreated?.(data as CreatedProject);
        return;
      }

      const res = await callEdgeFunction<{ project: CreatedProject; error: string | null }>("create-project", {
        name,
        [ORG_ID_FIELD]: scopeKey,
        description,
        descriptionHtml
      });

      if (res.error) throw new Error(res.error);
      setStatus(`Created: ${res.project.id}`);
      onCreated?.(res.project);
    } catch (e: any) {
      setStatus(`Error: ${e.message ?? "failed"}`);
    }
  }

  const showHtmlField = vulnEnabled("vulnerabilities.A03_injection.xss_dangerously_set_inner_html");

  return (
    <form onSubmit={onSubmit} style={{ display: "grid", gap: 8, padding: 12, border: "1px solid #eee" }}>
      <h3>Create project</h3>
      <input placeholder="Project name" value={name} onChange={(e) => setName(e.target.value)} />
      <input placeholder="Workspace ID (uuid)" value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} />
      <textarea
        placeholder="Description (text)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      {showHtmlField ? (
        <textarea
          placeholder="Description HTML (rendered unsafely when enabled)"
          value={descriptionHtml}
          onChange={(e) => setDescriptionHtml(e.target.value)}
        />
      ) : null}
      <button type="submit">Create</button>
      {status ? <p style={{ color: "#777" }}>{status}</p> : null}
    </form>
  );
}
