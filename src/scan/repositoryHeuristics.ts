import type { RepositoryFileSample } from "../types.js";
import { splitSecurityHeader } from "./securityHeader.js";

export type FileRole =
  | "ADMIN_ENDPOINT"
  | "USER_READ_ENDPOINT"
  | "USER_WRITE_ENDPOINT"
  | "AUTH_ENDPOINT"
  | "WEBHOOK_ENDPOINT"
  | "BACKGROUND_JOB"
  | "FRONTEND_PAGE"
  | "FRONTEND_ADMIN_PAGE"
  | "SERVER_COMPONENT"
  | "MIGRATION"
  | "SHARED_AUTH_LIB"
  | "HIGH_RISK_EXEC";

export type FileRoleAssignment = {
  path: string;
  roles: FileRole[];
  requiredControls: string[];
};

export type CandidateEvidence = {
  filepath: string;
  startLine?: number;
  endLine?: number;
  excerpt?: string;
  note?: string;
};

export type CandidateFinding = {
  id: string;
  type: string;
  summary: string;
  rationale: string;
  recommendation?: string;
  filepath?: string;
  evidence: CandidateEvidence[];
  relatedFileRoles?: FileRole[];
};

export type FileScope =
  | "frontend_ui"
  | "frontend_util"
  | "server_component"
  | "backend_endpoint"
  | "backend_shared"
  | "config_metadata"
  | "docs_tests"
  | "unknown";

export type FileScopeEvidence = {
  isEndpoint: boolean;
  isShared: boolean;
  isConfig: boolean;
  entryPointHints: string[];
  sinks: string[];
  sensitiveActionHints: string[];
  isServerAction: boolean;
  isClientComponent: boolean;
  hasRequestBody: boolean;
  fromSecurityHeader: boolean;
};

export type FileScopeAssignment = {
  path: string;
  scope: FileScope;
  evidence: FileScopeEvidence;
};

export type FileScopeClassification = {
  scope: FileScope;
  evidence: FileScopeEvidence;
};

export type RuleEvidenceGate = {
  endpointContext?: boolean;
  sharedContext?: boolean;
  sensitiveAction?: boolean;
  destructiveAction?: boolean;
  sinkTypes?: string[];
  requestBody?: boolean;
};

export type RuleScopeGate = {
  allowedScopes: FileScope[];
  requiresEvidence?: RuleEvidenceGate;
};

export type RuleGateMismatch =
  | "scope"
  | "endpoint"
  | "shared"
  | "sensitive"
  | "destructive"
  | "sink"
  | "request_body"
  | "evidence";

export type RuleGateCheck = {
  allowed: boolean;
  scope: FileScope;
  mismatches: RuleGateMismatch[];
};

export const REQUIRED_CONTROLS: Record<FileRole, string[]> = {
  ADMIN_ENDPOINT: [
    "authentication",
    "authorization:role",
    "audit_logging",
    "rate_limiting"
  ],
  USER_READ_ENDPOINT: ["authentication", "authorization:ownership_or_membership"],
  USER_WRITE_ENDPOINT: [
    "authentication",
    "authorization:ownership_or_membership",
    "rate_limiting"
  ],
  AUTH_ENDPOINT: ["rate_limiting", "secure_token_handling", "no_plaintext_secrets"],
  WEBHOOK_ENDPOINT: ["signature_verification", "replay_protection"],
  BACKGROUND_JOB: ["input_validation", "least_privilege"],
  FRONTEND_PAGE: [
    "secure_rendering",
    "no_frontend_only_auth",
    "no_sensitive_secrets"
  ],
  FRONTEND_ADMIN_PAGE: ["secure_rendering", "no_frontend_only_auth"],
  SERVER_COMPONENT: [],
  MIGRATION: ["no_plaintext_secrets", "secure_rls_policies"],
  SHARED_AUTH_LIB: ["authentication", "secure_token_handling", "no_plaintext_secrets"],
  HIGH_RISK_EXEC: ["input_validation", "timeout", "output_sanitization"]
};

const FRONTEND_EXTENSIONS = new Set(["tsx", "jsx", "vue", "svelte", "astro", "html"]);
const FRONTEND_PATH_HINTS = [
  "/pages/",
  "/app/",
  "/components/",
  "/ui/",
  "/views/",
  "/client/",
  "/frontend/",
  "/src/app/"
];
const APP_ROUTER_PATH_PATTERN = /(^|\/)(src\/)?app(\/|$)/i;
const BACKEND_PATH_HINTS = [
  "/backend/",
  "/server/",
  "/api/",
  "/functions/",
  "/edge/",
  "/supabase/",
  "/routes/",
  "/db/",
  "/schema/"
];
const APP_ROUTER_API_PATH_PATTERN = /(^|\/)(src\/)?app\/api(\/|$)/i;
const SERVER_ACTION_PATH_PATTERNS = [
  /^app\/actions(?:\/|$|\.)/i,
  /\/app\/actions(?:\/|$|\.)/i
];
const BACKGROUND_PATH_HINTS = [
  "/jobs/",
  "/workers/",
  "/queue/",
  "/queues/",
  "/cron/",
  "/scheduler/",
  "/schedules/",
  "/background/"
];
const FRONTEND_UI_EXTENSIONS = new Set([
  "tsx",
  "jsx",
  "vue",
  "svelte",
  "astro",
  "html",
  "css",
  "scss",
  "less"
]);
const SERVER_COMPONENT_EXTENSIONS = new Set(["ts", "tsx", "js", "jsx", "mdx"]);
const FRONTEND_UI_PATH_HINTS = ["/pages/", "/app/", "/components/", "/ui/", "/views/", "/src/app/"];
const FRONTEND_UTIL_PATH_HINTS = ["/utils/", "/lib/", "/hooks/", "/services/", "/store/"];
const BACKEND_ENDPOINT_PATH_HINTS = ["/api/", "/functions/", "/routes/", "/edge/"];
const BACKEND_SHARED_PATH_HINTS = [
  "/_shared/",
  "/shared/",
  "/lib/",
  "/libs/",
  "/utils/",
  "/helpers/",
  "/middleware/",
  "/middlewares/"
];
const DOC_EXTENSIONS = new Set(["md", "mdx", "rst", "adoc", "txt"]);
const DOC_BASENAMES = new Set([
  "readme.md",
  "readme.mdx",
  "license",
  "license.md",
  "changelog.md",
  "contributing.md"
]);
const DOC_PATH_HINTS = ["/docs/", "/doc/", "/documentation/"];
const TEST_PATH_HINTS = ["/__tests__/", "/__test__/", "/tests/", "/test/", "/spec/", "/specs/", "/cypress/"];
const TEST_FILE_PATTERNS = [/\.spec\.[tj]sx?$/, /\.test\.[tj]sx?$/];
const CONFIG_EXTENSIONS = new Set(["json", "yaml", "yml", "toml", "env", "ini"]);
const CONFIG_BASENAMES = new Set([
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lockb",
  "tsconfig.json",
  "tsconfig.base.json",
  "tsconfig.build.json",
  "deno.json",
  "deno.jsonc",
  ".npmrc",
  ".yarnrc",
  ".yarnrc.yml",
  ".editorconfig"
]);

const RATE_LIMIT_PATTERNS = [
  /rate[_-]?limit/i,
  /ratelimit/i,
  /throttle/i,
  /slowdown/i,
  /express-rate-limit/i,
  /upstash\/ratelimit/i
];
const RATE_LIMIT_NEGATION_PATTERNS = [
  /\bno\s+rate[_-]?limit\b/i,
  /\bwithout\s+rate[_-]?limit\b/i,
  /\bdisable(?:d)?\s+rate[_-]?limit\b/i,
  /\brate[_-]?limit\s*disabled\b/i,
  /\bno\s+throttl/i,
  /\bunthrottled\b/i,
  /\bunlimited\s+requests?\b/i,
  /\bnoRateLimit\b/
];

const ROLE_CHECK_PATTERNS = [
  /\brole\b/i,
  /\broles\b/i,
  /\bpermission\b/i,
  /\bpermissions\b/i,
  /\bclaims\b/i,
  /\bisAdmin\b/i,
  /\badminOnly\b/i,
  /\brequireRole\b/i,
  /\bhasRole\b/i,
  /\bauthoriz(e|ation)\b/i,
  /\bACL\b/i,
  /\bRBAC\b/i
];

const FRONTEND_ROLE_PATTERNS = [
  /\brole\b/i,
  /\broles\b/i,
  /\bpermission\b/i,
  /\bpermissions\b/i,
  /\bclaims\b/i,
  /\bisAdmin\b/i,
  /\bhasRole\b/i,
  /\bcan[A-Z]\w*/,
  /\buser\.role\b/i,
  /\bsession\.user\b/i
];

const OWNERSHIP_PATTERNS = [
  /\bowner(_id)?\b/i,
  /\buser_id\b/i,
  /\buserId\b/i,
  /\borg_id\b/i,
  /\borgId\b/i,
  /\btenant_id\b/i,
  /\btenantId\b/i,
  /\bteam_id\b/i,
  /\bteamId\b/i,
  /\bworkspace_id\b/i,
  /\bworkspaceId\b/i,
  /\baccount_id\b/i,
  /\baccountId\b/i,
  /\bmember(ship)?\b/i,
  /auth\.uid\(\)/i,
  /auth\.user/i,
  /session\.user/i
];

const RLS_PATTERNS = [/\brls\b/i, /row level security/i, /\bpolicy\b/i];

const ID_INPUT_PATTERNS = [
  /\b(req\.params|req\.query|req\.body|params|query|body)\.[A-Za-z0-9_]*id\b/i,
  /\b([A-Za-z0-9_]*Id)\s*=\s*(req\.params|req\.query|req\.body|params|query|body)\b/i,
  /\bctx\.params\.[A-Za-z0-9_]*id\b/i,
  /\b\{[^}]*\b[A-Za-z0-9_]*id\b[^}]*\}\s*=\s*await\s*(req|request)\.json\s*\(/i,
  /\b(req|request)\.json\s*\(\)[^;\n]*\b[A-Za-z0-9_]*id\b/i,
  /\bsearchParams\.get\s*\(\s*['"][^'"]*id['"]\s*\)/i,
  /\bnew\s+URL\s*\([^)]*\)\.searchParams\.get\s*\(\s*['"][^'"]*id['"]\s*\)/i,
  /\b(req|request)\.headers\.get\s*\(\s*['"][^'"]*id['"]\s*\)/i
];

const ORG_ID_INPUT_PATTERNS = [
  /\b(req\.params|req\.query|req\.body|params|query|body)\.[A-Za-z0-9_]*org(_?id)?\b/i,
  /\b(req\.params|req\.query|req\.body|params|query|body)\.[A-Za-z0-9_]*(organization|tenant)(_?id)?\b/i,
  /\borg(_?id)?\s*=\s*(req\.params|req\.query|req\.body|params|query|body)\b/i,
  /\b\{[^}]*\borg(_?id)?\b[^}]*\}\s*=\s*await\s*(req|request)\.json\s*\(/i,
  /\b\{[^}]*\b(organization|tenant)(_?id)?\b[^}]*\}\s*=\s*await\s*(req|request)\.json\s*\(/i,
  /\b(req|request)\.json\s*\(\)[^;\n]*\borg(_?id)?\b/i,
  /\b(req|request)\.json\s*\(\)[^;\n]*\b(organization|tenant)(_?id)?\b/i,
  /\bformData(?:\?\.|\.)get\s*\(\s*['"]org(_?id)?['"]\s*\)/i,
  /\bformData(?:\?\.|\.)get\s*\(\s*['"](organization|tenant)(_?id)?['"]\s*\)/i,
  /\b(input|data)\b[^;\n]{0,20}\.\s*(org|organization|tenant)(_?id)?\b/i,
  /\b(input|data)\s*(?:\?\.\s*)?\[\s*['"](org(_?id)?|organization(_?id)?|tenant(_?id)?)['"]\s*\]/i,
  /\bfunction\b[^(]*\(\s*\{[^}]*\b(org|organization|tenant)(_?id)?\b[^}]*\}/i,
  /\(\s*\{[^}]*\b(org|organization|tenant)(_?id)?\b[^}]*\}\s*\)\s*=>/i,
  /\bsearchParams\.get\s*\(\s*['"]org(_?id)?['"]\s*\)/i,
  /\bsearchParams\.get\s*\(\s*['"](organization|tenant)(_?id)?['"]\s*\)/i,
  /\bsearchParams\.org(_?id)?\b/i,
  /\bsearchParams\?\.org(_?id)?\b/i,
  /\bnew\s+URL\s*\([^)]*\)\.searchParams\.get\s*\(\s*['"]org(_?id)?['"]\s*\)/i,
  /\bnew\s+URL\s*\([^)]*\)\.searchParams\.get\s*\(\s*['"](organization|tenant)(_?id)?['"]\s*\)/i,
  /\bheaders\.get\s*\(\s*['"][^'"]*org[^'"]*id['"]\s*\)/i,
  /\b(req|request)\.headers\.get\s*\(\s*['"][^'"]*org[^'"]*id['"]\s*\)/i,
  /\bheaders\.get\s*\(\s*['"][^'"]*(organization|tenant)[^'"]*id['"]\s*\)/i,
  /\b(req|request)\.headers\.get\s*\(\s*['"][^'"]*(organization|tenant)[^'"]*id['"]\s*\)/i
];

const FRONTEND_ORG_ID_INPUT_PATTERNS = [
  /\bsearchParams\.org(_?id)?\b/i,
  /\bsearchParams\?\.org(_?id)?\b/i,
  /\bsearchParams\.get\s*\(\s*['"]org(_?id)?['"]\s*\)/i,
  /\bsearchParams\.get\s*\(\s*['"](organization|tenant)(_?id)?['"]\s*\)/i,
  /\bnew\s+URL\s*\([^)]*\)\.searchParams\.get\s*\(\s*['"]org(_?id)?['"]\s*\)/i,
  /\bnew\s+URL\s*\([^)]*\)\.searchParams\.get\s*\(\s*['"](organization|tenant)(_?id)?['"]\s*\)/i,
  /\bparams\.org(_?id)?\b/i,
  /\bparams\?\.org(_?id)?\b/i,
  /\bparams\.(organization|tenant)(_?id)?\b/i,
  /\bparams\?\.(organization|tenant)(_?id)?\b/i
];

const USER_ID_INPUT_PATTERNS = [
  /\b(req\.params|req\.query|req\.body|params|query|body)\.[A-Za-z0-9_]*user(_?id)?\b/i,
  /\buser(_?id)?\s*=\s*(req\.params|req\.query|req\.body|params|query|body)\b/i,
  /\b\{[^}]*\buser(_?id)?\b[^}]*\}\s*=\s*await\s*(req|request)\.json\s*\(/i,
  /\b(req|request)\.json\s*\(\)[^;\n]*\buser(_?id)?\b/i,
  /\bsearchParams\.get\s*\(\s*['"]user(_?id)?['"]\s*\)/i,
  /\bnew\s+URL\s*\([^)]*\)\.searchParams\.get\s*\(\s*['"]user(_?id)?['"]\s*\)/i,
  /\b(req|request)\.headers\.get\s*\(\s*['"][^'"]*user[^'"]*id['"]\s*\)/i
];

const REQUEST_JSON_PATTERNS = [/\b(req|request)\.json\s*\(/i];
const REQUEST_BODY_PATTERNS = [
  /\breq\.body\b/i,
  /\brequest\.body\b/i,
  /\b(await|return)\s+(req|request)\.json\s*\(/i,
  /\b(body|payload)\s*=\s*await\s*(req|request)\.json\s*\(/i
];
const REQUEST_BODY_LOG_PATTERNS = [
  /\bbody\b/i,
  /\bpayload\b/i,
  /\brequestBody\b/i,
  /\breq\.body\b/i,
  /\brequest\.body\b/i,
  /\b(req|request)\.json\s*\(/i,
  /\b(req|request)\.json\s*\?\.\s*\(/i,
  /\b(req|request)\.json\s*\(\)\s*\.\s*catch\b/i
];
const BODY_ID_PATTERNS = [
  /\b(body|data|payload|input)\b[^;\n]{0,20}\.\s*[A-Za-z0-9_]*id\b/i,
  /\b\{[^}]*\b[A-Za-z0-9_]*id\b[^}]*\}\s*=\s*(body|data|payload|input)\b/i
];
const BODY_ORG_PATTERNS = [
  /\b(body|data|payload|input)\b[^;\n]{0,20}\.\s*(org|organization|tenant)(_?id)?\b/i,
  /\b(body|data|payload|input)\s*(?:\?\.\s*)?\[\s*['"](org(_?id)?|organization(_?id)?|tenant(_?id)?)['"]\s*\]/i,
  /\b\{[^}]*\b(org|organization|tenant)(_?id)?\b[^}]*\}\s*=\s*(body|data|payload|input)\b/i
];

const IDOR_BYPASS_PATTERNS = [
  /\bidor\b/i,
  /\b(skip|bypass|disable|no)\s*(ownership|tenant|org|authorization|auth)\b/i,
  /\bskip(Ownership|Auth|Authorization|Tenant|Org)\b/i,
  /\bbypass(Ownership|Auth|Authorization|Tenant|Org)\b/i,
  /\baccess\s*control\b/i
];

const DB_ID_PATTERNS = [
  /\.eq\(\s*['"][A-Za-z0-9_]*id['"]/i,
  /\.match\(\s*\{[^}]*\b(id|[A-Za-z0-9_]*Id)\b/i,
  /\bwhere\s*\(\s*\{[^}]*\b(id|[A-Za-z0-9_]*Id)\b/i,
  /\bfind(Unique|First|One)\s*\(\s*\{[^}]*\b(id|[A-Za-z0-9_]*Id)\b/i,
  /\bWHERE\b[^\n]{0,80}\bid\b/i
];

const OWNERSHIP_FILTER_PATTERNS = [
  /\.eq\(\s*['"](org_id|orgId|user_id|userId|tenant_id|tenantId|owner_id|ownerId|team_id|teamId|workspace_id|workspaceId|account_id|accountId)['"]/i,
  /\.in\(\s*['"](org_id|orgId|user_id|userId|tenant_id|tenantId|owner_id|ownerId|team_id|teamId|workspace_id|workspaceId|account_id|accountId)['"]/i,
  /\.match\(\s*\{[^}]*\b(org_id|orgId|user_id|userId|tenant_id|tenantId|owner_id|ownerId|team_id|teamId|workspace_id|workspaceId|account_id|accountId)\b/i,
  /\bwhere\s*\(\s*\{[^}]*\b(org_id|orgId|user_id|userId|tenant_id|tenantId|owner_id|ownerId|team_id|teamId|workspace_id|workspaceId|account_id|accountId)\b/i,
  /\bWHERE\b[^\n]{0,120}\b(org_id|user_id|tenant_id|owner_id|team_id|workspace_id|account_id)\b/i
];

const DB_WRITE_PATTERNS = [/\.(insert|update|upsert|create(?:Many|One)?)\s*\(/i, /\.rpc\s*\(/i];
const FRONTEND_DB_WRITE_PATTERNS = [
  /\bsupabase\.from\([^)]*\)\.(insert|update|delete|upsert)\b/i,
  /\bsupabase\.rpc\s*\(/i
];
const SUPABASE_CLIENT_FACTORY_PATTERNS = [
  /\bcreateClient\s*(?:<[^>]*>)?\s*\(/i,
  /\bcreateBrowserClient\s*(?:<[^>]*>)?\s*\(/i
];
const SUPABASE_WRITE_METHOD_PATTERNS = [
  /\.from\s*\([^)]*\)\.(insert|update|delete|upsert)\b/i,
  /\.rpc\s*\(/i
];

const SENSITIVE_ACTION_PATTERNS = [
  /\blogin\b/i,
  /\bsignin\b/i,
  /\bsignup\b/i,
  /\bregister\b/i,
  /token\b/i,
  /\bpassword\b/i,
  /\breset\b/i,
  /\binvite\b/i,
  /\bcreate\b/i,
  /create[A-Z]/,
  /\bprojects?\b/i,
  /\blist\b/i,
  /\bwrite\b/i,
  /\bupdate\b/i,
  /\binsert\b/i,
  /\bupsert\b/i,
  /\bdelete\b/i,
  /\bdestroy\b/i,
  /\brevoke\b/i,
  /["']use server["']/i
];

const SENSITIVE_ACTION_HINT_PATTERNS = [
  /\bcreate\b/i,
  /create[A-Z]/,
  /\bprojects?\b/i,
  /\blist\b/i,
  /\bwrite\b/i,
  /\bupdate\b/i,
  /\binsert\b/i,
  /\bupsert\b/i,
  /token\b/i,
  /\bapi[_-]?token\b/i,
  /\baccess[_-]?token\b/i,
  /\brefresh[_-]?token\b/i
];

const DESTRUCTIVE_IDENTIFIER_PATTERN =
  /\b(?:delete|remove|destroy|revoke|disable|suspend)(?:[A-Z][a-z0-9]+|[_-][a-z0-9]+)/i;

const DESTRUCTIVE_PATTERNS = [
  /\bdelete\b/i,
  /\bremove\b/i,
  /\bdestroy\b/i,
  /\brevoke\b/i,
  /\bdisable\b/i,
  /\bsuspend\b/i,
  /\.delete\(/i,
  DESTRUCTIVE_IDENTIFIER_PATTERN
];

const AUTH_ACTION_HINT_PATTERNS = [
  /\blogin\b/i,
  /\bsignin\b/i,
  /\bsignup\b/i,
  /\bregister\b/i,
  /\btoken\b/i,
  /\bpassword\b/i,
  /\breset\b/i,
  /\binvite\b/i
];
const AUTH_FLOW_PATTERNS = [
  /\blogin\b/i,
  /\bsignin\b/i,
  /\bsignup\b/i,
  /\bregister\b/i,
  /\bpassword\b/i,
  /\breset\b/i,
  /\boauth\b/i,
  /\bsso\b/i,
  /\bsession\b/i,
  /\btoken\b/i
];
const ADMIN_STEP_UP_HINT_PATTERNS = [
  /\bstep[-\s]?up\b/i,
  /\breauth\b/i,
  /\bre-auth\b/i,
  /\belevat(e|ed)\b/i,
  /\bsudo\b/i,
  /\bprivileged\b/i
];

const DESTRUCTIVE_ACTION_HINT_PATTERNS = [
  /\bdelete\b/i,
  /\bremove\b/i,
  /\bdestroy\b/i,
  /\brevoke\b/i,
  /\bdisable\b/i,
  /\bsuspend\b/i,
  /\bdestructive\b/i,
  DESTRUCTIVE_IDENTIFIER_PATTERN
];

const DESTRUCTIVE_PATH_HINT_PATTERNS = [
  /delete/i,
  /remove/i,
  /destroy/i,
  /revoke/i,
  /disable/i,
  /suspend/i
];

const AUDIT_PATTERNS = [
  /\baudit\b/i,
  /audit_log/i,
  /auditLog/i,
  /securityLog/i,
  /logEvent/i
];

const AUDIT_DISABLE_PATTERNS = [
  /\bno[_\s-]?audit\b/i,
  /\bskip[_\s-]?audit\b/i,
  /\bdisable(?:d)?[_\s-]?audit\b/i,
  /\baud(it)?_?log(?:s)?\s*disabled\b/i,
  /vulnEnabled\s*\([^)]*audit/i
];

const UNBOUNDED_SELECT_PATTERNS = [
  /\.select\s*\(\s*['"][^'"]*['"]\s*\)/i,
  /\.select\s*\(\s*`[^`]*`\s*\)/i,
  /\.select\s*\(\s*\[[^\]]+\]\s*\)/i,
  /\.select\s*\(\s*\)/i,
  /\.select\s*\(\s*[A-Za-z_$]/i
];
const LIMIT_PATTERNS = [/\.limit\(/i, /\.range\(/i, /\.paginate\(/i, /\.page\(/i];
const SINGLE_RESULT_PATTERNS = [/\.single\s*\(/i, /\.maybeSingle\s*\(/i];
const SELECT_WRITE_CHAIN_PATTERNS = [
  /\.insert\s*\(/i,
  /\.update\s*\(/i,
  /\.upsert\s*\(/i,
  /\.delete\s*\(/i
];
const SELECT_TABLE_HINT_PATTERNS = [
  /\.from\s*\(/i,
  /\.selectFrom\s*\(/i,
  /\.table\s*\(/i,
  /\bfrom\s+['"`][^'"`]+['"`]/i
];
const SELECT_USER_FILTER_PATTERNS = [
  /\.(eq|neq|in|match|filter|ilike|like|contains|overlaps|textSearch)\s*\([^\n]*(req\.|request\.|params\.|query\.|body\.|searchParams|headers\.get)/i,
  /\bwhere\b[^\n]{0,120}\b(req\.|request\.|params\.|query\.|body\.|searchParams|headers\.get)/i
];

const EXTERNAL_CALL_PATTERNS = [
  /\bfetch\s*\(/i,
  /\baxios\b/i,
  /\bgot\s*\(/i,
  /\brequest\s*\(/i,
  /\bhttp\.request\s*\(/i,
  /\bhttps\.request\s*\(/i
];
const RESPONSE_HEADER_PATTERNS = [
  /\b(res|response)\.setHeader\s*\(/i,
  /\b(res|response)\.writeHead\s*\(/i,
  /\b(res|response)\.header\s*\(/i,
  /\b(reply|ctx)\.header\s*\(/i,
  /\bresponse\.headers\.set\s*\(/i,
  /\bresponse\.headers\.append\s*\(/i,
  /\bheaders\.set\s*\(/i,
  /\bheaders\.append\s*\(/i,
  /\bnew\s+Headers\s*\(/i,
  /\bNextResponse\.(json|redirect|next)\s*\([^)]*headers\s*:/i
];

const EXEC_PATTERNS = [
  /\bexecSync\s*\(/i,
  /\bexec\s*\(/i,
  /\bspawnSync\s*\(/i,
  /\bspawn\s*\(/i,
  /child_process/i,
  /Deno\.Command/i,
  /Deno\.run/i,
  /Bun\.spawn/i
];

const TIMEOUT_PATTERNS = [
  /timeout/i,
  /AbortController/i,
  /AbortSignal/i,
  /signal\s*:/i,
  /withTimeout/i,
  /setTimeout\s*\(/i
];

const LOCAL_TEST_URL_PATTERNS = [
  /\blocalhost\b/i,
  /\b127\.0\.0\.1\b/,
  /\b0\.0\.0\.0\b/,
  /\b::1\b/,
  /\bhttps?:\/\/example\.(?:com|org|net)\b/i,
  /\bhttps?:\/\/[^/\s]+\.(?:test|local|example|invalid)\b/i
];

const CORS_WILDCARD_PATTERNS = [
  /Access-Control-Allow-Origin[^\n]*\*/i,
  /allowOrigin[^\n]*\*/i,
  /origin\s*\?\?\s*['"]\*['"]/i,
  /origin\s*\|\|\s*['"]\*['"]/i,
  /cors\s*\([^)]*\*[^)]*\)/i
];

const JWT_FALLBACK_PATTERNS = [
  /JWT_SECRET[^\n]*\|\|[^\n]*['"][^'"]+['"]/i,
  /JWT_SECRET[^\n]*\?\?[^\n]*['"][^'"]+['"]/i,
  /jwtSecret[^\n]*\|\|[^\n]*['"][^'"]+['"]/i,
  /jwtSecret[^\n]*\?\?[^\n]*['"][^'"]+['"]/i
];

const JWT_DECODE_PATTERNS = [
  /jwt\.decode\s*\(/i,
  /\bjwtDecode\s*\(/i,
  /decodeJwt\s*\(/i,
  /decodeJWT\s*\(/i,
  /parseJwt\s*\(/i,
  /decodeProtectedHeader\s*\(/i
];
const JWT_VERIFY_PATTERNS = [
  /jwt\.verify\s*\(/i,
  /\bjwtVerify\s*\(/i,
  /verifyJwt\s*\(/i,
  /createVerifier\s*\(/i,
  /\bjwtDecrypt\s*\(/i
];
const JWT_CONTEXT_PATTERNS = [/\bjwt\b/i, /\btoken\b/i, /\baccess[_-]?token\b/i];
const JWT_BYPASS_TOGGLE_PATTERNS = [
  /\b(skip|bypass|disable|no)[\w\s-]{0,20}(verify|verification|signature)\b/i,
  /\bverify(Signature|Jwt|Token)?\s*:\s*false\b/i,
  /\bverify\s*:\s*false\b/i,
  /\bnoVerify\b/i,
  /\bskipJwtVerification\b/i,
  /\bdisableJwtVerification\b/i,
  /\bignoreExpiration\s*:\s*true\b/i,
  /\bignoreExp\s*:\s*true\b/i,
  /\brequireSignedTokens?\s*:\s*false\b/i,
  /\balgorithms?\s*:\s*\[\s*['"]none['"]\s*\]/i
];

const SQL_INJECTION_PATTERNS = [
  /\b(query|execute|sql)\s*\(.*\+.*\b(req\.|params\.|query\.|body\.)/i,
  /\b(query|execute|sql)\s*\(.*`[^`]*\$\{[^}]*\b(req\.|params\.|query\.|body\.)/i,
  /`[^`]*\b(select|insert|update|delete)\b[^`]*\$\{[^}]*\b(req\.|params\.|query\.|body\.)/i,
  /`[^`]*\b(select|insert|update|delete)\b[^`]*\$\{[^}]+}/i,
  /\b(select|insert|update|delete)\b[^\n]{0,120}\+[^\n]{0,120}\b(req\.|params\.|query\.|body\.)/i
];
const RAW_SQL_HELPER_PATTERNS = [/\braw\s+sql\b/i, /\bunsafe\s+sql\b/i, /\bsql\s+helper\b/i];

const QUERY_BUILDER_PATTERNS = [
  /\.(or|filter|ilike|order|textSearch)\s*\([^\n]*(req\.|params\.|query\.|body\.)/i,
  /\.(or|filter|ilike|order|textSearch)\s*\([^\n]*(filter|search|query|where)\b/i
];

const COMMAND_INJECTION_PATTERNS = [
  /\b(exec|execSync|spawn|spawnSync|Deno\.Command|Deno\.run|Bun\.spawn)\s*\([^)]*(\+|\$\{)[^)]*/i,
  /\b(exec|execSync|spawn|spawnSync|Deno\.Command|Deno\.run|Bun\.spawn)\s*\([^)]*`[^`]*\$\{[^}]+}/i
];

const COMMAND_INPUT_PATTERNS = [
  /\b(req\.|params\.|query\.|body\.)/i,
  /\b(repoUrl|repo|url|path|command|args?)\b/i
];

const TOKEN_CONTEXT_PATTERNS = [/\btoken\b/i, /\bapi[_-]?key\b/i, /\bsecret\b/i];
const WEAK_TOKEN_PATTERNS = [/Math\.random\s*\(/i, /\bDate\.now\s*\(/i];

const LOG_CALL_PATTERNS = [
  /\bconsole\.(log|info|warn|error|debug|trace)\s*\(/i,
  /\blogger(?:\?\.|\.)\s*(info|warn|error|debug|log|trace)\s*\(/i,
  /\blog(?:\?\.|\.)\s*(info|warn|error|debug|trace)\s*\(/i
];

const SENSITIVE_LOG_PATTERNS = [
  /\btoken\b/i,
  /\bsecret\b/i,
  /\bapi[_-]?key\b/i,
  /\bpassword\b/i,
  /\bbearer\b/i,
  /\bauthorization\b/i
];

const COMMAND_OUTPUT_PATTERNS = [
  /\bstdout\b/i,
  /\bstderr\b/i,
  /\boutput\b/i,
  /\bresult\b/i,
  /\bcommand\b/i,
  /\bcmd\b/i,
  /\brepoUrl\b/i,
  /\brepo_url\b/i,
  /\bcloneUrl\b/i,
  /\bclone_url\b/i,
  /\burl\b/i,
  /\brepo\b/i,
  /\bclone\b/i,
  /\bgit\b/i
];

const COMMAND_LOG_STRONG_PATTERNS = [
  /\bstdout\b/i,
  /\bstderr\b/i,
  /\bcmd\b/i,
  /\bcommand\b/i,
  /\brepoUrl\b/i,
  /\brepo_url\b/i,
  /\bcloneUrl\b/i,
  /\bclone_url\b/i,
  /\bgit\b/i,
  /\bclone\b/i
];

const DEBUG_ENDPOINT_PATTERNS = [/debug/i];
const DEBUG_HEADER_PATTERNS = [/\bheaders?\b/i, /\bauthorization\b/i];
const DEBUG_AUTH_PATTERNS = [/\bauth\b/i, /\bsession\b/i, /\bjwt\b/i, /\buser\b/i];

const WEBHOOK_SIGNATURE_PATTERNS = [
  /\bsignature\b/i,
  /\bhmac\b/i,
  /timingSafeEqual/i,
  /\bx-.*-signature\b/i,
  /\bwebhook-secret\b/i
];

const WEBHOOK_CONFIG_PATTERNS = [
  /\bconfigUrl\w*\b/i,
  /\bconfig_url\w*\b/i,
  /\bconfigUri\w*\b/i,
  /\bconfig_uri\w*\b/i,
  /\bconfigLink\w*\b/i,
  /\bconfig_link\w*\b/i,
  /\bremoteConfig\w*\b/i,
  /\bremote_config\w*\b/i,
  /\bconfigSource\b/i,
  /\bwebhookConfig\b/i,
  /\bwebhookConfig\w*\b/i,
  /\bwebhook_config\w*\b/i,
  /\bconfigEndpoint\b/i,
  /\bconfigPayload\b/i,
  /\bconfig\s*(?:\?\.|\.)\s*(url|uri|endpoint|link)\b/i,
  /\bconfig\s*\[\s*['"](url|uri|endpoint|link)['"]\s*\]/i,
  /\b(payload|body|req\.body|request\.body|event\.data|event\.payload)\s*(?:\?\.|\.)\s*config\w*\b/i,
  /\b(payload|body|req\.body|request\.body|event\.data|event\.payload)\s*(?:\?\.|\.)\s*config\s*(?:\?\.|\.)\s*(url|uri|endpoint|link)\b/i,
  /\b(payload|body|req\.body|request\.body|event\.data|event\.payload)\s*(?:\?\.|\.)\s*(url|uri|endpoint|link)\b/i,
  /\b\{\s*(config\w*|url|uri|endpoint|link)\s*\}\s*=\s*(payload|body|req\.body|request\.body|event\.data|event\.payload)\b/i,
  /\b\{\s*config\w*\s*\}\s*=\s*await\s*(req|request)\.json\s*\(\s*\)/i,
  /\b(await\s+)?(req|request)\.json\s*\(\s*\)\s*\.\s*config\w*\b/i,
  /\b(req|request)\.(query|params)\.config\w*\b/i,
  /\bsearchParams\.get\s*\(\s*['"]config(?:[_-]?(url|uri|endpoint|link))['"]\s*\)/i
];
const WEBHOOK_CONFIG_INTEGRITY_PATTERNS = [
  /\bconfig(?:[_-]?(?:url|uri|endpoint|link|payload|body|data|response|remote|source))\w*[^;\n]{0,40}\b(signature|sig|hmac|hash|checksum|digest|integrity)\b/i,
  /\b(signature|sig|hmac|hash|checksum|digest|integrity)\b[^;\n]{0,40}\bconfig(?:[_-]?(?:url|uri|endpoint|link|payload|body|data|response|remote|source))\w*\b/i,
  /\bremoteConfig\w*[^;\n]{0,40}\b(signature|sig|hmac|hash|checksum|digest|integrity)\b/i,
  /\b(signature|sig|hmac|hash|checksum|digest|integrity)\b[^;\n]{0,40}\bremoteConfig\w*\b/i,
  /\bconfig(?:[_-]?(?:payload|response|data))?\s*(?:\?\.|\.)\s*(signature|sig|hmac|hash|checksum|digest|integrity)\b/i,
  /\bconfig[_-]?(?:Signature|Sig|Hmac|Hash|Checksum|Digest|Integrity)\w*\b/i
];

const CODE_EXECUTION_PATTERNS = [
  /\bnew Function\s*\(/i,
  /\beval\s*\(/i,
  /\bvm\.runIn(New)?Context\s*\(/i
];

const DANGEROUS_HTML_PATTERNS = [/dangerouslySetInnerHTML/i];

const ANON_KEY_PATTERNS = [
  /SUPABASE_ANON_KEY/i,
  /\banonKey\b/i,
  /\bsupabaseAnonKey\b/i
];
const SERVICE_ROLE_KEY_PATTERNS = [
  /SERVICE_ROLE_KEY/i,
  /\bserviceRoleKey\b/i,
  /\bserviceRole\b/i
];
const SUPABASE_CONTEXT_PATTERNS = [
  /\bcreate(Client|ServerClient|BrowserClient|MiddlewareClient)\s*\(/i,
  /\bsupabase\.(from|rpc|storage|auth)\b/i
];
const ADMIN_CONTEXT_PATTERNS = [
  /\badmin\b/i,
  /\bservice\b/i,
  /\bprivileged\b/i,
  /\binternal\b/i,
  /[Aa][Dd][Mm][Ii][Nn](?=$|[_A-Z])/,
  /\badmin[a-z0-9]+\b/i,
  /service[\s_-]*role/i
];
const NEXT_PUBLIC_SECRET_PATTERNS = [
  /\bNEXT_PUBLIC_[A-Z0-9_]*(SERVICE_ROLE|SECRET|PRIVATE|ADMIN|SIGNING|JWT)(?:_?[A-Z0-9_]*KEY)?\b/i
];
const STORAGE_CONTEXT_PATTERNS = [
  /\bbucket\b/i,
  /\bstorage\b/i,
  /\bs3\b/i,
  /\bblob\b/i,
  /\bobject\s+storage\b/i,
  /\bsupabase\.storage\b/i
];
const PUBLIC_BUCKET_PATTERNS = [
  /\bpublic[-_]?read\b/i,
  /\bpublic[-_]?read[-_]?write\b/i,
  /\bpublic[-_]?bucket\b/i,
  /\bpublic[-_]?assets?\b/i,
  /\bbucket\b[^\n]{0,40}\bpublic\b/i,
  /\bpublic\b[^\n]{0,40}\bbucket\b/i
];

const AUTH_HEADER_PATTERNS = [/\bAuthorization\b/i, /\bBearer\b/i, /\bapikey\b/i];
const ACCESS_TOKEN_PATTERNS = [/\baccess_token\b/i, /\baccessToken\b/i];

const FRONTEND_AUTH_STATE_PATTERNS = [
  /\bsession\.user\b/i,
  /\buser\.id\b/i,
  /\bcurrentUser\b/i,
  /supabase\.auth\.get(User|Session)\b/i
];

const FRONTEND_API_CALL_PATTERNS = [/\bfetch\s*\(/i, /\baxios\b/i];

const LOGIN_PATH_PATTERNS = [/\/login\b/i, /\/signin\b/i];
const LOGIN_UI_PATTERNS = [/\blogin\b/i, /\bsignin\b/i, /\bpassword\b/i];
const CAPTCHA_PATTERNS = [/\bcaptcha\b/i, /\brecaptcha\b/i, /\bturnstile\b/i];
const LOCKOUT_PATTERNS = [
  /\blockout\b/i,
  /\baccount\s*lock/i,
  /\blocked\s*(?:account|user)?\b/i,
  /\btoo\s+many\s+attempts?\b/i,
  /\bfailed\s*attempts?\b/i,
  /\blogin\s*attempts?\b/i,
  /\bmax(?:imum)?\s*attempts?\b/i,
  /\bbrute[- ]?force\b/i
];
const MFA_PATTERNS = [
  /\bmfa\b/i,
  /\b2fa\b/i,
  /\btwo[-\s]?factor\b/i,
  /\bmulti[-\s]?factor\b/i,
  /\bsecond[-\s]?factor\b/i,
  /\botp\b/i,
  /\btotp\b/i,
  /\bone[-\s]?time\s+pass(code|word)\b/i,
  /\bauthenticator\b/i,
  /\bwebauthn\b/i,
  /\bpasskey\b/i
];
const LOCKOUT_NEGATION_PATTERNS = [
  /\bno\s+lockout\b/i,
  /\bwithout\s+lockout\b/i,
  /\blockout\s*disabled\b/i,
  /\bdisable(?:d)?\s+lockout\b/i,
  /\bno\s+(?:throttl(?:e|ing)?|rate\s*limit(?:ing)?)\b[^\n]{0,40}\blockout\b/i,
  /\blockout\b[^\n]{0,40}\bno\s+(?:throttl(?:e|ing)?|rate\s*limit(?:ing)?)\b/i,
  /\bunlimited\s+attempts?\b/i,
  /\bno\s+limit\s+on\s+attempts?\b/i,
  /\bno\s+account\s+lockout\b/i
];

const MAGIC_LINK_TOKEN_PATTERNS = [/\bmagicToken\b/i, /\bmagic_token\b/i];
const MAGIC_LINK_SESSION_PATTERNS = [/\bsignSession\s*\(/i];
const MAGIC_LINK_COOKIE_SET_PATTERNS = [/\bcookies\s*\(\s*\)\s*\.set\s*\(/i];
const MAGIC_LINK_EXPIRATION_PATTERNS = [
  /\bexpires?\b/i,
  /\bexpiresAt\b/i,
  /\bexpiresIn\b/i,
  /\bexpiry\b/i,
  /\bmaxAge\b/i,
  /\bmax_age\b/i,
  /\bttl\b/i,
  /\bexp\b\s*[:=]/i
];

const AUTH_FILE_PATTERNS = [
  /auth/i,
  /login/i,
  /signin/i,
  /signup/i,
  /register/i,
  /oauth/i,
  /callback/i,
  /token/i,
  /session/i,
  /password/i
];

const WEBHOOK_FILE_PATTERNS = [/webhook/i, /hook/i];

const ADMIN_PATH_PATTERNS = [/\/(admin|superadmin|staff|root)(\/|\.|_|-)/i, /\badmin\b/i];
const MEMBER_MANAGEMENT_PATH_PATTERNS = [
  /\/(members?|membership|memberships|roles?|permissions?|invites?|invitations?|teams?|workspaces?|organizations?|orgs?|accounts?)(\/|$|\.|_|-)/i,
  /\/(user|users)\/(roles?|permissions?|invites?|members?|membership)/i
];
const MEMBER_MANAGEMENT_CONTENT_PATTERNS = [
  /\bmember(ship)?\b/i,
  /\binvite\b/i,
  /\bteam\b/i,
  /\bworkspace\b/i,
  /\borganization\b/i,
  /\bgrant\b/i,
  /\brevoke\b/i,
  /\bassign\b/i,
  /\brole[_-]?id\b/i,
  /\bpermission[_-]?id\b/i,
  /\baddMember\b/i,
  /\bremoveMember\b/i,
  /\bsetRole\b/i,
  /\bupdateRole\b/i,
  /\bchangeRole\b/i,
  /\bmakeAdmin\b/i,
  /\bremoveAdmin\b/i
];
const MEMBER_MANAGEMENT_STRONG_PATTERNS = [
  /\binvite\b/i,
  /\baddMember\b/i,
  /\bremoveMember\b/i,
  /\bsetRole\b/i,
  /\bupdateRole\b/i,
  /\bchangeRole\b/i,
  /\bmakeAdmin\b/i,
  /\bremoveAdmin\b/i,
  /\bgrant\b/i,
  /\brevoke\b/i
];

const SHARED_AUTH_PATH_PATTERNS = [
  /\bauth\./i,
  /\bjwt\./i,
  /middleware\.(ts|js|tsx|jsx)$/i,
  /auth\/middleware/i
];

const HTTP_METHOD_PATTERNS: Record<string, RegExp[]> = {
  GET: [/\b(get|fetch)\b/i, /\.get\s*\(/i, /\bGET\b/],
  POST: [/\.post\s*\(/i, /\bPOST\b/],
  PUT: [/\.put\s*\(/i, /\bPUT\b/],
  PATCH: [/\.patch\s*\(/i, /\bPATCH\b/],
  DELETE: [/\.delete\s*\(/i, /\bDELETE\b/]
};

const ROUTER_HANDLER_PATTERNS = [
  /\b(app|router)\.(get|post|put|patch|delete|all)\s*\(/i,
  /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\b/i,
  /export\s+function\s+(GET|POST|PUT|PATCH|DELETE)\b/i,
  /export\s+const\s+(GET|POST|PUT|PATCH|DELETE)\s*=/i,
  /\breq\.method\b/i,
  /\bcase\s+['"](GET|POST|PUT|PATCH|DELETE)['"]\b/i,
  /Deno\.serve\s*\(/i,
  /addEventListener\s*\(\s*['"]fetch['"]\s*\)/i
];
const SERVER_ACTION_DIRECTIVE_PATTERN = /(^|\n)\s*["']use server["']\s*;?/i;
const USE_CLIENT_DIRECTIVE_PATTERN = /(^|\n)\s*["']use client["']\s*;?/i;

const UPLOAD_SIGNAL_PATTERNS = [
  /\bmultipart\/form-data\b/i,
  /\bmulter\b/i,
  /\bbusboy\b/i,
  /\bformidable\b/i,
  /\bfileUpload\b/i,
  /\breq\.files?\b/i,
  /\bcreateReadStream\b/i,
  /\bReadableStream\b/i,
  /\bFile\b/i,
  /\bBlob\b/i
];
const UPLOAD_FORMDATA_PATTERNS = [
  /\bformData\b/i,
  /\b(request|req)\.formData\s*\(/i
];
const UPLOAD_FORMDATA_FILE_PATTERNS = [
  /\bformData\.(get|getAll)\s*\(\s*['"](?:file|files|upload|attachment|avatar|image|photo|document)s?['"]\s*\)/i,
  /\bformData\.(get|getAll)\s*\(\s*`[^`]*(file|upload|attachment)[^`]*`\s*\)/i
];
const UPLOAD_PATH_PATTERNS = [/\/upload(s)?(\/|$)/i, /file[-_]?upload/i];
const UPLOAD_SIZE_LIMIT_PATTERNS = [
  /\bcontent-length\b/i,
  /\bmax(?:imum)?\s*file\s*size\b/i,
  /\bmax(?:imum)?\s*bytes\b/i,
  /\bsizeLimit\b/i,
  /\bmaxBodySize\b/i,
  /\bfileSize\b/i,
  /\bfilesize\b/i,
  /\blimits?\b[^;\n]*\bfile/i
];

const MAX_CANDIDATES = 60;
const MAX_EVIDENCE_LINES = 2;
const DEFAULT_CANDIDATE_PRIORITY = 10;
const DATA_ACCESS_SINK_TYPES = [
  "db.write",
  "db.query",
  "sql.query",
  "exec",
  "http.request"
];
const CANDIDATE_PRIORITY: Record<string, number> = {
  sql_injection: 120,
  command_injection: 120,
  dangerous_html_render: 115,
  permissive_cors: 110,
  missing_webhook_signature: 110,
  webhook_signature_missing: 110,
  missing_webhook_config_integrity: 112,
  webhook_code_execution: 105,
  jwt_validation_bypass: 105,
  weak_jwt_secret: 100,
  weak_token_generation: 95,
  magic_link_no_expiration: 90,
  idor: 95,
  org_id_trust: 95,
  unsafe_query_builder: 90,
  mass_assignment: 70,
  debug_auth_leak: 85,
  anon_key_bearer: 95,
  missing_bearer_token: 80,
  frontend_direct_db_write: 80,
  sensitive_logging: 75,
  command_output_logging: 85,
  unbounded_query: 70,
  missing_timeout: 65,
  frontend_only_authorization: 75,
  missing_rate_limiting: 45,
  missing_lockout: 44,
  missing_mfa: 43,
  missing_audit_logging: 65,
  missing_upload_size_limit: 60,
  missing_security_headers: 50,
  frontend_login_rate_limit: 40,
  frontend_secret_exposure: 90,
  missing_least_privilege: 60
};

const CANDIDATE_RULE_GATES: Record<string, RuleScopeGate> = {
  sql_injection: {
    allowedScopes: ["backend_endpoint", "backend_shared"],
    requiresEvidence: {
      endpointContext: true,
      sharedContext: true,
      sinkTypes: ["sql.query"]
    }
  },
  unsafe_query_builder: {
    allowedScopes: ["backend_endpoint", "backend_shared"],
    requiresEvidence: {
      endpointContext: true,
      sharedContext: true,
      sinkTypes: ["db.query"]
    }
  },
  mass_assignment: {
    allowedScopes: ["backend_endpoint"],
    requiresEvidence: {
      endpointContext: true,
      requestBody: true,
      sinkTypes: ["db.write"]
    }
  },
  command_injection: {
    allowedScopes: ["backend_endpoint"],
    requiresEvidence: { endpointContext: true, sinkTypes: ["exec"] }
  },
  idor: {
    allowedScopes: ["backend_endpoint"],
    requiresEvidence: { endpointContext: true, sinkTypes: ["db.query", "sql.query"] }
  },
  org_id_trust: {
    allowedScopes: ["backend_endpoint", "frontend_ui"],
    requiresEvidence: { sinkTypes: ["db.write", "http.request"] }
  },
  debug_auth_leak: {
    allowedScopes: ["backend_endpoint"],
    requiresEvidence: { endpointContext: true }
  },
  missing_rate_limiting: {
    allowedScopes: ["backend_endpoint"],
    requiresEvidence: { endpointContext: true, sensitiveAction: true }
  },
  missing_lockout: {
    allowedScopes: ["backend_endpoint", "server_component"],
    requiresEvidence: { sensitiveAction: true }
  },
  missing_mfa: {
    allowedScopes: ["backend_endpoint", "server_component"],
    requiresEvidence: { sensitiveAction: true }
  },
  missing_audit_logging: {
    allowedScopes: ["backend_endpoint", "backend_shared"],
    requiresEvidence: { endpointContext: true, sharedContext: true, destructiveAction: true }
  },
  missing_role_check: {
    allowedScopes: ["backend_endpoint"],
    requiresEvidence: { endpointContext: true }
  },
  missing_webhook_signature: {
    allowedScopes: ["backend_endpoint"],
    requiresEvidence: { endpointContext: true }
  },
  missing_webhook_config_integrity: {
    allowedScopes: ["backend_endpoint"],
    requiresEvidence: { endpointContext: true }
  },
  webhook_code_execution: {
    allowedScopes: ["backend_endpoint"],
    requiresEvidence: { endpointContext: true }
  },
  permissive_cors: {
    allowedScopes: ["backend_shared"],
    requiresEvidence: { sharedContext: true }
  },
  jwt_validation_bypass: {
    allowedScopes: ["backend_shared", "server_component"]
  },
  weak_jwt_secret: {
    allowedScopes: ["backend_shared"],
    requiresEvidence: { sharedContext: true }
  },
  magic_link_no_expiration: {
    allowedScopes: ["backend_endpoint", "server_component"],
    requiresEvidence: { sensitiveAction: true }
  },
  weak_token_generation: {
    allowedScopes: ["backend_endpoint", "backend_shared"]
  },
  sensitive_logging: {
    allowedScopes: ["backend_endpoint", "backend_shared"]
  },
  command_output_logging: {
    allowedScopes: ["backend_endpoint", "backend_shared"]
  },
  unbounded_query: {
    allowedScopes: ["backend_endpoint", "backend_shared"]
  },
  missing_timeout: {
    allowedScopes: ["backend_endpoint", "backend_shared"],
    requiresEvidence: {
      endpointContext: true,
      sharedContext: true,
      sinkTypes: ["http.request", "exec"]
    }
  },
  missing_upload_size_limit: {
    allowedScopes: ["backend_endpoint"],
    requiresEvidence: { endpointContext: true }
  },
  dangerous_html_render: {
    allowedScopes: ["frontend_ui"],
    requiresEvidence: { sinkTypes: ["template.render"] }
  },
  frontend_only_authorization: {
    allowedScopes: ["frontend_ui", "frontend_util"],
    requiresEvidence: { sensitiveAction: true }
  },
  anon_key_bearer: {
    allowedScopes: ["frontend_ui", "frontend_util", "backend_shared"]
  },
  missing_bearer_token: {
    allowedScopes: ["frontend_ui", "frontend_util"]
  },
  frontend_direct_db_write: {
    allowedScopes: ["frontend_ui", "frontend_util"]
  },
  frontend_login_rate_limit: {
    allowedScopes: ["frontend_ui"]
  },
  frontend_secret_exposure: {
    allowedScopes: ["frontend_ui", "frontend_util", "backend_shared", "config_metadata"]
  },
  missing_least_privilege: {
    allowedScopes: ["backend_shared", "config_metadata"]
  },
  missing_security_headers: {
    allowedScopes: ["backend_endpoint", "backend_shared", "config_metadata"],
    requiresEvidence: { sinkTypes: ["http.response.headers"] }
  }
};

const CONTROL_RULE_GATES: Record<string, RuleScopeGate> = {
  authentication: {
    allowedScopes: ["backend_endpoint", "backend_shared"]
  },
  "authorization:role": {
    allowedScopes: ["backend_endpoint"],
    requiresEvidence: { endpointContext: true }
  },
  "authorization:ownership_or_membership": {
    allowedScopes: ["backend_endpoint"],
    requiresEvidence: { endpointContext: true }
  },
  rate_limiting: {
    allowedScopes: ["backend_endpoint"],
    requiresEvidence: { endpointContext: true, sensitiveAction: true }
  },
  audit_logging: {
    allowedScopes: ["backend_endpoint", "backend_shared"],
    requiresEvidence: { endpointContext: true, sharedContext: true, destructiveAction: true }
  },
  secure_token_handling: {
    allowedScopes: ["backend_endpoint", "backend_shared"]
  },
  input_validation: {
    allowedScopes: ["backend_endpoint", "backend_shared"],
    requiresEvidence: { sinkTypes: DATA_ACCESS_SINK_TYPES }
  },
  signature_verification: {
    allowedScopes: ["backend_endpoint"],
    requiresEvidence: { endpointContext: true }
  },
  replay_protection: {
    allowedScopes: ["backend_endpoint"],
    requiresEvidence: { endpointContext: true }
  },
  timeout: {
    allowedScopes: ["backend_endpoint", "backend_shared"],
    requiresEvidence: {
      endpointContext: true,
      sharedContext: true,
      sinkTypes: ["http.request", "exec"]
    }
  },
  secure_rendering: {
    allowedScopes: ["frontend_ui"]
  },
  no_frontend_only_auth: {
    allowedScopes: ["frontend_ui", "frontend_util", "backend_endpoint"]
  },
  no_sensitive_secrets: {
    allowedScopes: ["frontend_ui", "frontend_util"]
  }
};

const AUTH_ENDPOINT_CONTROL_EXCLUSIONS = new Set([
  "authentication",
  "authorization:ownership_or_membership"
]);

function hasDataAccessSinks(evidence: FileScopeEvidence | undefined): boolean {
  if (!evidence) return false;
  const sinks = new Set(evidence.sinks.map((sink) => sink.toLowerCase()));
  return DATA_ACCESS_SINK_TYPES.some((sink) => sinks.has(sink.toLowerCase()));
}

function pruneAuthEndpointControls(
  controls: string[],
  roles: FileRole[],
  evidence: FileScopeEvidence | undefined
): string[] {
  if (!roles.includes("AUTH_ENDPOINT")) return controls;
  if (!evidence) return controls;
  if (hasDataAccessSinks(evidence)) return controls;
  return controls.filter((control) => !AUTH_ENDPOINT_CONTROL_EXCLUSIONS.has(control));
}

function ruleGateAllows(
  ruleId: string,
  scope: FileScope,
  evidence: FileScopeEvidence | undefined,
  gateMap: Record<string, RuleScopeGate>
): boolean {
  const gate = gateMap[ruleId];
  if (!gate) return true;
  const scopeValue = resolveGateScope(scope, evidence);
  if (!scopeMatchesGate(scopeValue, gate.allowedScopes)) return false;
  if (!gate.requiresEvidence) return true;
  if (!evidence) return false;
  return evidenceMatchesGate(gate.requiresEvidence, evidence);
}

function resolveGateScope(scope: FileScope, evidence: FileScopeEvidence | undefined): FileScope {
  if (evidence?.isServerAction) {
    return "backend_endpoint";
  }
  return scope;
}

function scopeMatchesGate(scope: FileScope, allowedScopes: FileScope[]): boolean {
  if (allowedScopes.includes(scope)) return true;
  if (scope !== "server_component") return false;
  return (
    allowedScopes.includes("frontend_ui") ||
    allowedScopes.includes("frontend_util") ||
    allowedScopes.includes("backend_endpoint")
  );
}

function evidenceMatchesGate(gate: RuleEvidenceGate, evidence: FileScopeEvidence): boolean {
  const requiresEndpoint = Boolean(gate.endpointContext);
  const requiresShared = Boolean(gate.sharedContext);
  const isEndpoint = evidence.isEndpoint || evidence.isServerAction;
  if (requiresEndpoint && requiresShared) {
    if (!isEndpoint && !evidence.isShared) return false;
  } else {
    if (requiresEndpoint && !isEndpoint) return false;
    if (requiresShared && !evidence.isShared) return false;
  }
  if (gate.sensitiveAction && evidence.sensitiveActionHints.length === 0 && !evidence.isServerAction) {
    return false;
  }
  if (gate.requestBody && !evidence.hasRequestBody) {
    return false;
  }
  if (gate.destructiveAction && !evidence.sensitiveActionHints.includes("destructive")) {
    return false;
  }
  if (gate.sinkTypes && gate.sinkTypes.length > 0) {
    const sinks = new Set(evidence.sinks.map((sink) => sink.toLowerCase()));
    const matches = gate.sinkTypes.some((sink) => sinks.has(sink.toLowerCase()));
    if (!matches) return false;
  }
  return true;
}

function collectGateMismatches(
  gate: RuleScopeGate,
  scope: FileScope,
  evidence: FileScopeEvidence | undefined
): RuleGateMismatch[] {
  const mismatches: RuleGateMismatch[] = [];
  if (!scopeMatchesGate(scope, gate.allowedScopes)) {
    mismatches.push("scope");
  }
  if (!gate.requiresEvidence) {
    return mismatches;
  }
  if (!evidence) {
    mismatches.push("evidence");
    return mismatches;
  }
  const requiresEndpoint = Boolean(gate.requiresEvidence.endpointContext);
  const requiresShared = Boolean(gate.requiresEvidence.sharedContext);
  const isEndpoint = evidence.isEndpoint || evidence.isServerAction;
  if (requiresEndpoint && requiresShared) {
    if (!isEndpoint && !evidence.isShared) {
      mismatches.push("endpoint");
      mismatches.push("shared");
    }
  } else {
    if (requiresEndpoint && !isEndpoint) {
      mismatches.push("endpoint");
    }
    if (requiresShared && !evidence.isShared) {
      mismatches.push("shared");
    }
  }
  if (
    gate.requiresEvidence.sensitiveAction &&
    evidence.sensitiveActionHints.length === 0 &&
    !evidence.isServerAction
  ) {
    mismatches.push("sensitive");
  }
  if (gate.requiresEvidence.requestBody && !evidence.hasRequestBody) {
    mismatches.push("request_body");
  }
  if (
    gate.requiresEvidence.destructiveAction &&
    !evidence.sensitiveActionHints.includes("destructive")
  ) {
    mismatches.push("destructive");
  }
  if (gate.requiresEvidence.sinkTypes && gate.requiresEvidence.sinkTypes.length > 0) {
    const sinks = new Set(evidence.sinks.map((sink) => sink.toLowerCase()));
    const matches = gate.requiresEvidence.sinkTypes.some((sink) =>
      sinks.has(sink.toLowerCase())
    );
    if (!matches) {
      mismatches.push("sink");
    }
  }
  return mismatches;
}

function evaluateRuleGate(
  ruleId: string,
  scope: FileScope | undefined,
  evidence: FileScopeEvidence | undefined,
  gateMap: Record<string, RuleScopeGate>
): RuleGateCheck | null {
  const gate = gateMap[ruleId];
  if (!gate) return null;
  const scopeValue = resolveGateScope(scope ?? "unknown", evidence);
  const mismatches = collectGateMismatches(gate, scopeValue, evidence);
  return {
    allowed: mismatches.length === 0,
    scope: scopeValue,
    mismatches
  };
}

export function evaluateControlGate(
  controlId: string,
  scope: FileScope | undefined,
  evidence: FileScopeEvidence | undefined
): RuleGateCheck | null {
  return evaluateRuleGate(controlId, scope, evidence, CONTROL_RULE_GATES);
}

export function evaluateCandidateGate(
  candidateType: string,
  scope: FileScope | undefined,
  evidence: FileScopeEvidence | undefined
): RuleGateCheck | null {
  return evaluateRuleGate(candidateType, scope, evidence, CANDIDATE_RULE_GATES);
}

export function filterRequiredControls(
  requiredControls: string[],
  scope: FileScope | undefined,
  evidence: FileScopeEvidence | undefined,
  roles: FileRole[] = []
): string[] {
  if (!requiredControls || requiredControls.length === 0) return [];
  const scopeValue = scope ?? "unknown";
  const gatedControls = requiredControls.filter((control) =>
    ruleGateAllows(control, scopeValue, evidence, CONTROL_RULE_GATES)
  );
  return pruneAuthEndpointControls(gatedControls, roles, evidence);
}

export function deriveFileRoleAssignments(files: RepositoryFileSample[]): FileRoleAssignment[] {
  return files.map((file) => {
    const roles = classifyFileRoles(file);
    const normalizedPath = normalizePath(file.path ?? "");
    const pathHints = buildPathHints(normalizedPath);
    const scopeEvidence = collectScopeEvidence(file.content ?? "", pathHints);
    const requiredControls = deriveRequiredControls(roles, scopeEvidence);
    return {
      path: file.path,
      roles,
      requiredControls
    };
  });
}

export function summarizeFileRoles(assignments: FileRoleAssignment[]): Record<string, number> {
  const summary: Record<string, number> = {};
  for (const assignment of assignments) {
    for (const role of assignment.roles) {
      summary[role] = (summary[role] ?? 0) + 1;
    }
  }
  return summary;
}

export function buildCandidateFindings(
  files: RepositoryFileSample[],
  assignments: FileRoleAssignment[],
  scopeAssignments?: FileScopeAssignment[]
): CandidateFinding[] {
  const candidates: CandidateFinding[] = [];
  const assignmentByPath = new Map(assignments.map((assignment) => [assignment.path, assignment]));
  const resolvedScopeAssignments =
    scopeAssignments && scopeAssignments.length > 0 ? scopeAssignments : deriveFileScopeAssignments(files);
  const scopeByPath = new Map(
    resolvedScopeAssignments.map((assignment) => [normalizePath(assignment.path), assignment])
  );
  const samplesByPath = new Map<string, RepositoryFileSample[]>();
  for (const file of files) {
    if (!file.path) continue;
    if (!samplesByPath.has(file.path)) {
      samplesByPath.set(file.path, []);
    }
    samplesByPath.get(file.path)!.push(file);
  }
  for (const list of samplesByPath.values()) {
    list.sort((a, b) => (a.chunkIndex ?? 0) - (b.chunkIndex ?? 0));
  }

  const frontendRoleEvidence = findFrontendRoleEvidence(files, assignmentByPath);

  for (const file of files) {
    const assignment = assignmentByPath.get(file.path);
    const roles = assignment?.roles ?? [];
    const content = file.content ?? "";
    const startLine = file.startLine ?? 1;
    const scopeAssignment = scopeByPath.get(normalizePath(file.path));
    const scopeValue = scopeAssignment?.scope ?? "unknown";
    const scopeEvidence = scopeAssignment?.evidence;
    const getOnlyEndpoint = isGetOnlyEndpoint(roles, content);
    const isLayout = isLayoutFile(file.path ?? "");
    const backendCandidate =
      isLikelyBackendFile(file.path, roles) || Boolean(scopeEvidence?.isShared);
    const canRunRule = (ruleId: string) => {
      const allowed = ruleGateAllows(ruleId, scopeValue, scopeEvidence, CANDIDATE_RULE_GATES);
      if (allowed) return true;
      if (!scopeEvidence) return false;
      const adminOrMember = roles.includes("ADMIN_ENDPOINT") ||
        scopeEvidence.sensitiveActionHints.includes("admin") ||
        scopeEvidence.sensitiveActionHints.includes("member.manage");
      const authRole = roles.includes("AUTH_ENDPOINT");
      const relaxableByRule: Partial<Record<string, Set<RuleGateMismatch>>> = {
        missing_mfa: new Set(["sensitive"]),
        missing_rate_limiting: new Set(["sensitive"]),
        missing_role_check: new Set(["endpoint"]),
        missing_audit_logging: new Set(["destructive", "sensitive"])
      };
      const relaxable = relaxableByRule[ruleId];
      if (!relaxable) {
        return false;
      }
      if (ruleId === "missing_role_check" && !adminOrMember) {
        return false;
      }
      if (
        (ruleId === "missing_mfa" || ruleId === "missing_rate_limiting") &&
        !adminOrMember &&
        !authRole
      ) {
        return false;
      }
      if (ruleId === "missing_audit_logging" && !adminOrMember && !authRole) {
        return false;
      }
      const gateCheck = evaluateCandidateGate(ruleId, scopeValue, scopeEvidence);
      if (!gateCheck) return false;
      return gateCheck.mismatches.every((mismatch) => relaxable.has(mismatch));
    };

    if (isEndpointRole(roles) || backendCandidate) {
      if (canRunRule("idor")) {
        const idor = detectIdorCandidate(file, roles);
        if (idor) {
          candidates.push(idor);
        }
      }

      if (canRunRule("org_id_trust")) {
        const orgTrust = detectOrgIdTrustCandidate(file, roles, scopeEvidence);
        if (orgTrust) {
          candidates.push(orgTrust);
        }
      }

      if (canRunRule("sql_injection")) {
        const sqlLine = findFirstLineMatch(content, SQL_INJECTION_PATTERNS, startLine);
        const rawSqlLine = sqlLine
          ? null
          : findFirstLineMatch(content, RAW_SQL_HELPER_PATTERNS, startLine);
        if (sqlLine || rawSqlLine) {
          const matchLine = sqlLine ?? rawSqlLine;
          const summary = rawSqlLine
            ? "Unsafe raw SQL execution helper without parameterization"
            : "SQL injection via raw SQL string concatenation";
          const rationale = rawSqlLine
            ? "Raw SQL helpers increase injection risk when request input is passed through without parameterization."
            : "Raw SQL appears to include user-controlled input via string concatenation or template interpolation.";
          candidates.push({
            id: `sql-injection:${file.path}:${matchLine?.line ?? startLine}`,
            type: "sql_injection",
            summary,
            rationale,
            filepath: file.path,
            evidence: [
              {
                filepath: file.path,
                startLine: matchLine?.line ?? startLine,
                endLine: matchLine?.line ?? startLine,
                excerpt: matchLine?.text,
                note: rawSqlLine
                  ? "Raw SQL helper detected"
                  : "Raw SQL with interpolated request input"
              }
            ],
            relatedFileRoles: roles
          });
        }
      }

      if (canRunRule("unsafe_query_builder")) {
        const queryLine = findFirstLineMatch(content, QUERY_BUILDER_PATTERNS, startLine);
        if (queryLine) {
          candidates.push({
            id: `unsafe-query-builder:${file.path}:${queryLine.line}`,
            type: "unsafe_query_builder",
            summary: "Unsafe query builder usage: user-controlled filter string passed into query composition",
            rationale:
              "Query builder filters appear to be composed from request input without validation or allowlists.",
            filepath: file.path,
            evidence: [
              {
                filepath: file.path,
                startLine: queryLine.line,
                endLine: queryLine.line,
                excerpt: queryLine.text,
                note: "Query builder uses request input"
              }
            ],
            relatedFileRoles: roles
          });
        }
      }

      if (canRunRule("command_injection") && hasCommandInjectionRisk(content)) {
        const execLine =
          findFirstLineMatch(content, COMMAND_INJECTION_PATTERNS, startLine) ??
          findFirstLineMatch(content, EXEC_PATTERNS, startLine);
        const inputLine = findFirstLineMatch(content, COMMAND_INPUT_PATTERNS, startLine);
        candidates.push({
          id: `command-injection:${file.path}:${execLine?.line ?? startLine}`,
          type: "command_injection",
          summary: "Command injection risk from user-controlled input in a shell command",
          rationale:
            "Shell commands appear to be constructed from request input without sanitization.",
          filepath: file.path,
          evidence: trimEvidence([
            {
              filepath: file.path,
              startLine: execLine?.line ?? startLine,
              endLine: execLine?.line ?? startLine,
              excerpt: execLine?.text,
              note: "Command execution call detected"
            },
            ...(inputLine
              ? [
                  {
                    filepath: file.path,
                    startLine: inputLine.line,
                    endLine: inputLine.line,
                    excerpt: inputLine.text,
                    note: "Request input referenced near command construction"
                  }
                ]
              : [])
          ]),
          relatedFileRoles: roles
        });
      }
    }

    if (canRunRule("org_id_trust") && (scopeValue === "frontend_ui" || scopeValue === "server_component")) {
      const orgTrust = detectFrontendOrgIdTrustCandidate(file, roles);
      if (orgTrust) {
        candidates.push(orgTrust);
      }
    }

    if (canRunRule("permissive_cors") && hasPermissiveCors(content)) {
      const line = findFirstLineMatch(content, CORS_WILDCARD_PATTERNS, startLine);
      candidates.push({
        id: `permissive-cors:${file.path}:${line?.line ?? startLine}`,
        type: "permissive_cors",
        summary: "Overly permissive CORS configuration allows any origin",
        rationale:
          "CORS configuration appears to allow wildcard origins, which can expose authenticated endpoints cross-origin.",
        filepath: file.path,
        evidence: [
          {
            filepath: file.path,
            startLine: line?.line ?? startLine,
            endLine: line?.line ?? startLine,
            excerpt: line?.text,
            note: "Wildcard CORS origin detected"
          }
        ],
        relatedFileRoles: roles
      });
    }

    if (canRunRule("debug_auth_leak") && isEndpointRole(roles) && hasDebugAuthLeak(content)) {
      const debugLine = findFirstLineMatch(content, DEBUG_ENDPOINT_PATTERNS, startLine);
      const headerLine = findFirstLineMatch(content, DEBUG_HEADER_PATTERNS, startLine);
      const authLine = findFirstLineMatch(content, DEBUG_AUTH_PATTERNS, startLine);
      const evidence = trimEvidence([
        ...(debugLine
          ? [
              {
                filepath: file.path,
                startLine: debugLine.line,
                endLine: debugLine.line,
                excerpt: debugLine.text,
                note: "Debug handler present"
              }
            ]
          : []),
        ...(headerLine
          ? [
              {
                filepath: file.path,
                startLine: headerLine.line,
                endLine: headerLine.line,
                excerpt: headerLine.text,
                note: "Request headers exposed"
              }
            ]
          : []),
        ...(authLine
          ? [
              {
                filepath: file.path,
                startLine: authLine.line,
                endLine: authLine.line,
                excerpt: authLine.text,
                note: "Auth/session context referenced"
              }
            ]
          : [])
      ]);
      candidates.push({
        id: `debug-auth-leak:${file.path}:${debugLine?.line ?? startLine}`,
        type: "debug_auth_leak",
        summary: "Debug endpoint leaks auth context and request headers",
        rationale:
          "Debug handlers should not return auth context or request headers; this can expose sensitive tokens or session data.",
        filepath: file.path,
        evidence,
        relatedFileRoles: roles
      });
    }

    if (
      canRunRule("weak_jwt_secret") &&
      (roles.includes("SHARED_AUTH_LIB") || roles.includes("AUTH_ENDPOINT")) &&
      hasJwtFallbackSecret(content)
    ) {
      const line = findFirstLineMatch(content, JWT_FALLBACK_PATTERNS, startLine);
      candidates.push({
        id: `jwt-weak-secret:${file.path}:${line?.line ?? startLine}`,
        type: "weak_jwt_secret",
        summary: "Weak/fallback JWT secret used",
        rationale:
          "JWT secret appears to fall back to a hardcoded value, enabling token forgery if defaults are used.",
        filepath: file.path,
        evidence: [
          {
            filepath: file.path,
            startLine: line?.line ?? startLine,
            endLine: line?.line ?? startLine,
            excerpt: line?.text,
            note: "JWT secret fallback detected"
          }
        ],
        relatedFileRoles: roles
      });
    }

    if (
      canRunRule("jwt_validation_bypass") &&
      (roles.includes("SHARED_AUTH_LIB") || roles.includes("AUTH_ENDPOINT")) &&
      hasJwtValidationBypass(content, startLine)
    ) {
      const line = findJwtValidationBypassLine(content, startLine);
      const note = line && JWT_DECODE_PATTERNS.some((pattern) => pattern.test(line.text))
        ? "JWT decode without verify"
        : "JWT verification bypass toggle";
      candidates.push({
        id: `jwt-no-verify:${file.path}:${line?.line ?? startLine}`,
        type: "jwt_validation_bypass",
        summary: "JWT validation bypass: token parsed without signature verification",
        rationale:
          "JWT appears to be decoded/parsed without signature verification, allowing forged tokens.",
        filepath: file.path,
        evidence: [
          {
            filepath: file.path,
            startLine: line?.line ?? startLine,
            endLine: line?.line ?? startLine,
            excerpt: line?.text,
            note
          }
        ],
        relatedFileRoles: roles
      });
    }

    if (
      canRunRule("magic_link_no_expiration") &&
      (roles.includes("AUTH_ENDPOINT") || roles.includes("SHARED_AUTH_LIB")) &&
      hasMagicLinkNoExpiration(content)
    ) {
      const magicLine = findFirstLineMatch(content, MAGIC_LINK_TOKEN_PATTERNS, startLine);
      const sessionLine = findFirstLineMatch(content, MAGIC_LINK_SESSION_PATTERNS, startLine);
      const cookieLine = findFirstLineMatch(content, MAGIC_LINK_COOKIE_SET_PATTERNS, startLine);
      const evidence = trimEvidence([
        ...(magicLine
          ? [
              {
                filepath: file.path,
                startLine: magicLine.line,
                endLine: magicLine.line,
                excerpt: magicLine.text,
                note: "Magic-link token received"
              }
            ]
          : []),
        ...(sessionLine
          ? [
              {
                filepath: file.path,
                startLine: sessionLine.line,
                endLine: sessionLine.line,
                excerpt: sessionLine.text,
                note: "Session token issued for magic link"
              }
            ]
          : []),
        ...(cookieLine && cookieLine.line !== sessionLine?.line
          ? [
              {
                filepath: file.path,
                startLine: cookieLine.line,
                endLine: cookieLine.line,
                excerpt: cookieLine.text,
                note: "Session cookie set without expiry checks"
              }
            ]
          : [])
      ]);
      candidates.push({
        id: `magic-link-no-expiration:${file.path}:${magicLine?.line ?? startLine}`,
        type: "magic_link_no_expiration",
        summary: "Magic-link tokens accepted without expiration validation",
        rationale:
          "Magic-link flows should validate token expiration before issuing sessions; no expiry checks were detected.",
        filepath: file.path,
        evidence,
        relatedFileRoles: roles
      });
    }

    if (canRunRule("weak_token_generation") && isTokenRelated(content, file.path) && hasWeakTokenGeneration(content)) {
      const line = findFirstLineMatch(content, WEAK_TOKEN_PATTERNS, startLine);
      candidates.push({
        id: `weak-token:${file.path}:${line?.line ?? startLine}`,
        type: "weak_token_generation",
        summary: "Insecure token generation uses low-entropy source",
        rationale:
          "Token appears to be generated using low-entropy sources such as Math.random or Date.now.",
        filepath: file.path,
        evidence: [
          {
            filepath: file.path,
            startLine: line?.line ?? startLine,
            endLine: line?.line ?? startLine,
            excerpt: line?.text,
            note: "Weak token generation detected"
          }
        ],
        relatedFileRoles: roles
      });
    }

    if (canRunRule("sensitive_logging")) {
      const sensitiveLogLine = findLogLineWithKeywords(content, startLine, SENSITIVE_LOG_PATTERNS);
      const requestBodyLogLine = sensitiveLogLine
        ? null
        : hasRequestBodySignal(content)
          ? findLogLineWithKeywords(content, startLine, REQUEST_BODY_LOG_PATTERNS)
          : null;
      const logLine = sensitiveLogLine ?? requestBodyLogLine;
      if (logLine) {
        const summary = requestBodyLogLine
          ? "Sensitive request body logged without redaction"
          : "Sensitive data (plaintext tokens/secrets) written to logs";
        candidates.push({
          id: `sensitive-log:${file.path}:${logLine.line}`,
          type: "sensitive_logging",
          summary,
          rationale: requestBodyLogLine
            ? "Request bodies often contain sensitive data and should not be logged without redaction."
            : "Logging statements appear to include tokens, secrets, or credentials.",
          filepath: file.path,
          evidence: [
            {
              filepath: file.path,
              startLine: logLine.line,
              endLine: logLine.line,
              excerpt: logLine.text,
              note: requestBodyLogLine ? "Request body logged" : "Sensitive value logged"
            }
          ],
          relatedFileRoles: roles
        });
      }
    }

    if (canRunRule("command_output_logging")) {
      const commandLogLine = findLogLineWithKeywords(content, startLine, COMMAND_OUTPUT_PATTERNS);
      const hasExec = hasHighRiskExec(content) || matchesAny(content, COMMAND_INJECTION_PATTERNS);
      const hasCommandInput = matchesAny(content, COMMAND_INPUT_PATTERNS);
      const hasStrongCommandLog = commandLogLine
        ? COMMAND_LOG_STRONG_PATTERNS.some((pattern) => pattern.test(commandLogLine.text))
        : false;
      if (commandLogLine && (hasExec || hasCommandInput || hasStrongCommandLog)) {
        candidates.push({
          id: `command-output-log:${file.path}:${commandLogLine.line}`,
          type: "command_output_logging",
          summary: "Sensitive command output or URLs logged without scrubbing",
          rationale: "Logging includes command output or repository URLs without scrubbing.",
          filepath: file.path,
          evidence: [
            {
              filepath: file.path,
              startLine: commandLogLine.line,
              endLine: commandLogLine.line,
              excerpt: commandLogLine.text,
              note: "Command output or URL logged"
            }
          ],
          relatedFileRoles: roles
        });
      } else if (hasExec && (hasCommandInput || matchesAny(content, COMMAND_OUTPUT_PATTERNS))) {
        const fallbackLogLine = findFirstLineMatch(content, LOG_CALL_PATTERNS, startLine);
        if (fallbackLogLine) {
          candidates.push({
            id: `command-output-log:${file.path}:${fallbackLogLine.line}`,
            type: "command_output_logging",
            summary: "Sensitive command output or URLs logged without scrubbing",
            rationale: "Command execution output or repository URLs may be logged without scrubbing.",
            filepath: file.path,
            evidence: [
              {
                filepath: file.path,
                startLine: fallbackLogLine.line,
                endLine: fallbackLogLine.line,
                excerpt: fallbackLogLine.text,
                note: "Command execution log statement"
              }
            ],
            relatedFileRoles: roles
          });
        }
      }
    }

    if (canRunRule("missing_webhook_signature") && roles.includes("WEBHOOK_ENDPOINT") && !hasWebhookSignatureCheck(content)) {
      const line = findFirstLineMatch(content, ROUTER_HANDLER_PATTERNS, startLine);
      candidates.push({
        id: `webhook-signature-missing:${file.path}:${line?.line ?? startLine}`,
        type: "missing_webhook_signature",
        summary: "Unsigned webhooks accepted or signature validation missing",
        rationale:
          "Webhook handlers should verify signatures to prevent forged requests, but no signature checks were detected.",
        filepath: file.path,
        evidence: [
          {
            filepath: file.path,
            startLine: line?.line ?? startLine,
            endLine: line?.line ?? startLine,
            excerpt: line?.text,
            note: "Webhook handler without signature verification"
          }
        ],
        relatedFileRoles: roles
      });
    }

    if (
      canRunRule("missing_webhook_config_integrity") &&
      roles.includes("WEBHOOK_ENDPOINT") &&
      hasWebhookConfigFetch(content) &&
      !hasWebhookConfigIntegrityCheck(content, startLine)
    ) {
      const line =
        findFirstLineMatch(content, WEBHOOK_CONFIG_PATTERNS, startLine) ??
        findFirstLineMatch(content, EXTERNAL_CALL_PATTERNS, startLine);
      candidates.push({
        id: `webhook-config-integrity:${file.path}:${line?.line ?? startLine}`,
        type: "missing_webhook_config_integrity",
        summary: "Webhook config payload fetched without integrity verification",
        rationale:
          "Webhook handlers should verify the integrity of external configuration payloads before applying them.",
        filepath: file.path,
        evidence: [
          {
            filepath: file.path,
            startLine: line?.line ?? startLine,
            endLine: line?.line ?? startLine,
            excerpt: line?.text,
            note: "Webhook config fetched without integrity checks"
          }
        ],
        relatedFileRoles: roles
      });
    }

    if (canRunRule("webhook_code_execution") && roles.includes("WEBHOOK_ENDPOINT") && hasCodeExecution(content)) {
      const line = findFirstLineMatch(content, CODE_EXECUTION_PATTERNS, startLine);
      candidates.push({
        id: `webhook-code-exec:${file.path}:${line?.line ?? startLine}`,
        type: "webhook_code_execution",
        summary: "User-supplied config executed as code",
        rationale:
          "Dynamic code execution in webhook handlers can execute attacker-controlled input.",
        filepath: file.path,
        evidence: [
          {
            filepath: file.path,
            startLine: line?.line ?? startLine,
            endLine: line?.line ?? startLine,
            excerpt: line?.text,
            note: "Dynamic code execution detected"
          }
        ],
        relatedFileRoles: roles
      });
    }

    if (
      canRunRule("dangerous_html_render") &&
      (roles.includes("FRONTEND_PAGE") || roles.includes("FRONTEND_ADMIN_PAGE")) &&
      hasDangerousHtml(content)
    ) {
      const line = findFirstLineMatch(content, DANGEROUS_HTML_PATTERNS, startLine);
      candidates.push({
        id: `dangerous-html:${file.path}:${line?.line ?? startLine}`,
        type: "dangerous_html_render",
        summary: "Stored XSS: dangerouslySetInnerHTML renders user-controlled HTML",
        rationale: "Rendering HTML with dangerouslySetInnerHTML can execute untrusted content.",
        filepath: file.path,
        evidence: [
          {
            filepath: file.path,
            startLine: line?.line ?? startLine,
            endLine: line?.line ?? startLine,
            excerpt: line?.text,
            note: "dangerouslySetInnerHTML usage"
          }
        ],
        relatedFileRoles: roles
      });
    }

    if (
      canRunRule("anon_key_bearer") &&
      (roles.includes("FRONTEND_PAGE") || roles.includes("FRONTEND_ADMIN_PAGE")) &&
      hasAnonKeyBearer(content)
    ) {
      const line = findFirstLineMatch(content, ANON_KEY_PATTERNS, startLine);
      candidates.push({
        id: `anon-key-bearer:${file.path}:${line?.line ?? startLine}`,
        type: "anon_key_bearer",
        summary: "Supabase anon key used as privileged bearer token",
        rationale:
          "Anon keys are public and should not be used as privileged bearer tokens for backend APIs.",
        filepath: file.path,
        evidence: [
          {
            filepath: file.path,
            startLine: line?.line ?? startLine,
            endLine: line?.line ?? startLine,
            excerpt: line?.text,
            note: "Anon key used in auth headers"
          }
        ],
        relatedFileRoles: roles
      });
    }

    if (canRunRule("anon_key_bearer") && !(roles.includes("FRONTEND_PAGE") || roles.includes("FRONTEND_ADMIN_PAGE"))) {
      const adminEvidence = findAnonKeyAdminEvidence(content, startLine, file.path);
      if (adminEvidence) {
        candidates.push({
          id: `anon-key-admin:${file.path}:${adminEvidence[0]?.startLine ?? startLine}`,
          type: "anon_key_bearer",
          summary: "Supabase anon key used for privileged server client",
          rationale:
            "Shared helpers appear to use a public anon key in an admin/service context, which can grant unintended access.",
          filepath: file.path,
          evidence: trimEvidence(adminEvidence),
          relatedFileRoles: roles
        });
      }
    }

    if (
      canRunRule("missing_bearer_token") &&
      (roles.includes("FRONTEND_PAGE") || roles.includes("FRONTEND_ADMIN_PAGE")) &&
      hasMissingBearerToken(content)
    ) {
      const line = findFirstLineMatch(content, FRONTEND_API_CALL_PATTERNS, startLine);
      candidates.push({
        id: `missing-bearer:${file.path}:${line?.line ?? startLine}`,
        type: "missing_bearer_token",
        summary: "Backend trusts frontend auth state without bearer token",
        rationale:
          "API calls appear to rely on frontend auth state without sending an access token.",
        filepath: file.path,
        evidence: [
          {
            filepath: file.path,
            startLine: line?.line ?? startLine,
            endLine: line?.line ?? startLine,
            excerpt: line?.text,
            note: "API call without authorization header"
          }
        ],
        relatedFileRoles: roles
      });
    }

    if (
      canRunRule("frontend_direct_db_write") &&
      (roles.includes("FRONTEND_PAGE") || roles.includes("FRONTEND_ADMIN_PAGE"))
    ) {
      const writeLine = findSupabaseWriteLine(content, startLine);
      if (writeLine) {
        candidates.push({
          id: `frontend-db-write:${file.path}:${writeLine.line}`,
          type: "frontend_direct_db_write",
          summary: "Frontend writes directly to the database without a server/edge gate",
          rationale:
            "Client-side database writes rely entirely on RLS and bypass server-side protections such as rate limiting and audit logging.",
          recommendation:
            "Move write operations behind API or edge functions, enforce strong RLS policies, and add server-side rate limiting and auditing.",
          filepath: file.path,
          evidence: [
            {
              filepath: file.path,
              startLine: writeLine.line,
              endLine: writeLine.line,
              excerpt: writeLine.text,
              note: "Client-side database write detected"
            }
          ],
          relatedFileRoles: roles
        });
      }
    }

    if (canRunRule("frontend_secret_exposure")) {
      const secretLine = findNextPublicSecretLine(content, startLine);
      if (secretLine) {
        const hasServiceRole = /SERVICE_ROLE/i.test(secretLine.text);
        const summary = hasServiceRole
          ? "NEXT_PUBLIC env var exposes a service role key"
          : "NEXT_PUBLIC env var exposes a privileged secret";
        candidates.push({
          id: `frontend-secret:${file.path}:${secretLine.line}`,
          type: "frontend_secret_exposure",
          summary,
          rationale:
            "Environment variables prefixed with NEXT_PUBLIC are bundled into client code and should not contain secrets.",
          filepath: file.path,
          evidence: [
            {
              filepath: file.path,
              startLine: secretLine.line,
              endLine: secretLine.line,
              excerpt: secretLine.text,
              note: "NEXT_PUBLIC secret exposure"
            }
          ],
          relatedFileRoles: roles
        });
      }
    }

    if (canRunRule("missing_least_privilege")) {
      const bucketLine = findPublicBucketLine(content, startLine);
      if (bucketLine) {
        candidates.push({
          id: `public-bucket:${file.path}:${bucketLine.line}`,
          type: "missing_least_privilege",
          summary: "Public storage bucket configured without access controls",
          rationale:
            "Storage buckets configured as public can expose sensitive data without least-privilege constraints.",
          filepath: file.path,
          evidence: [
            {
              filepath: file.path,
              startLine: bucketLine.line,
              endLine: bucketLine.line,
              excerpt: bucketLine.text,
              note: "Public bucket configuration detected"
            }
          ],
          relatedFileRoles: roles
        });
      }
    }

    if (
      canRunRule("frontend_login_rate_limit") &&
      (roles.includes("FRONTEND_PAGE") || roles.includes("FRONTEND_ADMIN_PAGE")) &&
      isLoginPage(file.path, content)
    ) {
      if (!hasRateLimit(content) && !hasCaptcha(content)) {
        const line = findFirstLineMatch(content, LOGIN_UI_PATTERNS, startLine);
        candidates.push({
          id: `login-no-throttle:${file.path}:${line?.line ?? startLine}`,
          type: "frontend_login_rate_limit",
          summary: "Login flow missing rate limiting or lockout",
          rationale:
            "Login UI lacks visible rate limiting, lockout, or captcha controls to deter brute force attempts.",
          filepath: file.path,
          evidence: [
            {
              filepath: file.path,
              startLine: line?.line ?? startLine,
              endLine: line?.line ?? startLine,
              excerpt: line?.text,
              note: "Login UI without throttling controls"
            }
          ],
          relatedFileRoles: roles
        });
      }
    }

    if (canRunRule("frontend_only_authorization") && roles.includes("FRONTEND_ADMIN_PAGE") && !isLayout) {
      const roleLine = findFirstLineMatch(content, FRONTEND_ROLE_PATTERNS, startLine);
      if (roleLine) {
        const apiLine = findFirstLineMatch(content, FRONTEND_API_CALL_PATTERNS, startLine);
        const evidence = trimEvidence([
          {
            filepath: file.path,
            startLine: roleLine.line,
            endLine: roleLine.line,
            excerpt: roleLine.text,
            note: "Frontend admin role/claim check detected"
          },
          ...(apiLine
            ? [
                {
                  filepath: file.path,
                  startLine: apiLine.line,
                  endLine: apiLine.line,
                  excerpt: apiLine.text,
                  note: "Admin action triggered from frontend"
                }
              ]
            : [])
        ]);
        candidates.push({
          id: `frontend-admin-only:${file.path}:${roleLine.line}`,
          type: "frontend_only_authorization",
          summary: "Frontend-only admin enforcement based on client roles/claims",
          rationale:
            "Admin access appears gated by client-side role checks without evidence of server-side enforcement.",
          filepath: file.path,
          evidence,
          relatedFileRoles: roles
        });
      }
    }

    if (
      canRunRule("frontend_only_authorization") &&
      isEndpointRole(roles) &&
      frontendRoleEvidence &&
      !hasRoleCheck(content)
    ) {
      if (isAdminOrDestructive(roles, content, file.path)) {
        const evidence = [...frontendRoleEvidence.evidence];
        const handlerLine = findFirstLineMatch(content, ROUTER_HANDLER_PATTERNS, startLine);
        evidence.push({
          filepath: file.path,
          startLine: handlerLine?.line ?? startLine,
          endLine: handlerLine?.line ?? startLine,
          excerpt: handlerLine?.text,
          note: "Backend endpoint lacks role enforcement in sampled code"
        });
        candidates.push({
          id: `frontend-only-auth:${file.path}:${handlerLine?.line ?? startLine}`,
          type: "frontend_only_authorization",
          summary: "Frontend-only admin enforcement based on client roles/claims",
          rationale:
            "Frontend checks for roles/claims but the backend endpoint sample lacks a server-side role check.",
          filepath: file.path,
          evidence: trimEvidence(evidence),
          relatedFileRoles: roles
        });
      }
    }

    if (
      canRunRule("missing_role_check") &&
      roles.includes("ADMIN_ENDPOINT") &&
      isEndpointRole(roles) &&
      !hasRoleCheck(content)
    ) {
      const adminLine = findFirstLineMatch(content, ADMIN_CONTEXT_PATTERNS, startLine);
      const handlerLine = findFirstLineMatch(content, ROUTER_HANDLER_PATTERNS, startLine);
      const evidenceLine = adminLine ?? handlerLine;
      if (evidenceLine) {
        candidates.push({
          id: `missing-role-check:${file.path}:${evidenceLine.line ?? startLine}`,
          type: "missing_role_check",
          summary: "Missing role checks on admin endpoint",
          rationale: "Admin endpoints should enforce roles/permissions on the server before performing actions.",
          filepath: file.path,
          evidence: [
            {
              filepath: file.path,
              startLine: evidenceLine.line ?? startLine,
              endLine: evidenceLine.line ?? startLine,
              excerpt: evidenceLine.text,
              note: "Admin endpoint lacks role enforcement in sampled code"
            }
          ],
          relatedFileRoles: roles
        });
      }
    }

    if (canRunRule("missing_rate_limiting") && isEndpointRole(roles)) {
      const sensitive = isSensitiveAction(content, roles, file.path, scopeEvidence);
      if (sensitive && !hasRateLimit(content)) {
        const line = findFirstLineMatch(content, SENSITIVE_ACTION_PATTERNS, startLine);
        const tokenRelated = isTokenRelated(content, file.path);
        const summary = tokenRelated
          ? "No rate limiting on sensitive actions (token issuance)"
          : "No rate limiting on sensitive actions";
        candidates.push({
          id: `missing-rate-limit:${file.path}:${line?.line ?? startLine}`,
          type: "missing_rate_limiting",
          summary,
          rationale:
            "Endpoint performs a sensitive action but no rate-limiting middleware or logic was detected.",
          filepath: file.path,
          evidence: [
            {
              filepath: file.path,
              startLine: line?.line ?? startLine,
              endLine: line?.line ?? startLine,
              excerpt: line?.text,
              note: "Sensitive action without visible rate limiting"
            }
          ],
          relatedFileRoles: roles
        });
      }
    }

    const isServerComponentScope = scopeValue === "server_component";
    if (
      canRunRule("missing_lockout") &&
      (isEndpointRole(roles) || scopeEvidence?.isServerAction || isServerComponentScope)
    ) {
      const lowerPath = file.path ? file.path.toLowerCase() : "";
      const scopeAuthHint = scopeEvidence?.sensitiveActionHints.includes("auth") ?? false;
      const loginSignal =
        roles.includes("AUTH_ENDPOINT") ||
        scopeAuthHint ||
        AUTH_ACTION_HINT_PATTERNS.some((pattern) => pattern.test(content)) ||
        LOGIN_PATH_PATTERNS.some((pattern) => pattern.test(lowerPath));
      if (loginSignal && !hasLockout(content) && !hasCaptcha(content)) {
        const line =
          findFirstLineMatch(content, AUTH_ACTION_HINT_PATTERNS, startLine) ??
          findFirstLineMatch(content, ROUTER_HANDLER_PATTERNS, startLine);
        candidates.push({
          id: `missing-lockout:${file.path}:${line?.line ?? startLine}`,
          type: "missing_lockout",
          summary: "Login flow missing account lockout protections",
          rationale:
            "Login endpoints should enforce lockout or brute-force defenses to prevent repeated credential stuffing attempts.",
          filepath: file.path,
          evidence: [
            {
              filepath: file.path,
              startLine: line?.line ?? startLine,
              endLine: line?.line ?? startLine,
              excerpt: line?.text,
              note: "Login handling without lockout safeguards"
            }
          ],
          relatedFileRoles: roles
        });
      }
    }

    if (
      canRunRule("missing_mfa") &&
      (isEndpointRole(roles) || scopeEvidence?.isServerAction || isServerComponentScope)
    ) {
      const lowerPath = file.path ? file.path.toLowerCase() : "";
      const pathForHints = lowerPath.startsWith("/") ? lowerPath : `/${lowerPath}`;
      const base = lowerPath.split("/").pop() ?? "";
      const authPathHint =
        AUTH_FILE_PATTERNS.some((pattern) => pattern.test(lowerPath)) ||
        LOGIN_PATH_PATTERNS.some((pattern) => pattern.test(lowerPath));
      const adminPathHint = ADMIN_PATH_PATTERNS.some(
        (pattern) => pattern.test(pathForHints) || pattern.test(base)
      );
      const memberManagementHint = hasMemberManagementContext(pathForHints, base, content);
      const authFlowSignal =
        roles.includes("AUTH_ENDPOINT") ||
        authPathHint ||
        AUTH_FLOW_PATTERNS.some((pattern) => pattern.test(content));
      const adminStepUpSignal =
        (roles.includes("ADMIN_ENDPOINT") || adminPathHint || memberManagementHint) &&
        (memberManagementHint ||
          hasRoleCheck(content) ||
          ADMIN_STEP_UP_HINT_PATTERNS.some((pattern) => pattern.test(content)));
      if ((authFlowSignal || adminStepUpSignal) && !hasMfa(content)) {
        const line =
          findFirstLineMatch(content, AUTH_ACTION_HINT_PATTERNS, startLine) ??
          findFirstLineMatch(content, ROUTER_HANDLER_PATTERNS, startLine);
        const summary = adminStepUpSignal && !authFlowSignal
          ? "Missing multi-factor authentication on privileged admin action"
          : adminStepUpSignal
            ? "Missing multi-factor authentication on privileged login flow"
            : "Missing multi-factor authentication on login flow";
        const rationale = adminStepUpSignal && !authFlowSignal
          ? "Privileged admin actions should require step-up MFA/2FA verification before completion."
          : "Privileged authentication flows should enforce MFA/2FA to reduce account takeover risk.";
        candidates.push({
          id: `missing-mfa:${file.path}:${line?.line ?? startLine}`,
          type: "missing_mfa",
          summary,
          rationale,
          filepath: file.path,
          evidence: [
            {
              filepath: file.path,
              startLine: line?.line ?? startLine,
              endLine: line?.line ?? startLine,
              excerpt: line?.text,
              note: "Auth flow without MFA/2FA safeguards"
            }
          ],
          relatedFileRoles: roles
        });
      }
    }

    if (
      canRunRule("missing_upload_size_limit") &&
      isEndpointRole(roles) &&
      hasUploadSignal(content, file.path) &&
      !hasUploadSizeLimit(content)
    ) {
      const line =
        findFirstLineMatch(content, UPLOAD_SIGNAL_PATTERNS, startLine) ??
        findFirstLineMatch(content, REQUEST_JSON_PATTERNS, startLine);
      candidates.push({
        id: `missing-upload-size:${file.path}:${line?.line ?? startLine}`,
        type: "missing_upload_size_limit",
        summary: "Large uploads accepted without size limits",
        rationale:
          "Upload handlers should enforce file size limits to prevent resource exhaustion and abuse.",
        filepath: file.path,
        evidence: [
          {
            filepath: file.path,
            startLine: line?.line ?? startLine,
            endLine: line?.line ?? startLine,
            excerpt: line?.text,
            note: "Upload handler without size limits"
          }
        ],
        relatedFileRoles: roles
      });
    }

    if (canRunRule("mass_assignment") && isEndpointRole(roles) && !getOnlyEndpoint) {
      const hasRequestBody = hasRequestBodySignal(content);
      const hasDbWrite = matchesAny(content, DB_WRITE_PATTERNS);
      if (hasRequestBody && hasDbWrite) {
        const bodyLine =
          findFirstLineMatch(content, REQUEST_BODY_PATTERNS, startLine) ??
          findFirstLineMatch(content, REQUEST_JSON_PATTERNS, startLine);
        const writeLine = findFirstLineMatch(content, DB_WRITE_PATTERNS, startLine);
        candidates.push({
          id: `mass-assignment:${file.path}:${bodyLine?.line ?? startLine}`,
          type: "mass_assignment",
          summary: "Request body written to models without explicit field allowlist",
          rationale:
            "Endpoint accepts request body data and writes it to the database, which can enable mass assignment without explicit field allowlists.",
          filepath: file.path,
          evidence: trimEvidence([
            ...(bodyLine
              ? [
                  {
                    filepath: file.path,
                    startLine: bodyLine.line,
                    endLine: bodyLine.line,
                    excerpt: bodyLine.text,
                    note: "Request body consumed"
                  }
                ]
              : []),
            ...(writeLine
              ? [
                  {
                    filepath: file.path,
                    startLine: writeLine.line,
                    endLine: writeLine.line,
                    excerpt: writeLine.text,
                    note: "Database write from request data"
                  }
                ]
              : [])
          ]),
          relatedFileRoles: roles
        });
      }
    }

    if (
      canRunRule("missing_security_headers") &&
      (!isEndpointRole(roles) || !getOnlyEndpoint)
    ) {
      const headerLine = findFirstLineMatch(content, RESPONSE_HEADER_PATTERNS, startLine);
      if (headerLine) {
        candidates.push({
          id: `missing-security-headers:${file.path}:${headerLine.line}`,
          type: "missing_security_headers",
          summary: "Response headers configured without explicit security header defaults",
          rationale:
            "Response handling is present, but security headers (CSP, HSTS, X-Frame-Options) should be consistently enforced.",
          filepath: file.path,
          evidence: [
            {
              filepath: file.path,
              startLine: headerLine.line,
              endLine: headerLine.line,
              excerpt: headerLine.text,
              note: "Response header mutation detected"
            }
          ],
          relatedFileRoles: roles
        });
      }
    }

    if (canRunRule("missing_audit_logging")) {
      const auditDisabled = matchesAny(content, AUDIT_DISABLE_PATTERNS);
      const destructiveAdmin =
        roles.includes("ADMIN_ENDPOINT") && isDestructiveAction(content, file.path);
      if (auditDisabled || (destructiveAdmin && !hasAuditLogging(content))) {
        const line = auditDisabled
          ? findFirstLineMatch(content, AUDIT_DISABLE_PATTERNS, startLine)
          : findFirstLineMatch(content, DESTRUCTIVE_PATTERNS, startLine);
        const summary = auditDisabled
          ? "Audit logging can be disabled or skipped for sensitive actions"
          : "No audit log recorded for destructive admin action";
        const rationale = auditDisabled
          ? "Audit logging appears to be bypassable, which can leave sensitive actions without a trail."
          : "Admin endpoint appears to perform destructive actions without emitting audit logs that capture actor + target.";
        candidates.push({
          id: `missing-audit-log:${file.path}:${line?.line ?? startLine}`,
          type: "missing_audit_logging",
          summary,
          rationale,
          filepath: file.path,
          evidence: [
            {
              filepath: file.path,
              startLine: line?.line ?? startLine,
              endLine: line?.line ?? startLine,
              excerpt: line?.text,
              note: auditDisabled
                ? "Audit logging can be bypassed"
                : "Destructive action without audit logging"
            }
          ],
          relatedFileRoles: roles
        });
      }
    }

    if (canRunRule("unbounded_query") && hasUnboundedSelect(content)) {
      const line = findFirstLineMatch(content, UNBOUNDED_SELECT_PATTERNS, startLine);
      candidates.push({
        id: `unbounded-query:${file.path}:${line?.line ?? startLine}`,
        type: "unbounded_query",
        summary: "Unbounded database query missing limits/pagination",
        rationale:
          "Query selects all rows or columns without an explicit limit/pagination guard in the sampled code.",
        filepath: file.path,
        evidence: [
          {
            filepath: file.path,
            startLine: line?.line ?? startLine,
            endLine: line?.line ?? startLine,
            excerpt: line?.text,
            note: "Select without limit or range"
          }
        ],
        relatedFileRoles: roles
      });
    }

    if (canRunRule("missing_timeout")) {
      const line = findMissingTimeoutLine(content, startLine);
      if (line) {
        candidates.push({
          id: `missing-timeout:${file.path}:${line.line}`,
          type: "missing_timeout",
          summary: "No timeout on external call or subprocess",
          rationale:
            "External requests or subprocesses appear to run without a timeout or abort signal.",
          filepath: file.path,
          evidence: [
            {
              filepath: file.path,
              startLine: line.line,
              endLine: line.line,
              excerpt: line.text,
              note: "External call or exec without timeout"
            }
          ],
          relatedFileRoles: roles
        });
      }
    }
  }

  for (const [path, group] of samplesByPath) {
    if (group.length < 2) continue;
    const assignment = assignmentByPath.get(path);
    const roles = assignment?.roles ?? [];
    const scopeAssignment = scopeByPath.get(normalizePath(path));
    const scopeValue = scopeAssignment?.scope ?? "unknown";
    const scopeEvidence = scopeAssignment?.evidence;
    const canRunRule = (ruleId: string) =>
      ruleGateAllows(ruleId, scopeValue, scopeEvidence, CANDIDATE_RULE_GATES);
    const backendCandidate = isLikelyBackendFile(path, roles) || Boolean(scopeEvidence?.isShared);
    const frontendOrgTrustCandidate =
      (scopeValue === "frontend_ui" || scopeValue === "server_component") && canRunRule("org_id_trust");
    if (!isEndpointRole(roles) && !backendCandidate && !frontendOrgTrustCandidate) {
      continue;
    }
    if (isEndpointRole(roles) || backendCandidate) {
      if (canRunRule("idor")) {
        const idor = detectIdorCandidateAcrossChunks(group, roles);
        if (idor) {
          candidates.push(idor);
        }
      }
      if (canRunRule("org_id_trust")) {
        const orgTrust = detectOrgIdTrustCandidateAcrossChunks(group, roles, scopeEvidence);
        if (orgTrust) {
          candidates.push(orgTrust);
        }
      }
      if (
        canRunRule("missing_webhook_config_integrity") &&
        roles.includes("WEBHOOK_ENDPOINT") &&
        hasWebhookConfigFetchAcrossSamples(group) &&
        !hasWebhookConfigIntegrityAcrossSamples(group)
      ) {
        const configLine = findFirstLineMatchAcrossSamples(group, WEBHOOK_CONFIG_PATTERNS);
        const fetchLine = findFirstLineMatchAcrossSamples(group, EXTERNAL_CALL_PATTERNS);
        const evidence = trimEvidence([
          ...(configLine
            ? [
                {
                  filepath: configLine.filepath,
                  startLine: configLine.line,
                  endLine: configLine.line,
                  excerpt: configLine.text,
                  note: "Webhook config reference"
                }
              ]
            : []),
          ...(fetchLine
            ? [
                {
                  filepath: fetchLine.filepath,
                  startLine: fetchLine.line,
                  endLine: fetchLine.line,
                  excerpt: fetchLine.text,
                  note: "External config fetch"
                }
              ]
            : [])
        ]);
        candidates.push({
          id: `webhook-config-integrity:${path}:${configLine?.line ?? fetchLine?.line ?? group[0]?.startLine ?? 1}`,
          type: "missing_webhook_config_integrity",
          summary: "Webhook config payload fetched without integrity verification",
          rationale:
            "Webhook handlers should verify the integrity of external configuration payloads before applying them.",
          filepath: path,
          evidence,
          relatedFileRoles: roles
        });
      }
    }
    if (frontendOrgTrustCandidate) {
      const orgTrust = detectFrontendOrgIdTrustCandidateAcrossChunks(group, roles);
      if (orgTrust) {
        candidates.push(orgTrust);
      }
    }
  }

  const deduped = dedupeCandidates(candidates);
  return prioritizeCandidates(deduped).slice(0, MAX_CANDIDATES);
}

export function classifyFileRoles(file: RepositoryFileSample): FileRole[] {
  const roles = new Set<FileRole>();
  const path = file.path || "";
  const lowerPath = path.toLowerCase();
  const pathForHints = lowerPath.startsWith("/") ? lowerPath : `/${lowerPath}`;
  const base = lowerPath.split("/").pop() ?? "";
  const ext = base.includes(".") ? base.split(".").pop() ?? "" : "";
  const content = file.content ?? "";
  const isFrontend =
    !APP_ROUTER_API_PATH_PATTERN.test(pathForHints) &&
    (FRONTEND_EXTENSIONS.has(ext) || FRONTEND_PATH_HINTS.some((hint) => pathForHints.includes(hint)));
  const isServerActionPath = SERVER_ACTION_PATH_PATTERNS.some((pattern) => pattern.test(pathForHints));
  const isServerAction = hasServerActionDirective(content) || isServerActionPath;
  const isAppRouterPath = APP_ROUTER_PATH_PATTERN.test(pathForHints);
  const isServerComponentPath =
    isAppRouterPath &&
    !APP_ROUTER_API_PATH_PATTERN.test(pathForHints) &&
    !isServerActionPath &&
    SERVER_COMPONENT_EXTENSIONS.has(ext);

  if (lowerPath.includes("/migrations/") || lowerPath.includes("/migration/")) {
    roles.add("MIGRATION");
  }
  if (
    ext === "sql" &&
    (lowerPath.includes("/db/") || lowerPath.includes("/schema/") || base.includes("schema"))
  ) {
    roles.add("MIGRATION");
  }

  const adminPathHint = ADMIN_PATH_PATTERNS.some(
    (pattern) => pattern.test(pathForHints) || pattern.test(base)
  );
  const memberManagementHint = hasMemberManagementContext(pathForHints, base, content);
  if (!isFrontend && (adminPathHint || memberManagementHint)) {
    roles.add("ADMIN_ENDPOINT");
  }

  if (WEBHOOK_FILE_PATTERNS.some((pattern) => pattern.test(lowerPath) || pattern.test(base))) {
    roles.add("WEBHOOK_ENDPOINT");
  }

  if (AUTH_FILE_PATTERNS.some((pattern) => pattern.test(lowerPath) || pattern.test(base))) {
    roles.add("AUTH_ENDPOINT");
  }

  if (SHARED_AUTH_PATH_PATTERNS.some((pattern) => pattern.test(lowerPath))) {
    roles.add("SHARED_AUTH_LIB");
  }

  if (isFrontend) {
    roles.add("FRONTEND_PAGE");
  }

  if (roles.has("FRONTEND_PAGE") && lowerPath.includes("admin")) {
    roles.add("FRONTEND_ADMIN_PAGE");
  }

  if (BACKGROUND_PATH_HINTS.some((hint) => lowerPath.includes(hint))) {
    roles.add("BACKGROUND_JOB");
  }

  if (hasHighRiskExec(content)) {
    roles.add("HIGH_RISK_EXEC");
  }

  if (isServerComponentPath && !hasUseClientDirective(content)) {
    roles.add("SERVER_COMPONENT");
  }

  if (isServerAction) {
    roles.add("USER_WRITE_ENDPOINT");
  }

  const methods = detectHttpMethods(content);
  if (methods.has("GET")) {
    roles.add("USER_READ_ENDPOINT");
  }
  if (methods.has("POST") || methods.has("PUT") || methods.has("PATCH") || methods.has("DELETE")) {
    roles.add("USER_WRITE_ENDPOINT");
  }

  return Array.from(roles);
}

export function classifyFileScope(file: RepositoryFileSample): FileScopeClassification {
  const path = normalizePath(file.path ?? "");
  const pathHints = buildPathHints(path);
  const evidence = collectScopeEvidence(file.content ?? "", pathHints);
  const scope = decideFileScope(pathHints, evidence);
  return { scope, evidence };
}

export function deriveFileScopeAssignments(files: RepositoryFileSample[]): FileScopeAssignment[] {
  const samplesByPath = new Map<string, RepositoryFileSample[]>();
  for (const file of files) {
    const path = normalizePath(file.path ?? "");
    if (!path) continue;
    if (!samplesByPath.has(path)) {
      samplesByPath.set(path, []);
    }
    samplesByPath.get(path)!.push(file);
  }

  const assignments: FileScopeAssignment[] = [];
  for (const [path, samples] of samplesByPath) {
    const pathHints = buildPathHints(path);
    const evidenceList = samples.map((sample) => collectScopeEvidence(sample.content ?? "", pathHints));
    const evidence = mergeScopeEvidence(evidenceList);
    const scope = decideFileScope(pathHints, evidence);
    assignments.push({ path, scope, evidence });
  }
  return assignments;
}

function deriveRequiredControls(roles: FileRole[], scopeEvidence?: FileScopeEvidence): string[] {
  const controls = new Set<string>();
  for (const role of roles) {
    for (const control of REQUIRED_CONTROLS[role] ?? []) {
      controls.add(control);
    }
  }
  return pruneAuthEndpointControls(Array.from(controls), roles, scopeEvidence);
}

function detectHttpMethods(content: string): Set<string> {
  const methods = new Set<string>();
  if (!content) return methods;

  for (const pattern of ROUTER_HANDLER_PATTERNS) {
    if (pattern.test(content)) {
      for (const [method, patterns] of Object.entries(HTTP_METHOD_PATTERNS)) {
        if (patterns.some((regex) => regex.test(content))) {
          methods.add(method);
        }
      }
      break;
    }
  }

  if (content.includes("router.all(") || content.includes("app.all(")) {
    methods.add("GET");
    methods.add("POST");
    methods.add("PUT");
    methods.add("PATCH");
    methods.add("DELETE");
  }

  return methods;
}

type PathHints = {
  lowerPath: string;
  base: string;
  ext: string;
  isConfig: boolean;
  isDocsTests: boolean;
  isFrontend: boolean;
  isFrontendUi: boolean;
  isFrontendUtil: boolean;
  isBackend: boolean;
  isAppRouterPath: boolean;
  isAppRouterApiPath: boolean;
  isBackendEndpointHint: boolean;
  isBackendShared: boolean;
  isServerActionPath: boolean;
  isServerComponentPath: boolean;
  isDestructivePathHint: boolean;
};

type SecurityHeaderHints = {
  hasHeader: boolean;
  entryPointType: string | null;
  entryPointIdentifier: string | null;
  sinks: string[];
};

function normalizePath(value: string): string {
  return value
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.?\/*/, "")
    .replace(/\/+/g, "/")
    .replace(/\/+$/, "");
}

function buildPathHints(path: string): PathHints {
  const normalized = normalizePath(path);
  const lowerPath = normalized.toLowerCase();
  const pathForHints = lowerPath.startsWith("/") ? lowerPath : `/${lowerPath}`;
  const base = lowerPath.split("/").pop() ?? "";
  const ext = base.includes(".") ? base.split(".").pop() ?? "" : "";
  const isConfig = isConfigPath(lowerPath, base, ext);
  const isDocsTests = isDocsTestsPath(lowerPath, base, ext);
  const isAppRouterPath = APP_ROUTER_PATH_PATTERN.test(pathForHints);
  const isAppRouterApiPath = APP_ROUTER_API_PATH_PATTERN.test(pathForHints);
  const isFrontend =
    !isAppRouterApiPath &&
    (FRONTEND_PATH_HINTS.some((hint) => lowerPath.includes(hint)) ||
      FRONTEND_UI_EXTENSIONS.has(ext));
  const isFrontendUi =
    isFrontend &&
    (FRONTEND_UI_EXTENSIONS.has(ext) ||
      FRONTEND_UI_PATH_HINTS.some((hint) => lowerPath.includes(hint)));
  const isFrontendUtil =
    isFrontend && FRONTEND_UTIL_PATH_HINTS.some((hint) => lowerPath.includes(hint));
  const isBackend =
    BACKEND_PATH_HINTS.some((hint) => pathForHints.includes(hint)) ||
    BACKGROUND_PATH_HINTS.some((hint) => pathForHints.includes(hint));
  const isBackendShared = BACKEND_SHARED_PATH_HINTS.some((hint) => pathForHints.includes(hint));
  const isBackendEndpointHint =
    isAppRouterApiPath ||
    (!isBackendShared && BACKEND_ENDPOINT_PATH_HINTS.some((hint) => pathForHints.includes(hint)));
  const isServerActionPath = SERVER_ACTION_PATH_PATTERNS.some((pattern) => pattern.test(pathForHints));
  const isServerComponentPath = isAppRouterPath &&
    !isAppRouterApiPath &&
    !isServerActionPath &&
    SERVER_COMPONENT_EXTENSIONS.has(ext);
  const isDestructivePathHint = DESTRUCTIVE_PATH_HINT_PATTERNS.some((pattern) => pattern.test(lowerPath));

  return {
    lowerPath,
    base,
    ext,
    isConfig,
    isDocsTests,
    isFrontend,
    isFrontendUi,
    isFrontendUtil,
    isBackend,
    isAppRouterPath,
    isAppRouterApiPath,
    isBackendEndpointHint,
    isBackendShared,
    isServerActionPath,
    isServerComponentPath,
    isDestructivePathHint
  };
}

function isConfigPath(lowerPath: string, base: string, ext: string): boolean {
  if (CONFIG_BASENAMES.has(base)) {
    return true;
  }
  if (base.startsWith(".env")) {
    return true;
  }
  if (CONFIG_EXTENSIONS.has(ext)) {
    return true;
  }
  return false;
}

function isDocsTestsPath(lowerPath: string, base: string, ext: string): boolean {
  if (DOC_BASENAMES.has(base)) {
    return true;
  }
  if (DOC_EXTENSIONS.has(ext)) {
    return true;
  }
  if (DOC_PATH_HINTS.some((hint) => lowerPath.includes(hint))) {
    return true;
  }
  if (TEST_PATH_HINTS.some((hint) => lowerPath.includes(hint))) {
    return true;
  }
  if (TEST_FILE_PATTERNS.some((pattern) => pattern.test(base))) {
    return true;
  }
  return false;
}

function collectScopeEvidence(content: string, pathHints: PathHints): FileScopeEvidence {
  const { body, header } = extractSecurityHeaderHints(content);
  const entryPointHints = collectEntryPointHints(body, header);
  const sinks = collectSinkHints(body, header);
  const sensitiveActionHints = collectSensitiveActionHints(body, pathHints);
  const hasRequestBody = hasRequestBodySignal(body);
  const headerIsEndpoint = header.hasHeader ? isEndpointEntryType(header.entryPointType) : false;
  const contentIsEndpoint = header.hasHeader ? false : matchesAny(body, ROUTER_HANDLER_PATTERNS);
  const pathIsEndpoint = header.hasHeader ? false : pathHints.isBackendEndpointHint;
  const detectedServerAction = pathHints.isServerActionPath || hasServerActionDirective(body);
  const isClientComponent = hasUseClientDirective(body);
  const isServerAction = detectedServerAction;
  const isEndpoint = header.hasHeader
    ? headerIsEndpoint || detectedServerAction
    : contentIsEndpoint || pathIsEndpoint || detectedServerAction;
  const isShared = pathHints.isBackendShared || isSharedEntryType(header.entryPointType);

  return {
    isEndpoint,
    isShared,
    isConfig: pathHints.isConfig,
    entryPointHints,
    sinks,
    sensitiveActionHints,
    isServerAction,
    isClientComponent,
    hasRequestBody,
    fromSecurityHeader: header.hasHeader
  };
}

function mergeScopeEvidence(evidenceList: FileScopeEvidence[]): FileScopeEvidence {
  const headerEvidence = evidenceList.filter((evidence) => evidence.fromSecurityHeader);
  const primary = headerEvidence.length ? headerEvidence : evidenceList;
  const isEndpoint = primary.some((evidence) => evidence.isEndpoint);
  const entryPointHints = uniqueList(primary.flatMap((evidence) => evidence.entryPointHints));
  const sinks = uniqueList(primary.flatMap((evidence) => evidence.sinks));
  const sensitiveActionHints = uniqueList(
    evidenceList.flatMap((evidence) => evidence.sensitiveActionHints)
  );
  const isShared = evidenceList.some((evidence) => evidence.isShared);
  const isConfig = evidenceList.some((evidence) => evidence.isConfig);
  const isServerAction = evidenceList.some((evidence) => evidence.isServerAction);
  const isClientComponent = evidenceList.some((evidence) => evidence.isClientComponent);
  const hasRequestBody = evidenceList.some((evidence) => evidence.hasRequestBody);
  const mergedSensitiveActionHints =
    isServerAction && !sensitiveActionHints.includes("server.action")
      ? [...sensitiveActionHints, "server.action"]
      : sensitiveActionHints;

  return {
    isEndpoint,
    isShared,
    isConfig,
    entryPointHints,
    sinks,
    sensitiveActionHints: mergedSensitiveActionHints,
    isServerAction,
    isClientComponent,
    hasRequestBody,
    fromSecurityHeader: headerEvidence.length > 0
  };
}

function decideFileScope(pathHints: PathHints, evidence: FileScopeEvidence): FileScope {
  if (pathHints.isConfig) {
    return "config_metadata";
  }
  if (pathHints.isDocsTests) {
    return "docs_tests";
  }
  if (pathHints.isAppRouterApiPath) {
    return "backend_endpoint";
  }
  if (evidence.isServerAction || pathHints.isServerActionPath) {
    return "backend_endpoint";
  }
  if (evidence.isEndpoint && (pathHints.isBackendEndpointHint || pathHints.isBackend)) {
    return "backend_endpoint";
  }
  if (pathHints.isServerComponentPath && !evidence.isClientComponent && !evidence.isEndpoint) {
    return "server_component";
  }
  if (pathHints.isFrontend) {
    if (pathHints.isFrontendUtil && !pathHints.isFrontendUi) {
      return "frontend_util";
    }
    if (pathHints.isFrontendUi && !pathHints.isFrontendUtil) {
      return "frontend_ui";
    }
    if (pathHints.isFrontendUtil) {
      return "frontend_util";
    }
    return "frontend_ui";
  }

  const backendCandidate = pathHints.isBackend || evidence.isEndpoint || evidence.isShared;
  if (backendCandidate) {
    if (pathHints.isBackendShared || evidence.isShared) {
      return "backend_shared";
    }
    if (evidence.isEndpoint || pathHints.isBackendEndpointHint) {
      return "backend_endpoint";
    }
    return "backend_shared";
  }

  return "unknown";
}

function extractSecurityHeaderHints(content: string): { body: string; header: SecurityHeaderHints } {
  const { header, body } = splitSecurityHeader(content);
  if (!header) {
    return {
      body: content,
      header: { hasHeader: false, entryPointType: null, entryPointIdentifier: null, sinks: [] }
    };
  }
  return { body, header: parseSecurityHeaderHints(header) };
}

function parseSecurityHeaderHints(headerText: string): SecurityHeaderHints {
  let entryPointType: string | null = null;
  let entryPointIdentifier: string | null = null;
  const sinks: string[] = [];
  let section = "";

  for (const rawLine of headerText.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    if (!rawLine.startsWith(" ") && line.endsWith(":")) {
      section = line.slice(0, -1).toUpperCase();
      continue;
    }
    if (section === "ENTRY_POINT") {
      if (line.startsWith("type:")) {
        entryPointType = normalizeHeaderValue(line.slice("type:".length).trim());
      } else if (line.startsWith("identifier:")) {
        entryPointIdentifier = normalizeHeaderValue(line.slice("identifier:".length).trim());
      }
    } else if (section === "SINKS" && line.startsWith("-")) {
      const value = line.slice(1).trim();
      if (value && value !== "none") {
        sinks.push(value);
      }
    }
  }

  return {
    hasHeader: true,
    entryPointType,
    entryPointIdentifier,
    sinks: uniqueList(sinks)
  };
}

function normalizeHeaderValue(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "unknown") {
    return null;
  }
  return trimmed;
}

function isEndpointEntryType(value: string | null): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "http" || normalized === "webhook" || normalized === "rpc" || normalized === "graphql";
}

function isSharedEntryType(value: string | null): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "library" || normalized === "job" || normalized === "cli";
}

function collectEntryPointHints(content: string, header: SecurityHeaderHints): string[] {
  if (header.hasHeader) {
    const hints: string[] = [];
    if (header.entryPointType) {
      hints.push(`type:${header.entryPointType}`);
    }
    if (header.entryPointIdentifier) {
      hints.push(`id:${header.entryPointIdentifier}`);
    }
    return uniqueList(hints);
  }

  const hints: string[] = [];
  if (hasServerActionDirective(content)) {
    hints.push("server.action");
  }
  if (/Deno\.serve\s*\(/i.test(content)) {
    hints.push("deno.serve");
  }
  if (/addEventListener\s*\(\s*['"]fetch['"]\s*\)/i.test(content)) {
    hints.push("fetch.listener");
  }
  if (/\b(app|router)\.(get|post|put|patch|delete|all)\s*\(/i.test(content)) {
    hints.push("router.method");
  }
  if (/export\s+(async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/i.test(content)) {
    hints.push("http.method");
  }
  const methods = detectHttpMethods(content);
  for (const method of methods) {
    hints.push(`method:${method}`);
  }
  return uniqueList(hints);
}

function collectSinkHints(content: string, header: SecurityHeaderHints): string[] {
  const hints: string[] = [];
  if (header.hasHeader) {
    hints.push(...header.sinks);
  }
  if (matchesAny(content, DB_WRITE_PATTERNS)) {
    hints.push("db.write");
  }
  if (matchesAny(content, DB_ID_PATTERNS) || matchesAny(content, QUERY_BUILDER_PATTERNS)) {
    hints.push("db.query");
  }
  if (matchesAny(content, SQL_INJECTION_PATTERNS) || matchesAny(content, RAW_SQL_HELPER_PATTERNS)) {
    hints.push("sql.query");
  }
  if (matchesAny(content, EXEC_PATTERNS) || matchesAny(content, COMMAND_INJECTION_PATTERNS)) {
    hints.push("exec");
  }
  if (matchesAny(content, EXTERNAL_CALL_PATTERNS)) {
    hints.push("http.request");
  }
  if (matchesAny(content, DANGEROUS_HTML_PATTERNS)) {
    hints.push("template.render");
  }
  if (matchesAny(content, RESPONSE_HEADER_PATTERNS)) {
    hints.push("http.response.headers");
  }
  return uniqueList(hints);
}

function collectSensitiveActionHints(content: string, pathHints?: PathHints): string[] {
  const hints: string[] = [];
  if (AUTH_ACTION_HINT_PATTERNS.some((pattern) => pattern.test(content))) {
    hints.push("auth");
  }
  if (SENSITIVE_ACTION_HINT_PATTERNS.some((pattern) => pattern.test(content))) {
    hints.push("action");
  }
  if (matchesAny(content, DB_WRITE_PATTERNS)) {
    hints.push("db.write");
  }
  if (matchesAny(content, ADMIN_CONTEXT_PATTERNS)) {
    hints.push("admin");
  }
  if (matchesAny(content, MEMBER_MANAGEMENT_CONTENT_PATTERNS)) {
    hints.push("member.manage");
  }
  if (hasServerActionDirective(content) || pathHints?.isServerActionPath) {
    hints.push("server.action");
  }
  if (pathHints) {
    const pathForHints = pathHints.lowerPath.startsWith("/") ? pathHints.lowerPath : `/${pathHints.lowerPath}`;
    const adminPathHint = ADMIN_PATH_PATTERNS.some(
      (pattern) => pattern.test(pathForHints) || pattern.test(pathHints.base)
    );
    const memberPathHint = MEMBER_MANAGEMENT_PATH_PATTERNS.some(
      (pattern) => pattern.test(pathForHints) || pattern.test(pathHints.base)
    );
    const memberManagementHint = memberPathHint ||
      hasMemberManagementContext(pathForHints, pathHints.base, content);
    if (adminPathHint || memberManagementHint || memberPathHint) {
      hints.push("admin");
    }
    if (memberManagementHint || memberPathHint) {
      hints.push("member.manage");
    }
  }
  const destructiveByContent = DESTRUCTIVE_ACTION_HINT_PATTERNS.some((pattern) => pattern.test(content));
  const destructiveByPath = pathHints
    ? DESTRUCTIVE_PATH_HINT_PATTERNS.some((pattern) => pattern.test(pathHints.lowerPath))
    : false;
  if (destructiveByContent || destructiveByPath) {
    hints.push("destructive");
  }
  return hints;
}

function uniqueList(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function isEndpointRole(roles: FileRole[]): boolean {
  return (
    roles.includes("USER_READ_ENDPOINT") ||
    roles.includes("USER_WRITE_ENDPOINT") ||
    roles.includes("ADMIN_ENDPOINT") ||
    roles.includes("AUTH_ENDPOINT") ||
    roles.includes("WEBHOOK_ENDPOINT")
  );
}

function isLikelyBackendFile(path: string, roles: FileRole[]): boolean {
  if (!path) return false;
  const lowerPath = path.toLowerCase();
  const pathForHints = lowerPath.startsWith("/") ? lowerPath : `/${lowerPath}`;
  const base = lowerPath.split("/").pop() ?? "";
  const ext = base.includes(".") ? base.split(".").pop() ?? "" : "";
  if (roles.includes("FRONTEND_PAGE") || roles.includes("FRONTEND_ADMIN_PAGE")) {
    return false;
  }
  if (FRONTEND_EXTENSIONS.has(ext)) {
    return false;
  }
  if (SERVER_ACTION_PATH_PATTERNS.some((pattern) => pattern.test(pathForHints))) {
    return true;
  }
  return (
    BACKEND_PATH_HINTS.some((hint) => pathForHints.includes(hint)) ||
    BACKEND_SHARED_PATH_HINTS.some((hint) => pathForHints.includes(hint))
  );
}

function hasHighRiskExec(content: string): boolean {
  return EXEC_PATTERNS.some((pattern) => pattern.test(content));
}

function hasRoleCheck(content: string): boolean {
  return ROLE_CHECK_PATTERNS.some((pattern) => pattern.test(content));
}

function hasMemberManagementContext(pathForHints: string, base: string, content: string): boolean {
  const hasPathHint = MEMBER_MANAGEMENT_PATH_PATTERNS.some(
    (pattern) => pattern.test(pathForHints) || pattern.test(base)
  );
  const hasContentHint = MEMBER_MANAGEMENT_CONTENT_PATTERNS.some((pattern) => pattern.test(content));
  const hasStrongContentHint = MEMBER_MANAGEMENT_STRONG_PATTERNS.some((pattern) => pattern.test(content));
  if (hasPathHint && (hasContentHint || hasRoleCheck(content))) {
    return true;
  }
  if (!hasPathHint && hasContentHint && hasRoleCheck(content)) {
    return true;
  }
  if (!hasPathHint && hasStrongContentHint) {
    return true;
  }
  return false;
}

function hasRateLimit(content: string): boolean {
  if (!content) return false;
  const lines = content.split("\n");
  for (const line of lines) {
    if (!RATE_LIMIT_PATTERNS.some((pattern) => pattern.test(line))) {
      continue;
    }
    if (RATE_LIMIT_NEGATION_PATTERNS.some((pattern) => pattern.test(line))) {
      continue;
    }
    return true;
  }
  return false;
}

function hasLockout(content: string): boolean {
  if (!content) return false;
  const lines = content.split("\n");
  for (const line of lines) {
    if (!LOCKOUT_PATTERNS.some((pattern) => pattern.test(line))) {
      continue;
    }
    if (LOCKOUT_NEGATION_PATTERNS.some((pattern) => pattern.test(line))) {
      continue;
    }
    return true;
  }
  return false;
}

function hasMfa(content: string): boolean {
  if (!content) return false;
  return MFA_PATTERNS.some((pattern) => pattern.test(content));
}

function hasMagicLinkExpirationCheck(content: string): boolean {
  if (!content) return false;
  const lines = content.split("\n");
  const windowSize = 6;
  const magicLines: number[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (MAGIC_LINK_TOKEN_PATTERNS.some((pattern) => pattern.test(lines[i]))) {
      magicLines.push(i);
    }
  }
  if (magicLines.length === 0) return false;
  for (const index of magicLines) {
    const end = Math.min(lines.length, index + windowSize + 1);
    for (let i = index; i < end; i += 1) {
      if (MAGIC_LINK_EXPIRATION_PATTERNS.some((pattern) => pattern.test(lines[i]))) {
        return true;
      }
    }
  }
  return false;
}

function hasMagicLinkNoExpiration(content: string): boolean {
  if (!content) return false;
  const hasMagicToken = MAGIC_LINK_TOKEN_PATTERNS.some((pattern) => pattern.test(content));
  if (!hasMagicToken) return false;
  const hasSessionSignal =
    MAGIC_LINK_SESSION_PATTERNS.some((pattern) => pattern.test(content)) ||
    MAGIC_LINK_COOKIE_SET_PATTERNS.some((pattern) => pattern.test(content));
  if (!hasSessionSignal) return false;
  return !hasMagicLinkExpirationCheck(content);
}

function isSensitiveAction(
  content: string,
  roles: FileRole[],
  filepath?: string,
  scopeEvidence?: FileScopeEvidence
): boolean {
  if (roles.includes("AUTH_ENDPOINT")) {
    return true;
  }
  if (scopeEvidence) {
    if (scopeEvidence.isServerAction) {
      return true;
    }
    if (scopeEvidence.sensitiveActionHints.length > 0) {
      return true;
    }
  }
  if (matchesAny(content, DB_WRITE_PATTERNS)) {
    return true;
  }
  if (hasServerActionDirective(content)) {
    return true;
  }
  if (filepath) {
    const normalized = normalizePath(filepath);
    const pathForHints = normalized.startsWith("/") ? normalized : `/${normalized}`;
    if (SERVER_ACTION_PATH_PATTERNS.some((pattern) => pattern.test(pathForHints))) {
      return true;
    }
  }
  return SENSITIVE_ACTION_PATTERNS.some((pattern) => pattern.test(content));
}

function isDestructiveAction(content: string, filepath?: string): boolean {
  if (DESTRUCTIVE_PATTERNS.some((pattern) => pattern.test(content))) {
    return true;
  }
  if (filepath) {
    const lower = filepath.toLowerCase();
    if (/(delete|remove|destroy|revoke|disable|suspend)/i.test(lower)) {
      return true;
    }
  }
  return false;
}

function isAdminOrDestructive(roles: FileRole[], content: string, filepath?: string): boolean {
  return roles.includes("ADMIN_ENDPOINT") || isDestructiveAction(content, filepath);
}

function hasAuditLogging(content: string): boolean {
  return AUDIT_PATTERNS.some((pattern) => pattern.test(content));
}

function isUnboundedSelectSnippet(snippet: string): boolean {
  if (!snippet) return false;
  if (!UNBOUNDED_SELECT_PATTERNS.some((pattern) => pattern.test(snippet))) {
    return false;
  }
  if (LIMIT_PATTERNS.some((pattern) => pattern.test(snippet))) {
    return false;
  }
  if (SINGLE_RESULT_PATTERNS.some((pattern) => pattern.test(snippet))) {
    return false;
  }
  if (SELECT_WRITE_CHAIN_PATTERNS.some((pattern) => pattern.test(snippet))) {
    return false;
  }
  const hasTableSelect = SELECT_TABLE_HINT_PATTERNS.some((pattern) => pattern.test(snippet));
  const hasUserFilter = SELECT_USER_FILTER_PATTERNS.some((pattern) => pattern.test(snippet));
  if (!hasTableSelect && !hasUserFilter) {
    return false;
  }
  return true;
}

function collectSelectQueryVariables(content: string): string[] {
  const vars = new Set<string>();
  const assignmentPattern =
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([\s\S]{0,200}?)(?:;|\n)/g;
  for (const match of content.matchAll(assignmentPattern)) {
    const varName = match[1];
    const expression = match[2] ?? "";
    if (!varName || !expression) continue;
    if (!isUnboundedSelectSnippet(expression)) {
      continue;
    }
    vars.add(varName);
  }
  return Array.from(vars);
}

function hasUnboundedSelect(content: string): boolean {
  if (!UNBOUNDED_SELECT_PATTERNS.some((pattern) => pattern.test(content))) {
    return false;
  }
  const selectPattern = /\.select\s*\(/gi;
  let match: RegExpExecArray | null = selectPattern.exec(content);
  while (match) {
    const start = match.index ?? 0;
    const before = content.slice(Math.max(0, start - 200), start);
    const window = content.slice(start, start + 240);
    const snippet = `${before}${window}`;
    if (isUnboundedSelectSnippet(snippet)) {
      return true;
    }
    match = selectPattern.exec(content);
  }

  const queryVars = collectSelectQueryVariables(content);
  for (const queryVar of queryVars) {
    const escaped = queryVar.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const awaitPattern = new RegExp(`\\bawait\\s+${escaped}\\b(?!\\s*\\.)`, "i");
    if (awaitPattern.test(content)) {
      return true;
    }
  }

  return false;
}

function hasExternalCall(content: string): boolean {
  return EXTERNAL_CALL_PATTERNS.some((pattern) => pattern.test(content)) ||
    EXEC_PATTERNS.some((pattern) => pattern.test(content));
}

function hasTimeout(content: string): boolean {
  return TIMEOUT_PATTERNS.some((pattern) => pattern.test(content));
}

function isLocalOrTestUrl(text: string): boolean {
  if (!text) return false;
  return LOCAL_TEST_URL_PATTERNS.some((pattern) => pattern.test(text));
}

function findMissingTimeoutLine(
  content: string,
  startLine: number
): { line: number; text: string } | null {
  if (!content) return null;
  const matches = findLineMatches(content, [...EXTERNAL_CALL_PATTERNS, ...EXEC_PATTERNS], startLine);
  for (const match of matches) {
    if (isLocalOrTestUrl(match.text)) {
      continue;
    }
    if (TIMEOUT_PATTERNS.some((pattern) => pattern.test(match.text))) {
      continue;
    }
    if (match.text.includes(")")) {
      return match;
    }
    if (!hasPatternNearLine(content, match.line, startLine, TIMEOUT_PATTERNS, 4)) {
      return match;
    }
  }
  return null;
}

function hasPermissiveCors(content: string): boolean {
  return CORS_WILDCARD_PATTERNS.some((pattern) => pattern.test(content));
}

function hasJwtFallbackSecret(content: string): boolean {
  return JWT_FALLBACK_PATTERNS.some((pattern) => pattern.test(content));
}

function hasJwtDecodeWithoutVerify(content: string): boolean {
  return JWT_DECODE_PATTERNS.some((pattern) => pattern.test(content)) &&
    !JWT_VERIFY_PATTERNS.some((pattern) => pattern.test(content));
}

function findJwtValidationBypassLine(
  content: string,
  startLine: number
): { line: number; text: string } | null {
  if (!content) return null;
  if (hasJwtDecodeWithoutVerify(content)) {
    return findFirstLineMatch(content, JWT_DECODE_PATTERNS, startLine);
  }
  const matches = findLineMatches(content, JWT_BYPASS_TOGGLE_PATTERNS, startLine);
  for (const match of matches) {
    if (hasPatternNearLine(content, match.line, startLine, JWT_CONTEXT_PATTERNS, 4)) {
      return match;
    }
  }
  return null;
}

function hasJwtValidationBypass(content: string, startLine: number): boolean {
  return Boolean(findJwtValidationBypassLine(content, startLine));
}

function hasWeakTokenGeneration(content: string): boolean {
  return WEAK_TOKEN_PATTERNS.some((pattern) => pattern.test(content));
}

function hasCommandInjectionRisk(content: string): boolean {
  if (!EXEC_PATTERNS.some((pattern) => pattern.test(content))) {
    return false;
  }
  if (COMMAND_INJECTION_PATTERNS.some((pattern) => pattern.test(content))) {
    return true;
  }
  return COMMAND_INPUT_PATTERNS.some((pattern) => pattern.test(content));
}

function isTokenRelated(content: string, path: string): boolean {
  const lowerPath = path.toLowerCase();
  return TOKEN_CONTEXT_PATTERNS.some((pattern) => pattern.test(content)) ||
    lowerPath.includes("token") ||
    lowerPath.includes("apikey") ||
    lowerPath.includes("api-key") ||
    lowerPath.includes("secret");
}

function hasServerActionDirective(content: string): boolean {
  if (!content) return false;
  return SERVER_ACTION_DIRECTIVE_PATTERN.test(content);
}

function hasUseClientDirective(content: string): boolean {
  if (!content) return false;
  return USE_CLIENT_DIRECTIVE_PATTERN.test(content);
}

function hasWebhookSignatureCheck(content: string): boolean {
  return WEBHOOK_SIGNATURE_PATTERNS.some((pattern) => pattern.test(content));
}

function hasWebhookConfigFetch(content: string): boolean {
  const hasConfigReference = matchesAny(content, WEBHOOK_CONFIG_PATTERNS);
  if (!hasConfigReference) {
    return false;
  }
  return matchesAny(content, EXTERNAL_CALL_PATTERNS);
}

function hasWebhookConfigIntegrityCheck(content: string, startLine = 1): boolean {
  const matches = findLineMatches(content, WEBHOOK_CONFIG_INTEGRITY_PATTERNS, startLine);
  if (matches.length === 0) {
    return false;
  }
  for (const match of matches) {
    if (!hasPatternNearLine(content, match.line, startLine, WEBHOOK_CONFIG_PATTERNS, 6)) {
      continue;
    }
    if (hasPatternNearLine(content, match.line, startLine, EXTERNAL_CALL_PATTERNS, 6)) {
      return true;
    }
  }
  return false;
}

function hasWebhookConfigFetchAcrossSamples(samples: RepositoryFileSample[]): boolean {
  const hasConfigReference = matchesAnyAcrossSamples(samples, WEBHOOK_CONFIG_PATTERNS);
  if (!hasConfigReference) {
    return false;
  }
  return matchesAnyAcrossSamples(samples, EXTERNAL_CALL_PATTERNS);
}

function hasWebhookConfigIntegrityAcrossSamples(samples: RepositoryFileSample[]): boolean {
  return samples.some((sample) =>
    hasWebhookConfigIntegrityCheck(sample.content ?? "", sample.startLine ?? 1)
  );
}

function hasUploadSignal(content: string, path: string): boolean {
  const lowerPath = path.toLowerCase();
  if (UPLOAD_PATH_PATTERNS.some((pattern) => pattern.test(lowerPath))) {
    return true;
  }
  const hasStrongSignal = UPLOAD_SIGNAL_PATTERNS.some((pattern) => pattern.test(content));
  if (hasStrongSignal) {
    return true;
  }
  if (!UPLOAD_FORMDATA_PATTERNS.some((pattern) => pattern.test(content))) {
    return false;
  }
  return UPLOAD_FORMDATA_FILE_PATTERNS.some((pattern) => pattern.test(content));
}

function hasUploadSizeLimit(content: string): boolean {
  return UPLOAD_SIZE_LIMIT_PATTERNS.some((pattern) => pattern.test(content));
}

function hasCodeExecution(content: string): boolean {
  return CODE_EXECUTION_PATTERNS.some((pattern) => pattern.test(content));
}

function hasDangerousHtml(content: string): boolean {
  return DANGEROUS_HTML_PATTERNS.some((pattern) => pattern.test(content));
}

function hasAnonKeyBearer(content: string): boolean {
  return matchesAny(content, ANON_KEY_PATTERNS) && matchesAny(content, AUTH_HEADER_PATTERNS);
}

function hasMissingBearerToken(content: string): boolean {
  if (!matchesAny(content, FRONTEND_API_CALL_PATTERNS)) {
    return false;
  }
  if (!matchesAny(content, FRONTEND_AUTH_STATE_PATTERNS)) {
    return false;
  }
  return !matchesAny(content, AUTH_HEADER_PATTERNS) && !matchesAny(content, ACCESS_TOKEN_PATTERNS);
}

function hasRequestBodySignal(content: string): boolean {
  if (matchesAny(content, REQUEST_BODY_PATTERNS) || matchesAny(content, REQUEST_JSON_PATTERNS)) {
    return true;
  }
  return Boolean(findLogLineWithKeywords(content, 1, REQUEST_BODY_LOG_PATTERNS));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function collectSupabaseClientAliases(content: string): string[] {
  const aliases = new Set<string>();
  const assignmentPattern =
    /\b(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?(?:createClient|createBrowserClient)\s*(?:<[^>]*>)?\s*\(/g;
  for (const match of content.matchAll(assignmentPattern)) {
    const alias = match[1];
    if (alias) {
      aliases.add(alias);
    }
  }
  if (
    matchesAny(content, SUPABASE_CONTEXT_PATTERNS) ||
    matchesAny(content, SUPABASE_CLIENT_FACTORY_PATTERNS)
  ) {
    aliases.add("supabase");
  }
  return Array.from(aliases);
}

function findSupabaseWriteLine(
  content: string,
  startLine: number
): { line: number; text: string } | null {
  const aliases = collectSupabaseClientAliases(content);
  const patterns: RegExp[] = [];
  for (const alias of aliases) {
    const escaped = escapeRegExp(alias);
    patterns.push(
      new RegExp(
        `\\b${escaped}\\s*\\.from\\s*\\([^)]*\\)\\s*\\.(insert|update|delete|upsert)\\b`,
        "i"
      )
    );
    patterns.push(new RegExp(`\\b${escaped}\\s*\\.rpc\\s*\\(`, "i"));
  }
  if (patterns.length === 0) {
    if (matchesAny(content, SUPABASE_CONTEXT_PATTERNS)) {
      const fallback = findFirstLineMatch(content, SUPABASE_WRITE_METHOD_PATTERNS, startLine);
      if (fallback) {
        return fallback;
      }
    }
    return findFirstLineMatch(content, FRONTEND_DB_WRITE_PATTERNS, startLine);
  }
  return findFirstLineMatch(content, patterns, startLine);
}

function isGetOnlyEndpoint(roles: FileRole[], content: string): boolean {
  if (!isEndpointRole(roles)) return false;
  if (roles.includes("USER_WRITE_ENDPOINT")) return false;
  const methods = detectHttpMethods(content);
  if (methods.size === 0) return false;
  const hasWrite = ["POST", "PUT", "PATCH", "DELETE"].some((method) => methods.has(method));
  return methods.has("GET") && !hasWrite;
}

function isLayoutFile(path: string): boolean {
  const lower = path.toLowerCase();
  const base = lower.split("/").pop() ?? "";
  return base.startsWith("layout.");
}

function findAnonKeyAdminEvidence(
  content: string,
  startLine: number,
  filepath: string
): CandidateEvidence[] | null {
  if (!matchesAny(content, ANON_KEY_PATTERNS)) {
    return null;
  }
  if (!matchesAny(content, SUPABASE_CONTEXT_PATTERNS)) {
    return null;
  }
  const hasAdminContext = matchesAny(content, ADMIN_CONTEXT_PATTERNS);
  const hasServiceRoleContext = matchesAny(content, SERVICE_ROLE_KEY_PATTERNS);
  if (!hasAdminContext && !hasServiceRoleContext) {
    return null;
  }
  const anonLine = findFirstLineMatch(content, ANON_KEY_PATTERNS, startLine);
  const adminLine = hasAdminContext ? findFirstLineMatch(content, ADMIN_CONTEXT_PATTERNS, startLine) : null;
  const serviceLine = hasServiceRoleContext
    ? findFirstLineMatch(content, SERVICE_ROLE_KEY_PATTERNS, startLine)
    : null;
  const evidence: CandidateEvidence[] = [];
  if (adminLine) {
    evidence.push({
      filepath,
      startLine: adminLine.line,
      endLine: adminLine.line,
      excerpt: adminLine.text,
      note: "Admin/service context detected"
    });
  }
  if (anonLine) {
    evidence.push({
      filepath,
      startLine: anonLine.line,
      endLine: anonLine.line,
      excerpt: anonLine.text,
      note: "Anon key referenced"
    });
  }
  if (serviceLine) {
    evidence.push({
      filepath,
      startLine: serviceLine.line,
      endLine: serviceLine.line,
      excerpt: serviceLine.text,
      note: "Service role key available in shared config"
    });
  }
  if (evidence.length === 0) {
    return null;
  }
  return evidence;
}

function findNextPublicSecretLine(
  content: string,
  startLine: number
): { line: number; text: string } | null {
  return findFirstLineMatch(content, NEXT_PUBLIC_SECRET_PATTERNS, startLine);
}

function findPublicBucketLine(
  content: string,
  startLine: number
): { line: number; text: string } | null {
  if (!matchesAny(content, STORAGE_CONTEXT_PATTERNS)) {
    return null;
  }
  return findFirstLineMatch(content, PUBLIC_BUCKET_PATTERNS, startLine);
}

function isLoginPage(path: string, content: string): boolean {
  const lowerPath = path.toLowerCase();
  if (LOGIN_PATH_PATTERNS.some((pattern) => pattern.test(lowerPath))) {
    return true;
  }
  return matchesAny(content, LOGIN_UI_PATTERNS);
}

function hasDebugAuthLeak(content: string): boolean {
  if (!content) return false;
  if (!matchesAny(content, DEBUG_ENDPOINT_PATTERNS)) {
    return false;
  }
  if (!matchesAny(content, DEBUG_HEADER_PATTERNS)) {
    return false;
  }
  return matchesAny(content, DEBUG_AUTH_PATTERNS);
}

function prioritizeCandidates(candidates: CandidateFinding[]): CandidateFinding[] {
  return [...candidates].sort((a, b) => {
    const aPriority = CANDIDATE_PRIORITY[a.type] ?? DEFAULT_CANDIDATE_PRIORITY;
    const bPriority = CANDIDATE_PRIORITY[b.type] ?? DEFAULT_CANDIDATE_PRIORITY;
    if (aPriority !== bPriority) {
      return bPriority - aPriority;
    }
    const aEvidence = Array.isArray(a.evidence) ? a.evidence.length : 0;
    const bEvidence = Array.isArray(b.evidence) ? b.evidence.length : 0;
    if (aEvidence !== bEvidence) {
      return bEvidence - aEvidence;
    }
    return (a.id ?? "").localeCompare(b.id ?? "");
  });
}

function hasCaptcha(content: string): boolean {
  return CAPTCHA_PATTERNS.some((pattern) => pattern.test(content));
}

function detectIdorCandidate(file: RepositoryFileSample, roles: FileRole[]): CandidateFinding | null {
  const content = file.content ?? "";
  const startLine = file.startLine ?? 1;

  const hasRequestJson = matchesAny(content, REQUEST_JSON_PATTERNS);
  const hasBodyId = hasRequestJson && matchesAny(content, BODY_ID_PATTERNS);
  if (!matchesAny(content, ID_INPUT_PATTERNS) && !hasBodyId) {
    return null;
  }
  const queryMatches = [
    ...findLineMatches(content, DB_ID_PATTERNS, startLine),
    ...findLineMatches(content, SQL_INJECTION_PATTERNS, startLine)
  ];
  if (queryMatches.length === 0) {
    return null;
  }

  const hasBypassHint = matchesAny(content, IDOR_BYPASS_PATTERNS);
  const hasRls = matchesAny(content, RLS_PATTERNS);
  let queryLine =
    queryMatches.find(
      (match) =>
        !hasPatternNearLine(content, match.line, startLine, OWNERSHIP_FILTER_PATTERNS, 6)
    ) ?? queryMatches[0];
  if (!queryLine) {
    return null;
  }
  const ownershipNear = hasPatternNearLine(content, queryLine.line, startLine, OWNERSHIP_FILTER_PATTERNS, 6);
  if ((ownershipNear || hasRls) && !hasBypassHint) {
    return null;
  }

  const inputLine =
    findFirstLineMatch(content, ID_INPUT_PATTERNS, startLine) ??
    (hasBodyId ? findFirstLineMatch(content, BODY_ID_PATTERNS, startLine) : null);
  const bypassLine = hasBypassHint ? findFirstLineMatch(content, IDOR_BYPASS_PATTERNS, startLine) : null;

  const evidence: CandidateEvidence[] = [];
  if (inputLine) {
    evidence.push({
      filepath: file.path,
      startLine: inputLine.line,
      endLine: inputLine.line,
      excerpt: inputLine.text,
      note: "Client-supplied identifier"
    });
  }
  if (queryLine) {
    evidence.push({
      filepath: file.path,
      startLine: queryLine.line,
      endLine: queryLine.line,
      excerpt: queryLine.text,
      note: "Query by ID without tenant guard"
    });
  }
  if (bypassLine) {
    evidence.push({
      filepath: file.path,
      startLine: bypassLine.line,
      endLine: bypassLine.line,
      excerpt: bypassLine.text,
      note: "Ownership/authorization bypass flag detected"
    });
  }

  return {
    id: `idor:${file.path}:${queryLine?.line ?? startLine}`,
    type: "idor",
    summary: "IDOR: object fetched by ID without ownership/tenant validation",
    rationale:
      "Endpoint appears to fetch data by client-provided ID without verifying ownership or tenant membership.",
    filepath: file.path,
    evidence: trimEvidence(evidence),
    relatedFileRoles: roles
  };
}

function inferTrustedIdentifierLabel(text: string | null): string {
  const lower = (text ?? "").toLowerCase();
  if (/\buser(_?id)?\b/i.test(lower)) {
    return "userId";
  }
  if (/\btenant(_?id)?\b/i.test(lower)) {
    return "tenantId";
  }
  if (/\borganization(_?id)?\b/i.test(lower)) {
    return "organizationId";
  }
  if (/\borg(_?id)?\b/i.test(lower)) {
    return "orgId";
  }
  return "orgId";
}

function buildTrustedIdSummary(idLabel: string): string {
  if (idLabel === "userId") {
    return "Trusting client-provided userId for access control";
  }
  return `Trusting client-provided ${idLabel} for tenant routing`;
}

function buildTrustedIdRationale(idLabel: string): string {
  if (idLabel === "userId") {
    return "userId appears to be taken from request input and used in a write path without server-side derivation.";
  }
  return `${idLabel} appears to be taken from request input and used in a write path without server-side derivation.`;
}

function buildFrontendTrustedIdSummary(idLabel: string): string {
  if (idLabel === "userId") {
    return "Access control risk: userId from URL used in server-side fetch";
  }
  return `Tenant isolation risk: ${idLabel} from URL used in server-side fetch`;
}

function buildFrontendTrustedIdRationale(idLabel: string): string {
  if (idLabel === "userId") {
    return "Server-rendered code uses userId from URL/search params to fetch data without deriving it from server-side auth.";
  }
  return `Server-rendered code uses ${idLabel} from URL/search params to fetch tenant data without deriving it from server-side auth.`;
}

function detectOrgIdTrustCandidate(
  file: RepositoryFileSample,
  roles: FileRole[],
  scopeEvidence?: FileScopeEvidence
): CandidateFinding | null {
  const content = file.content ?? "";
  const startLine = file.startLine ?? 1;

  const isServerAction = hasServerActionDirective(content) || Boolean(scopeEvidence?.isServerAction);
  const hasRequestJson = matchesAny(content, REQUEST_JSON_PATTERNS);
  const hasBodyOrg = matchesAny(content, BODY_ORG_PATTERNS) && (hasRequestJson || isServerAction);
  const hasUserIdInput = matchesAny(content, USER_ID_INPUT_PATTERNS);
  if (!matchesAny(content, ORG_ID_INPUT_PATTERNS) && !hasBodyOrg && !hasUserIdInput) {
    return null;
  }
  if (!matchesAny(content, DB_WRITE_PATTERNS)) {
    return null;
  }

  const inputLine =
    findFirstLineMatch(content, ORG_ID_INPUT_PATTERNS, startLine) ??
    findFirstLineMatch(content, USER_ID_INPUT_PATTERNS, startLine) ??
    (hasBodyOrg ? findFirstLineMatch(content, BODY_ORG_PATTERNS, startLine) : null);
  const writeLine = findFirstLineMatch(content, DB_WRITE_PATTERNS, startLine);
  const idLabel = inferTrustedIdentifierLabel(inputLine?.text ?? null);

  const evidence: CandidateEvidence[] = [];
  if (inputLine) {
    evidence.push({
      filepath: file.path,
      startLine: inputLine.line,
      endLine: inputLine.line,
      excerpt: inputLine.text,
      note: `Client-provided ${idLabel}`
    });
  }
  if (writeLine) {
    evidence.push({
      filepath: file.path,
      startLine: writeLine.line,
      endLine: writeLine.line,
      excerpt: writeLine.text,
      note: "Write operation using request data"
    });
  }

  return {
    id: `orgid-trust:${file.path}:${inputLine?.line ?? startLine}`,
    type: "org_id_trust",
    summary: buildTrustedIdSummary(idLabel),
    rationale: buildTrustedIdRationale(idLabel),
    filepath: file.path,
    evidence: trimEvidence(evidence),
    relatedFileRoles: roles
  };
}

function detectFrontendOrgIdTrustCandidate(
  file: RepositoryFileSample,
  roles: FileRole[]
): CandidateFinding | null {
  const content = file.content ?? "";
  const startLine = file.startLine ?? 1;

  if (hasUseClientDirective(content)) {
    return null;
  }
  if (!matchesAny(content, FRONTEND_ORG_ID_INPUT_PATTERNS)) {
    return null;
  }
  if (!matchesAny(content, EXTERNAL_CALL_PATTERNS)) {
    return null;
  }

  const inputLine = findFirstLineMatch(content, FRONTEND_ORG_ID_INPUT_PATTERNS, startLine);
  const fetchLine = findFirstLineMatch(content, EXTERNAL_CALL_PATTERNS, startLine);
  if (!inputLine || !fetchLine) {
    return null;
  }

  const idLabel = inferTrustedIdentifierLabel(inputLine.text);
  const evidence: CandidateEvidence[] = [
    {
      filepath: file.path,
      startLine: inputLine.line,
      endLine: inputLine.line,
      excerpt: inputLine.text,
      note: `${idLabel} sourced from URL/search params`
    },
    {
      filepath: file.path,
      startLine: fetchLine.line,
      endLine: fetchLine.line,
      excerpt: fetchLine.text,
      note: `Server-side fetch uses URL ${idLabel}`
    }
  ];

  return {
    id: `orgid-trust-frontend:${file.path}:${inputLine.line}`,
    type: "org_id_trust",
    summary: buildFrontendTrustedIdSummary(idLabel),
    rationale: buildFrontendTrustedIdRationale(idLabel),
    filepath: file.path,
    evidence: trimEvidence(evidence),
    relatedFileRoles: roles
  };
}

function matchesAnyAcrossSamples(samples: RepositoryFileSample[], patterns: RegExp[]): boolean {
  return samples.some((sample) => matchesAny(sample.content ?? "", patterns));
}

function findFirstLineMatchAcrossSamples(
  samples: RepositoryFileSample[],
  patterns: RegExp[]
): { filepath: string; line: number; text: string; sample: RepositoryFileSample } | null {
  for (const sample of samples) {
    const match = findFirstLineMatch(sample.content ?? "", patterns, sample.startLine ?? 1);
    if (match) {
      return { filepath: sample.path, line: match.line, text: match.text, sample };
    }
  }
  return null;
}

function findLineMatchesAcrossSamples(
  samples: RepositoryFileSample[],
  patterns: RegExp[]
): Array<{ filepath: string; line: number; text: string; sample: RepositoryFileSample }> {
  const matches: Array<{ filepath: string; line: number; text: string; sample: RepositoryFileSample }> = [];
  for (const sample of samples) {
    const lines = findLineMatches(sample.content ?? "", patterns, sample.startLine ?? 1);
    for (const line of lines) {
      matches.push({ filepath: sample.path, line: line.line, text: line.text, sample });
    }
  }
  return matches;
}

function detectIdorCandidateAcrossChunks(
  samples: RepositoryFileSample[],
  roles: FileRole[]
): CandidateFinding | null {
  const sorted = [...samples].sort((a, b) => (a.chunkIndex ?? 0) - (b.chunkIndex ?? 0));
  const hasRequestJson = matchesAnyAcrossSamples(sorted, REQUEST_JSON_PATTERNS);
  const hasBodyId = hasRequestJson && matchesAnyAcrossSamples(sorted, BODY_ID_PATTERNS);
  if (!matchesAnyAcrossSamples(sorted, ID_INPUT_PATTERNS) && !hasBodyId) {
    return null;
  }

  const queryMatches = [
    ...findLineMatchesAcrossSamples(sorted, DB_ID_PATTERNS),
    ...findLineMatchesAcrossSamples(sorted, SQL_INJECTION_PATTERNS)
  ];
  if (queryMatches.length === 0) {
    return null;
  }

  const hasBypassHint = matchesAnyAcrossSamples(sorted, IDOR_BYPASS_PATTERNS);
  const hasRls = matchesAnyAcrossSamples(sorted, RLS_PATTERNS);

  let queryLine =
    queryMatches.find(
      (match) =>
        !hasPatternNearLine(
          match.sample.content ?? "",
          match.line,
          match.sample.startLine ?? 1,
          OWNERSHIP_FILTER_PATTERNS,
          6
        )
    ) ?? queryMatches[0];
  if (!queryLine) {
    return null;
  }
  const ownershipNear = hasPatternNearLine(
    queryLine.sample.content ?? "",
    queryLine.line,
    queryLine.sample.startLine ?? 1,
    OWNERSHIP_FILTER_PATTERNS,
    6
  );
  if ((ownershipNear || hasRls) && !hasBypassHint) {
    return null;
  }

  const inputLine =
    findFirstLineMatchAcrossSamples(sorted, ID_INPUT_PATTERNS) ??
    (hasBodyId ? findFirstLineMatchAcrossSamples(sorted, BODY_ID_PATTERNS) : null);
  const bypassLine = hasBypassHint ? findFirstLineMatchAcrossSamples(sorted, IDOR_BYPASS_PATTERNS) : null;

  const filepath = sorted[0]?.path ?? "";
  const evidence: CandidateEvidence[] = [];
  if (inputLine) {
    evidence.push({
      filepath: inputLine.filepath,
      startLine: inputLine.line,
      endLine: inputLine.line,
      excerpt: inputLine.text,
      note: "Client-supplied identifier"
    });
  }
  if (queryLine) {
    evidence.push({
      filepath: queryLine.filepath,
      startLine: queryLine.line,
      endLine: queryLine.line,
      excerpt: queryLine.text,
      note: "Query by ID without tenant guard"
    });
  }
  if (bypassLine) {
    evidence.push({
      filepath: bypassLine.filepath,
      startLine: bypassLine.line,
      endLine: bypassLine.line,
      excerpt: bypassLine.text,
      note: "Ownership/authorization bypass flag detected"
    });
  }

  return {
    id: `idor:${filepath}:${queryLine?.line ?? sorted[0]?.startLine ?? 1}`,
    type: "idor",
    summary: "IDOR: object fetched by ID without ownership/tenant validation",
    rationale:
      "Endpoint appears to fetch data by client-provided ID without verifying ownership or tenant membership.",
    filepath,
    evidence: trimEvidence(evidence),
    relatedFileRoles: roles
  };
}

function detectOrgIdTrustCandidateAcrossChunks(
  samples: RepositoryFileSample[],
  roles: FileRole[],
  scopeEvidence?: FileScopeEvidence
): CandidateFinding | null {
  const sorted = [...samples].sort((a, b) => (a.chunkIndex ?? 0) - (b.chunkIndex ?? 0));
  const filepath = sorted[0]?.path ?? "";
  const normalizedPath = normalizePath(filepath);
  const pathForHints = normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`;
  const isServerAction =
    Boolean(scopeEvidence?.isServerAction) ||
    SERVER_ACTION_PATH_PATTERNS.some((pattern) => pattern.test(pathForHints)) ||
    sorted.some((sample) => hasServerActionDirective(sample.content ?? ""));
  const hasRequestJson = matchesAnyAcrossSamples(sorted, REQUEST_JSON_PATTERNS);
  const hasBodyOrg =
    matchesAnyAcrossSamples(sorted, BODY_ORG_PATTERNS) && (hasRequestJson || isServerAction);
  const hasUserIdInput = matchesAnyAcrossSamples(sorted, USER_ID_INPUT_PATTERNS);
  if (!matchesAnyAcrossSamples(sorted, ORG_ID_INPUT_PATTERNS) && !hasBodyOrg && !hasUserIdInput) {
    return null;
  }
  if (!matchesAnyAcrossSamples(sorted, DB_WRITE_PATTERNS)) {
    return null;
  }

  const inputLine =
    findFirstLineMatchAcrossSamples(sorted, ORG_ID_INPUT_PATTERNS) ??
    findFirstLineMatchAcrossSamples(sorted, USER_ID_INPUT_PATTERNS) ??
    (hasBodyOrg ? findFirstLineMatchAcrossSamples(sorted, BODY_ORG_PATTERNS) : null);
  const writeLine = findFirstLineMatchAcrossSamples(sorted, DB_WRITE_PATTERNS);
  if (!writeLine) {
    return null;
  }
  const idLabel = inferTrustedIdentifierLabel(inputLine?.text ?? null);

  const evidence: CandidateEvidence[] = [];
  if (inputLine) {
    evidence.push({
      filepath: inputLine.filepath,
      startLine: inputLine.line,
      endLine: inputLine.line,
      excerpt: inputLine.text,
      note: `Client-provided ${idLabel}`
    });
  }
  if (writeLine) {
    evidence.push({
      filepath: writeLine.filepath,
      startLine: writeLine.line,
      endLine: writeLine.line,
      excerpt: writeLine.text,
      note: "Write operation using request data"
    });
  }

  return {
    id: `orgid-trust:${filepath}:${inputLine?.line ?? writeLine.line}`,
    type: "org_id_trust",
    summary: buildTrustedIdSummary(idLabel),
    rationale: buildTrustedIdRationale(idLabel),
    filepath,
    evidence: trimEvidence(evidence),
    relatedFileRoles: roles
  };
}

function detectFrontendOrgIdTrustCandidateAcrossChunks(
  samples: RepositoryFileSample[],
  roles: FileRole[]
): CandidateFinding | null {
  const sorted = [...samples].sort((a, b) => (a.chunkIndex ?? 0) - (b.chunkIndex ?? 0));
  if (matchesAnyAcrossSamples(sorted, [USE_CLIENT_DIRECTIVE_PATTERN])) {
    return null;
  }
  if (!matchesAnyAcrossSamples(sorted, FRONTEND_ORG_ID_INPUT_PATTERNS)) {
    return null;
  }
  if (!matchesAnyAcrossSamples(sorted, EXTERNAL_CALL_PATTERNS)) {
    return null;
  }

  const inputLine = findFirstLineMatchAcrossSamples(sorted, FRONTEND_ORG_ID_INPUT_PATTERNS);
  const fetchLine = findFirstLineMatchAcrossSamples(sorted, EXTERNAL_CALL_PATTERNS);
  if (!inputLine || !fetchLine) {
    return null;
  }

  const filepath = sorted[0]?.path ?? "";
  const idLabel = inferTrustedIdentifierLabel(inputLine.text);
  const evidence: CandidateEvidence[] = [
    {
      filepath: inputLine.filepath,
      startLine: inputLine.line,
      endLine: inputLine.line,
      excerpt: inputLine.text,
      note: `${idLabel} sourced from URL/search params`
    },
    {
      filepath: fetchLine.filepath,
      startLine: fetchLine.line,
      endLine: fetchLine.line,
      excerpt: fetchLine.text,
      note: `Server-side fetch uses URL ${idLabel}`
    }
  ];

  return {
    id: `orgid-trust-frontend:${filepath}:${inputLine.line}`,
    type: "org_id_trust",
    summary: buildFrontendTrustedIdSummary(idLabel),
    rationale: buildFrontendTrustedIdRationale(idLabel),
    filepath,
    evidence: trimEvidence(evidence),
    relatedFileRoles: roles
  };
}

function findFrontendRoleEvidence(
  files: RepositoryFileSample[],
  assignments: Map<string, FileRoleAssignment>
): { evidence: CandidateEvidence[] } | null {
  for (const file of files) {
    const roles = assignments.get(file.path)?.roles ?? [];
    if (!roles.includes("FRONTEND_PAGE") && !roles.includes("FRONTEND_ADMIN_PAGE")) {
      continue;
    }
    const line = findFirstLineMatch(file.content ?? "", FRONTEND_ROLE_PATTERNS, file.startLine ?? 1);
    if (line) {
      return {
        evidence: [
          {
            filepath: file.path,
            startLine: line.line,
            endLine: line.line,
            excerpt: line.text,
            note: "Frontend role/claim check detected"
          }
        ]
      };
    }
  }
  return null;
}

function findLineMatches(
  content: string,
  patterns: RegExp[],
  startLine: number
): { line: number; text: string }[] {
  if (!content) return [];
  const lines = content.split("\n");
  const matches: { line: number; text: string }[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (patterns.some((pattern) => pattern.test(line))) {
      matches.push({ line: startLine + i, text: line.trim() });
    }
  }
  return matches;
}

function hasPatternNearLine(
  content: string,
  absoluteLine: number,
  startLine: number,
  patterns: RegExp[],
  window = 6
): boolean {
  if (!content) return false;
  const lines = content.split("\n");
  const index = Math.max(0, absoluteLine - startLine);
  const from = Math.max(0, index - window);
  const to = Math.min(lines.length - 1, index + window);
  for (let i = from; i <= to; i += 1) {
    const line = lines[i];
    if (patterns.some((pattern) => pattern.test(line))) {
      return true;
    }
  }
  return false;
}

function findFirstLineMatch(
  content: string,
  patterns: RegExp[],
  startLine: number
): { line: number; text: string } | null {
  if (!content) return null;
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (patterns.some((pattern) => pattern.test(line))) {
      return { line: startLine + i, text: line.trim() };
    }
  }
  return null;
}

function findLogLineWithKeywords(
  content: string,
  startLine: number,
  keywordPatterns: RegExp[]
): { line: number; text: string } | null {
  if (!content) return null;
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (LOG_CALL_PATTERNS.some((pattern) => pattern.test(line)) &&
      keywordPatterns.some((pattern) => pattern.test(line))) {
      return { line: startLine + i, text: line.trim() };
    }
  }
  return null;
}

function matchesAny(content: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(content));
}

function trimEvidence(evidence: CandidateEvidence[]): CandidateEvidence[] {
  return evidence.slice(0, MAX_EVIDENCE_LINES);
}

function dedupeCandidates(candidates: CandidateFinding[]): CandidateFinding[] {
  const seen = new Set<string>();
  const deduped: CandidateFinding[] = [];
  for (const candidate of candidates) {
    const key = `${candidate.type}|${candidate.filepath ?? ""}|${candidate.summary}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(candidate);
  }
  return deduped;
}
