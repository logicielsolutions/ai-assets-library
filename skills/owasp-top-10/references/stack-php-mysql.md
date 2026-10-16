# Stack notes — PHP + MySQL / Aurora (example)

Example stack-specific reference for PHP applications backed by a relational database (MySQL, MariaDB, Aurora MySQL). Use this as a template — copy it, rename to your project's stack name, and adjust to match your codebase's idioms.

The most common OWASP-class bugs in this stack and the canonical fixes.

---

## Database access

Use PDO with prepared statements. Always. Even for "just one quick query."

**Vulnerable:**
```php
$id = $_GET['id'];
$result = $pdo->query("SELECT * FROM customers WHERE id = $id");
```

**Fixed:**
```php
$stmt = $pdo->prepare('SELECT * FROM customers WHERE id = :id');
$stmt->execute(['id' => $_GET['id']]);
$result = $stmt->fetchAll(PDO::FETCH_ASSOC);
```

### Type juggling on numeric inputs

PHP's loose comparison and PDO's emulated prepares can cause unexpected coercion. Bind with explicit types where it matters:

```php
$stmt->bindValue(':id', $_GET['id'], PDO::PARAM_INT);
```

Better: validate first.

```php
$id = filter_var($_GET['id'], FILTER_VALIDATE_INT);
if ($id === false) { http_response_code(400); exit; }
```

### Multi-tenant scoping

If your app serves multiple companies / accounts, every query must scope by the requesting user's tenant. Enforce this in a base repository / DAO so individual endpoints can't skip it:

```php
abstract class TenantScopedRepository {
    protected function find(string $sql, array $params): array {
        $params['_tenant'] = $this->currentUser->tenantId;
        $sql .= ' AND tenant_id = :_tenant';
        // ...
    }
}
```

### Managed-database configuration

If you're on a managed cluster (AWS RDS/Aurora, GCP Cloud SQL, Azure Database for MySQL), apply the equivalent of the AWS-flavored example below. The principles — enforced TLS, credential rotation, retained backups, deletion protection, audit logging — apply universally.

- `require_secure_transport = ON` in the cluster parameter group (forces TLS on every connection).
- IAM database authentication or Secrets Manager rotation, not static passwords in `.env`.
- Backup retention ≥ 7 days (compliance dependent).
- Deletion protection enabled on production clusters.
- CloudTrail data events enabled on the cluster.

---

## Output escaping

PHP's templating defaults are not safe by default the way React JSX is. Audit every echo of a database value or request value into HTML.

**Vulnerable:**
```php
<div>Welcome, <?= $user['name'] ?></div>
```

**Fixed:**
```php
<div>Welcome, <?= htmlspecialchars($user['name'], ENT_QUOTES | ENT_HTML5, 'UTF-8') ?></div>
```

Define a helper (`h()`) once, use it everywhere. If the project uses Blade / Twig, use `{{ $var }}` (auto-escaped) and never `{!! $var !!}` for user content.

---

## File operations

### Uploads

```php
// Validate file type, size, name
$file = $_FILES['upload'];
if ($file['size'] > 5 * 1024 * 1024) { error('Too large'); }
$mime = mime_content_type($file['tmp_name']);
if (!in_array($mime, ['image/jpeg', 'image/png'])) { error('Invalid type'); }

// Store with a server-chosen name, not the user's
$ext = $mime === 'image/jpeg' ? '.jpg' : '.png';
$dest = '/var/app/uploads/' . bin2hex(random_bytes(16)) . $ext;
move_uploaded_file($file['tmp_name'], $dest);
```

Never serve uploads from the same domain as the app if they could contain user-controlled content. Use a separate domain or S3 with `Content-Disposition: attachment`.

### Path traversal

Audit any code that builds a filesystem path from user input. The pattern from [A01](01-broken-access-control.md):

```php
$file = basename($_GET['file']);
$path = realpath('/var/app/documents/' . $file);
if ($path === false || strpos($path, '/var/app/documents/') !== 0) {
    http_response_code(404); exit;
}
readfile($path);
```

### Phar deserialization

PHP-specific risk. Many file-related functions (`file_exists`, `file_get_contents`, `is_dir`, `unlink`, etc.) will trigger Phar metadata deserialization if passed a `phar://` URL. If you ever do filesystem operations on user-controlled paths, defend with:

```php
if (str_contains($userPath, 'phar://')) { abort(); }
// or restrict to a basename and prefix, see above
```

In PHP 8+, Phar handling is more restricted but still warrants caution.

---

## Sessions

```php
// php.ini or runtime
session.cookie_httponly = 1
session.cookie_secure = 1
session.cookie_samesite = "Lax"     // "Strict" for admin areas
session.use_strict_mode = 1
session.gc_maxlifetime = 1800       // 30 min; tune for the app
```

On login, regenerate the session ID:
```php
session_regenerate_id(true);
```

On logout, destroy the session server-side:
```php
$_SESSION = [];
session_destroy();
setcookie(session_name(), '', time() - 3600, '/');
```

---

## Password storage

```php
$hash = password_hash($plain, PASSWORD_ARGON2ID);   // PHP 7.3+

// Verify
if (password_verify($plain, $user['password_hash'])) {
    if (password_needs_rehash($user['password_hash'], PASSWORD_ARGON2ID)) {
        $newHash = password_hash($plain, PASSWORD_ARGON2ID);
        // store $newHash
    }
    // login OK
}
```

Never `md5`, `sha1`, or `crypt` for passwords. Audit legacy tables for these and migrate on next login.

---

## Error handling

```php
// production
ini_set('display_errors', '0');
ini_set('log_errors', '1');
ini_set('error_log', '/var/log/app/php_errors.log');
```

Throw exceptions for application errors; central handler converts to client responses with request IDs.

```php
set_exception_handler(function ($e) {
    $requestId = bin2hex(random_bytes(8));
    error_log(sprintf('[%s] %s', $requestId, (string) $e));
    http_response_code(500);
    echo json_encode(['error' => 'Internal error', 'requestId' => $requestId]);
});
```

Never echo `$e->getMessage()` or `$e->getTraceAsString()` to the client.

---

## Common patterns to audit

When reviewing PRs in a PHP codebase:

1. **Every new `query()` / `exec()` call** — is the value parameterized, or is it building SQL with concatenation?
2. **Every new endpoint** — does it call the central auth middleware? Is there a tenant scope?
3. **Every new template echo** — is `htmlspecialchars` or a Blade-style auto-escape in play?
4. **Every new file operation** — is the path validated?
5. **Every new external call** (Twilio, payment gateway, CRM, etc.) — credentials from Secrets Manager? TLS enforced?
6. **Every new dependency in `composer.json`** — name verified on Packagist, version pinned, `composer.lock` committed?

---

## Mixed PHP / JS gotcha

If your PHP backend has a JS frontend, audit JSX/TS for PHP idioms that don't translate. A common bug pattern: PHP-style bracket notation (`arr[]` to append) leaking into JavaScript form serialization or array building, where it does something completely different. Silent FE-side bugs that degrade rather than crash are the hardest to detect — combine with [A09](09-logging-alerting.md) and ensure client-side errors are reported to the server (via a `/api/client-error` endpoint or Sentry).

---

## Tools to run

- **PHPStan** (level 6+ ideally): static analysis for type errors that often correlate with security bugs.
- **Psalm** with `taint analysis`: tracks tainted input from sources (`$_GET`, `$_POST`, request bodies) to sinks (queries, `exec`, `echo`).
- **Composer audit**: `composer audit` in CI.
- **PHPCS / PHP_CodeSniffer** with security rules.
