# A02:2025 — Security Misconfiguration

Moved from #5 in 2021 to #2 in 2025. The class isn't exotic — it's the gap between "we built something secure" and "we deployed it with the settings that ship by default." 100% of tested applications have at least one. In 2025 the surface area includes Terraform, Kubernetes manifests, GitHub Actions, container images, and cloud IAM — not just web server settings.

---

## Sub-classes to watch for

### Default credentials

If the application, framework, or service has a default admin account, it must be changed before reaching any environment beyond local dev. Audit: `admin/admin`, `root/root`, `postgres/postgres`, MongoDB without `--auth`, Redis without `requirepass`.

### Unnecessary features enabled

- Sample apps and demo routes left in the build.
- Directory listing on the web server.
- Test frameworks, debug toolbars, profilers reachable in production.
- Open management ports (Kibana, RabbitMQ admin, Mongo Express) on public IPs.

If the production image contains a binary, route, or page that has no production use, it's a target.

### Stack-trace leakage

**Vulnerable (Express):**
```js
app.use((err, req, res, next) => {
  res.status(500).send(err.stack);   // ← leaks framework, file paths, query that failed
});
```

**Fixed:**
```js
app.use((err, req, res, next) => {
  logger.error({ err, requestId: req.id, userId: req.user?.id });
  res.status(500).json({ error: 'Internal error', requestId: req.id });
});
```

Same for PHP — turn `display_errors = Off` in production, log to file or stderr.

### Missing security headers

For every HTML-serving endpoint, set:

| Header | Purpose | Failure mode if missing |
|---|---|---|
| `Strict-Transport-Security: max-age=31536000; includeSubDomains` | Force HTTPS on the browser | Network attacker downgrades to HTTP, steals session cookie |
| `Content-Security-Policy: default-src 'self'; ...` | Restrict script/style/frame origins | XSS payload can call out to attacker domain |
| `X-Content-Type-Options: nosniff` | Disable MIME sniffing | Uploaded file gets reinterpreted as script |
| `X-Frame-Options: DENY` or `CSP: frame-ancestors 'none'` | Block iframing | Clickjacking — invisible iframe over attacker UI |
| `Referrer-Policy: strict-origin-when-cross-origin` | Limit Referer leak | Sensitive URLs leak to third-party assets |

For APIs (JSON-only): HSTS, `X-Content-Type-Options: nosniff`, and `Cache-Control: no-store` on sensitive responses.

### XXE — XML External Entity injection

XML parsers default to resolving external entities. Feeding untrusted XML to a default parser is a remote file read / SSRF / sometimes RCE.

**Vulnerable (Java):**
```java
DocumentBuilderFactory dbf = DocumentBuilderFactory.newInstance();
DocumentBuilder db = dbf.newDocumentBuilder();
Document doc = db.parse(userSuppliedXmlStream);   // ← entities enabled by default
```

Attacker payload:
```xml
<?xml version="1.0"?>
<!DOCTYPE foo [ <!ENTITY xxe SYSTEM "file:///etc/passwd"> ]>
<root>&xxe;</root>
```

**Fixed:**
```java
DocumentBuilderFactory dbf = DocumentBuilderFactory.newInstance();
dbf.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
dbf.setFeature("http://xml.org/sax/features/external-general-entities", false);
dbf.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
dbf.setXIncludeAware(false);
```

**PHP (libxml):**
```php
libxml_disable_entity_loader(true);                // PHP < 8
// PHP 8+: pass LIBXML_NONET | LIBXML_NOENT off (NOENT must NOT be set)
$dom = new DOMDocument();
$dom->loadXML($xml, LIBXML_NONET);
```

**Node (`fast-xml-parser`, `xml2js`):** check the library's docs — most disable entity expansion by default but some don't.

Prefer JSON for any new inter-service protocol — it doesn't have this failure mode.

### Open cloud storage / wide IAM

- **S3**: `BlockPublicAccess` should have all four flags `true` unless there is a documented public use case. Bucket policies should be checked in IaC, not via the console.
- **MongoDB Atlas**: IP allowlist must not be `0.0.0.0/0`. Database users must have role-specific permissions, not `atlasAdmin`.
- **AWS IAM**: no `Action: "*"` outside of trust-policy contexts. Cross-account roles use external IDs.

Run Checkov / tfsec / Trivy on every IaC PR. Fail the build on HIGH/CRITICAL.

### Insecure framework settings

- Express: `app.disable('x-powered-by')`.
- Spring Boot: `management.endpoints.web.exposure.include` minimal; never `*` in prod.
- PHP: `expose_php = Off`, `display_errors = Off`, `session.cookie_httponly = 1`, `session.cookie_secure = 1`, `session.cookie_samesite = Lax`.
- Aurora / RDS: SSL required, deletion protection on, automated backups, IAM auth or Secrets Manager rotation.

### CI/CD pipeline misconfiguration

CI/CD pipelines are production surfaces. The same rules apply:

- GitHub Actions: third-party actions pinned by commit SHA, not tag. `permissions:` block on every workflow, default to read-only. Secrets scoped per environment.
- Build artifacts signed. Verification gate before deploy.
- Branch protection on default branch: required reviews, required status checks, no force push.

### Secrets in source

The classic miss. Audit for:

- `.env` files committed.
- Hardcoded `aws_access_key_id`, `api_key`, `password`, `secret` literals.
- Connection strings with embedded credentials.
- Private keys in repo (`.pem`, `.p12`, `id_rsa`).

Use AWS Secrets Manager / Parameter Store / Vault, identity federation, short-lived tokens. If you find a leak, rotate the credential first, then strip from git history (which alone doesn't help — assume it's been seen).

---

## Prevention checklist

- [ ] Hardening is automated; dev/QA/prod use identical configs (different credentials only).
- [ ] No samples, demos, or test endpoints in the production image.
- [ ] Stack traces are logged server-side and never returned to the client.
- [ ] Required security headers set on every HTML response; HSTS + nosniff on JSON.
- [ ] XML parsers explicitly disable DTD and external entities — every one, not just the one you remember.
- [ ] Cloud storage / DB clusters created with deny-public defaults; IaC scanned in CI.
- [ ] No secrets in source, config files, Dockerfiles, or CI logs. Use a secret manager.
- [ ] CI/CD pipelines: third-party actions SHA-pinned, secrets scoped, branch protection on.
- [ ] Annual review of cloud IAM and bucket policies, even if scanners cover the rest.

---

## Stack-aware notes

- **PHP + relational DB**: PHP error display must be off in production; managed-DB cluster public-access must be off; database log retention ≥ 12 months baseline (24 months for security-critical groups). See [stack-php-mysql.md](stack-php-mysql.md).
- **Node.js + MongoDB**: Atlas IP allowlist must exclude `0.0.0.0/0`; database users scoped to a single DB; SCRAM-SHA-256 not SCRAM-SHA-1; TLS required. See [stack-node-mongo.md](stack-node-mongo.md).
- **AWS infra**: see [stack-aws-infra.md](stack-aws-infra.md) for IAM, S3, GuardDuty, Security Hub specifics.

---

## OWASP references

- [Testing Guide: Configuration Management](https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/02-Configuration_and_Deployment_Management_Testing/README)
- [NIST SP 800-123: Guide to General Server Hardening](https://csrc.nist.gov/publications/detail/sp/800-123/final)
- [CIS Benchmarks](https://www.cisecurity.org/cis-benchmarks/)
