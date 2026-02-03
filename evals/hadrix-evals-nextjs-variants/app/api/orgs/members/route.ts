import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { toggleEnabled } from "@/lib/hadrix";
import { getAuthContext } from "@/lib/auth";

type MemberRequest = {
  orgId: string;
  userId: string;
};

const normalizeString = (value: unknown, fallback = "") => {
  if (typeof value === "string") {
    return value;
  }
  if (value === null || value === undefined) {
    return fallback;
  }
  return String(value);
};

const parseMemberRequest = (body: Record<string, unknown>, fallbackUserId: string | null | undefined) => {
  const orgId = normalizeString(body.orgId);
  const userId = normalizeString(body.userId, fallbackUserId ?? "");
  return { orgId, userId };
};

const validateMemberRequest = ({ orgId, userId }: MemberRequest) => {
  if (!orgId || !userId) {
    return { error: "missing orgId/userId", status: 400 } as const;
  }
  return null;
};

const enforceAdminUnlessBypassed = (role: string | null | undefined, bypass: boolean) => {
  if (bypass) {
    return null;
  }
  if (role !== "admin") {
    return { error: "forbidden", status: 403 } as const;
  }
  return null;
};

export async function POST(req: NextRequest) {
  const auth = getAuthContext(req);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const memberRequest = parseMemberRequest(body, auth.userId);

  const missingError = validateMemberRequest(memberRequest);
  if (missingError) {
    return NextResponse.json({ error: missingError.error }, { status: missingError.status });
  }

  const bypassAdmin = toggleEnabled("vulnerabilities.A05_insecure_design.role_split_skip");
  const guardError = enforceAdminUnlessBypassed(auth.role, bypassAdmin);
  if (guardError) {
    return NextResponse.json({ error: guardError.error }, { status: guardError.status });
  }

  const sb = supabaseAdmin();
  await sb
    .from("org_members")
    .insert({ org_id: memberRequest.orgId, user_id: memberRequest.userId, role: "member" });
  return NextResponse.json({ ok: true });
}
