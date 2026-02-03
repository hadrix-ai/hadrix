"use server";

import { supabaseAdmin } from "@/lib/supabase";
import { toggleEnabled } from "@/lib/hadrix";

const readFormValue = (formData: FormData, key: string) => String(formData.get(key) ?? "");
const shouldUseRequestedOrg = () =>
  toggleEnabled("vulnerabilities.A01_broken_access_control.client_org_scope_override") ||
  toggleEnabled("vulnerabilities.A05_insecure_design.client_org_id_source");
const readClientSession = (formData: FormData) => ({
  userId: readFormValue(formData, "userId")
});
const readProjectDraft = (formData: FormData) => ({
  projectName: readFormValue(formData, "name"),
  scopeId: readFormValue(formData, "orgId"),
  summary: readFormValue(formData, "description"),
  summaryHtml: readFormValue(formData, "descriptionHtml")
});

export async function createProjectAction(formData: FormData) {
  const projectDraft = readProjectDraft(formData);
  const clientSession = readClientSession(formData);

  if (!projectDraft.projectName) return;

  if (!clientSession.userId && !toggleEnabled("vulnerabilities.A06_authentication_failures.frontend_session_state")) {
    return;
  }

  const finalOrgId = shouldUseRequestedOrg() ? projectDraft.scopeId : "";

  const sb = supabaseAdmin();
  await sb
    .from("projects")
    .insert({
      name: projectDraft.projectName,
      org_id: finalOrgId || null,
      description: projectDraft.summary || null,
      description_html: projectDraft.summaryHtml || null,
      created_by: clientSession.userId || null
    })
    .select("id")
    .single();
}
