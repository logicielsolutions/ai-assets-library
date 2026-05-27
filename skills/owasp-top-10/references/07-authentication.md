# A07:2025 — Authentication Failures

Authentication is your front door. Get this wrong and the rest of your security doesn't matter — attackers don't have to bypass your controls; they log in as someone else. 36 distinct CWEs in this category.

---

## Sub-classes to watch for

### Credential stuffing and password spraying

Attackers reuse breached username/password lists against your login. Variations: "hybrid" stuffing tries small mutations (`Winter2025` → `Winter2026`). Spraying tries a few common passwords against many accounts to evade per-account lockouts.

**Defenses:**
- Check new passwords against known-breached databases (HaveIBeenPwned k-anonymity API).
- Rate limit failures per IP and per account. Increasing backoff on repeated failures.
- Detect spraying: failures spread across many usernames from the same IP / IP range / ASN.
- MFA dramatically reduces the impact of credential reuse.

### Weak password policies

NIST 800-63 has clarified what works and what doesn't:

- ✅ Minimum 8 characters, maximum at least 64.
- ✅ Allow all printable characters including spaces.
- ✅ Check against breach databases.
- ✅ Allow paste in password fields (helps password managers).
- ❌ Mandatory complexity rules (mixed case, digits, symbols) — encourage `Password1!` patterns.
- ❌ Mandatory periodic rotation — encourages predictable mutations.
- ❌ Knowledge-based answers ("first pet") — fundamentally unsafe.

### Missing or ineffective MFA

MFA should be the default for any sensitive system, mandatory for admin accounts.

Strength order:
1. **WebAuthn / passkeys** — phishing-resistant. Direction of travel.
2. **Hardware security keys** (YubiKey, Titan) — phishing-resistant.
3. **TOTP** (Google Authenticator, Authy, 1Password) — acceptable floor.
4. **Push notifications** — convenient but susceptible to "MFA fatigue" attacks (spam the user with prompts until they tap accept).
5. **SMS** — better than nothing, but vulnerable to SIM-swap. Not acceptable for high-value accounts.

### Account enumeration

Login, reset, and signup endpoints can leak which emails exist:

**Vulnerable:**
- Login: "Invalid password" (account exists) vs "User not found" (doesn't).
- Signup: "Email already in use".
- Reset: "Reset link sent" vs "Email not registered".

**Fixed:** identical messaging for all outcomes. "If an account with that email exists, we've sent reset instructions." Same status code, same response time (use constant-time comparison or simulated work on the no-account branch).

### Session management

**Required behaviors:**
- New session ID on login (prevent fixation).
- High-entropy random ID, ≥ 128 bits (CSPRNG).
- Stored in HTTP-only, Secure, SameSite cookies — never in URLs or local storage for sensitive apps.
- Invalidated server-side on logout (the cookie deletion isn't enough — a leaked token must stop working).
- Idle timeout (15–60 min for sensitive apps) and absolute timeout (8–24 hours).
- For SSO: Single Logout actually invalidates downstream sessions.

### Hard-coded credentials

Passwords in source, config, Docker images. Audit:
```
grep -rE '(password|secret|api[_-]?key|token)\s*[:=]\s*["'\''][^"\\'\'']{6,}' .
```
Use a secret manager.

---

## JWT — the dominant pattern, the dominant pitfall

JWTs are signed claims. The server signs `{userId, exp, role}`, the client stores it, downstream services verify with the appropriate key. **JWTs are signed, not encrypted** — the payload is base64-decoded readable by anyone holding the token.

### Critical: pin the algorithm

**Vulnerable (Node, `jsonwebtoken`):**
```js
const payload = jwt.verify(token, SECRET);   // ← algorithm taken from token header
```

If the token header says `{"alg":"none"}`, the library may accept the token with no signature. If it says `{"alg":"HS256"}` and the server is configured for RS256, the attacker signs the token with the **RSA public key** as the HMAC secret and the library treats it as valid.

**Fixed:**
```js
const payload = jwt.verify(token, PUBLIC_KEY, {
  algorithms: ['RS256'],         // ← explicit allowlist, not from token
  issuer: 'https://auth.example.com',
  audience: 'api.example.com',
  clockTolerance: 5,             // small window for clock skew
});
```

PHP (`firebase/php-jwt`):
```php
$payload = JWT::decode($token, new Key($publicKey, 'RS256'));
```

Even there, do **not** dynamically pass the algorithm from the header.

### Validate every claim you rely on

- `exp` — expiration (always check).
- `nbf` — not before (skew window).
- `iss` — issuer must match expected auth server.
- `aud` — audience must match this service. A correctly-signed token for another audience is still a failure.
- `sub` — subject (user ID).
- Custom claims (`role`, `scope`) — validate the values before trusting them.

### Token lifetime and revocation

Stateless JWTs are not revocable by default. Options:

- Short-lived access tokens (5–15 minutes) + longer refresh tokens; revocation = refuse to refresh.
- Maintain a revocation list (`jti` blacklist in Redis) checked on every verify — adds a round-trip but enables logout-everywhere.
- Hybrid: short access tokens, opaque refresh tokens stored server-side.

### Don't put secrets in the payload

Anyone holding the token reads the payload. PII, internal IDs that aren't supposed to leak, anything sensitive — don't include it. A user ID + role is normal; a SSN is not.

### Key management

- Sign with private key (RS256/ES256); verify with public key. Public key distributed via JWKS endpoint.
- Rotate keys on a schedule; include `kid` (key ID) in token header so verifiers can pick the right key.
- HMAC (HS256) is fine for single-service signing, but key rotation is harder; prefer asymmetric for anything crossing service boundaries.

---

## Real-world scenario: SSO logout

A user logs out of the SSO portal. The portal clears its own session. The downstream apps (mail, docs, chat) didn't get the logout signal and remain authenticated. The user walks away from a public computer assuming they're logged out.

**Fix:** Single Logout (SLO) is a standard SAML / OIDC feature. Wire it up. Test it: log out, then verify each downstream app is also logged out within the SLO timeout.

---

## Prevention checklist

- [ ] MFA available on every account; mandatory for admin and high-privilege.
- [ ] Passwords: 8–64+ chars, no mandatory complexity, no mandatory rotation, checked against breach DB on creation.
- [ ] Account enumeration not possible via login, reset, or signup.
- [ ] Rate limits on login (per IP and per account), reset, and MFA prompts.
- [ ] Session IDs from CSPRNG, ≥ 128 bits, rotated on login, invalidated server-side on logout.
- [ ] Session cookies: `HttpOnly`, `Secure`, `SameSite=Lax` (or `Strict` for admin).
- [ ] JWT verify calls pin the algorithm in the `algorithms` option; reject `none`.
- [ ] JWT verification validates `exp`, `iss`, `aud`, `nbf` claims.
- [ ] JWT keys: asymmetric (RS256/ES256) where tokens cross service boundaries; rotated on schedule.
- [ ] No hard-coded credentials in code, config, or images. Secret manager.
- [ ] SSO: Single Logout tested and working.
- [ ] Auth events (login success, login failure, password reset, MFA enrollment, role change) logged with enough context to detect attacks.

---

## Testing patterns

```js
describe('JWT verification', () => {
  it('rejects alg: none', async () => {
    const token = makeUnsignedToken({ sub: 'admin', role: 'admin' });
    const res = await request.get('/api/admin/users').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it('rejects RS256/HS256 algorithm confusion', async () => {
    const token = signWithHmac(PUBLIC_KEY_BYTES, { sub: 'admin', role: 'admin' }, 'HS256');
    const res = await request.get('/api/admin/users').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it('rejects expired tokens', async () => {
    const token = signWithKey(PRIVATE_KEY, { sub: 'alice', exp: Date.now()/1000 - 60 });
    const res = await request.get('/api/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it('rejects tokens for the wrong audience', async () => {
    const token = signWithKey(PRIVATE_KEY, { sub: 'alice', aud: 'someone-else' });
    const res = await request.get('/api/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });
});

describe('Login enumeration', () => {
  it('returns the same message and timing for unknown email vs wrong password', async () => {
    const t1 = await timed(() => request.post('/api/login').send({ email: 'unknown@x.com', password: 'x' }));
    const t2 = await timed(() => request.post('/api/login').send({ email: knownEmail, password: 'wrong' }));
    expect(t1.body).toEqual(t2.body);
    expect(Math.abs(t1.ms - t2.ms)).toBeLessThan(50);   // adjust tolerance
  });
});
```

---

## OWASP references

- [Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [JSON Web Token Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html)
- [NIST 800-63: Digital Identity Guidelines](https://pages.nist.gov/800-63-3/)
