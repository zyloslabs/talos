# Talos — Setup & Manual Test Guide

> **Test Automation & Logic Orchestration System**
>
> This guide walks through what Talos can do, how to install it, and how to manually test the full pipeline end-to-end.

---

## What Talos Does

Talos is an autonomous E2E testing engine. Point it at a web application and a GitHub repository — it crawls the codebase, builds a semantic knowledge base, generates Playwright tests using GitHub Copilot, runs them, and optionally exports them to a GitHub repo.

| Capability | What It Does |
|---|---|
| **Discover** | Fetches source files from a GitHub repo, chunks them into semantic segments |
| **Index (RAG)** | Embeds chunks via GitHub Models API, stores in LanceDB for vector search |
| **Generate Tests** | Uses GitHub Copilot SDK + RAG context to write Playwright tests (with POM) |
| **Execute Tests** | Runs tests in Playwright across Chromium/Firefox/WebKit, captures traces/screenshots/video |
| **Self-Heal** | On failure, analyzes root cause and regenerates a fix automatically |
| **Export to GitHub** | Packages tests and pushes to any GitHub repo you specify |
| **AI Explain** | Uses Copilot to explain any test or selected code snippet in plain English |
| **Knowledge Base** | Ingest Markdown/OpenAPI docs, auto-tag, and generate Given/When/Then acceptance criteria |
| **Traceability** | Links requirements → acceptance criteria → test cases for RTM reporting |
| **Vault Roles** | Stores credential references (not cleartext) for login personas (admin/standard/guest) |
| **MCP Tools** | 21 tools exposed via Model Context Protocol for AI agent orchestration |

---

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| **Node.js** | ≥ 22 | `node --version` to check |
| **pnpm** | ≥ 10.28 | `npm install -g pnpm` |
| **GitHub account** | — | With Copilot subscription |
| **GitHub PAT** | — | Needs `repo` + `read:org` scopes |
| **Playwright browsers** | Latest | Installed automatically below |

---

## Step 1 — Clone & Install

```bash
# Clone the repo
git clone https://github.com/zyloslabs/talos.git
cd talos

# Install all dependencies (root + UI)
pnpm install

# Install Playwright browser binaries
npx playwright install chromium
```

---

## Step 2 — Configure Environment

Talos reads configuration from `~/.talos/.env` at startup (never from a project-level `.env`).

```bash
# Create the data directory
mkdir -p ~/.talos

# Copy the example config
cp .env.example ~/.talos/.env

# Open and edit
nano ~/.talos/.env          # or use your preferred editor
```

Fill in these values:

```dotenv
# GitHub PAT — used for repo discovery.
# Scopes required: repo (read), read:org
GITHUB_PERSONAL_ACCESS_TOKEN=ghp_...

# Copilot device auth — get this from https://github.com/settings/apps
# (Only needed if Copilot SDK needs an explicit client ID)
GITHUB_CLIENT_ID=Iv1.abc123

# Optional: secure the Admin API with a bearer token
TALOS_ADMIN_TOKEN=some-random-secret

# Port (default is fine)
PORT=3000
```

> **No OpenAI key needed.** Embeddings use the GitHub Models REST API with the same PAT.

---

## Step 3 — Start the Servers

Open **two terminals**:

**Terminal 1 — Backend:**
```bash
cd talos
pnpm dev
```

Watch for this output:
```
[talos] server listening on http://localhost:3000
[copilot] device auth required
[copilot] → open https://github.com/login/device
[copilot] → enter code: XXXX-XXXX
```

**If it shows a device code:** Open https://github.com/login/device in your browser, enter the code, and authorize. The server will continue once auth completes. Auth tokens are saved to `~/.talos/auth.json` — you won't need to do this again.

**Terminal 2 — Frontend:**
```bash
cd talos/ui
pnpm dev
```

Watch for:
```
▲ Next.js 16
   - Local: http://localhost:3001
```

**Open the dashboard:** http://localhost:3001

---

## Step 4 — Verify Health

```bash
curl http://localhost:3000/health
# Expected: {"status":"ok","uptime":...}
```

---

## Step 5 — Register an Application

Navigate to **http://localhost:3001/talos** (the Talos tab in the nav).

1. Click **Add Application** (or the `+` button)
2. Fill in:
   - **Name**: anything descriptive, e.g. `My App`
   - **Repository URL**: a GitHub repo Talos will crawl, e.g. `https://github.com/your-org/your-app`
   - **Base URL**: the running app's URL, e.g. `http://localhost:4000` or `https://staging.example.com`
3. Click **Create**

> The app must already be running at the Base URL for test execution to work. Talos doesn't start apps for you.

**Verify via API:**
```bash
curl http://localhost:3000/api/talos/applications | jq '.[].name'
```

---

## Step 6 — Discover & Index the Repository

This step crawls the GitHub repo and builds the vector knowledge base used for AI test generation.

1. In the Talos dashboard, click on your application
2. Go to the **Workbench** tab
3. Click **Discover** (or the equivalent pipeline step button)
4. Watch the real-time progress: `filesDiscovered`, `filesIndexed`, `chunksCreated`

**Behind the scenes:**
- Fetches every `.ts`, `.tsx`, `.js`, `.jsx`, `.vue`, `.html`, `.css` file from the repo
- Chunks them at ~1000 character boundaries (respecting function/class structure)
- Embeds each chunk via `POST https://models.github.ai/inference/embeddings` (model: `openai/text-embedding-3-small`)
- Stores vectors in LanceDB at `~/.talos/vectordb/`

**When it completes:** You'll see a success count. Discovery can take 30 seconds to several minutes depending on repo size.

**Via API (alternative):**
```bash
APP_ID="<your-app-id>"  # from Step 5 response
curl -X POST http://localhost:3000/api/talos/applications/$APP_ID/discover \
  -H "Content-Type: application/json" \
  -d '{"force": false}'
```

---

## Step 7 — Generate Tests with AI

This step uses GitHub Copilot + the RAG index to write Playwright tests.

**Via the UI:**
1. In the Workbench, click **Generate**
2. Enter a prompt describing the test flow, e.g.:
   > "Generate an end-to-end test for the login flow. The user fills in the email field, enters their password, clicks the Sign In button, and is redirected to the dashboard where their username appears in the top navigation."
3. Select a test type: `e2e`, `smoke`, `regression`, or `accessibility`
4. Click **Generate**

**Via API:**
```bash
curl -X POST http://localhost:3000/api/talos/tests/generate \
  -H "Content-Type: application/json" \
  -d '{
    "applicationId": "'$APP_ID'",
    "prompt": "Generate an e2e test for the login flow",
    "testType": "e2e"
  }'
```

**What to expect:**
- Copilot SDK generates TypeScript Playwright code with Page Object Model
- Test is created with `status: "draft"` — requires review before activation
- The generated test appears in the **Test Matrix** view

**Effective prompt tips:**
- Name specific UI elements: `"click the [data-testid='submit-btn'] button"`
- Describe the expected outcome: `"the success banner with text 'Welcome back' should be visible"`
- Be explicit about navigation: `"navigate to /settings/account"`
- For smoke tests: focus on one critical happy path only

---

## Step 8 — Review Tests in the Test Matrix

Navigate to the **Test Matrix** (inside your application view).

For each generated test you can:

1. **View the code** in the Monaco editor (left panel)
2. **Edit the code** — click the Edit toggle, make changes, hit `Cmd+S` to save
3. **Explain the test** — click **Explain Test** in the right panel for a Copilot-powered plain-English explanation
4. **Explain a selection** — highlight code in the editor, then click **Explain Selection**
5. **Activate the test** — change its status from `draft` to `active` before running

---

## Step 9 — Execute Tests

Once a test is `active`, you can run it.

**Via the UI:**
1. In the Test Matrix, select a test
2. Click **Run Test**
3. Choose browser: `chromium` (default), `firefox`, or `webkit`
4. The run status updates in real time via Socket.IO

**Via API:**
```bash
TEST_ID="<your-test-id>"
curl -X POST http://localhost:3000/api/talos/runs \
  -H "Content-Type: application/json" \
  -d '{
    "testId": "'$TEST_ID'",
    "browser": "chromium",
    "environment": "local"
  }'
```

**Artifacts captured on failure:**
- Screenshot (`~/.talos/artifacts/`)
- Video recording
- Playwright trace (open with `npx playwright show-trace <trace.zip>`)

---

## Step 10 — Export Tests to GitHub

Once tests are verified, push them to a GitHub repository.

**Via the UI:**
1. In your application view, click **Export to GitHub**
2. Enter the target repo as `owner/repo` (e.g., `your-org/app-playwright-tests`)
3. Enter the target branch (default: `main`)
4. Check **Create if not exists** if the repo doesn't exist yet
5. Click **Export**

A link to the pushed commit will appear on success.

**Via API:**
```bash
curl -X POST http://localhost:3000/api/talos/applications/$APP_ID/export-to-github \
  -H "Content-Type: application/json" \
  -d '{
    "targetRepo": "your-org/app-playwright-tests",
    "branch": "main",
    "createIfNotExists": true
  }'
```

---

## Optional Steps

### Ingest Documentation

Upload Markdown, OpenAPI, PDF, or Word docs to enrich the knowledge base:

```bash
curl -X POST http://localhost:3000/api/talos/applications/$APP_ID/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "content": "# Login Feature\n\nUsers must enter email + password...",
    "format": "markdown",
    "fileName": "login-spec.md",
    "docType": "specification"
  }'
```

### Configure Vault Credentials

For apps behind authentication, store credential references (not cleartext values):

```bash
curl -X POST http://localhost:3000/api/talos/vault-roles \
  -H "Content-Type: application/json" \
  -d '{
    "applicationId": "'$APP_ID'",
    "name": "Admin User",
    "roleType": "admin",
    "usernameRef": "vault:my-app-admin-user",
    "passwordRef": "vault:my-app-admin-pass"
  }'
```

### Access the Admin Panel

Open **http://localhost:3001/admin** to manage:
- Environment variables (`GITHUB_TOKEN`, `TALOS_ADMIN_TOKEN`, etc.)
- Copilot session configuration
- MCP tool configuration
- Platform agents and skills

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Server exits immediately with no output | Check `~/.talos/.env` exists and has valid values |
| `[copilot] error: unauthorized` | Re-run with a fresh `GITHUB_TOKEN` in `~/.talos/.env`; delete `~/.talos/auth.json` to force re-auth |
| Discovery finishes with `0 chunks` | Verify the `repositoryUrl` is public (or your PAT has `repo` scope), and the repo contains `.ts/.js/.tsx` files |
| Test generation returns a template stub (`// TODO: Implement test logic`) | Copilot wasn't available — check auth; the stub is the `copilot-unavailable` fallback |
| Test execution fails immediately | Confirm the app is running at the registered `baseUrl`; check `PLAYWRIGHT_TIMEOUT` if it's slow |
| Export fails with `https only` error | The GitHub API base URL must be `https://` — if using GHES check the URL format |
| Admin panel returns 401 | `TALOS_ADMIN_TOKEN` in `~/.talos/.env` must match what you send (or leave it unset to disable auth) |

---

## File Layout After Setup

```
~/.talos/
├── talos.db          # SQLite — applications, tests, runs, vault roles
├── vectordb/         # LanceDB vector store (embeddings)
│   └── talos_chunks.lance/
├── auth.json         # GitHub Copilot OAuth tokens (auto-created)
├── .env              # Your environment config
├── artifacts/        # Screenshots, videos, Playwright traces
└── exports/          # Packaged test exports (zip)
```

---

## Quick Reference

| URL | Purpose |
|---|---|
| http://localhost:3001/talos | Application list + dashboard |
| http://localhost:3001/workbench | Full pipeline (Discover → Generate → Execute) |
| http://localhost:3001/admin | Admin panel (env, Copilot, MCP tools) |
| http://localhost:3000/health | Backend health check |
| http://localhost:3000/api/talos/applications | Applications REST API |
| http://localhost:3000/api/talos/tests | Tests REST API |
| http://localhost:3000/api/talos/runs | Test runs REST API |
