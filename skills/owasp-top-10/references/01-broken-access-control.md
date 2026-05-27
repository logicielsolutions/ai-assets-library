# A01:2025 — Broken Access Control

100% of tested applications have some form of broken access control. It is the #1 risk for a reason: every endpoint, every record, every URL is a potential bypass.

**Authentication ≠ Authorization.** Authentication proves *who* you are. Authorization decides *what* you can do. A correctly-authenticated user calling `/api/orders/12346` (their neighbor's order) is an authentication success and an authorization failure. Most developers conflate the two. That's where bugs come from.

---

## Sub-classes to watch for

### IDOR — Insecure Direct Object Reference

The pattern: a handler takes an ID from the request and returns the matching record without checking that the requesting user owns it.

**Vulnerable (Node/Express):**
```js
app.get('/api/orders/:id', requireAuth, async (req, res) => {
  const order = await Order.findById(req.params.id);   // ← no ownership check
  res.json(order);
});
```

**Fixed:**
```js
app.get('/api/orders/:id', requireAuth, async (req, res) => {
  const order = await Order.findOne({
    _id: req.params.id,
    customerId: req.user.id,    // ← ownership scoped in the query
  });
  if (!order) return res.status(404).json({ error: 'Not found' });
  res.json(order);
});
```

Note the response is 404, not 403. 403 confirms the resource exists; 404 doesn't leak that.

For NoSQL stores (e.g. MongoDB) the ownership scoping must happen in the query itself, not in a post-fetch `if`. Post-fetch checks race with caching, are easy to forget, and don't compose with `find()` (which returns lists).

### Missing authorization on write operations

Read endpoints often get the most attention. POST/PUT/PATCH/DELETE need the same checks, and the consequence of getting them wrong is usually worse (data change, not data read).

**Vulnerable:**
```js
app.patch('/api/users/:id', requireAuth, async (req, res) => {
  await User.updateOne({ _id: req.params.id }, req.body);   // ← also no ownership, also no field allowlist
});
```

Two bugs: (1) any authenticated user can modify any other user, and (2) `req.body` is passed straight through, so the request can also set `role: "admin"`.

**Fixed:**
```js
const ALLOWED_FIELDS = ['name', 'avatarUrl', 'preferences'];
app.patch('/api/users/:id', requireAuth, async (req, res) => {
  if (req.params.id !== req.user.id && !req.user.isAdmin) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const update = pick(req.body, ALLOWED_FIELDS);
  await User.updateOne({ _id: req.params.id }, update);
  res.json({ ok: true });
});
```

### Force browsing

The URL `/admin/users` not appearing in the menu does not protect it. Guard the route on the server. Test by `curl`ing it as an unauthenticated user, and as a non-admin authenticated user. If either gets through, the route is unprotected.

### Client-side-only access control

If the entire access control story is "the frontend doesn't render the button", an attacker bypasses the UI:

```bash
curl -X POST https://example.com/api/admin/delete-user -d '{"id":"123"}'
```

Server-side enforcement is the only access control that exists. Frontend gating is UX, not security.

### Path / Directory Traversal

User-controlled filename concatenated into a filesystem path.

**Vulnerable (PHP):**
```php
$file = $_GET['file'];
readfile('/var/app/documents/' . $file);   // ?file=../../../etc/passwd
```

**Fixed:**
```php
$file = basename($_GET['file']);                            // strip any path
$path = realpath('/var/app/documents/' . $file);           // resolve symlinks
if ($path === false || strpos($path, '/var/app/documents/') !== 0) {
    http_response_code(404);
    exit;
}
readfile($path);
```

The two-layer defense — strip path components AND verify the resolved path is still under the allowed base — is what survives clever encoding (`%2e%2e`, null bytes, UNC paths on Windows).

### JWT tampering / metadata manipulation

Covered in depth under [A07 Authentication](07-authentication.md). The short version:

- Always pass an explicit `algorithms` array to `jwt.verify` — never let the token's header pick the algorithm.
- Validate `exp`, `iss`, `aud` claims, not just signature.
- The token payload is base64-encoded, not encrypted; do not put secrets in it.

### CORS misconfiguration

Reflecting `Origin` blindly:

```js
res.setHeader('Access-Control-Allow-Origin', req.headers.origin);   // ← reflects anything
res.setHeader('Access-Control-Allow-Credentials', 'true');
```

With `Allow-Credentials: true` and a reflected origin, any site the user visits can make authenticated requests to your API. Use an allowlist.

### SSRF (now under A01)

Server-side request forgery used to be A10 in 2021; in 2025 it's folded into Broken Access Control because the server is making a request on the user's behalf to a resource the user shouldn't be able to reach.

**Vulnerable:**
```js
app.get('/preview', async (req, res) => {
  const { url } = req.query;
  const body = await fetch(url);   // ← can hit 169.254.169.254 (AWS metadata), localhost, internal subnets
  res.send(await body.text());
});
```

**Fixes:**
- Allowlist hostnames (not blocklist — IPv6, decimal-encoded IPs, and DNS rebinding defeat blocklists).
- Resolve DNS *before* the request, check the resolved IP is not in RFC1918 / link-local / metadata ranges, then connect by IP.
- For AWS, require IMDSv2 (session-token-based) to block the most common SSRF-to-credential-theft path.

---

## Prevention checklist

- [ ] Authorization decision lives in trusted server-side code.
- [ ] One central middleware / helper enforces auth and authz on protected routes — not scattered per-handler logic.
- [ ] Deny-by-default: every new route is private unless explicitly opened.
- [ ] Object lookups scope by ownership in the query, not in a post-fetch check.
- [ ] POST/PUT/PATCH/DELETE checked as carefully as GET.
- [ ] File path inputs validated with `basename` + `realpath` + base-directory check.
- [ ] JWT verification pins the algorithm; SSRF endpoints allowlist destinations.
- [ ] CORS uses an origin allowlist; `Allow-Credentials: true` is never paired with a reflected origin.
- [ ] Access-control failures are logged with user ID, route, method, and timestamp.
- [ ] Rate limits on every authenticated endpoint to make brute-forcing IDs expensive.

---

## Testing patterns

For every authenticated route, write at minimum:

```js
describe('GET /api/orders/:id', () => {
  it('returns the order for its owner', async () => {
    const order = await createOrder({ customerId: alice.id });
    const res = await request.get(`/api/orders/${order.id}`).set(authHeader(alice));
    expect(res.status).toBe(200);
  });

  it('does not leak another user\'s order', async () => {
    const order = await createOrder({ customerId: alice.id });
    const res = await request.get(`/api/orders/${order.id}`).set(authHeader(bob));
    expect(res.status).toBe(404);   // not 403 — 404 doesn't confirm the resource exists
  });

  it('rejects unauthenticated requests', async () => {
    const order = await createOrder({ customerId: alice.id });
    const res = await request.get(`/api/orders/${order.id}`);
    expect(res.status).toBe(401);
  });

  it('rejects malformed IDs without a stack trace', async () => {
    const res = await request.get('/api/orders/not-an-objectid').set(authHeader(alice));
    expect(res.status).toBe(400);
    expect(res.body).not.toHaveProperty('stack');
  });
});
```

Run this matrix as a fixture across every new authenticated route. The cost is small; the catch rate is enormous.

---

## OWASP references

- [Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
- [Testing Guide: Authorization Testing](https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/05-Authorization_Testing/README)
