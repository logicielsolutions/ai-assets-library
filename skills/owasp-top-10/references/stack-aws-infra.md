# Stack notes — AWS infrastructure (example)

Example reference for AWS infrastructure security. Most security misconfigurations on AWS fall under [A02 Security Misconfiguration](02-security-misconfiguration.md) and [A09 Logging & Alerting](09-logging-alerting.md). Concrete patterns below.

Use this as a template — adjust account counts, retention windows, and tooling to match your environment.

---

## S3

### Block public access (default)

Every new bucket should have all four BlockPublicAccess flags `true`:

```hcl
resource "aws_s3_bucket_public_access_block" "this" {
  bucket = aws_s3_bucket.this.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
```

If a bucket genuinely must serve public content (web assets, public downloads), document why in the PR description and put it on a dedicated bucket — never on a bucket that also stores private data.

### Server-side encryption

Default-encrypt every bucket:

```hcl
resource "aws_s3_bucket_server_side_encryption_configuration" "this" {
  bucket = aws_s3_bucket.this.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.app.arn
    }
    bucket_key_enabled = true
  }
}
```

SSE-S3 (`AES256`) is the floor; SSE-KMS adds key-level access control and audit.

### Versioning + Object Lock for audit-critical buckets

CloudTrail destination buckets, log archives, and signed-artifact buckets benefit from Object Lock to prevent tampering even by privileged users.

### Bucket policies

Avoid `Principal: "*"` outside explicit public-asset use cases. Use IAM roles + identity-based policies for application access where possible.

---

## IAM

### Least privilege

No `Action: "*"`, no `Resource: "*"` in identity-based policies for application roles. If a Lambda needs to read from one S3 prefix, scope the policy to that prefix.

```hcl
data "aws_iam_policy_document" "lambda_s3" {
  statement {
    effect    = "Allow"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.uploads.arn}/customer-files/*"]
  }
}
```

### Service-linked roles

Per-service / per-function role. No shared "application role" used by everything.

### Cross-account roles

External ID required on AssumeRole for any third-party access. MFA condition on human roles.

### Inline policies vs managed policies

Inline policies harder to audit at scale. Prefer customer-managed policies attached to roles.

### No long-lived access keys

For humans: SSO via Identity Center. Programmatic access via STS / IAM Identity Center / temporary credentials.
For services: IAM roles via instance profile / Lambda execution role / IRSA (for EKS) / Pod Identity. Never bake an access key into an image.

### Root account

MFA on root. Access keys deleted. Used only for the handful of operations that require it.

---

## CloudTrail

### Required configuration

- Organization trail (one trail covering all accounts).
- Logs delivered to a dedicated central account / bucket.
- Log file validation enabled.
- KMS-encrypted destination bucket.
- Object Lock on the destination bucket.
- Management events: read and write.
- Data events for sensitive resources (S3 buckets with customer data, KMS keys).

### Retention

Set an explicit retention. "Never expire" is not the same as a defined retention policy from an audit perspective. Recommendation: 24 months minimum for CloudTrail (security-critical).

### Alerts to write

- Trail disabled.
- Trail logging stopped.
- Destination bucket policy changed.
- KMS key disabled.
- New IAM user created.
- IAM policy change with `*` action or `*` resource.
- Root account login.
- AssumeRole from unusual source IP / unusual account.

---

## VPC Flow Logs

Capture VPC, subnet, or ENI-level network flow.

```hcl
resource "aws_flow_log" "vpc" {
  log_destination      = aws_cloudwatch_log_group.flow.arn
  traffic_type         = "ALL"
  vpc_id               = aws_vpc.main.id
  max_aggregation_interval = 60
}
```

Retention: 12 months baseline, 24 months security-critical.

---

## GuardDuty + Security Hub

- Enable GuardDuty in every account, with the master account aggregating findings.
- Enable Security Hub with the AWS Foundational Security Best Practices standard and CIS Benchmarks.
- Forward findings to a SIEM or alerting system (SNS → PagerDuty / Slack).
- Add the GuardDuty and Security Hub log groups to your log retention schedule with 24-month retention.

---

## Secrets management

### Storage

- **AWS Secrets Manager** for credentials that need rotation (DB passwords, API keys to third parties).
- **Parameter Store (SSM)** for config that isn't strictly secret (URLs, feature flags), and for secrets that don't need rotation but want centralized storage.
- **KMS** for application-layer encryption keys (envelope-encrypt the data with a data key, store the encrypted data key with the data, never the raw key).

### Access

Application reads at startup or on-demand. Never bake into images. Per-environment secrets (production secrets unreadable from dev role).

### Rotation

- DB credentials rotated quarterly minimum; automated via Secrets Manager + RDS.
- Application keys / API tokens rotated on schedule and on personnel changes.

---

## RDS / Aurora

- `require_secure_transport = ON` (MySQL/Aurora) or equivalent TLS enforcement (Postgres `rds.force_ssl = 1`) in the cluster parameter group.
- Encryption at rest: enabled.
- Deletion protection: enabled.
- Backup retention: ≥ 7 days (extend per data classification).
- Performance Insights, Enhanced Monitoring on.
- IAM database authentication or Secrets Manager rotation for credentials.
- Public accessibility: off.
- Subnet group in private subnets only.
- Security group restricts ingress to app subnets / known sources.

---

## Networking

- App tier in private subnets; only ALB / NLB in public subnets.
- Security groups: explicit ingress rules, no `0.0.0.0/0` on database / admin / internal ports.
- NACLs as defense-in-depth.
- AWS WAF on public ALBs with managed rule groups (Core, Known Bad Inputs, SQLi, XSS).
- AWS Shield Standard always on; Shield Advanced if cost-justified.

---

## CI/CD on AWS

- CodePipeline / GitHub Actions OIDC integration with AWS, not long-lived access keys.
- Build roles scoped to specific operations.
- Artifacts stored in S3 with versioning + Object Lock.
- Container images in ECR with image scanning enabled and image tag immutability on.

---

## IaC scanning

Required in CI for every Terraform / CloudFormation / CDK PR:

- **Checkov** — broad, fast, opinionated.
- **tfsec** (now `trivy config`) — Terraform-focused.
- **Trivy** — also scans container images.
- **cfn-nag** — CloudFormation-specific.

Block merge on HIGH/CRITICAL findings.

---

## Common patterns to audit

When reviewing IaC PRs:

1. **Every new bucket** — BlockPublicAccess set? Encryption configured? Versioning if it stores anything important?
2. **Every new IAM policy** — no `*` for action or resource (outside trust policies)?
3. **Every new security group** — no `0.0.0.0/0` on non-public ports?
4. **Every new RDS / Aurora cluster** — encryption, no public access, deletion protection, secrets via Secrets Manager?
5. **Every new Lambda / ECS task** — role scoped to its actual needs?
6. **Every new CloudWatch log group** — explicit retention set (12–24 months per data classification)?
7. **Every new external integration** — credentials in Secrets Manager, TLS required, IP allowlist scoped?

---

## Tools to run

- **Checkov / tfsec / Trivy** in CI on every PR.
- **AWS Config** with the appropriate conformance pack (CIS, NIST, PCI).
- **AWS Security Hub** consolidating findings.
- **Prowler** for periodic out-of-band assessment.
- **Steampipe** for ad-hoc queries across the estate.
