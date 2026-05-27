# Security testing checklist

Functional security tests run as part of every CI pipeline. The cost of writing them is small; the cost of shipping a regression is large.

This document collects the test patterns referenced from each category's reference file, organized for use in PRs.

---

## Per-route minimum (authenticated routes)

Every new authenticated route gets these four tests:

```js
describe('GET /api/orders/:id', () => {
  it('returns 200 for the owner', async () => {
    const order = await createOrder({ ownerId: alice.id });
    const res = await api.as(alice).get(`/api/orders/${order.id}`);
    expect(res.status).toBe(200);
  });

  it('returns 404 for another user', async () => {
    const order = await createOrder({ ownerId: alice.id });
    const res = await api.as(bob).get(`/api/orders/${order.id}`);
    expect(res.status).toBe(404);            // not 403 — 404 hides existence
  });

  it('returns 401 unauthenticated', async () => {
    const order = await createOrder({ ownerId: alice.id });
    const res = await api.anon().get(`/api/orders/${order.id}`);
    expect(res.status).toBe(401);
  });

  it('returns 400 for malformed input without leaking stack', async () => {
    const res = await api.as(alice).get('/api/orders/not-an-id');
    expect(res.status).toBe(400);
    expect(res.body).not.toHaveProperty('stack');
    expect(res.body).toHaveProperty('requestId');
  });
});
```

Build a Jest / Vitest helper that takes a route + factory and emits the 4-test fixture.

---

## Per-route for write operations

Add to the above:

```js
it('cannot modify another user\'s record', async () => {
  const order = await createOrder({ ownerId: alice.id });
  const res = await api.as(bob).patch(`/api/orders/${order.id}`).send({ status: 'cancelled' });
  expect(res.status).toBe(404);
  const refreshed = await Order.findById(order.id);
  expect(refreshed.status).not.toBe('cancelled');
});

it('respects field allowlist (cannot escalate role / change tenantId)', async () => {
  const res = await api.as(alice).patch('/api/users/me').send({ role: 'admin', tenantId: 'other' });
  // 200 with the allowed fields applied, OR 400 — either way:
  const me = await User.findById(alice.id);
  expect(me.role).toBe('user');
  expect(me.tenantId).toBe(alice.tenantId);
});
```

---

## Per-high-value-flow

Payments, role changes, password reset, MFA enrollment, account deletion:

```js
describe('POST /api/transfer', () => {
  it('is rate-limited', async () => {
    for (let i = 0; i < 10; i++) {
      await api.as(alice).post('/api/transfer').send(validBody);
    }
    const res = await api.as(alice).post('/api/transfer').send(validBody);
    expect(res.status).toBe(429);
  });

  it('rolls back fully on partial failure', async () => {
    await mockBank.failOn('credit');
    const before = await getBalance(alice);
    await api.as(alice).post('/api/transfer').send({ to: bob.id, amount: 100 });
    expect(await getBalance(alice)).toBe(before);
  });

  it('writes the audit log line', async () => {
    await api.as(alice).post('/api/transfer').send({ to: bob.id, amount: 100 });
    const entries = await AuditLog.find({ userId: alice.id, action: 'transfer' });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ amount: 100, destination: bob.id });
  });

  it('is idempotent under the same idempotency key', async () => {
    const key = 'idem-' + Date.now();
    await api.as(alice).post('/api/transfer').set('Idempotency-Key', key).send(validBody);
    const before = await getBalance(alice);
    await api.as(alice).post('/api/transfer').set('Idempotency-Key', key).send(validBody);
    expect(await getBalance(alice)).toBe(before);
  });
});
```

---

## Auth-specific

```js
describe('JWT verification', () => {
  it('rejects alg: none', async () => {
    const token = makeUnsignedToken({ sub: 'admin', role: 'admin' });
    const res = await api.withToken(token).get('/api/me');
    expect(res.status).toBe(401);
  });

  it('rejects algorithm confusion (HS256 signed with RSA public key)', async () => {
    const token = signWithHmac(PUBLIC_KEY_BYTES, { sub: 'admin' }, 'HS256');
    const res = await api.withToken(token).get('/api/me');
    expect(res.status).toBe(401);
  });

  it('rejects expired tokens', async () => {
    const token = signWithKey(PRIVATE_KEY, { sub: 'alice', exp: nowSeconds() - 60 });
    const res = await api.withToken(token).get('/api/me');
    expect(res.status).toBe(401);
  });

  it('rejects wrong audience', async () => {
    const token = signWithKey(PRIVATE_KEY, { sub: 'alice', aud: 'other-service' });
    const res = await api.withToken(token).get('/api/me');
    expect(res.status).toBe(401);
  });

  it('rejects wrong issuer', async () => {
    const token = signWithKey(PRIVATE_KEY, { sub: 'alice', iss: 'evil.example.com' });
    const res = await api.withToken(token).get('/api/me');
    expect(res.status).toBe(401);
  });
});

describe('Login', () => {
  it('returns the same message and similar timing for unknown email vs wrong password', async () => {
    const t1 = await timed(() => api.post('/api/login').send({ email: 'nope@x.com', password: 'x' }));
    const t2 = await timed(() => api.post('/api/login').send({ email: knownEmail, password: 'wrong' }));
    expect(t1.body).toEqual(t2.body);
    expect(Math.abs(t1.ms - t2.ms)).toBeLessThan(50);
  });

  it('rejects type-juggling password injection', async () => {
    const res = await api.post('/api/login').send({ email: knownEmail, password: { $ne: null } });
    expect(res.status).toBe(400);
  });

  it('rate-limits failed logins', async () => {
    for (let i = 0; i < 10; i++) {
      await api.post('/api/login').send({ email: knownEmail, password: 'wrong' });
    }
    const res = await api.post('/api/login').send({ email: knownEmail, password: correctPassword });
    expect([429, 401]).toContain(res.status);   // either rate-limited or still locked out
  });
});
```

---

## XSS regression

For every user-facing text field:

```js
describe('Profile bio', () => {
  it('renders script tags as text, not HTML', async () => {
    await api.as(alice).put('/api/profile').send({ bio: '<script>window.x=1</script>' });
    const html = await api.as(bob).get(`/profile/${alice.id}`).text();
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>window.x=1</script>');
  });

  it('sanitizes rendered HTML through DOMPurify (if rich text)', async () => {
    await api.as(alice).put('/api/profile').send({ bio: '<a href="javascript:alert(1)">click</a>' });
    const html = await api.as(bob).get(`/profile/${alice.id}`).text();
    expect(html).not.toContain('javascript:');
  });
});
```

---

## Input validation / fuzzing

```js
describe('endpoint accepts only expected shape', () => {
  const cases = [
    { input: { name: 123 },                  expect: 400 },     // wrong type
    { input: { name: 'x'.repeat(10000) },    expect: 400 },     // oversize
    { input: {},                              expect: 400 },     // missing required
    { input: { name: 'ok', extra: 'oops' },  expect: 200 },     // extra fields tolerated (or 400 if strict)
    { input: { name: '<script>alert(1)</script>' }, expect: 200 }, // accepted, escaped on render
  ];
  cases.forEach(({ input, expect: e }) => {
    it(`returns ${e} for ${JSON.stringify(input)}`, async () => {
      const res = await api.as(alice).post('/api/things').send(input);
      expect(res.status).toBe(e);
    });
  });
});
```

For command-handling endpoints, fuzz with shell metacharacters and confirm 4xx:

```js
const SHELL_META = [';', '&&', '||', '`', '$()', '\n', '\\', '|', '$IFS'];
SHELL_META.forEach(meta => {
  it(`rejects shell metacharacter: ${JSON.stringify(meta)}`, async () => {
    const res = await api.as(alice).post('/api/dns-lookup').send({ host: `example.com${meta}` });
    expect(res.status).toBe(400);
  });
});
```

---

## SQL / NoSQL injection

```js
describe('injection-safe queries', () => {
  it('does not match all rows when id is SQL injection payload', async () => {
    const res = await api.as(alice).get(`/api/things/${encodeURIComponent("1' OR '1'='1")}`);
    expect(res.status).toBe(400);   // ID schema rejects
  });

  it('does not let password be a Mongo operator', async () => {
    const res = await api.post('/api/login').send({
      email: knownEmail,
      password: { $regex: '.*' },
    });
    expect(res.status).toBe(400);
  });
});
```

---

## Error handling / fail-closed

```js
it('returns generic error without stack', async () => {
  const res = await api.as(alice).get('/api/cause-error');
  expect(res.body).not.toHaveProperty('stack');
  expect(res.body).not.toMatch(/at .+:\d+:\d+/);
  expect(res.body.requestId).toBeDefined();
});

it('denies when policy engine is unreachable', async () => {
  await mockPolicyEngine.makeUnreachable();
  const res = await api.as(alice).get('/api/admin/things');
  expect([403, 503]).toContain(res.status);
  expect(res.status).not.toBe(200);
});

it('does not leak DB connections on failure', async () => {
  const initial = await db.activeConnectionCount();
  for (let i = 0; i < 100; i++) await api.post('/upload').send(invalidUpload).catch(() => {});
  expect(await db.activeConnectionCount()).toBeLessThan(initial + 5);
});
```

---

## Logging assertions

```js
it('logs auth failures with enough context', async () => {
  await api.post('/api/login').send({ email: knownEmail, password: 'wrong' });
  const entry = await waitForLog({ event: 'login_failure' });
  expect(entry).toMatchObject({ email: knownEmail, ip: expect.any(String) });
  expect(entry).not.toHaveProperty('password');     // never log the actual password
});

it('does not log JWT tokens', async () => {
  await api.withToken(validToken).get('/api/me');
  const logs = await getRecentLogs();
  expect(logs.join('\n')).not.toContain(validToken);
});
```

---

## CI integration

In CI, also run:

- **Dependency scan**: `npm audit` / `composer audit` / `pip-audit`. Fail on HIGH/CRITICAL.
- **SAST**: Semgrep with OWASP rules, or language-specific (Psalm for PHP, ESLint security plugins for Node).
- **DAST** (periodic, not every PR): OWASP ZAP baseline scan against the staging deployment.
- **IaC scan**: Checkov / Trivy on every Terraform / CloudFormation change.
- **Container scan**: Trivy on built images before push to ECR.
- **Secrets scan**: `gitleaks` / `truffleHog` on every PR. Block merge if a secret is detected.

---

## When you add a new endpoint

Use this PR template snippet:

```markdown
### Security checklist
- [ ] Auth middleware applied
- [ ] Authorization scoped in the query (ownership / tenant)
- [ ] Input schema-validated at boundary
- [ ] Output escaped / safe serialization
- [ ] Rate-limited
- [ ] Errors fail closed, generic response, request ID
- [ ] Security event logged (success and failure)
- [ ] Functional tests: owner, other-user, anonymous, malformed input
- [ ] For high-value: idempotency, rollback, audit log tests added
```

If you can't check a box, explain why in the PR description.
