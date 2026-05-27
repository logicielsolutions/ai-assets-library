# A05:2025 — Injection

Dropped from #1 (2021) to #5 (2025) because parameterized queries, ORMs, and framework-level escaping have reduced classic failures. Still the largest CWE family in the Top 10 — 37 distinct CWEs, including XSS (30k+ CVEs) and SQL injection (14k+ CVEs).

**Universal pattern:** untrusted input reaches an interpreter, the interpreter treats part of it as instructions rather than data. The interpreter can be a SQL engine, a shell, an HTML parser, an LDAP directory, a template engine, an XML parser, or an LLM. The defense is the same: parameterize, validate, escape.

---

## SQL injection

**Vulnerable (PHP):**
```php
$id = $_GET['id'];
$rows = $pdo->query("SELECT * FROM accounts WHERE id = '$id'")->fetchAll();
```

Attacker: `?id=' OR '1'='1` → returns all accounts.

**Fixed (PHP/PDO):**
```php
$stmt = $pdo->prepare('SELECT * FROM accounts WHERE id = :id');
$stmt->execute(['id' => $_GET['id']]);
$rows = $stmt->fetchAll();
```

**Fixed (Node + `mysql2`):**
```js
const [rows] = await pool.execute('SELECT * FROM accounts WHERE id = ?', [req.query.id]);
```

**ORMs (Laravel Eloquent, Sequelize, Mongoose):** safe by default, but `whereRaw`, `query`, `$queryRaw`, and string-interpolated `where` clauses break the safety. Audit for these.

**Caveat: table and column names cannot be parameterized.** If the user picks the column to sort by, validate against an allowlist:
```js
const ALLOWED_SORT = ['createdAt', 'amount', 'status'];
const sortCol = ALLOWED_SORT.includes(req.query.sort) ? req.query.sort : 'createdAt';
```

---

## NoSQL injection (MongoDB)

Mongo doesn't have a string-parsed query language, so it's not vulnerable to classic SQL-style injection. It has different problems.

### Type-juggling injection

If `req.body.password` is expected as a string but the client sends `{"$ne": null}`, Mongoose / native driver will treat it as a query operator:

**Vulnerable:**
```js
const user = await User.findOne({
  email: req.body.email,
  password: req.body.password,    // ← attacker sends {"$ne": null} → matches any user
});
```

**Fixed:** coerce types explicitly, or use a validator (Zod, Joi, AJV):
```js
const schema = z.object({ email: z.string().email(), password: z.string().min(1) });
const { email, password } = schema.parse(req.body);
const user = await User.findOne({ email });
if (!user || !(await argon2.verify(user.passwordHash, password))) {
  return res.status(401).json({ error: 'Invalid credentials' });
}
```

### `$where` operator with user input

```js
db.collection.find({ $where: `this.username == '${req.query.user}'` });   // ← JS injection into Mongo's JS evaluator
```

Never use `$where` with user input. Same for `mapReduce` and `$function`. Use regular field queries.

### Aggregation pipeline injection

Letting the client supply pipeline stages directly:
```js
const docs = await collection.aggregate(req.body.pipeline);   // ← any operator the client wants
```
Build the pipeline server-side from validated inputs.

---

## OS command injection

Any time the application invokes a shell, an interpolated user value is a vulnerability.

**Vulnerable (Node):**
```js
const { exec } = require('child_process');
exec(`nslookup ${req.query.domain}`, callback);   // ← ?domain=example.com;cat /etc/passwd
```

**Fixed (Node):** use `execFile` / `spawn` with an argv array (no shell):
```js
const { execFile } = require('child_process');
execFile('nslookup', [req.query.domain], callback);
```

Even with `execFile`, validate the argument format — `nslookup` will accept many strings, but for hostnames you should match against a strict regex.

**Vulnerable (PHP):**
```php
system("convert " . $_POST['file'] . " output.jpg");
```

**Fixed:**
```php
$file = $_POST['file'];
if (!preg_match('/^[a-zA-Z0-9_\-\.]+\.(jpg|png|gif)$/', $file)) {
    http_response_code(400);
    exit;
}
$result = system(escapeshellcmd("convert " . escapeshellarg($file) . " output.jpg"));
```

Better: avoid shelling out altogether — use `Imagick`, `GD`, etc.

---

## Cross-Site Scripting (XSS)

Output context matters more than input. The same string is safe in HTML text content, dangerous in a script context, and a different danger in a URL parameter.

### Stored XSS

User-supplied content stored in DB, rendered to other users without escaping.

**Vulnerable (React):**
```jsx
<div dangerouslySetInnerHTML={{ __html: user.bio }} />
```

**Fixed:** render as text. React auto-escapes JSX text:
```jsx
<div>{user.bio}</div>
```

If the bio must support formatting, allowlist via `DOMPurify` before rendering:
```jsx
import DOMPurify from 'dompurify';
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(user.bio) }} />
```

### Reflected XSS

User input echoed back in the response without escaping. Same fix — let the templating engine escape by default; bypasses (`| safe`, `html_safe`, `{{!...}}`, `v-html`, `dangerouslySetInnerHTML`) must be rare and audited.

### DOM XSS

`element.innerHTML = userInput`, `eval(userInput)`, `setTimeout(userInput, 0)`. Use `element.textContent` for setting text; don't `eval` user input ever.

### Content-Security-Policy

A strong CSP raises the cost of an XSS bug — even if an attacker injects script, the browser refuses to execute it from an unauthorized origin:
```
Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-{random}'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'
```

---

## XXE — XML External Entity injection

See [A02 Security Misconfiguration](02-security-misconfiguration.md) for full details. Quick rule: every XML parser must explicitly disable DTD and external entities. Prefer JSON for new protocols.

---

## LDAP, expression-language, OGNL, template injection

Same family. Each has a specific escape function or parameterization API. If the project uses any of these interpreters, look up the safe pattern for that specific library and use it, not string concatenation.

---

## LLM prompt injection

Untrusted content (user input, retrieved documents, tool output) reaches an LLM prompt and gets treated as instructions to the model. See the [OWASP LLM Top 10](https://genai.owasp.org/) for the dedicated list.

Defensive patterns:
- Treat user content as data inside the prompt, not as instructions. Use clear delimiters (XML-like tags, fenced sections).
- Apply output validation: if the model is supposed to return JSON, parse it and reject if it doesn't conform.
- Constrain tool use: the model should only be able to call tools whose effects are reversible or audit-logged.
- Don't feed untrusted external content (web pages, emails, PDFs) directly into a high-privilege agent.

---

## Prevention checklist

- [ ] Every database call uses parameterized queries or a safe ORM API. No string concatenation.
- [ ] Mongo queries: type-validate user input before passing as a query field. Never `$where`, `mapReduce`, or `$function` with user input.
- [ ] No `exec()`, `system()`, `passthru()`, `Runtime.exec`, `child_process.exec` with interpolated user input. Use argv form, validate args.
- [ ] Output escaping is the default. Template engine bypasses (`dangerouslySetInnerHTML`, `| safe`, `v-html`) are rare, intentional, and reviewed.
- [ ] XML parsers disable DTD and external entities at construction.
- [ ] Server-side input validation: positive (allowlist), not negative (blocklist).
- [ ] A strong Content-Security-Policy is sent on every HTML response.
- [ ] LLM prompts treat untrusted content as data; tool effects are constrained.
- [ ] SAST/DAST in CI flags string-concatenated queries, eval, and dangerous innerHTML.

---

## Testing patterns

For SQL/Mongo endpoints, write a test that proves the parameterization works:
```js
it('does not match all users when password is sent as an operator', async () => {
  const res = await request.post('/api/login').send({
    email: 'alice@example.com',
    password: { $ne: null },
  });
  expect(res.status).toBe(400);    // Zod rejects the type
});
```

For XSS, write a stored-XSS regression test on every user-facing text field:
```js
it('renders bio as text, not HTML', async () => {
  await api.updateProfile({ bio: '<script>window.x=1</script>' });
  const html = await api.getProfilePage(userId);
  expect(html).not.toMatch(/<script>window\.x=1<\/script>/);
  expect(html).toMatch(/&lt;script&gt;window\.x=1&lt;\/script&gt;/);
});
```

For command injection, fuzz inputs with shell metacharacters (`;`, `&&`, `` ` ``, `$(...)`, newlines) and verify the response is 4xx, not "command executed with extra steps".

---

## OWASP references

- [Injection Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Injection_Prevention_Cheat_Sheet.html)
- [SQL Injection Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html)
- [Cross-Site Scripting Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)
- [OWASP LLM Top 10](https://genai.owasp.org/llmrisk/llm01-prompt-injection/)
