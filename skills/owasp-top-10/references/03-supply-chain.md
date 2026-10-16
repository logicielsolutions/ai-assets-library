# A03:2025 — Software Supply Chain Failures

Top-ranked in the 2025 community survey (50% rated it #1). Highest average incidence rate of any category. Famous attacks: SolarWinds (2020), Log4Shell (2021), Bybit ($1.5B, 2025), Shai-Hulud npm worm (2025).

The 2021 list called this "Vulnerable and Outdated Components". The rename matters: the risk extends across the entire process of building, distributing, and updating software — not just version pinning.

---

## Sub-classes to watch for

### Typosquatting and package name confusion

Attackers register packages with names that look almost identical to popular ones, waiting for a developer's typo or muscle memory.

**npm examples:** `lodashs` (not `lodash`), `momnet` (not `moment`), `colors-js` (not `colors`).
**PyPI examples:** `requets`, `python-sqlite` (vs. system `python3-sqlite3`), homoglyphs using lookalike Unicode characters.

The squatted name doesn't exist upstream, so the registry accepts it. Install-time hooks (`postinstall` in npm, `setup.py` in PyPI) run on the developer's machine and in CI with the build's privileges.

**Defenses:**
- Review every new dependency in PRs. Verify the spelling against the official registry page, not just the diff.
- Scope private packages: `@your-org/...` on npm, with `.npmrc` set so that scope can only resolve from the internal registry.
- Lockfiles checked into source control (`package-lock.json`, `composer.lock`, `Pipfile.lock`); require a PR to change them.
- Use package signing / provenance where available (npm provenance, Sigstore, PyPI trusted publishers).
- Allowlist critical dependencies in CI so new ones can't land without explicit review.

### Dependency confusion

Attacker publishes a public package with the same name as your private internal one. Your build pulls the public version because the resolver prefers the public registry.

**Defense:** scope private packages and configure the package manager to never resolve scoped packages from the public registry. For npm:
```ini
# .npmrc
@your-org:registry=https://npm.internal.your-org.example/
//npm.internal.your-org.example/:_authToken=${INTERNAL_NPM_TOKEN}
```

For Composer (PHP), use a private Satis/Packagist and pin the repository order.

### Floating tags and unverified updates

Pinning to `latest`, `^1.2.3`, or `~1.2.3` means each build can pull a different version. For application dependencies a lockfile makes this safe; for container base images and CI actions, pin by digest.

**Vulnerable:**
```dockerfile
FROM node:18
```
**Fixed:**
```dockerfile
FROM node:18.20.4-bookworm@sha256:0a26210e6d... # update via PR with intent
```

**Vulnerable:**
```yaml
- uses: actions/checkout@v4
```
**Fixed:**
```yaml
- uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11   # v4.1.1
```

### No SBOM, no continuous inventory

If you don't know what's running in production, you can't react to a CVE. SBOM (Software Bill of Materials) is the inventory. OWASP Dependency-Track and Dependency-Check are widely used; npm's `npm audit`, GitHub's Dependabot, and Snyk add scanning.

Subscribe to:
- [OSV.dev](https://osv.dev/) — Open Source Vulnerabilities database.
- [NVD](https://nvd.nist.gov/) — National Vulnerability Database.
- Vendor security advisories for libraries you depend on heavily.

### Weak CI/CD

The pipeline that builds production has often weaker security than production. A compromised pipeline injects code into every deploy.

**Required controls:**
- MFA on every repo and registry account.
- Branch protection on `main` / `master` and any long-lived integration branch (e.g. `develop`).
- Separation of duties: the engineer who writes code does not single-handedly approve and deploy. PR review + automated checks + deploy gate.
- Signed build artifacts; signature verified at deploy time.
- Tamper-evident logs (CloudTrail, GitHub audit log to S3).
- Environment-scoped secrets, not org-wide.

### Untrusted component sources

Downloading a library from a random Stack Overflow answer or a Google result. Always pull from the official registry, official mirror, or your vetted internal mirror. Verify signature / checksum where the registry provides one.

### Unmaintained components

A library hasn't shipped a release in two years and the issue tracker is full of unresolved CVEs. Migration is the only real fix; "virtual patching" via WAF rules buys time but doesn't close the hole.

---

## Prevention checklist

- [ ] Lockfile checked in, updated via PR with review.
- [ ] Every new dependency PR: name verified against the canonical registry, maintainer reputation checked, install-time scripts reviewed.
- [ ] Private packages scoped; package manager configured to refuse public resolution of internal scopes.
- [ ] Container base images and third-party GitHub Actions pinned by digest, not tag.
- [ ] SBOM generated on every build; stored and queryable.
- [ ] Dependency scanning (OWASP DC, Dependabot, Snyk, Trivy) runs on every PR; CRITICAL blocks merge.
- [ ] CI/CD: MFA, branch protection, separation of duties, signed artifacts, scoped secrets.
- [ ] Subscription to CVE feeds for high-impact dependencies; rotation playbook for emergency patches.
- [ ] Canary or staged rollouts for application updates; never deploy a new dependency version to all instances simultaneously.

---

## When you add a new dependency

Before merging the line:

1. **Confirm the name.** Open the registry page directly (not via Google). Spelling exact. Maintainer is who you expected. Recent release activity.
2. **Read the changelog** for the version you're pinning. Is it a major version with breaking changes? A `0.x` version that hasn't stabilized?
3. **Check the dependency tree.** `npm ls newpkg`, `composer show --tree`, `pip show newpkg`. Surprise transitive deps?
4. **Run the audit tool.** `npm audit`, `composer audit`, `pip-audit`.
5. **Note the package's own security posture.** Does it have a security policy? Has it had recent CVEs? Is it maintained?

If any answer is "I don't know," answer it before merging.

---

## When CVE drops on a dependency you use

1. **Confirm exposure.** Is the vulnerable function or path actually called from your code? Many CVEs require specific configurations.
2. **Patch fast where exposed.** Bump the version, run tests, deploy.
3. **Mitigate where you can't patch immediately.** WAF rule, feature flag, disable the affected endpoint.
4. **Log the decision.** Why you patched / chose not to patch / mitigated. This is what evidence looks like in an audit.

---

## Stack-aware notes

- **PHP**: Composer + Packagist. `composer.lock` must be committed. `composer audit` in CI.
- **Node.js**: npm + lockfile. Watch for postinstall scripts in new packages. Consider `--ignore-scripts` on CI installs for additional containment, with explicit allowlist for packages that genuinely need their scripts.
- **GitHub Actions**: pin third-party actions by commit SHA. First-party `actions/*` can use major tags but pin to specific minor for stability.

---

## OWASP references

- [OWASP Dependency-Track](https://dependencytrack.org/)
- [OWASP Dependency-Check](https://owasp.org/www-project-dependency-check/)
- [OSV.dev](https://osv.dev/)
- [SLSA framework](https://slsa.dev/) — supply chain levels for software artifacts
