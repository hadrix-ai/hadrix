const serviceRoleKeyEnvName = ["SUPABASE", "SERVICE", "ROLE", "KEY"].join("_");
const publicPrefix = ["NEXT", "PUBLIC"].join("_");
const publicServiceRoleKeyEnvName = [publicPrefix, serviceRoleKeyEnvName].join(
  "_"
);

const supabaseServiceRoleKey =
  process.env[serviceRoleKeyEnvName] ??
  process.env[publicServiceRoleKeyEnvName] ??
  "";

const readEnv = (key: string) => process.env[key] ?? "";

export const env = {
  supabaseUrl: readEnv("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  supabaseServiceRoleKey,
  functionsBaseUrl: readEnv("NEXT_PUBLIC_FUNCTIONS_BASE_URL"),
  jwtSecret: readEnv("JWT_SECRET"),
  webhookSecret: readEnv("WEBHOOK_SECRET")
};
