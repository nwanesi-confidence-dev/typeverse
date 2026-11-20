# Setting Up GitHub Word-Pack Factory & GitHub Pages

TypeVerse runs as a **100% static website** and an **offline-first desktop app** with **zero backend server** and **no API keys inside the app**.

Instead, GitHub Actions runs on a daily schedule (using your Gemini API key stored privately as a GitHub Secret), generates fresh validated word packs into `packs/`, commits them to the repository, and publishes the site and packs via **GitHub Pages**.

---

## Step 1: Create a GitHub Repository and Push

1. Create a new repository on GitHub (for example `typeverse`), public or private (note: GitHub Free plans require a **public** repository for GitHub Pages).
2. Push this project to the `main` branch:
   ```bash
   git init
   git add .
   git commit -m "Initial TypeVerse commit"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
   git push -u origin main
   ```

---

## Step 2: Add `GEMINI_API_KEY` as a Repository Secret

Your Gemini key lives **only** inside GitHub Actions and is **never** bundled into the website or desktop installers.

1. Get a free Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey).
2. In your GitHub repository, go to **Settings → Secrets and variables → Actions → Secrets**.
3. Click **New repository secret**.
4. Name: `GEMINI_API_KEY`
5. Value: paste your Gemini API key and click **Add secret**.

> **Security check:** You do NOT put this key in `.env` or any file in the repo. `scripts/generate-packs.mjs` reads it strictly from the `GEMINI_API_KEY` environment variable inside the `generate` GitHub Actions job and passes it only in the HTTP `x-goog-api-key` header.

---

## Step 3: Enable GitHub Pages (GitHub Actions Source)

1. In your GitHub repository, go to **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions** (NOT "Deploy from a branch").
3. Save if prompted.

When the workflow deploys, your TypeVerse URL will be:
- Project repo: `https://YOUR-USERNAME.github.io/YOUR-REPO/`
- User/Org repo (`YOUR-USERNAME.github.io`): `https://YOUR-USERNAME.github.io/`

And your published word packs index URL will be:
- `https://YOUR-USERNAME.github.io/YOUR-REPO/packs/index.json`

---

## Step 4: Set `PACKS_URL` Variable for the Desktop App

So that packaged Windows and macOS desktop installers automatically fetch daily word packs from your GitHub Pages site:

1. Open **Settings → Secrets and variables → Actions → Variables**.
2. Click **New repository variable**.
3. Name: `PACKS_URL`
4. Value: `https://YOUR-USERNAME.github.io/YOUR-REPO/packs/` *(must end with `/packs/`)*
5. Click **Add variable**.

*(Even without `PACKS_URL`, desktop users can enter or override any pack source URL in TypeVerse under **Appearance & Controls → Word pack source URL**, or stay 100% offline with the built-in 3,000+ words and starter packs.)*

---

## Step 5: Run Your First Word-Pack Generation & Pages Deploy

1. Open the **Actions** tab in your GitHub repository.
2. Select **Packs and Pages** on the left.
3. Click **Run workflow** (on branch `main`) → **Run workflow**.
4. Watch the two jobs finish:
   - **Generate & Validate Word Packs**: generates up to 12 packs for today, checks every letter/row/safety rule, prunes packs older than 14 days, keeps `packs/` under 5 MB, and commits `packs/` back to `main`.
   - **Build & Deploy GitHub Pages**: runs `npm test` + `npm run packs:validate`, builds `dist/` with the correct `VITE_BASE`, scans for secrets, and deploys to GitHub Pages.
5. Open `https://YOUR-USERNAME.github.io/YOUR-REPO/packs/index.json` in your browser to confirm live JSON packs, then open `https://YOUR-USERNAME.github.io/YOUR-REPO/`!

---

## Step 6: Build Desktop Installers (Windows `.exe` + macOS `.dmg`)

Once Pages is live and `PACKS_URL` is set:

1. Push a version tag:
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```
   *(Or run **Actions → Desktop Release Build → Run workflow**.)*
2. Download the installers from **Actions → Artifacts** or **Releases** (Draft release).

---

## Adjusting Model, Themes, or Schedule (`packs.config.json`)

- **Model name**: edit `"geminiModel"` in `packs.config.json` (currently `"gemini-2.5-flash"`).
- **Daily rate / free-tier limits**: edit `"maxCallsPerRun"` (default `12`) or `"delayBetweenCallsMs"` (default `15000`). If Gemini returns HTTP `429`, the script backs off, saves any completed packs, logs the reason in `packs/last-run.json`, and exits cleanly without failing the deploy.
- **Schedule**: edit `cron` in `.github/workflows/packs-and-pages.yml` (default `"0 4 * * *"` = daily at 04:00 UTC).

---

## Troubleshooting

- **Permission error pushing `packs/` from Actions (`403` / protected branch)**:
  1. Ensure **Settings → Actions → General → Workflow permissions** allows **Read and write permissions** (the workflow also explicitly sets `permissions: contents: write`).
  2. If `main` has branch protection rules enabled, allow `github-actions[bot]` or bypass rules for pack updates, or run generation on a dedicated branch.
- **GitHub Pages shows 404 on assets**: Verify **Settings → Pages → Source** is set to **GitHub Actions** (so `.github/workflows/packs-and-pages.yml` sets `VITE_BASE=/YOUR-REPO/` automatically).
- **How to check if today's run worked**: Open `packs/last-run.json` in your repository on GitHub — it shows `ranAt`, `attempted`, `succeeded`, `failed`, `stoppedEarlyReason`, `totalPacks`, and `totalBytes`.
- **Desktop app not pulling new packs**: Open **Appearance & Controls → Fresh Word Packs**, verify your `PACKS_URL` (or paste `https://YOUR-USERNAME.github.io/YOUR-REPO/packs/` in **Word pack source URL**), and click **Refresh words**.
