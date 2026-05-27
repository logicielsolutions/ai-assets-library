# Stack notes — Node.js + MongoDB + React (example)

Example stack-specific reference for Node.js backends backed by MongoDB (Atlas or self-hosted), with React frontends. Use this as a template — copy it, rename to your project's stack name, and adjust to match your codebase's idioms.

The most common OWASP-class bugs in this stack and the canonical fixes.

---

## MongoDB-specific injection

MongoDB doesn't have a parsed query language, so it's immune to classic SQL injection. It has its own family of problems.

### Type-juggling injection

The big one. If `req.body.password` is expected as a string but the client sends an operator object, Mongoose / native driver evaluate it as a query:

```js
// Vulnerable
const user = await User.findOne({
  email: req.body.email,
  password: req.body.password,    // ← {"$ne": null} matches any user
});
```

**Defense — validate every request body and query:**

```js
import { z } from 'zod';

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128),
});

app.post('/api/login', async (req, res) => {
  const { email, password } = LoginSchema.parse(req.body);   // throws on type mismatch
  const user = await User.findOne({ email });
  if (!user || !(await argon2.verify(user.passwordHash, password))) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  // ...
});
```

Apply a global error handler that catches `ZodError` and returns 400.

### `$where`, `mapReduce`, `$function`, `$expr` with user input

Never pass user input into these operators — they evaluate JavaScript expressions:

```js
// Vulnerable
db.collection.find({ $where: `this.username == '${req.query.user}'` });

// If you actually need a JS predicate, write it server-side and don't interpolate user input.
db.collection.find({ username: req.query.user });    // normal query is almost always sufficient
```

### Aggregation pipelines from the client

```js
// Vulnerable — client controls the entire pipeline
const docs = await collection.aggregate(req.body.pipeline);
```

Build the pipeline server-side from validated, narrow inputs:

```js
const QuerySchema = z.object({ dateFrom: z.coerce.date(), dateTo: z.coerce.date() });
const { dateFrom, dateTo } = QuerySchema.parse(req.query);
const docs = await collection.aggregate([
  { $match: { tenantId: req.user.tenantId, createdAt: { $gte: dateFrom, $lte: dateTo } } },
  { $group: { _id: '$status', count: { $sum: 1 } } },
]).toArray();
```

### Multi-tenant scoping in Mongo

Every query, every aggregation stage, every update must include `tenantId`. Best enforced as a Mongoose middleware that auto-injects the scope, with tests that catch the missing-scope case:

```js
schema.pre(/^find/, function () {
  if (!this.getQuery().tenantId) {
    throw new Error('Tenant scope missing — refusing query');
  }
});
```

The "refuse without scope" pattern catches forgotten scopes at dev/test time instead of silently returning cross-tenant data.

### Atlas configuration

- IP allowlist: explicit, not `0.0.0.0/0`. Use PrivateLink / VPC peering for production.
- Database users: scoped to a single database with role-specific permissions (`readWrite` on your app DB only).
- Authentication: SCRAM-SHA-256, not SCRAM-SHA-1.
- TLS: required in the connection string (`tls=true`).
- Encryption at rest: enabled (default in Atlas) — consider customer-managed keys for sensitive clusters.
- Backup: continuous + scheduled snapshots; retention per data classification.
- Audit log: enabled and forwarded to a SIEM.

---

## Express / Node patterns

### Schema validation everywhere

Every endpoint validates `body`, `query`, `params` with Zod/Joi/AJV at the boundary. Reject 400 on schema failure, never proceed with partial data.

### Auth middleware as first thing in the chain

```js
const requireAuth = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).end();
  try {
    req.user = jwt.verify(token, PUBLIC_KEY, {
      algorithms: ['RS256'],
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    next();
  } catch (e) {
    res.status(401).end();
  }
};

app.use('/api', requireAuth);
```

Every protected route inherits the check. No per-handler "did I remember the auth call?" risk.

### Authorization scoped to the query

The IDOR pattern from [A01](01-broken-access-control.md): never `findById(req.params.id)`. Always `findOne({ _id: req.params.id, tenantId: req.user.tenantId, owner: req.user.id })`.

### Helmet + rate limiting

```js
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

app.use(helmet({
  contentSecurityPolicy: { /* per app */ },
  hsts: { maxAge: 31536000, includeSubDomains: true },
}));

app.use('/api/login', rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  message: { error: 'Too many requests' },
}));
```

Per-route rate limits for sensitive endpoints (login, reset, MFA, expensive aggregations). Global lower limit for the rest.

### Error handler

```js
app.use((err, req, res, next) => {
  if (err instanceof z.ZodError) {
    return res.status(400).json({ error: 'Invalid input', issues: err.issues });
  }
  logger.error({ event: 'unhandled_error', err, requestId: req.id });
  res.status(500).json({ error: 'Internal error', requestId: req.id });
});
```

---

## JWT in this stack

Mongo and Node frequently use `jsonwebtoken`. The algorithm-confusion attacks ([A07](07-authentication.md)) hit this library historically (CVE-2022-23529 and others). Always:

```js
jwt.verify(token, PUBLIC_KEY, {
  algorithms: ['RS256'],     // ← critical
  issuer: 'https://auth.example.com',
  audience: 'api.example.com',
  clockTolerance: 5,
});
```

Never `jwt.verify(token, KEY)` without options.

Keep the library current — algorithm-confusion bugs have recurred.

---

## React / frontend

### XSS

JSX auto-escapes text. Don't undo it:

```jsx
// Vulnerable
<div dangerouslySetInnerHTML={{ __html: user.bio }} />

// Fixed
<div>{user.bio}</div>

// If rich text is required
import DOMPurify from 'dompurify';
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(user.bio) }} />
```

### URL injection

`<a href={user.url}>` with `user.url = "javascript:..."` is an XSS vector:

```jsx
function safeUrl(u) {
  try {
    const parsed = new URL(u);
    if (!['http:', 'https:', 'mailto:'].includes(parsed.protocol)) return '#';
    return parsed.toString();
  } catch {
    return '#';
  }
}

<a href={safeUrl(user.url)} rel="noopener noreferrer" target="_blank">{user.url}</a>
```

### Storage of secrets in the browser

Never put long-lived secrets (full-access API keys, signing keys, etc.) in `localStorage`, `sessionStorage`, or React state — any XSS reads them. Use HTTP-only cookies for session tokens. Public client identifiers (Stripe publishable keys, OAuth client IDs) are fine in source.

### CSP

The strongest defense against any XSS bug that slips through:

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'nonce-{random}';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  connect-src 'self' https://api.example.com;
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';
```

Per-request nonce on inline scripts (use one only if you genuinely need inline). Tighten progressively.

---

## Common patterns to audit

When reviewing PRs in a Node.js + Mongo codebase:

1. **Every new endpoint** — Zod schema on input? `requireAuth` upstream? Tenant scoping in the query?
2. **Every `findOne` / `find` / `aggregate`** — `tenantId` in the filter?
3. **Every `jwt.verify`** — explicit `algorithms`?
4. **Every React component receiving server data** — auto-escaped, or `dangerouslySetInnerHTML` with DOMPurify?
5. **Every new package in `package.json`** — name verified, version pinned, lockfile updated, postinstall scripts reviewed?
6. **Every config / env change** — secrets pulled from Secrets Manager / Parameter Store, not committed?

---

## Feature-flag and rollout discipline

Feature-flag rollouts that change query shape (new aggregation, new index requirement) need staged rollout, query-cost monitoring, and a kill switch. Crash-but-recover patterns hide bugs — crash loops without an alert are an [A09](09-logging-alerting.md) failure. Overlaps with [A06 Insecure Design](06-insecure-design.md) and [A10 Exceptional Conditions](10-exceptional-conditions.md).

---

## Tools to run

- **ESLint** with `eslint-plugin-security` and `eslint-plugin-no-unsanitized`.
- **`npm audit`** in CI; fix HIGH/CRITICAL.
- **Snyk** or **Trivy** for deeper supply-chain / image scanning.
- **TypeScript strict mode**: catches a surprising number of bugs that would otherwise become security issues (missing null checks, wrong types feeding into queries).
