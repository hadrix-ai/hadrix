"use server";

import { supabaseAdmin } from "@/lib/supabase";

export async function createProjectAction(formData: FormData) {
  const name = String(formData.get("name") ?? "");
  const orgId = String(formData.get("orgId") ?? "");
  const description = String(formData.get("description") ?? "");
  const descriptionHtml = String(formData.get("descriptionHtml") ?? "");
  const userId = String(formData.get("userId") ?? "");

  if (!name || !orgId || !userId) return;

  const sb = supabaseAdmin();
  await sb
    .from("projects")
    .insert({
      name,
      org_id: orgId,
      description: description || null,
      description_html: descriptionHtml || null,
      created_by: userId || null
    })
    .select("id")
    .single();
}
