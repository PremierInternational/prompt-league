# Prompt League — Azure Static Web Apps

## Folder Structure

```
prompt-league-swa/
├── index.html          ← scorer app (served as static file)
└── api/
    ├── host.json       ← Azure Functions runtime config
    ├── package.json    ← Node.js project file
    └── score/
        ├── index.js    ← proxy function (POST /api/score)
        └── function.json ← HTTP trigger definition
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

## Troubleshooting

**Network error in browser**
The function and HTML share a domain in Static Web Apps so CORS errors
shouldn't occur. If one does, go to your Static Web App → Configuration
and add app setting: WEBSITE_CORS_ALLOWED_ORIGINS = *

**503 error**
API key not configured — check Step 3.

**Function returns 404**
Confirm the GitHub Actions deployment completed (check the Actions tab
in your GitHub repo). The api/score folder structure must be exact.

---

## Cost

Azure Static Web Apps Free tier includes hosting + serverless API with
no expiration. At Definian's usage levels you will not pay anything.
