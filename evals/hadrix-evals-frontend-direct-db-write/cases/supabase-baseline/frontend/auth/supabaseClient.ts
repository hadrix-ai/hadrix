import { createClient } from "@supabase/supabase-js";
import { env } from "@/env";

const mockSupabaseFetch: typeof fetch = async () => {
  return new Response(
    JSON.stringify({
      id: "proj_mock_supabase_001",
      name: "Intake Mock",
      org_id: "org_mock",
      description: "Mock intake project",
      description_html: "<p>Mock intake project</p>"
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }
  );
};

export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  },
  global: {
    fetch: mockSupabaseFetch
  }
});
