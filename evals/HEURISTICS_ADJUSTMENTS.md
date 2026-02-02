# Heuristic Adjustment Notes (Eval Sanity Check)

## What broke after comment removal

After the vulnerability callout comments were removed from eval fixtures, the
`evals-sanity-check` repo stopped producing a SQL injection finding. The scan
log showed `sql_injection` failing the rule gate due to missing `sql.query`
sink evidence.

## Why heuristics may have relied on comments

`sql.query` sink evidence is currently derived from content matches on:
- `SQL_INJECTION_PATTERNS`
- `RAW_SQL_HELPER_PATTERNS` (matches phrases like "raw sql", "unsafe sql",
  and "sql helper")

Those phrases are frequently found in comments rather than executable code.
Once comments were removed, the sink hint disappeared, which blocked
`sql_injection` from being considered at all.

Separately, a helper that executes `client.query(sql)` does not trip the
current `SQL_INJECTION_PATTERNS` unless the file also contains an inline SQL
string with concatenation or template interpolation.

## Broader comment dependence (other rules)

Several heuristics operate on raw file text without stripping comments. That
means vulnerability callout comments can satisfy rule gates or hint patterns
even when the executable code does not contain those signals. Removing the
comments then removes the signals and can suppress findings.

Examples of comment-sensitive patterns (non-exhaustive):
- **Rate limiting / lockout**: matches words like "rate limit", "throttle",
  "lockout", "brute force". A comment such as "No rate limiting" can satisfy
  the hint patterns without any code that enforces or checks limits.
- **Audit logging**: matches "audit log" or "audit logging". A comment that
  explains missing audits can be misread as evidence.
- **Timeouts**: matches "timeout" tokens. Comments describing missing timeouts
  can trip or suppress the heuristic.
- **Webhook signature / config integrity**: matches "webhook" + "signature"
  or "config integrity" phrases, which are common in callout comments.
- **Debug auth leak**: matches "debug", "auth", "headers", "session", "jwt".
  Descriptive comments can create false context.
- **Org/ID trust and ownership**: patterns scan for "orgId", "userId",
  "tenant", "ownership" words, which are often present in explanations.
- **Sensitive logging**: token-based matches ("token", "secret", "password")
  can be hit in comments even if logs are absent.

This is why comment-based fixture markers are risky: they can both cause
false positives (comment-only evidence) and false negatives (removing comments
eliminates the only matching tokens).

## Suggested heuristic adjustments

1) **Detect SQL sinks from APIs, not text tags**
   - Recognize calls like `client.query(...)`, `db.execute(...)`,
     `pool.query(...)`, `prisma.$queryRawUnsafe(...)`, `knex.raw(...)`, etc.
   - Add these to sink discovery so `sql.query` does not depend on keyword
     phrases.

2) **Add light dataflow for raw SQL strings**
   - If `query/execute` receives a variable, look for nearby assignments of
     that variable that use string concatenation or template literals.
   - This captures `const sql = \`select ... ${input}\`; client.query(sql);`.

3) **Treat keyword phrases as low-confidence hints**
   - Keep `RAW_SQL_HELPER_PATTERNS` only as a fallback signal and avoid
     counting matches inside comments.

4) **Strip or de-weight comments for all keyword heuristics**
   - Avoid treating comment-only matches as evidence for rule gates.
   - If comments are kept, count them as weak signals that must be supported
     by code tokens (AST or token-based checks).

5) **Require at least one code-level indicator per rule**
   - Example: "missing rate limiting" should require an endpoint + sensitive
     action + no detected limiter usage, not just the phrase "no rate limit".
   - Apply the same pattern for audit logging, lockout, webhook verification,
     and debug leaks.

6) **Keep the SQL pattern checks, but scope them to code tokens**
   - The current template/concatenation patterns are useful, but they should
     not depend on comments to activate sink detection.

## Fixture note

The `evals-sanity-check` fixture now includes an inline SQL template in code
to ensure the `sql_injection` rule is exercised without relying on comment
text.
