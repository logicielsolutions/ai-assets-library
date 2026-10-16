# A10:2025 — Mishandling of Exceptional Conditions

New in 2025 (replaces SSRF at #10; SSRF moved into [A01](01-broken-access-control.md)). 24 distinct CWEs. The question this category asks: when your code encounters something unexpected, does it fail safely, or does it fail in a way an attacker can exploit?

The bugs aren't new. They've been promoted from "code hygiene" to a named security category — for good reason.

---

## Sub-classes to watch for

### Failing open instead of closed

A permission check that throws an exception and continues with the request as if the user were authorized.

**Vulnerable:**
```js
function canAccess(user, resource) {
  try {
    return policy.check(user, resource);
  } catch (e) {
    logger.error('policy check failed', e);
    return true;   // ← fail open
  }
}
```

**Fixed:**
```js
function canAccess(user, resource) {
  try {
    return policy.check(user, resource);
  } catch (e) {
    logger.error({ event: 'policy_check_failed', user: user.id, resource: resource.id, err: e });
    return false;   // ← fail closed
  }
}
```

Anywhere a security decision can throw, the catch must default to deny.

### Resource exhaustion through exception paths

An endpoint uploads files. It catches exceptions but doesn't release the resources it allocated.

**Vulnerable:**
```js
app.post('/upload', async (req, res) => {
  const tmpFile = await openTempFile();
  try {
    await processUpload(req, tmpFile);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Upload failed' });
    // ← tmpFile never closed; file handle leaked
  }
});
```

**Fixed:**
```js
app.post('/upload', async (req, res) => {
  const tmpFile = await openTempFile();
  try {
    await processUpload(req, tmpFile);
    res.json({ ok: true });
  } catch (e) {
    logger.error({ event: 'upload_failed', err: e });
    res.status(500).json({ error: 'Upload failed', requestId: req.id });
  } finally {
    await tmpFile.close();
  }
});
```

`finally` for resource cleanup. Or `using` / RAII / context managers / `defer` depending on the language. The same goes for DB connections, network sockets, locks, semaphores, memory pools.

### State corruption from interrupted multi-step operations

Money transfer:
1. Debit source account.
2. Credit destination account.
3. Log transaction.

Network drops between step 1 and step 2. A naive implementation leaves the source debited without the destination credit. An attacker deliberately induces drops to drain accounts or trigger race conditions.

**Fixed:**
- All three steps in a single ACID transaction; commit only after step 3. Roll back on any failure.
- Or, for distributed transactions, use an idempotency key + saga pattern + compensation. The recovery path must be designed; "we'll retry" is not a design.

### TOCTOU (time-of-check / time-of-use)

The application checks permissions at one moment and performs the action a moment later. Between the two, state changes — or in filesystem cases, a symlink is swapped in.

**Vulnerable:**
```python
if os.access(path, os.W_OK):     # check
    with open(path, 'w') as f:   # use — but path may have changed
        f.write(data)
```

**Fixed:** open the file first (with `O_NOFOLLOW`, `O_EXCL` as appropriate), then operate on the file descriptor. The check and use are atomic on the FD.

For authorization-then-action patterns:
- Bundle the authorization check into the same transaction as the action (UPDATE ... WHERE owner = ?).
- For long-lived authorization (token validity), check on every action, not just at session start.

### Sensitive data exposure via error messages

Raw exception text returned to the client.

**Vulnerable:**
```js
app.use((err, req, res, next) => {
  res.status(500).json({ error: err.message, stack: err.stack });
});
```

**Fixed:**
```js
app.use((err, req, res, next) => {
  logger.error({ event: 'unhandled_error', err, requestId: req.id });
  res.status(500).json({ error: 'Internal error', requestId: req.id });
});
```

The user gets a generic message and a request ID. Engineers correlate via the ID.

### Missing rate limits and resource quotas

The OWASP guidance is blunt: "nothing in IT should be limitless." Every boundary needs caps.

- Request rate per IP / per user / per token.
- Request body size cap.
- File upload size cap.
- Database query timeouts.
- Memory caps per worker.
- Concurrency caps per endpoint.
- Cost caps on cloud spend (an unbounded loop in a Lambda or a runaway crawler can create an extraordinary bill).

Express + `express-rate-limit`, Nginx `limit_req`, AWS WAF rules, Cloudflare WAF — pick a layer and use it consistently.

### Inconsistent exception handling across the codebase

The same error in ten places produces ten different behaviors. Some log; some don't. Some return 500; some return 200 with `{ error: ... }`. Some leak the stack; some don't.

Centralize:
- One global error-handler middleware.
- One pattern for "expected" application errors (return 4xx with a typed code).
- One pattern for "unexpected" errors (log, return 500, opaque message).
- One library / helper for "convert this thrown error into the standard response shape".

The win is reviewability: when every error path looks the same, the reviewer can spot the one that doesn't.

### Missing input validation creating exceptional conditions

A request missing a required parameter. A request with the wrong type. A request 100× the expected size. Each of these creates a path through the code that the developer probably didn't think about.

**Defense:** validate at the boundary with a schema validator (Zod, Joi, AJV, Pydantic, Symfony Validator). Reject with 400 before any business logic runs.

---

## Prevention checklist

- [ ] Every security decision fails closed on exception (deny, rollback, abort).
- [ ] Every resource allocation paired with cleanup in `finally` / `using` / `defer`.
- [ ] Multi-step operations are transactional; rollback on any failure; no partial commits.
- [ ] TOCTOU patterns replaced with atomic check-and-act (single SQL statement, FD-based filesystem ops).
- [ ] Errors logged at the source with context (user, request, params).
- [ ] Client-facing error responses are generic + request ID; full details server-side only.
- [ ] Global error handler in place as a backstop for anything uncaught.
- [ ] Rate limits, body-size caps, file upload caps, query timeouts set at every endpoint.
- [ ] Cloud spend caps / budgets configured to catch runaway costs from unbounded loops.
- [ ] Input validated at the boundary with a schema validator before business logic.
- [ ] One consistent error-handling pattern used across the codebase.

---

## Testing patterns

```js
describe('resource exhaustion via error path', () => {
  it('does not leak DB connections when upload fails', async () => {
    const startConnections = await db.activeConnectionCount();
    for (let i = 0; i < 100; i++) {
      await request.post('/upload').send(invalidUpload).catch(() => {});
    }
    const endConnections = await db.activeConnectionCount();
    expect(endConnections).toBeLessThan(startConnections + 5);    // allow some noise
  });
});

describe('fail closed', () => {
  it('denies access when the policy engine is down', async () => {
    await mockPolicyEngine.makeUnreachable();
    const res = await request.get('/api/admin/users').set(authHeader(admin));
    expect(res.status).toBe(503);    // or 403 — not 200
  });
});

describe('transaction rollback', () => {
  it('does not debit source when destination credit fails', async () => {
    await mockBackend.failOn('credit-destination');
    const before = await getBalance(alice);
    await request.post('/api/transfer').send({ to: bob.id, amount: 100 }).set(authHeader(alice));
    const after = await getBalance(alice);
    expect(after).toBe(before);
  });
});

describe('error response shape', () => {
  it('does not leak stack traces', async () => {
    const res = await request.get('/api/cause-an-error');
    expect(res.body).not.toHaveProperty('stack');
    expect(res.body.error).toMatch(/Internal error/);
    expect(res.body.requestId).toBeDefined();
  });
});
```

---

## Stack-aware notes

- **PHP**: use `try/catch/finally`; close PDO statements and file handles in `finally`. PHP's `set_exception_handler` for the global backstop.
- **Node.js**: Express error-handling middleware as the global backstop. `process.on('uncaughtException')` and `process.on('unhandledRejection')` log and crash — let the orchestrator restart.
- **Relational DB (MySQL/Aurora/Postgres)**: wrap multi-statement business operations in `BEGIN; ... COMMIT;`; use `SELECT ... FOR UPDATE` to lock rows when checking-then-updating.
- **MongoDB**: transactions are supported on replica sets; use them for multi-document operations that must be atomic.

---

## OWASP references

- [Error Handling Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Error_Handling_Cheat_Sheet.html)
- [CWE-209: Generation of Error Message Containing Sensitive Information](https://cwe.mitre.org/data/definitions/209.html)
- [CWE-636: Not Failing Securely](https://cwe.mitre.org/data/definitions/636.html)
