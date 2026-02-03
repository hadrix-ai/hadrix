export const env = {
  supabaseUrl: process.env.SUPABASE_URL ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  jwtSecret: process.env.JWT_SECRET ?? ""
};
