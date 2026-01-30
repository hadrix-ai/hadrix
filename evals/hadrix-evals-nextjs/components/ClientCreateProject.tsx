"use client";

import { useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { vulnEnabled } from "@/lib/hadrix";

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

export function ClientCreateProject() {
  const [name, setName] = useState("");
  const [orgId, setOrgId] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("Creating...");
    try {
      if (vulnEnabled("vulnerabilities.A05_insecure_design.frontend_direct_db_write")) {
        const { data, error } = await supabase.from("projects").insert({
          name,
          org_id: orgId,
          description
        }).select().single();
        if (error) throw error;
        setStatus(`Created: ${(data as Project | null)?.id ?? "ok"}`);
        return;
      }

      setStatus("Write gated by server action.");
    } catch (err: any) {
      setStatus(`Error: ${err?.message ?? "failed"}`);
    }
  }

  return (
    <section>
      <h2>Create project (client write)</h2>
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
