# A08:2025 — Software or Data Integrity Failures

Integrity failures happen when applications trust code, data, or artifacts without verifying where they came from or whether they've been tampered with. Closely related to A03 Supply Chain — supply-chain is about the attacker compromising something upstream of you; integrity is about whether your own system notices.

If your integrity controls are strong, a compromised upstream gets caught before it executes. If they're weak, you're flying blind.

---

## Sub-classes to watch for

### Insecure deserialization

Some serialization formats can carry executable types or constructors. Feeding untrusted bytes into a deserializer of these formats is one of the most dangerous patterns in application security.

| Language | Dangerous calls | Reasonably safe |
|---|---|---|
| Java | `ObjectInputStream.readObject`, JBoss, RMI | JSON (Jackson with `DefaultTyping` off) |
| Python | `pickle.loads`, `marshal.loads`, `yaml.load` | `json.loads`, `yaml.safe_load` |
| PHP | `unserialize`, Phar deserialization on file ops | `json_decode` |
| Node | `node-serialize`, `serialize-javascript` eval mode | `JSON.parse` |
| .NET | `BinaryFormatter`, `NetDataContractSerializer`, `LosFormatter`, `ObjectStateFormatter` | `System.Text.Json` |
| Ruby | `Marshal.load`, `YAML.load` | `JSON.parse`, `YAML.safe_load` |

**Vulnerable (PHP):**
```php
$data = unserialize($_COOKIE['preferences']);
```
Attacker crafts a payload that triggers magic methods (`__wakeup`, `__destruct`) on autoloaded classes — RCE.

**Vulnerable (Python):**
```python
import pickle
state = pickle.loads(request.cookies['state'])
```

**Fixed:** use JSON or another non-executable format. If you absolutely must deserialize untrusted data in one of these formats, apply an HMAC or signature over the bytes and verify it before deserialization. Better: don't trust the client to hold state — use server-side storage with an opaque key.

### Unverified updates

Auto-update mechanisms that download and apply binaries without verifying signatures. Common in IoT firmware, desktop apps, mobile apps with sideloaded updates, and internal deployment systems that pull from build artifacts without verification.

**Fix:** every release signed by the publisher; client verifies signature before applying. Use an established framework (TUF, Sigstore, vendor's signed-update SDK) rather than rolling your own.

### Unsigned artifacts in the build pipeline

The build produces a `.jar`, `.war`, `.dll`, container image, or `.tar.gz`. The deploy pulls it and runs it. If there's no signature verification in between, anyone who can write to the artifact storage can swap the artifact.

**Fix:** sign artifacts in the build (Sigstore / cosign / vendor signing). Verify signature in the deploy step. Fail closed on mismatch.

### Untrusted external services with too much access

The OWASP scenario: a company maps `support.myCompany.com` to a third-party support provider's infrastructure. Cookies set on the parent domain are sent to the support subdomain — including authentication cookies. The third party can read them and impersonate users.

**Fix:** map third-party services on a domain you don't share cookies with. Either a different second-level domain (`mycompany-support.com` not `support.mycompany.com`) or set cookies with the narrowest `Domain` attribute that works.

### Untrusted package sources

Developer can't find a package on the official registry; downloads from a tutorial site or a forked repo. Same family as A03 Supply Chain — never pull dependencies from unverified mirrors.

### CI/CD without integrity controls

Pipeline trusts whatever it builds without verifying where the source came from, what it built, and what's being deployed.

**Required controls:**
- Source is fetched from a known origin (your git server), at a verified commit.
- Build runs in an isolated environment (fresh container, no persistent state).
- Output is signed.
- Provenance is attached (SLSA-style attestation): "this artifact was built from this commit, with these dependencies, in this environment, at this time".
- Deploy verifies the signature and provenance before running the artifact.

### Missing sub-resource integrity (SRI)

If your HTML loads third-party scripts (CDN, analytics, widgets) without an SRI hash, a compromised CDN serves attacker-controlled JS to your users.

**Vulnerable:**
```html
<script src="https://cdn.example.com/library.js"></script>
```

**Fixed:**
```html
<script src="https://cdn.example.com/library.js"
        integrity="sha384-oqVuAfXRKap7fdgcCY5uykM6+R9GqQ8K/uxy9rx7HNQlGYl1kPzQho1wx4JwY8wC"
        crossorigin="anonymous"></script>
```

If the hash doesn't match, the browser refuses to execute. Cheap to add, widely under-used.

---

## Prevention checklist

- [ ] No deserialization of untrusted input via `pickle`, `unserialize`, `ObjectInputStream`, etc. JSON or another non-executable format only.
- [ ] If untrusted serialized data must be deserialized, an HMAC or signature is verified first.
- [ ] All build artifacts signed; signature verified at deploy.
- [ ] Container images pulled by digest, signed, verified.
- [ ] CI/CD: isolated build environment, verified source, attached provenance.
- [ ] Auto-update mechanisms verify publisher signatures before applying.
- [ ] Third-party subdomains do not share cookies with the main app.
- [ ] All CDN-hosted scripts and stylesheets use SRI hashes.
- [ ] Dependencies pulled only from official / vetted-internal registries.
- [ ] Pipeline access controls: no single individual writes code AND promotes to prod without review.

---

## Testing patterns

For deserialization endpoints:
```js
it('rejects tampered signed payload', async () => {
  const valid = signedPayload({ userId: 'alice', role: 'user' });
  const tampered = valid.replace('user', 'admin');         // flip a byte
  const res = await request.get('/api/state').set('Cookie', `state=${tampered}`);
  expect(res.status).toBe(400);
});

it('rejects unsigned payload', async () => {
  const raw = Buffer.from(JSON.stringify({ userId: 'alice', role: 'admin' })).toString('base64');
  const res = await request.get('/api/state').set('Cookie', `state=${raw}`);
  expect(res.status).toBe(400);
});
```

For artifact signing — in CI, fail the deploy job if signature verification doesn't pass. Add a smoke test that runs a deploy with a tampered artifact and confirms the job fails.

---

## Stack-aware notes

- **PHP**: audit for `unserialize` on any data that originates from a request (cookies, POST bodies, query params) or from an external source (file upload, API response). PHP's Phar deserialization is an under-appreciated risk — file operations like `file_exists` on a `phar://` URL can trigger deserialization.
- **Node.js**: avoid `node-serialize`. `JSON.parse` is the right default. If you must store complex objects, store an ID and look up server-side.
- **CI/CD**: GitHub Actions third-party actions pinned by SHA (A03 + A08 overlap). Artifact uploads to S3 with bucket versioning enabled so a tampered artifact can be rolled back.

---

## OWASP references

- [Deserialization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Deserialization_Cheat_Sheet.html)
- [Software Supply Chain Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Software_Supply_Chain_Security_Cheat_Sheet.html)
- [SLSA framework](https://slsa.dev/)
- [Sigstore / cosign](https://www.sigstore.dev/)
