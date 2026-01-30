"use server";

import { supabaseAdmin } from "@/lib/supabase";
import { vulnEnabled } from "@/lib/hadrix";

export async function createProjectAction(formData: FormData) {
  const name = String(formData.get("name") ?? "");
  const orgId = String(formData.get("orgId") ?? "");
  const description = String(formData.get("description") ?? "");
  const descriptionHtml = String(formData.get("descriptionHtml") ?? "");
  const userId = String(formData.get("userId") ?? "");

  if (!name) return;


  if (!userId && !vulnEnabled("vulnerabilities.A06_authentication_failures.trust_frontend_auth_state")) {
    return;
  }

  const trustClientOrgId =
    vulnEnabled("vulnerabilities.A01_broken_access_control.cross_org_leakage_trusting_org_id") ||
    vulnEnabled("vulnerabilities.A05_insecure_design.trust_client_org_id");

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
