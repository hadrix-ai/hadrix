export const SIGNAL_IDS = [
  "public_entrypoint",
  "internal_entrypoint",
  "api_handler",
  "webhook_handler",
  "job_worker",
  "frontend_dom_write",
  "template_render",
  "redirect_sink",
  "http_request_sink",
  "ssrf_candidate",
  "exec_sink",
  "eval_sink",
  "raw_sql_sink",
  "orm_query_sink",
  "file_read_sink",
  "file_write_sink",
  "secrets_access",
  "logs_sensitive",
  "debug_endpoint",
  "authn_present",
  "authn_missing_or_unknown",
  "authz_present",
  "authz_missing_or_unknown",
  "rls_reliance",
  "client_supplied_identifier",
  "client_supplied_org_id",
  "client_supplied_user_id",
  "id_in_path_or_query",
  "mass_assignment_risk",
  "insecure_deserialization",
  "untrusted_input_present",
  "unvalidated_input",
  "weak_validation_or_unknown",
  "rate_limit_missing_or_unknown",
  "cors_permissive_or_unknown"
] as const;

export type SignalId = typeof SIGNAL_IDS[number];

export const SIGNAL_DEFINITIONS: Record<SignalId, { description: string }> = {
  public_entrypoint: {
    description: "Publicly reachable entrypoint or handler."
  },
  internal_entrypoint: {
    description: "Internal-only entrypoint or handler."
  },
  api_handler: {
    description: "API route handler or controller logic."
  },
  webhook_handler: {
    description: "Webhook receiver or verification handler."
  },
  job_worker: {
    description: "Background job or task worker."
  },
  frontend_dom_write: {
    description: "Writes or renders content into the frontend DOM."
  },
  template_render: {
    description: "Renders a template with dynamic data."
  },
  redirect_sink: {
    description: "Performs HTTP redirects based on inputs."
  },
  http_request_sink: {
    description: "Makes outbound HTTP requests."
  },
  ssrf_candidate: {
    description: "Outbound requests accept client-controlled URLs."
  },
  exec_sink: {
    description: "Executes system commands or subprocesses."
  },
  eval_sink: {
    description: "Evaluates dynamic code (eval/Function)."
  },
  raw_sql_sink: {
    description: "Executes raw SQL strings."
  },
  orm_query_sink: {
    description: "Runs ORM queries or query builder calls."
  },
  file_read_sink: {
    description: "Reads from the filesystem."
  },
  file_write_sink: {
    description: "Writes to the filesystem."
  },
  secrets_access: {
    description: "Accesses secrets or credentials."
  },
  logs_sensitive: {
    description: "Logs potentially sensitive data."
  },
  debug_endpoint: {
    description: "Debug or diagnostics endpoint."
  },
  authn_present: {
    description: "Authentication checks or guards are present."
  },
  authn_missing_or_unknown: {
    description: "Authentication checks are missing or unclear."
  },
  authz_present: {
    description: "Authorization or permission checks are present."
  },
  authz_missing_or_unknown: {
    description: "Authorization checks are missing or unclear."
  },
  rls_reliance: {
    description: "Relies on row-level security (RLS) policies."
  },
  client_supplied_identifier: {
    description: "Client supplies identifiers used in access decisions."
  },
  client_supplied_org_id: {
    description: "Client supplies organization or tenant identifiers."
  },
  client_supplied_user_id: {
    description: "Client supplies user identifiers."
  },
  id_in_path_or_query: {
    description: "Identifiers appear in URL path or query parameters."
  },
  mass_assignment_risk: {
    description: "Potential mass assignment over model fields."
  },
  insecure_deserialization: {
    description: "Deserializes untrusted or opaque payloads."
  },
  untrusted_input_present: {
    description: "Handles inputs marked untrusted (request params/body/headers)."
  },
  unvalidated_input: {
    description: "Uses inputs without validation or sanitization."
  },
  weak_validation_or_unknown: {
    description: "Validation appears weak or unknown."
  },
  rate_limit_missing_or_unknown: {
    description: "Rate limiting is missing or unclear."
  },
  cors_permissive_or_unknown: {
    description: "CORS configuration is permissive or unclear."
  }
};
