# A09:2025 — Security Logging and Alerting Failures

Renamed in 2025 from "Logging and Monitoring" — the word change matters. Monitoring implies dashboards you look at. Alerting implies signals that reach you. Logs that exist but no one watches are useless.

This category rarely shows up in scanner reports and generates few CVEs (~723), but when it shows up in a breach it's usually the difference between catching the attack in progress and finding out about it on the news. Real cases referenced by OWASP: a children's health plan with seven years of undetected access, a European airline fined £20M after a delayed-detection breach.

---

## What to log

For every security-relevant event:

| Event | Required fields |
|---|---|
| Login success | timestamp, user ID, IP, user agent, auth method (password / MFA / SSO) |
| Login failure | timestamp, attempted user (if known), IP, user agent, reason code |
| Password reset request | timestamp, account, IP, reset token ID |
| Password change | timestamp, user ID, IP, "via reset" / "by user" / "by admin" |
| MFA enrollment / removal | timestamp, user ID, IP, method, actor (self / admin) |
| Role / permission change | timestamp, target user, granting user, before, after |
| Access denied (403) | timestamp, user ID, route, method, IP |
| High-value transaction | timestamp, user ID, action, amount, destination, IP, request ID |
| Admin / privileged operation | timestamp, admin user ID, target, action, IP |
| Suspicious pattern detection | timestamp, pattern (e.g. "10 failed logins from IP"), affected accounts |

For each, include a **request ID** so logs across services can be correlated.

---

## What NOT to log

- Passwords, even hashed.
- Full JWTs or session tokens (token IDs are OK).
- API keys, secrets, encryption keys.
- Full credit card numbers (last 4 digits only).
- SSNs, full DOBs, government IDs (use a hash or last-N digits if needed for correlation).
- Health information unless the system is specifically designed for HIPAA/equivalent.
- Verbatim user input that might contain attack payloads — encode it before logging to prevent log injection.

If sensitive data must be referenced, log a tokenized or hashed identifier. A `user.email` may be acceptable in some contexts (auth event for a SaaS) but not others (medical-platform log of a patient signing in). Define and document the standard.

---

## Log integrity and storage

- **Centralized aggregation.** Local log files are a starting point. Ship to CloudWatch / Datadog / Splunk / ELK so an attacker with shell on a single host can't erase the trail.
- **Append-only.** Use write-once or immutable storage for the aggregate (S3 with Object Lock, ELK with index lifecycle to cold storage).
- **Tamper-evident.** Cryptographic hash chain or HMAC over log batches for high-assurance environments.
- **Encrypted in transit and at rest.** TLS for ingestion; at-rest encryption on the storage.
- **Retention long enough for forensic analysis.** SOC 2 doesn't prescribe a fixed number — your org and auditor set it — but a common baseline is 12 months for application logs and 24+ months for security-critical streams (CloudTrail, auth logs, payment flows, threat-detection feeds). Application logs vary by data classification.

---

## Alerting

Logs without alerts are paperwork. Alerts without context are noise. Both have to be right.

### Good alerts

| Pattern | Alert |
|---|---|
| 10+ login failures from one IP in 1 minute | Possible credential stuffing — block IP, page on-call if widespread |
| Login from a country never seen for this account | Flag for user verification; alert if multiple accounts simultaneously |
| Same MFA prompt sent 5+ times in 5 minutes | MFA fatigue attack — block prompts, require re-auth |
| Admin role assigned to a non-admin account | Page on-call; immediate review |
| New AWS IAM user created outside of Terraform | Page on-call |
| CloudTrail logging disabled | Page on-call immediately |
| Unusual data egress volume (e.g. 100× normal) | Page on-call |
| Tampering with the log pipeline itself | Page on-call |

### Bad alerts

- "Error rate is up" — too generic, fires constantly.
- "Disk is 80% full" — operational, not security; route to ops.
- Threshold alerts that fire daily — they get ignored, and the real one gets ignored with them.

### Alerting test

If a pentest against your application doesn't trigger any alert, your detection controls aren't working. Schedule periodic adversarial exercises (purple team, automated attack simulations) and confirm alerts fire.

---

## Common failure modes

### Logs not centralized

Log files on individual EC2 hosts. Container goes away, logs go away. An attacker on the host can `rm` the file. Solution: ship to a log aggregator, real-time.

### Log injection

User input written to a log without encoding:
```js
logger.info(`User ${req.body.name} signed in`);    // attacker sets name to "alice\n[ERR] System breach"
```

The log file now has a forged entry. Solution: structured logging (JSON), don't string-interpolate user input into log lines.

```js
logger.info({ event: 'login', userId: alice.id, ip: req.ip });
```

### Information leakage in logs

Sensitive data accidentally logged then exposed via a log aggregator UI accessible to too many engineers. Treat the log aggregator as a sensitive data store. Field-level access controls.

### Local-only logs

Logs only on the host. Backups missing. Retention ends before the breach is detected. The OWASP children's-health-plan case: breach could have been ongoing since 2013, found in 2020+.

### Missing error handling

Application throws, the error is swallowed by a generic middleware, and there's no log line for the failure. Combine A09 with [A10](10-exceptional-conditions.md) — every catch logs.

---

## Prevention checklist

- [ ] Auth success/failure, access denied, privileged ops, and high-value transactions all logged with structured fields.
- [ ] Sensitive data (passwords, tokens, full PII) never logged. Lint rule or pre-commit check catches accidental inclusion.
- [ ] Log injection prevented — structured logging, no string interpolation of user input into log messages.
- [ ] Logs shipped to a central aggregator in real time. Local storage is a buffer, not the destination.
- [ ] Aggregator storage is append-only / immutable; long enough retention (≥12 months general, ≥24 months security-critical).
- [ ] Alerts defined for the specific attack patterns relevant to the app (credential stuffing, account takeover, mass exfiltration, IAM changes, log pipeline tampering).
- [ ] Alerts route to a system that wakes someone up — not just a dashboard.
- [ ] Periodic exercise (pentest / red team / chaos) verifies alerts fire.
- [ ] Incident response runbook exists; engineers know the categories of events and how to triage.

---

## Stack-aware notes

- **PHP**: `error_log` to centralized syslog / CloudWatch. Application audit log (separate from error log) for security events.
- **Node.js**: structured logger (`pino`, `winston` with JSON transport). Forward to CloudWatch / Datadog / equivalent.
- **AWS**: a common-baseline retention target is 12 months for application log groups, 24 months for security-critical ones (SOC 2 itself doesn't fix a number — your org and auditor do). Confirm CloudTrail and VPC Flow Logs have explicit retention set (never-expire is not equivalent to a defined retention policy). Verify application log groups aren't sitting at the platform default of a few days/weeks.
- **GuardDuty / Security Hub**: ensure their log groups are included in the retention schedule. These are required event sources for credible attack detection.

---

## OWASP references

- [Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
- [Application Logging Vocabulary Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Application_Logging_Vocabulary_Cheat_Sheet.html)
- [NIST 800-61r2: Computer Security Incident Handling Guide](https://csrc.nist.gov/publications/detail/sp/800-61/rev-2/final)
