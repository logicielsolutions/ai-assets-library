---
name: owasp-top-10
description: >
  OWASP Top 10:2025 security checklist for writing, reviewing, and testing code.
  Use this skill ANY time the user is writing new code, reviewing code, writing tests,
  building APIs or endpoints, setting up authentication or authorization, handling user input,
  configuring infrastructure (any cloud, any database), managing secrets, working with
  JWTs or sessions, deserializing data, parsing XML/JSON, uploading files, wiring up CI/CD,
  adding dependencies, or making any change that touches a security-relevant code path.
  Apply proactively — even on small features, refactors, or "quick fixes" — to catch broken
  access control, injection, weak crypto, supply-chain risks, misconfigurations, and the
  other Top 10 categories before they ship. Do not wait for the user to say "review for
  security" — assume every coding task could introduce one of these classes and run the
  applicable checks silently. Triggers: writing endpoints, queries, login flows, file
  uploads, role checks, password handling, encryption code, dependency additions, Dockerfiles,
  Terraform/CloudFormation, GitHub Actions, error handlers, deserialization, JWT verify
  calls, and any test that touches an authenticated route. Also triggers on the phrase
  "OWASP", "security review", "pentest", "vuln", or "harden".
---

# OWASP Top 10:2025 Security Skill

Catch the ten most common classes of application security failure before they reach a pull request. This skill applies during day-to-day coding and review — it is not a once-a-quarter audit checklist.

Source: [OWASP Top 10:2025](https://owasp.org/www-project-top-ten/).

---

## The Mental Model

Three principles cover most of the Top 10:

1. **Server-side, every time.** The client is untrusted. UI controls (disabled buttons, hidden menus, client-side role checks) are usability features, not security controls. Every authorization decision, validation, and rate limit must run on the server.
2. **Deny by default.** Every endpoint, file, bucket, IAM role, IV, and parser starts with "no" and is opened only for the specific case that needs it. The opposite — "allow, then try to block" — fails silently.
3. **Trust the boundaries.** When data crosses from untrusted to trusted (user → server, package registry → build, browser → DB), apply the appropriate boundary control: parameterize, validate, escape, verify signature, pin algorithm, fail closed.

If a piece of code is doing any of those things wrong, it has a Top 10 bug. Find it before the PR lands.

---

## Top-Priority Red Flags

Stop writing or reviewing if you see any of these patterns. Each maps to an OWASP category — see the reference file in parentheses for depth.

| # | Red flag | Category |
|---|---|---|
| 1 | SQL/HQL/Mongo query built by string concatenation with user input | A05 Injection ([05](references/05-injection.md)) |
| 2 | `jwt.verify(token, key)` without an explicit `algorithms` allowlist | A07 Auth ([07](references/07-authentication.md)) |
| 3 | Authorization decision made only in the frontend, or only via "is the menu visible" | A01 Access Control ([01](references/01-broken-access-control.md)) |
| 4 | Object lookup by ID from the request without an ownership check (`Order.findById(req.params.id)` returning to the caller) | A01 IDOR ([01](references/01-broken-access-control.md)) |
| 5 | `exec()`, `system()`, `passthru()`, `Runtime.exec`, `child_process.exec` with any interpolated user value | A05 Command injection ([05](references/05-injection.md)) |
| 6 | `dangerouslySetInnerHTML`, `v-html`, `\| safe`, `html_safe`, or template `{{...}}` rendering user-supplied HTML | A05 XSS ([05](references/05-injection.md)) |
| 7 | XML parser created with library defaults and fed untrusted XML (XXE) | A02/A05 ([02](references/02-security-misconfiguration.md)) |
| 8 | MD5 or SHA-1 used for anything called "secure", "auth", "hash for storage" | A04 Crypto ([04](references/04-cryptographic-failures.md)) |
| 9 | Password stored with anything other than Argon2 / scrypt / bcrypt / PBKDF2 (with a current work factor) | A04 Password storage ([04](references/04-cryptographic-failures.md)) |
| 10 | `try { ... } catch (e) { /* swallow */ }` on a security-sensitive operation, or a permission check that "fails open" | A10 Exceptional conditions ([10](references/10-exceptional-conditions.md)) |
| 11 | New dependency added without checking the exact spelling against the official registry, or pinned to a floating tag (`latest`, `^`, `~`) on a security-sensitive package | A03 Supply chain ([03](references/03-supply-chain.md)) |
| 12 | Stack traces, framework versions, or raw DB errors returned to the client | A02 Misconfig ([02](references/02-security-misconfiguration.md)) |
| 13 | Secret literal in source, config file, Dockerfile, or CI workflow | A02/A03 ([02](references/02-security-misconfiguration.md)) |
| 14 | Object storage bucket, managed-DB project, or DB cluster created without an explicit deny-public policy | A02 Cloud misconfig ([02](references/02-security-misconfiguration.md)) |
| 15 | Deserialization of untrusted bytes (Java `ObjectInputStream`, Python `pickle.loads`, PHP `unserialize`, Node `node-serialize`) | A08 Integrity ([08](references/08-integrity.md)) |
| 16 | Authentication or authorization event with no log line, or a log line containing the password / token / PII | A09 Logging ([09](references/09-logging-alerting.md)) |
| 17 | New endpoint with no rate limit, no input length cap, and no auth requirement | A06 Design / A10 ([06](references/06-insecure-design.md)) |

If any red flag fires, name it explicitly in the response — don't quietly fix it without telling the user, because the pattern likely exists elsewhere in the codebase.

---

## Workflow

### When writing new code

Before writing the function body, ask in your head:

1. **Who is allowed to call this?** Write the authorization check as the first line of the handler, not the last. If there is no check yet, write `// TODO: authz` and stop until it's resolved.
2. **What untrusted input does it accept?** For each parameter, decide the validator (type, length, allowed charset, ownership of referenced IDs).
3. **What interpreter does the data reach?** SQL → parameterized. Shell → don't use the shell; use the argv form of `execFile` / `proc_open`. HTML → escape by default. XML → parser with DTD off. LDAP → escaped DN. Mongo → typed query object, never `$where` with user input.
4. **What does it write?** Log the security-relevant event (success and failure) with user ID and request ID, but never with the credential itself.
5. **What happens on error?** Catch where it occurs; on a security check failure, fail closed (deny, rollback, do not retry).

### When reviewing code

Scan the diff for the red flags table above, then walk the change with these questions:

- **Authz**: is there one check, in one place, that the new code actually goes through? Or is it scattered / missing / client-only?
- **Input**: every `req.body`, `req.query`, `req.params`, `$_POST`, `$_GET`, `RequestParameter` — what validates it, and where does it land?
- **Interpreter**: every place a string becomes a query, a command, HTML, or a deserialized object — is the boundary safe?
- **Errors**: every `catch`, every default branch, every `else` — does it fail closed and log? Or does it return success-ish?
- **Crypto**: any new hash, signature, encryption, IV, or random number — is it from a vetted library with current parameters?
- **Logs**: does the change log the right events at the right level, and does it avoid logging secrets / PII?
- **Dependencies**: every new line in `package.json` / `composer.json` / `requirements.txt` — exact spelling matches the canonical name, pinned version, and added by an actual person not a copy-paste from a tutorial?

### When writing tests

Functional access-control tests are a required part of the Top 10 defense (A01). For every new authenticated route, write at minimum:

- A test that the **owner** can access their own resource.
- A test that **another user** cannot access it (returns 403/404, not 200 with empty body).
- A test that an **unauthenticated** request is rejected.
- A test that a **malformed / oversize / wrong-type** payload is rejected with a 4xx and no stack trace.

For high-value flows (payments, role changes, password reset, MFA enrollment) also add:

- A rate-limit test (101st request in a minute is rejected).
- A test that an interrupted transaction rolls back (debit without credit is not possible).
- A test that the audit log line is written.

See [references/testing-checklist.md](references/testing-checklist.md) for a fuller suite.

### When configuring infrastructure / CI

- IaC (Terraform, CloudFormation, CDK, Pulumi) scanned in CI by Checkov / tfsec / Trivy before merge.
- Container base images pinned by digest, not tag.
- Object storage buckets: deny-public by default; an explicit, reviewed exception only for public assets.
- Identity / IAM: roles per service, no wildcard `Action: "*"` or `Resource: "*"` outside of trust policies.
- Secrets: a managed secret store (cloud-provider secret manager, HashiCorp Vault, etc.). Never in env files committed to git, never in CI logs.
- Audit / network-flow logs retained per a defined retention policy (commonly 12 months baseline, 24+ months for security-critical streams).
- CI: pinned by commit SHA for third-party actions/plugins, secrets scoped per environment, branch protection on default branch.

See [references/stack-aws-infra.md](references/stack-aws-infra.md) for an AWS-flavored worked example.

---

## Quick Reference: The Ten Categories

| # | Category | One-line trigger to read the reference | File |
|---|---|---|---|
| A01 | Broken Access Control | Touching auth, roles, ownership, JWT, SSRF, file path | [01](references/01-broken-access-control.md) |
| A02 | Security Misconfiguration | Touching configs, headers, defaults, XML, cloud perms | [02](references/02-security-misconfiguration.md) |
| A03 | Software Supply Chain Failures | Adding/upgrading deps, CI/CD changes, lock files | [03](references/03-supply-chain.md) |
| A04 | Cryptographic Failures | Hashing, encryption, IVs, TLS, keys, passwords | [04](references/04-cryptographic-failures.md) |
| A05 | Injection | SQL, NoSQL, OS commands, XSS, XXE, LDAP, prompt | [05](references/05-injection.md) |
| A06 | Insecure Design | New feature, business logic, multi-tenant, threat modeling | [06](references/06-insecure-design.md) |
| A07 | Authentication Failures | Login, MFA, sessions, JWT verify, password reset | [07](references/07-authentication.md) |
| A08 | Software or Data Integrity Failures | Deserialize, sign, verify, update channel | [08](references/08-integrity.md) |
| A09 | Security Logging & Alerting Failures | Log lines for auth/access/payment, alert thresholds | [09](references/09-logging-alerting.md) |
| A10 | Mishandling of Exceptional Conditions | Try/catch, rollback, fail-closed, timeouts | [10](references/10-exceptional-conditions.md) |

Read the reference file in full when the work touches its area. Cite the category in PR descriptions and review comments — it gives the reader the same vocabulary.

---

## Stack-Specific Notes

OWASP categories play out differently in each language and framework. The `references/` folder ships three **example** stack files showing the *kinds* of stack-specific guidance to write — they cover different surface areas (one app-layer + relational DB, one app-layer + NoSQL + frontend, one cloud-infra), so don't expect identical sections across them:

- [`references/stack-php-mysql.md`](references/stack-php-mysql.md) — PDO parameterization, template escaping, Phar deserialization, session config, password storage for PHP + relational DB.
- [`references/stack-node-mongo.md`](references/stack-node-mongo.md) — NoSQL injection (`$where`, type-juggling), Express middleware order, JWT verification, React XSS, CSP for Node.js + MongoDB + React.
- [`references/stack-aws-infra.md`](references/stack-aws-infra.md) — S3 BlockPublicAccess, IAM least-privilege, CloudTrail / Flow Logs / GuardDuty, Secrets Manager for AWS infrastructure.

**For your project:** delete any example files that don't apply, then add a `references/stack-<your-stack>.md` for your own stack. The shape that works well: vulnerable example → fixed example → stack-idiomatic mitigations → "patterns to audit when reviewing PRs" → tools to run in CI. Reference it from this section.

---

## How to Use the references/

The SKILL.md gives you the framework. The reference files give you the depth — code-level examples, specific library calls, and per-stack pitfalls. Open a reference when:

- The current task clearly falls in one of the ten categories (read that category's file).
- You see one of the red flags and want to confirm the fix pattern.
- You're writing tests and need the canonical test cases for that category.
- The user asks "is this safe?" or "what could go wrong here?" — read the most relevant 1–2 references before answering.

Do not bulk-load all 10 references for an ordinary task. Progressive disclosure is the design.

---

## When You Find a Vulnerability

If you find an OWASP-class issue in existing code while doing unrelated work:

1. **Name the category explicitly** (e.g., "this looks like A01 Broken Access Control / IDOR").
2. **Don't silently rewrite it** as part of the unrelated change — that hides the issue from review history.
3. **Surface it to the user** with a short description, the line, and the fix.
4. Recommend filing a separate ticket (Jira, GitHub Issue, Linear, etc.) so the finding is tracked and triaged through the team's normal vulnerability workflow.

The goal is not to ship the fix in the same PR; it's to make sure the finding is recorded and triaged.

---

## Maintenance

This skill is based on OWASP Top 10:2025. When the list changes (typically every 3–4 years), update the category names and the red-flag table. When a new attack class becomes common in the wild (e.g., prompt injection, model supply-chain attacks), add it to the relevant reference file rather than waiting for the next OWASP cycle.
