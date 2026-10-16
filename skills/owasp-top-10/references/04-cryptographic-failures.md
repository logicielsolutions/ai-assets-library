# A04:2025 — Cryptographic Failures

Dropped from #2 (2021) to #4 (2025) because TLS, HSTS, and modern framework defaults have closed many common failures. What remains is usually catastrophic when it happens: poor key management, weak password storage, downgrade attacks.

---

## Rules of thumb

- **Don't roll your own crypto.** Use a vetted library — `libsodium` / `crypto` (Node) / `cryptography` (Python) / OpenSSL bindings / `phpseclib` for PHP.
- **Use authenticated encryption** (AES-GCM, ChaCha20-Poly1305). Plain encryption without an integrity tag lets the attacker modify ciphertext undetected.
- **Use a CSPRNG for any security-sensitive randomness.** `crypto.randomBytes` (Node), `random_bytes()` (PHP 7+), `secrets` module (Python). Never `Math.random()`, `mt_rand`, `rand`.

---

## Sub-classes to watch for

### Deprecated hash functions for security purposes

MD5 and SHA-1 are broken for cryptographic uses. Acceptable: SHA-256, SHA-3, BLAKE2/3. Pseudonymous identifiers and ETags don't strictly need cryptographic strength, but defaulting to SHA-256 removes the question.

### Password hashing

Never plain hash. Never unsalted. Never fast.

**Current best practice (2025):**
- **Argon2id** — preferred new systems.
- **scrypt** — acceptable.
- **bcrypt** — acceptable for legacy systems; cost factor ≥ 12 (verify against OWASP current guidance).
- **PBKDF2-HMAC-SHA-512** — acceptable; iteration count ≥ 600,000 (verify against OWASP current guidance).

**Node:**
```js
import { hash, verify } from '@node-rs/argon2';
const hashed = await hash(password, {
  memoryCost: 19456,      // 19 MiB — verify against current OWASP guidance
  timeCost: 2,
  outputLen: 32,
  parallelism: 1,
});
const ok = await verify(hashed, password);
```

**PHP:**
```php
$hashed = password_hash($password, PASSWORD_ARGON2ID);
$ok = password_verify($password, $hashed);
// password_needs_rehash($hashed, PASSWORD_ARGON2ID) — re-hash on next login if params changed
```

### ECB mode (and other unauthenticated modes)

Block ciphers (AES, DES) encrypt in fixed-size blocks. "Mode of operation" defines how the blocks chain. ECB encrypts each block independently — identical plaintext blocks produce identical ciphertext blocks. The classic demonstration is the "ECB penguin": encrypting an image of the Linux Tux logo with AES-ECB produces output that still visibly shows the penguin.

**Vulnerable:** `aes-128-ecb`, `aes-256-ecb`.
**Use instead:** `aes-256-gcm` (authenticated) or `chacha20-poly1305` (authenticated). Generate a fresh, random 12-byte IV per encryption. Never reuse an IV with the same key.

**Node (AES-256-GCM):**
```js
import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';

function encrypt(plaintext, key) {
  const iv = randomBytes(12);                            // 96-bit IV for GCM
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]);                  // store all three together
}

function decrypt(blob, key) {
  const iv = blob.subarray(0, 12);
  const tag = blob.subarray(12, 28);
  const ct = blob.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}
```

### TLS / transport

- TLS 1.2 minimum; TLS 1.3 preferred.
- Forward-secrecy cipher suites only (`ECDHE_*`).
- HSTS with `max-age` ≥ 31536000 (1 year), `includeSubDomains`, `preload` once the domain stable.
- No CBC ciphers in new config.
- Never `STARTTLS` for sensitive protocols — use implicit TLS.
- Validate server certificates and the full chain; never disable verification "to fix" a TLS error in production code.

### Key management

- Most sensitive keys in HSM / KMS (AWS KMS, GCP KMS, Azure Key Vault, HashiCorp Vault). Application gets to call `Encrypt` / `Decrypt`, not to see the raw key.
- Distinct keys per environment.
- Rotation on a schedule, not just on incident.
- Never check keys into git, config files, container images, or CI logs.
- Application reads keys from a secret manager at runtime, not from environment variables baked into the image.

### IV / nonce mistakes

- Generate IVs with a CSPRNG. Never zero, never sequential.
- Never reuse an IV with the same key under GCM — it catastrophically breaks confidentiality and integrity.
- For ChaCha20-Poly1305 same rule applies.
- IV is not secret; store it alongside the ciphertext.

### Insufficient randomness

`Math.random()`, `mt_rand`, Python `random` are not cryptographic. They produce predictable sequences from observable state. For tokens, session IDs, password reset links, MFA codes, salts, IVs — use:
- Node: `crypto.randomBytes`, `crypto.randomUUID`.
- PHP: `random_bytes`, `random_int`.
- Python: `secrets.token_urlsafe`, `secrets.randbits`.
- Java: `SecureRandom`.

### Padding oracle / side channels

If your code reports "bad padding" vs "bad MAC" with different error messages or timings, an attacker can exploit it. Use authenticated encryption (GCM, Poly1305) so the only failure mode is "tag mismatch", and use constant-time comparison (`crypto.timingSafeEqual`, `hash_equals` in PHP) for MACs.

### Caching of sensitive responses

Sensitive responses should send `Cache-Control: no-store, no-cache, must-revalidate` and `Pragma: no-cache`. Without this, CDNs and shared caches can leak data across users.

---

## Prevention checklist

- [ ] All sensitive data classified; encryption decisions match the classification.
- [ ] TLS 1.2+ enforced everywhere; HSTS set with long max-age.
- [ ] Internal service-to-service traffic also TLS, not just public traffic.
- [ ] Passwords stored with Argon2id / scrypt / bcrypt / PBKDF2, with current parameters.
- [ ] No MD5, SHA-1, ECB mode, or DES anywhere in the security path.
- [ ] Encryption uses AES-GCM or ChaCha20-Poly1305 with fresh random IVs.
- [ ] Keys in HSM / KMS, not in env vars or source.
- [ ] All security-sensitive randomness from a CSPRNG.
- [ ] Constant-time comparison for tokens, MACs, signatures.
- [ ] Sensitive responses set `Cache-Control: no-store`.
- [ ] Plan for post-quantum migration on high-risk systems (target: 2030).

---

## Stack-aware notes

- **PHP + relational DB**: prefer `password_hash` with `PASSWORD_ARGON2ID`; if legacy bcrypt with PASSWORD_DEFAULT, set a high cost and call `password_needs_rehash` on login. Managed-DB connections must use TLS — verify the cluster requires it via its parameter group (e.g. `require_secure_transport = ON` on MySQL/Aurora).
- **Node.js**: use `@node-rs/argon2` or `argon2` package. JWT signing is covered under [A07](07-authentication.md) but the algorithm and key handling rules from this category apply.
- **MongoDB Atlas**: enable encryption at rest (default in Atlas); enforce TLS-only connection strings (`tls=true`); use customer-managed keys via AWS KMS for the highest-sensitivity clusters.
- **AWS**: KMS-based envelope encryption for application-layer secrets; never write a raw data key to disk.

---

## OWASP references

- [Cryptographic Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)
- [Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [Transport Layer Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Transport_Layer_Security_Cheat_Sheet.html)
