# A06:2025 — Insecure Design

A design flaw is "we never created the control in the architecture." An implementation flaw is "we had the control but coded it wrong." Implementation flaws can be patched; design flaws cannot be fixed by perfect implementation. If rate limiting was never designed in, no amount of careful coding adds it after the fact — you have to go back and redesign.

---

## The pre-code workflow

For any new feature, especially anything touching auth, access control, business logic, or money — answer these before opening the editor:

1. **Who benefits from abusing this feature?** Curious users, malicious customers, insiders, scrapers, scalpers, competitors.
2. **What's the worst outcome they could cause?** Data exfiltration, denial of service, financial loss, regulatory exposure, reputational damage.
3. **What controls prevent that?** Auth, rate limiting, deposit requirements, anomaly detection, separation of duties, idempotency keys.
4. **Which controls already exist as shared infrastructure?** Use those; don't reinvent.
5. **Where are the trust boundaries?** What crosses each one, and how is it validated?

If any answer is "I don't know" or "we'll figure that out later," the design isn't ready.

---

## Common design failures

### Insecure credential recovery

Security questions ("mother's maiden name", "first pet") are prohibited by NIST 800-63b and OWASP ASVS. Answers are often discoverable on social media or public records, and multiple people can know them. Replace with email-verified reset links (short TTL, single-use, invalidated on next reset) plus MFA before the password change is accepted.

### Business logic flaws

The cinema booking case from the OWASP material: group bookings discounted, capped at 15 attendees before requiring a deposit. The cap was enforced per-booking, not across bookings. Attackers placed many concurrent bookings of 15 seats each, locking 600 seats across the chain.

**Pattern to look for:** any limit, threshold, or discount that is enforced per-request when it should be enforced per-actor / per-time-window. Cross-request state matters.

### Missing rate limits / anti-automation

Scalping (bots buying inventory in seconds), credential stuffing (millions of login attempts), API abuse (scraping all products). The design must include:

- Rate limits per IP, per user, per device fingerprint.
- CAPTCHA on high-risk flows.
- Anomaly detection (sudden spike in 4xx, signup velocity, login failures).
- For inventory: queue systems, invite-based access, purchase pattern detection.

### Trust boundary violations

Two services share an identifier without agreeing on its meaning. Service A uses a cookie set on `.example.com`, which is also sent to `.support.example.com` operated by a third party. The third party can now read the user's session cookie. Map every boundary; cookies, headers, JWTs, signed URLs each have a scope and audience.

### Weak tenant separation

In a multi-tenant SaaS, the design has to make it impossible to query across tenants:

- Every row has a `tenant_id`; every query scopes by it.
- Better: per-tenant database / schema, so queries cannot cross.
- Application code can't be trusted to remember the filter on every query — enforce at the data layer (row-level security, schema-per-tenant).

### Single-actor sensitive operations

A money transfer that one user can complete end-to-end. A production deploy that the same engineer wrote and pushed. A key rotation done by the person holding the key. These violate separation of duties. The fix is to design in a second-actor approval step.

### Default-allow newly-created principals

Setting newly created users to admin "we'll downgrade later" is a design choice. Any compromised account inherits the over-privilege. Default to the minimum role; uplift via explicit, audited grant.

---

## Core principles

### Least privilege

Every user, service, process gets only what it needs. Default deny; access granted explicitly, narrowly, and time-bounded.

### Separation of duties

Critical operations require multiple actors. Financial transfer: submitter ≠ approver. Deploy: author ≠ deployer. Key custody: holder ≠ authorizer.

### Defense in depth

Assume any single control can fail. Layer independent controls so a single failure isn't catastrophic. WAF + auth middleware + DB constraints + audit log — each catches different failure modes.

### Fail closed / fail safe

Errors default to denying access. A permission check that throws is a deny, not a "well, let them through and we'll log it."

### Complete mediation

Every access check on every request. No "we checked at login and cached the result for an hour." Tokens get revoked, roles change, contexts shift.

### Economy of mechanism

Simpler designs fail in fewer places. If the auth flow requires a whiteboard to explain, it has bugs no one has found yet.

---

## Threat modeling, lightweight

You don't need a multi-day workshop. For each new feature:

1. **Data flow diagram** (5 minutes): user → frontend → API → DB → external services. Mark trust boundaries.
2. **STRIDE per asset** (10 minutes per critical asset):
   - **S**poofing: can someone pretend to be someone else?
   - **T**ampering: can someone modify data they shouldn't?
   - **R**epudiation: can someone deny they took an action?
   - **I**nformation disclosure: can someone read data they shouldn't?
   - **D**enial of service: can someone make it unavailable?
   - **E**levation of privilege: can someone gain higher rights than granted?
3. **Mitigations** (15 minutes): for each threat that's real, what's the control? If "rate limit", "audit log", "MFA", "idempotency key" — name it. If "we'll think about it later", flag it.

The output: a short document attached to the design, listed mitigations as user stories or tasks. This is what threat modeling looks like in practice.

---

## Misuse cases alongside use cases

For every user story, write a matching misuse story:

| User story | Misuse story |
|---|---|
| User can book group tickets | Attacker books all available seats to deny service / scalp |
| User can reset their password by email | Attacker uses reset endpoint to enumerate registered emails |
| User can upload a profile photo | Attacker uploads a file that's actually a webshell / a 10GB zip bomb / contains EXIF with an embedded script |
| Admin can impersonate a user for support | Attacker compromises an admin and exfiltrates customer accounts at scale |

The misuse cases reveal design gaps the functional requirements never surface.

---

## Reference architectures

For the recurring problems, use battle-tested patterns:

- **Auth**: OAuth 2.1 / OpenID Connect via an established IdP (Auth0, Cognito, Okta, Keycloak, your own well-reviewed impl). Don't roll a custom flow.
- **MFA**: TOTP + WebAuthn / passkeys as the long-term direction.
- **Authorization**: explicit policy engine (Open Policy Agent / Cedar / Casbin) for complex rules, RBAC + scoping for simpler cases.
- **Session management**: framework defaults are usually correct; bypassing them is the red flag.
- **Secrets**: AWS Secrets Manager / Parameter Store / Vault. Never application-managed.

---

## Prevention checklist

- [ ] Threat model written for every critical feature before code.
- [ ] Misuse cases identified for each user story.
- [ ] Rate limiting, anomaly detection designed into business logic, not added later.
- [ ] Multi-actor approval designed for high-impact operations.
- [ ] Tenant isolation enforced at the data layer, not just in application code.
- [ ] Reference architectures used for auth, MFA, sessions, secrets.
- [ ] Security requirements written into user stories ("user cannot book more than N seats per hour").
- [ ] Plausibility checks at each tier (frontend validates, API validates, DB constrains).
- [ ] Tests validate that the threat-model controls actually work.

---

## OWASP references

- [Secure Product Design Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secure_Product_Design_Cheat_Sheet.html)
- [OWASP SAMM: Threat Assessment](https://owaspsamm.org/model/design/threat-assessment/)
- [Threat Modeling Manifesto](https://threatmodelingmanifesto.org/)
- [NIST SP 800-160: Systems Security Engineering](https://csrc.nist.gov/publications/detail/sp/800-160/vol-1-rev-1/final)
