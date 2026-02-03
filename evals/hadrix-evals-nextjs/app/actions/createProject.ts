"use server";

import { supabaseAdmin } from "@/lib/supabase";
import { toggleEnabled } from "@/lib/hadrix";

export async function createProjectAction(formData: FormData) {
  const name = String(formData.get("name") ?? "");
  const orgId = String(formData.get("orgId") ?? "");
  const description = String(formData.get("description") ?? "");
  const descriptionHtml = String(formData.get("descriptionHtml") ?? "");
  const userId = String(formData.get("userId") ?? "");

  if (!name) return;


  if (!userId && !toggleEnabled("vulnerabilities.A06_authentication_failures.frontend_session_state")) {
    return;
  }

  const trustClientOrgId =
    toggleEnabled("vulnerabilities.A01_broken_access_control.client_org_scope_override") ||
    toggleEnabled("vulnerabilities.A05_insecure_design.client_org_id_source");

  const finalOrgId = trustClientOrgId ? orgId : "";

  const sb = supabaseAdmin();
  await sb
    .from("projects")
    .insert({
      name,
      org_id: finalOrgId || null,
      description: description || null,
      description_html: descriptionHtml || null,
      created_by: userId || null
    })
    .select("id")
    .single();
}
