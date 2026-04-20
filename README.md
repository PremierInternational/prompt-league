# Prompt League — Azure Static Web Apps

## Folder Structure

```
prompt-league-swa/
├── index.html              ← scorer app (served as static file)
├── challenges.json         ← weekly challenges + seasons (edit this to change prompts)
└── api/
    ├── host.json           ← Azure Functions runtime config
    ├── package.json        ← Node.js project file (incl. @azure/data-tables)
    ├── shared/
    │   └── tables.js       ← shared Table Storage client helper
    ├── score/              ← POST /api/score         (Anthropic proxy)
    ├── submissions/        ← POST /api/submissions   (persist one score)
    └── leaderboard/        ← GET  /api/leaderboard   (ranked results)
```

The PROXY_URL in index.html is set to `/api/score` — a relative path that works
automatically because the static file and the function share the same domain.

---

## Step 1 — Push to GitHub

Create a **private** repo in your GitHub org (e.g. PremierInternational/prompt-league).
Push this entire folder as the repo root.

```bash
cd prompt-league-swa
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/PremierInternational/prompt-league.git
git push -u origin main
```

---

## Step 2 — Create the Static Web App in Azure

1. Go to portal.azure.com
2. Search **Static Web Apps** → click **Create**
3. Fill in:
   - Subscription: your existing subscription
   - Resource group: `definian-tools` (create new if needed)
   - Name: `prompt-league`
   - Plan type: **Free**
   - Region: Central US
4. Under Deployment details:
   - Source: **GitHub**
   - Sign in with GitHub → authorize Azure
   - Organization: PremierInternational
   - Repository: prompt-league
   - Branch: main
5. Under Build details:
   - Build presets: **Custom**
   - App location: `/`
   - Api location: `api`
   - Output location: *(leave blank)*
6. Click **Review + create** → **Create**

Azure automatically adds a GitHub Actions workflow file to your repo.
Every push to main deploys automatically from this point forward.

---

## Step 3 — Add the API Key

1. Open your new Static Web App in the Azure Portal
2. Left menu → **Configuration**
3. Click **Add** under Application Settings
4. Name: `ANTHROPIC_API_KEY`   Value: `sk-ant-...your key...`
5. Click **Save**

---

## Step 3b — Add Azure Table Storage (for leaderboard persistence)

The `submissions` and `leaderboard` functions persist scores to **Azure Table
Storage**. One-time setup:

1. In the Azure Portal, search **Storage accounts** → **Create**
   - Resource group: same as your Static Web App (`definian-tools`)
   - Storage account name: `promptleaguestore` (must be globally unique, lowercase, no hyphens)
   - Region: same region as the Static Web App
   - Performance: **Standard**
   - Redundancy: **Locally-redundant storage (LRS)** — cheapest, fine here
   - Leave all other defaults → **Review + create** → **Create**
2. Once deployed, open the storage account → left menu → **Security + networking → Access keys**
3. Click **Show** next to *key1* → copy the **Connection string** value
4. Go back to your Static Web App → **Configuration** → **Add**
   - Name: `TABLES_CONNECTION_STRING`
   - Value: *(paste the connection string)*
5. Click **Save**

The `submissions` table is created automatically on first write — no need to
create it manually.

**Verify it worked**: after someone submits a prompt on the live site, open
the storage account → **Storage browser → Tables → submissions**. You should
see one row per submission, with columns like `user`, `dept`, `week`,
`season`, `total`, `grade`. If the table is missing or empty, check the
Static Web App's function logs (Azure Portal → your SWA → Functions →
`submissions` → Invocations) for errors.

**Cost**: at Definian's scale (hundreds of rows, well under 1 GB), Table Storage
is effectively free — pennies per month at most.

---

## Step 4 — Get the URL

On the Static Web App overview page you'll see a URL like:
`https://purple-sand-abc123.azurestaticapps.net`

That's it — no URL to paste back into the HTML. The `/api/score` path
routes automatically to your function.

---

## Step 5 — Share It

Options:
- Drop the URL in a pinned Teams message
- Add as a Teams tab: channel → + tab → Website → paste URL
- Link from your SharePoint intranet page

---

## Editing the Weekly Challenges

Challenges and seasons live in [challenges.json](challenges.json) at the repo
root — not inside the HTML. This means anyone with repo write access can edit
them **through GitHub's web UI** (no local dev setup required):

1. Go to the repo on GitHub → open `challenges.json`
2. Click the pencil icon (Edit this file)
3. Change the `title`, `desc`, `starter`, etc. for the week you want
4. Scroll down → **Commit changes** directly to `main` (or open a PR)
5. GitHub Actions deploys automatically; changes are live in ~90 seconds

### The file structure

```json
{
  "seasons": [
    { "number": 1, "name": "Foundations", "subtitle": "...", "season_start": "2026-04-27", "weeks": 6 }
  ],
  "challenges": [
    { "week": 1, "season": 1, "title": "...", "skill": "...", "desc": "...", "starter": "..." }
  ]
}
```

- `season_start` is the Monday (YYYY-MM-DD) of that season's Week 1. The app
  automatically shows the right challenge based on today's date vs. the
  season_start dates.
- `weeks` is the number of weeks in that season.
- Each challenge needs all six fields: `week`, `season`, `title`, `skill`,
  `desc`, `starter`.
- `starter` is the pre-filled text that opens in Claude when users click
  "Open in Claude".

### Watch out for

- **Every week needs a challenge.** If today maps to a week that isn't in
  the array, the app falls back to week 1.
- **JSON is picky.** Strings need double quotes (not single). No trailing
  commas. If the file is malformed, the app will show an error banner
  instead of loading — test your edit by visiting the site right after the
  deploy completes.
- **Escape quotes inside strings** with `\"` (see week 10 in the file for
  an example).

---

## Local Development

You can run the whole app locally — static site, both Azure Functions, and a
fake Table Storage — without deploying anything. This is the fastest way to
iterate on changes.

### One-time setup

1. **Install Node.js 18+** — https://nodejs.org (verify with `node --version`).

2. **Install Azure Functions Core Tools** (must be on PATH — do NOT use the
   npm package, it's unreliable on Windows):

   **Windows** (recommended):
   ```powershell
   winget install Microsoft.Azure.FunctionsCoreTools
   ```

   **macOS**:
   ```bash
   brew tap azure/functions && brew install azure-functions-core-tools@4
   ```

   Close and reopen your terminal after install, then verify:
   ```bash
   func --version
   ```

3. **Install this repo's tooling**:

   ```bash
   npm run setup
   ```

   That installs the SWA CLI + Azurite at the repo root, and the Function
   dependencies (`@azure/data-tables`, etc.) inside `api/`.

4. **Create your local settings file**:

   ```bash
   cp api/local.settings.json.example api/local.settings.json
   ```

   Open `api/local.settings.json` and paste your real Anthropic API key into
   `ANTHROPIC_API_KEY`. The pre-filled `TABLES_CONNECTION_STRING` already
   points at Azurite — leave it alone.

   This file is gitignored — it will not be committed.

### Running it

You need **two terminals** open side by side.

**Terminal 1 — fake storage (Azurite)**:

```bash
npm run storage
```

This starts a local Table Storage emulator listening on `127.0.0.1:10002`.
Data is persisted to `./.azurite/` (also gitignored), so your submissions
survive restarts. To wipe the local leaderboard, stop Azurite and delete
the `.azurite` folder.

**Terminal 2 — the app**:

```bash
npm run dev
```

This starts the Static Web Apps emulator, which serves `index.html` and
routes `/api/*` to the Azure Functions in `api/`. Open the URL it prints
(usually `http://localhost:4280`).

### What to test

- Submit a prompt → DevTools Network tab should show `/api/score` returning 200
- `/api/submissions` should return 201
- The leaderboard should populate with your submission
- Open the Azurite data file at `.azurite/__azurite_db_table__.json` to
  verify rows are being written

### Common local-dev issues

- **"Could not find or install Azure Functions Core Tools"** or **"Cannot find download package for Windows"** → `func` isn't on PATH. Install it with `winget install Microsoft.Azure.FunctionsCoreTools` (Windows) or `brew install azure-functions-core-tools@4` (macOS), then **close and reopen your terminal** so PATH refreshes. Verify with `func --version`.
- **403 from the scoring call** → `ANTHROPIC_API_KEY` not set in `api/local.settings.json`.
- **ECONNREFUSED on port 10002** → Terminal 1 (Azurite) isn't running.
- **Port 4280 already in use** → another `swa start` is still running; kill it or pass `--port 4281`.

---

## Troubleshooting

**Network error in browser**
The function and HTML share a domain in Static Web Apps so CORS errors
shouldn't occur. If one does, go to your Static Web App → Configuration
and add app setting: WEBSITE_CORS_ALLOWED_ORIGINS = *

**503 error from /api/score**
API key not configured — check Step 3.

**503 error from /api/submissions or empty leaderboard**
`TABLES_CONNECTION_STRING` not configured — check Step 3b.

**Leaderboard still empty after a submission**
Open the storage account → **Storage browser → Tables → submissions** and
confirm rows are arriving. If rows exist but the UI shows nothing, check the
browser Network tab for the `/api/leaderboard` response.

**Function returns 404**
Confirm the GitHub Actions deployment completed (check the Actions tab
in your GitHub repo). The api/score folder structure must be exact.

---

## Cost

Azure Static Web Apps Free tier includes hosting + serverless API with
no expiration. At Definian's usage levels you will not pay anything.
