"use client";

import { useState } from "react";
import { createClient } from "@supabase/supabase-js";
import hadrixConfig from "../../../hadrix.config.json";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  { auth: { persistSession: false } }
);

type Project = {
  id: string;
  name: string;
  org_id: string | null;
  description: string | null;
};

type PreflightResult = {
  allowed: boolean;
  token?: string;
  reason?: string;
};

function vulnEnabled(path: string): boolean {
  const parts = path.split(".");
  let current: any = hadrixConfig;
  for (const part of parts) {
    current = current?.[part];
  }
  return Boolean(current);
}

async function preflightWrite(orgId: string): Promise<PreflightResult> {
  try {
    const res = await fetch(`/api/projects/preflight?orgId=${encodeURIComponent(orgId)}`);
    if (!res.ok) {
      return { allowed: false, reason: "Server preflight denied." };
    }
    const data = await res.json();
    return {
      allowed: Boolean(data?.allowed),
      token: typeof data?.token === "string" ? data.token : undefined,
      reason: typeof data?.reason === "string" ? data.reason : ""
    };
  } catch {
    return { allowed: false, reason: "Server preflight unavailable." };
  }
}

export function ClientCreateProject() {
  const [name, setName] = useState("");
  const [orgId, setOrgId] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("Creating...");
    try {
      const preflight = await preflightWrite(orgId);
      if (vulnEnabled("vulnerabilities.A05_insecure_design.frontend_direct_db_write") && preflight.allowed) {
        const { data, error } = await supabase
          .from("projects")
          .insert({
            name: name.trim(),
            org_id: orgId,
            description,
            preflight_token: preflight.token ?? null
          })
          .select()
          .single();
        if (error) throw error;
        setStatus(`Created: ${(data as Project | null)?.id ?? "ok"}`);
        return;
      }

      const reason = preflight.reason ? ` (${preflight.reason})` : "";
      setStatus(`Write gated by server action${reason}`);
    } catch (err: any) {
      setStatus(`Error: ${err?.message ?? "failed"}`);
    }
  }

  return (
    <section>
      <h2>Create project (client write with preflight)</h2>
      <form onSubmit={onSubmit}>
        <label>
          Project name
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Org ID
          <input value={orgId} onChange={(e) => setOrgId(e.target.value)} />
        </label>
        <label>
          Description
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <button type="submit">Create</button>
      </form>
      {status ? <p style={{ color: "#777" }}>{status}</p> : null}
    </section>
  );
}
