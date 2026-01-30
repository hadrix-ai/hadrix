export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  supabaseServiceRoleKey:
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY ?? "",
  functionsBaseUrl: process.env.NEXT_PUBLIC_FUNCTIONS_BASE_URL ?? "",
  jwtSecret: process.env.JWT_SECRET ?? "",
  webhookSecret: process.env.WEBHOOK_SECRET ?? ""
};
