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
  filepath?: string;
  evidence: CandidateEvidence[];
  relatedFileRoles?: FileRole[];
};

export type FileScope =
  | "frontend_ui"
  | "frontend_util"
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
  AUTH_ENDPOINT: ["rate_limiting", "secure_token_handling"],
  WEBHOOK_ENDPOINT: ["signature_verification", "replay_protection"],
  BACKGROUND_JOB: ["input_validation", "least_privilege"],
  FRONTEND_PAGE: [
    "secure_rendering",
    "no_frontend_only_auth",
    "no_sensitive_secrets"
  ],
  FRONTEND_ADMIN_PAGE: ["secure_rendering", "no_frontend_only_auth"],
  MIGRATION: ["no_plaintext_secrets", "secure_rls_policies"],
  SHARED_AUTH_LIB: ["authentication", "secure_token_handling"],
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
const BACKEND_PATH_HINTS = [
  "/backend/",
  "/server/",
  "/api/",
  "/functions/",
  "/edge/",
  "/supabase/",
  "/routes/"
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
  /\bsearchParams\.get\s*\(\s*['"]org(_?id)?['"]\s*\)/i,
  /\bsearchParams\.get\s*\(\s*['"](organization|tenant)(_?id)?['"]\s*\)/i,
  /\bnew\s+URL\s*\([^)]*\)\.searchParams\.get\s*\(\s*['"]org(_?id)?['"]\s*\)/i,
  /\bnew\s+URL\s*\([^)]*\)\.searchParams\.get\s*\(\s*['"](organization|tenant)(_?id)?['"]\s*\)/i,
  /\bheaders\.get\s*\(\s*['"][^'"]*org[^'"]*id['"]\s*\)/i,
  /\b(req|request)\.headers\.get\s*\(\s*['"][^'"]*org[^'"]*id['"]\s*\)/i,
  /\bheaders\.get\s*\(\s*['"][^'"]*(organization|tenant)[^'"]*id['"]\s*\)/i,
  /\b(req|request)\.headers\.get\s*\(\s*['"][^'"]*(organization|tenant)[^'"]*id['"]\s*\)/i
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
const BODY_ID_PATTERNS = [
  /\b(body|data|payload|input)\b[^;\n]{0,20}\.\s*[A-Za-z0-9_]*id\b/i,
  /\b\{[^}]*\b[A-Za-z0-9_]*id\b[^}]*\}\s*=\s*(body|data|payload|input)\b/i
];
const BODY_ORG_PATTERNS = [
  /\b(body|data|payload|input)\b[^;\n]{0,20}\.\s*(org|organization|tenant)(_?id)?\b/i,
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

const DB_WRITE_PATTERNS = [/\.(insert|update|upsert)\s*\(/i, /\.rpc\s*\(/i];

const SENSITIVE_ACTION_PATTERNS = [
  /\blogin\b/i,
  /\bsignin\b/i,
  /\bsignup\b/i,
  /\bregister\b/i,
  /\btoken\b/i,
  /\bpassword\b/i,
  /\breset\b/i,
  /\binvite\b/i,
  /\bcreate\b/i,
  /\bdelete\b/i,
  /\bdestroy\b/i,
  /\brevoke\b/i
];

const DESTRUCTIVE_PATTERNS = [
  /\bdelete\b/i,
  /\bremove\b/i,
  /\bdestroy\b/i,
  /\brevoke\b/i,
  /\bdisable\b/i,
  /\bsuspend\b/i,
  /\.delete\(/i
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

const DESTRUCTIVE_ACTION_HINT_PATTERNS = [
  /\bdelete\b/i,
  /\bremove\b/i,
  /\bdestroy\b/i,
  /\brevoke\b/i,
  /\bdisable\b/i,
  /\bsuspend\b/i
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

const UNBOUNDED_SELECT_PATTERNS = [/\.select\(\s*['"][*]['"]\s*\)/i];
const LIMIT_PATTERNS = [/\.limit\(/i, /\.range\(/i, /\.paginate\(/i, /\.page\(/i];

const EXTERNAL_CALL_PATTERNS = [
  /\bfetch\s*\(/i,
  /\baxios\b/i,
  /\bgot\s*\(/i,
  /\brequest\s*\(/i,
  /\bhttp\.request\s*\(/i,
  /\bhttps\.request\s*\(/i
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

const JWT_DECODE_PATTERNS = [/jwt\.decode\s*\(/i, /decodeJwt\s*\(/i, /parseJwt\s*\(/i];
const JWT_VERIFY_PATTERNS = [/jwt\.verify\s*\(/i, /verifyJwt\s*\(/i, /createVerifier\s*\(/i];

const SQL_INJECTION_PATTERNS = [
  /\b(query|execute|sql)\s*\(.*\+.*\b(req\.|params\.|query\.|body\.)/i,
  /\b(query|execute|sql)\s*\(.*`[^`]*\$\{[^}]*\b(req\.|params\.|query\.|body\.)/i,
  /`[^`]*\b(select|insert|update|delete)\b[^`]*\$\{[^}]*\b(req\.|params\.|query\.|body\.)/i,
  /`[^`]*\b(select|insert|update|delete)\b[^`]*\$\{[^}]+}/i,
  /\b(select|insert|update|delete)\b[^\n]{0,120}\+[^\n]{0,120}\b(req\.|params\.|query\.|body\.)/i
];

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
  /\bconsole\.(log|info|warn|error)\s*\(/i,
  /\blogger\.(info|warn|error|debug|log)\s*\(/i,
  /\blog\.(info|warn|error|debug)\s*\(/i
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

const MAX_CANDIDATES = 60;
const MAX_EVIDENCE_LINES = 2;
const DEFAULT_CANDIDATE_PRIORITY = 10;
const CANDIDATE_PRIORITY: Record<string, number> = {
  sql_injection: 120,
  command_injection: 120,
  dangerous_html_render: 115,
  permissive_cors: 110,
  missing_webhook_signature: 110,
  webhook_signature_missing: 110,
  webhook_code_execution: 105,
  jwt_validation_bypass: 105,
  weak_jwt_secret: 100,
  weak_token_generation: 95,
  idor: 95,
  org_id_trust: 95,
  unsafe_query_builder: 90,
  debug_auth_leak: 85,
  anon_key_bearer: 85,
  missing_bearer_token: 80,
  sensitive_logging: 75,
  command_output_logging: 85,
  unbounded_query: 70,
  missing_timeout: 65,
  frontend_only_authorization: 75,
  missing_rate_limiting: 45,
  missing_audit_logging: 65,
  frontend_login_rate_limit: 40
};

const CANDIDATE_RULE_GATES: Record<string, RuleScopeGate> = {
  sql_injection: {
    allowedScopes: ["backend_endpoint"],
    requiresEvidence: { endpointContext: true, sinkTypes: ["sql.query", "db.query"] }
  },
  unsafe_query_builder: {
    allowedScopes: ["backend_endpoint"],
    requiresEvidence: { endpointContext: true, sinkTypes: ["db.query"] }
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
    allowedScopes: ["backend_endpoint"],
    requiresEvidence: { endpointContext: true, sinkTypes: ["db.write"] }
  },
  debug_auth_leak: {
    allowedScopes: ["backend_endpoint"],
    requiresEvidence: { endpointContext: true }
  },
  missing_rate_limiting: {
    allowedScopes: ["backend_endpoint"],
    requiresEvidence: { endpointContext: true, sensitiveAction: true }
  },
  missing_audit_logging: {
    allowedScopes: ["backend_endpoint"],
    requiresEvidence: { endpointContext: true, destructiveAction: true }
  },
  missing_webhook_signature: {
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
    allowedScopes: ["backend_shared"],
    requiresEvidence: { sharedContext: true }
  },
  weak_jwt_secret: {
    allowedScopes: ["backend_shared"],
    requiresEvidence: { sharedContext: true }
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
    allowedScopes: ["backend_endpoint"],
    requiresEvidence: { endpointContext: true, sinkTypes: ["http.request", "exec"] }
  },
  dangerous_html_render: {
    allowedScopes: ["frontend_ui"],
    requiresEvidence: { sinkTypes: ["template.render"] }
  },
  frontend_only_authorization: {
    allowedScopes: ["frontend_ui", "frontend_util"]
  },
  anon_key_bearer: {
    allowedScopes: ["frontend_ui", "frontend_util"]
  },
  missing_bearer_token: {
    allowedScopes: ["frontend_ui", "frontend_util"]
  },
  frontend_login_rate_limit: {
    allowedScopes: ["frontend_ui"]
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
    allowedScopes: ["backend_endpoint"],
    requiresEvidence: { endpointContext: true, destructiveAction: true }
  },
  secure_token_handling: {
    allowedScopes: ["backend_endpoint", "backend_shared"]
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
    allowedScopes: ["backend_endpoint"],
    requiresEvidence: { sinkTypes: ["http.request", "exec"] }
  },
  secure_rendering: {
    allowedScopes: ["frontend_ui"]
  },
  no_frontend_only_auth: {
    allowedScopes: ["frontend_ui", "frontend_util"]
  },
  no_sensitive_secrets: {
    allowedScopes: ["frontend_ui", "frontend_util"]
  }
};

function ruleGateAllows(
  ruleId: string,
  scope: FileScope,
  evidence: FileScopeEvidence | undefined,
  gateMap: Record<string, RuleScopeGate>
): boolean {
  const gate = gateMap[ruleId];
  if (!gate) return true;
  if (!gate.allowedScopes.includes(scope)) return false;
  if (!gate.requiresEvidence) return true;
  if (!evidence) return false;
  return evidenceMatchesGate(gate.requiresEvidence, evidence);
}

function evidenceMatchesGate(gate: RuleEvidenceGate, evidence: FileScopeEvidence): boolean {
  if (gate.endpointContext && !evidence.isEndpoint) return false;
  if (gate.sharedContext && !evidence.isShared) return false;
  if (gate.sensitiveAction && evidence.sensitiveActionHints.length === 0) return false;
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
  if (!gate.allowedScopes.includes(scope)) {
    mismatches.push("scope");
  }
  if (!gate.requiresEvidence) {
    return mismatches;
  }
  if (!evidence) {
    mismatches.push("evidence");
    return mismatches;
  }
  if (gate.requiresEvidence.endpointContext && !evidence.isEndpoint) {
    mismatches.push("endpoint");
  }
  if (gate.requiresEvidence.sharedContext && !evidence.isShared) {
    mismatches.push("shared");
  }
  if (gate.requiresEvidence.sensitiveAction && evidence.sensitiveActionHints.length === 0) {
    mismatches.push("sensitive");
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
  const scopeValue = scope ?? "unknown";
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
  evidence: FileScopeEvidence | undefined
): string[] {
  if (!requiredControls || requiredControls.length === 0) return [];
  const scopeValue = scope ?? "unknown";
  return requiredControls.filter((control) =>
    ruleGateAllows(control, scopeValue, evidence, CONTROL_RULE_GATES)
  );
}

export function deriveFileRoleAssignments(files: RepositoryFileSample[]): FileRoleAssignment[] {
  return files.map((file) => {
    const roles = classifyFileRoles(file);
    const requiredControls = deriveRequiredControls(roles);
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
    const backendCandidate = isLikelyBackendFile(file.path, roles);
    const scopeAssignment = scopeByPath.get(normalizePath(file.path));
    const scopeValue = scopeAssignment?.scope ?? "unknown";
    const scopeEvidence = scopeAssignment?.evidence;
    const canRunRule = (ruleId: string) =>
      ruleGateAllows(ruleId, scopeValue, scopeEvidence, CANDIDATE_RULE_GATES);

    if (isEndpointRole(roles) || backendCandidate) {
      if (canRunRule("idor")) {
        const idor = detectIdorCandidate(file, roles);
        if (idor) {
          candidates.push(idor);
        }
      }

      if (canRunRule("org_id_trust")) {
        const orgTrust = detectOrgIdTrustCandidate(file, roles);
        if (orgTrust) {
          candidates.push(orgTrust);
        }
      }

      if (canRunRule("sql_injection")) {
        const sqlLine = findFirstLineMatch(content, SQL_INJECTION_PATTERNS, startLine);
        if (sqlLine) {
          candidates.push({
            id: `sql-injection:${file.path}:${sqlLine.line}`,
            type: "sql_injection",
            summary: "SQL injection via raw SQL string concatenation",
            rationale:
              "Raw SQL appears to include user-controlled input via string concatenation or template interpolation.",
            filepath: file.path,
            evidence: [
              {
                filepath: file.path,
                startLine: sqlLine.line,
                endLine: sqlLine.line,
                excerpt: sqlLine.text,
                note: "Raw SQL with interpolated request input"
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
      hasJwtDecodeWithoutVerify(content)
    ) {
      const line = findFirstLineMatch(content, JWT_DECODE_PATTERNS, startLine);
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
            note: "JWT decode without verify"
          }
        ],
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
      if (sensitiveLogLine) {
        candidates.push({
          id: `sensitive-log:${file.path}:${sensitiveLogLine.line}`,
          type: "sensitive_logging",
          summary: "Sensitive data (plaintext tokens/secrets) written to logs",
          rationale: "Logging statements appear to include tokens, secrets, or credentials.",
          filepath: file.path,
          evidence: [
            {
              filepath: file.path,
              startLine: sensitiveLogLine.line,
              endLine: sensitiveLogLine.line,
              excerpt: sensitiveLogLine.text,
              note: "Sensitive value logged"
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

    if (canRunRule("frontend_only_authorization") && roles.includes("FRONTEND_ADMIN_PAGE")) {
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

    if (canRunRule("missing_rate_limiting") && isEndpointRole(roles)) {
      const sensitive = isSensitiveAction(content, roles);
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

    if (canRunRule("missing_audit_logging") && roles.includes("ADMIN_ENDPOINT") && isDestructiveAction(content, file.path)) {
      const auditDisabled = matchesAny(content, AUDIT_DISABLE_PATTERNS);
      if (!hasAuditLogging(content) || auditDisabled) {
        const line = findFirstLineMatch(content, DESTRUCTIVE_PATTERNS, startLine);
        candidates.push({
          id: `missing-audit-log:${file.path}:${line?.line ?? startLine}`,
          type: "missing_audit_logging",
          summary: "No audit log recorded for destructive admin action",
          rationale:
            "Admin endpoint appears to perform destructive actions without emitting audit logs that capture actor + target.",
          filepath: file.path,
          evidence: [
            {
              filepath: file.path,
              startLine: line?.line ?? startLine,
              endLine: line?.line ?? startLine,
              excerpt: line?.text,
              note: "Destructive action without audit logging"
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

    if (
      canRunRule("missing_timeout") &&
      (hasExternalCall(content) || roles.includes("HIGH_RISK_EXEC")) &&
      !hasTimeout(content)
    ) {
      const line = findFirstLineMatch(content, [...EXTERNAL_CALL_PATTERNS, ...EXEC_PATTERNS], startLine);
      candidates.push({
        id: `missing-timeout:${file.path}:${line?.line ?? startLine}`,
        type: "missing_timeout",
        summary: "No timeout on external call or subprocess",
        rationale:
          "External requests or subprocesses appear to run without a timeout or abort signal.",
        filepath: file.path,
        evidence: [
          {
            filepath: file.path,
            startLine: line?.line ?? startLine,
            endLine: line?.line ?? startLine,
            excerpt: line?.text,
            note: "External call or exec without timeout"
          }
        ],
        relatedFileRoles: roles
      });
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
    const backendCandidate = isLikelyBackendFile(path, roles);
    if (!isEndpointRole(roles) && !backendCandidate) {
      continue;
    }
    if (canRunRule("idor")) {
      const idor = detectIdorCandidateAcrossChunks(group, roles);
      if (idor) {
        candidates.push(idor);
      }
    }
    if (canRunRule("org_id_trust")) {
      const orgTrust = detectOrgIdTrustCandidateAcrossChunks(group, roles);
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
  const base = lowerPath.split("/").pop() ?? "";
  const ext = base.includes(".") ? base.split(".").pop() ?? "" : "";
  const content = file.content ?? "";
  const isFrontend =
    FRONTEND_EXTENSIONS.has(ext) || FRONTEND_PATH_HINTS.some((hint) => lowerPath.includes(hint));

  if (lowerPath.includes("/migrations/") || lowerPath.includes("/migration/")) {
    roles.add("MIGRATION");
  }

  if (!isFrontend && ADMIN_PATH_PATTERNS.some((pattern) => pattern.test(lowerPath) || pattern.test(base))) {
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

function deriveRequiredControls(roles: FileRole[]): string[] {
  const controls = new Set<string>();
  for (const role of roles) {
    for (const control of REQUIRED_CONTROLS[role] ?? []) {
      controls.add(control);
    }
  }
  return Array.from(controls);
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
  isBackendEndpointHint: boolean;
  isBackendShared: boolean;
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
  const base = lowerPath.split("/").pop() ?? "";
  const ext = base.includes(".") ? base.split(".").pop() ?? "" : "";
  const isConfig = isConfigPath(lowerPath, base, ext);
  const isDocsTests = isDocsTestsPath(lowerPath, base, ext);
  const isFrontend =
    FRONTEND_PATH_HINTS.some((hint) => lowerPath.includes(hint)) ||
    FRONTEND_UI_EXTENSIONS.has(ext);
  const isFrontendUi =
    isFrontend &&
    (FRONTEND_UI_EXTENSIONS.has(ext) ||
      FRONTEND_UI_PATH_HINTS.some((hint) => lowerPath.includes(hint)));
  const isFrontendUtil =
    isFrontend && FRONTEND_UTIL_PATH_HINTS.some((hint) => lowerPath.includes(hint));
  const isBackend =
    BACKEND_PATH_HINTS.some((hint) => lowerPath.includes(hint)) ||
    BACKGROUND_PATH_HINTS.some((hint) => lowerPath.includes(hint));
  const isBackendShared = BACKEND_SHARED_PATH_HINTS.some((hint) => lowerPath.includes(hint));
  const isBackendEndpointHint =
    !isBackendShared && BACKEND_ENDPOINT_PATH_HINTS.some((hint) => lowerPath.includes(hint));

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
    isBackendEndpointHint,
    isBackendShared
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
  const sensitiveActionHints = collectSensitiveActionHints(body);
  const headerIsEndpoint = header.hasHeader ? isEndpointEntryType(header.entryPointType) : false;
  const contentIsEndpoint = header.hasHeader ? false : matchesAny(body, ROUTER_HANDLER_PATTERNS);
  const pathIsEndpoint = header.hasHeader ? false : pathHints.isBackendEndpointHint;
  const isEndpoint = header.hasHeader ? headerIsEndpoint : contentIsEndpoint || pathIsEndpoint;
  const isShared = pathHints.isBackendShared || isSharedEntryType(header.entryPointType);

  return {
    isEndpoint,
    isShared,
    isConfig: pathHints.isConfig,
    entryPointHints,
    sinks,
    sensitiveActionHints,
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

  return {
    isEndpoint,
    isShared,
    isConfig,
    entryPointHints,
    sinks,
    sensitiveActionHints,
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
  if (header.hasHeader) {
    return uniqueList(header.sinks);
  }

  const hints: string[] = [];
  if (matchesAny(content, DB_WRITE_PATTERNS)) {
    hints.push("db.write");
  }
  if (matchesAny(content, DB_ID_PATTERNS) || matchesAny(content, QUERY_BUILDER_PATTERNS)) {
    hints.push("db.query");
  }
  if (matchesAny(content, SQL_INJECTION_PATTERNS)) {
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
  return uniqueList(hints);
}

function collectSensitiveActionHints(content: string): string[] {
  const hints: string[] = [];
  if (AUTH_ACTION_HINT_PATTERNS.some((pattern) => pattern.test(content))) {
    hints.push("auth");
  }
  if (DESTRUCTIVE_ACTION_HINT_PATTERNS.some((pattern) => pattern.test(content))) {
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
  const base = lowerPath.split("/").pop() ?? "";
  const ext = base.includes(".") ? base.split(".").pop() ?? "" : "";
  if (roles.includes("FRONTEND_PAGE") || roles.includes("FRONTEND_ADMIN_PAGE")) {
    return false;
  }
  if (FRONTEND_EXTENSIONS.has(ext)) {
    return false;
  }
  return BACKEND_PATH_HINTS.some((hint) => lowerPath.includes(hint));
}

function hasHighRiskExec(content: string): boolean {
  return EXEC_PATTERNS.some((pattern) => pattern.test(content));
}

function hasRoleCheck(content: string): boolean {
  return ROLE_CHECK_PATTERNS.some((pattern) => pattern.test(content));
}

function hasRateLimit(content: string): boolean {
  return RATE_LIMIT_PATTERNS.some((pattern) => pattern.test(content));
}

function isSensitiveAction(content: string, roles: FileRole[]): boolean {
  if (roles.includes("AUTH_ENDPOINT")) {
    return true;
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

function hasUnboundedSelect(content: string): boolean {
  if (!UNBOUNDED_SELECT_PATTERNS.some((pattern) => pattern.test(content))) {
    return false;
  }
  return !LIMIT_PATTERNS.some((pattern) => pattern.test(content));
}

function hasExternalCall(content: string): boolean {
  return EXTERNAL_CALL_PATTERNS.some((pattern) => pattern.test(content)) ||
    EXEC_PATTERNS.some((pattern) => pattern.test(content));
}

function hasTimeout(content: string): boolean {
  return TIMEOUT_PATTERNS.some((pattern) => pattern.test(content));
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

function hasWebhookSignatureCheck(content: string): boolean {
  return WEBHOOK_SIGNATURE_PATTERNS.some((pattern) => pattern.test(content));
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

function detectOrgIdTrustCandidate(file: RepositoryFileSample, roles: FileRole[]): CandidateFinding | null {
  const content = file.content ?? "";
  const startLine = file.startLine ?? 1;

  const hasRequestJson = matchesAny(content, REQUEST_JSON_PATTERNS);
  const hasBodyOrg = hasRequestJson && matchesAny(content, BODY_ORG_PATTERNS);
  if (!matchesAny(content, ORG_ID_INPUT_PATTERNS) && !hasBodyOrg) {
    return null;
  }
  if (!matchesAny(content, DB_WRITE_PATTERNS)) {
    return null;
  }

  const inputLine =
    findFirstLineMatch(content, ORG_ID_INPUT_PATTERNS, startLine) ??
    (hasBodyOrg ? findFirstLineMatch(content, BODY_ORG_PATTERNS, startLine) : null);
  const writeLine = findFirstLineMatch(content, DB_WRITE_PATTERNS, startLine);

  const evidence: CandidateEvidence[] = [];
  if (inputLine) {
    evidence.push({
      filepath: file.path,
      startLine: inputLine.line,
      endLine: inputLine.line,
      excerpt: inputLine.text,
      note: "Client-provided orgId"
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
    summary: "Trusting client-provided orgId for tenant routing",
    rationale:
      "orgId appears to be taken from request input and used in a write path without server-side derivation.",
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
  roles: FileRole[]
): CandidateFinding | null {
  const sorted = [...samples].sort((a, b) => (a.chunkIndex ?? 0) - (b.chunkIndex ?? 0));
  const hasRequestJson = matchesAnyAcrossSamples(sorted, REQUEST_JSON_PATTERNS);
  const hasBodyOrg = hasRequestJson && matchesAnyAcrossSamples(sorted, BODY_ORG_PATTERNS);
  if (!matchesAnyAcrossSamples(sorted, ORG_ID_INPUT_PATTERNS) && !hasBodyOrg) {
    return null;
  }
  if (!matchesAnyAcrossSamples(sorted, DB_WRITE_PATTERNS)) {
    return null;
  }

  const inputLine =
    findFirstLineMatchAcrossSamples(sorted, ORG_ID_INPUT_PATTERNS) ??
    (hasBodyOrg ? findFirstLineMatchAcrossSamples(sorted, BODY_ORG_PATTERNS) : null);
  const writeLine = findFirstLineMatchAcrossSamples(sorted, DB_WRITE_PATTERNS);
  if (!writeLine) {
    return null;
  }

  const filepath = sorted[0]?.path ?? "";
  const evidence: CandidateEvidence[] = [];
  if (inputLine) {
    evidence.push({
      filepath: inputLine.filepath,
      startLine: inputLine.line,
      endLine: inputLine.line,
      excerpt: inputLine.text,
      note: "Client-provided orgId"
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
    summary: "Trusting client-provided orgId for tenant routing",
    rationale:
      "orgId appears to be taken from request input and used in a write path without server-side derivation.",
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
