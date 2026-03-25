# Security Policy

## Supported Versions

We release patches for security vulnerabilities in the following versions:

| Version | Supported          |
| ------- | ------------------ |
| Latest  | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

If you discover a security vulnerability within Talos, please send an email to **security@zylos.dev**. All security vulnerabilities will be promptly addressed.

Please include the following information in your report:

- **Type of vulnerability** (e.g., injection, authentication bypass, path traversal)
- **Full paths of source file(s)** related to the vulnerability
- **Location of the affected source code** (tag/branch/commit or direct URL)
- **Step-by-step instructions** to reproduce the issue
- **Proof-of-concept or exploit code** (if possible)
- **Impact of the issue**, including how an attacker might exploit it

## Response Timeline

- **Initial Response**: Within 48 hours of receiving your report
- **Status Update**: Within 7 days with our assessment
- **Resolution**: We aim to resolve critical issues within 30 days

## Disclosure Policy

- We will work with you to understand and resolve the issue quickly
- We will keep you informed of our progress
- We will credit you in any public disclosure (unless you prefer to remain anonymous)
- We ask that you give us reasonable time to address the issue before any public disclosure

## Security Best Practices for Users

When deploying Talos:

### Authentication & Access

- Set a strong, unique value for `TALOS_ADMIN_TOKEN` to secure the admin API
- Rotate authentication tokens periodically
- Restrict network access to the API port (default: 3000) to trusted hosts only
- Use HTTPS in production via a reverse proxy (Nginx, Caddy, Cloudflare Tunnel, etc.)

### Network Security

- Do not expose the Talos server directly to the internet without a reverse proxy
- Bind to `localhost` (default) when running locally
- Configure appropriate firewall rules for production deployments
- Use Cloudflare Tunnel for secure external access when needed

### API Keys & Secrets

- Store API keys in environment variables or the `.env` file (never commit to version control)
- Use the built-in **Credential Vault** to inject runtime credentials rather than hardcoding them
- The vault sanitizes credentials before any test package export — verify exports don't contain secrets
- Review `.gitignore` to ensure the `.env` file and any secrets files are excluded

### File System Access

- Configure the `TALOS_ALLOWED_PATHS` environment variable to limit filesystem tool access
- Restrict the `TALOS_DATA_DIR` to a dedicated directory with appropriate permissions

### GitHub Token Scope

- The `GITHUB_PERSONAL_ACCESS_TOKEN` used for discovery should have minimal required scopes:
  - `repo:read` for private repositories
  - `read:org` if discovering organization repositories
  - Do not use a token with write permissions unless strictly necessary

### Database Security

- The SQLite database at `~/.talos/talos.db` contains application metadata and test history
- Ensure the data directory has appropriate file permissions (`chmod 700 ~/.talos`)
- Back up the database regularly if running in production

### Audit Trail

- Test run history and agent activity are logged in `~/.talos/`
- Log files may contain application URLs and metadata — treat them as sensitive
- Regularly review and rotate logs in production environments

### Dependency Security

- Run `pnpm audit` periodically to check for vulnerable dependencies
- Keep Talos updated to the latest version to receive security patches
- Subscribe to GitHub repository notifications for security advisories
