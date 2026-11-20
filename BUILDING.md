# Building TypeVerse Desktop Apps (Windows & macOS)

TypeVerse runs offline out of the box and can be packaged into a Windows `.exe` installer (+ portable `.exe`) and macOS `.dmg` / `.zip` using Electron and `electron-builder`.

---

## Optional: Connecting Online Static Word Packs (`VITE_PACKS_URL`)

TypeVerse has **zero server backend** and **never** includes `GEMINI_API_KEY`. Instead, fresh word packs are published as static JSON files via GitHub Pages (see `SETUP_GITHUB.md`). Set `VITE_PACKS_URL` at build time (or GitHub repo variable `PACKS_URL` in Actions) to your Pages packs folder URL (for example `https://USERNAME.github.io/typeverse/packs/`).

- If omitted at build time, the desktop app still works 100% offline with its bundled 3,000+ words, starter packs, sentences, paragraphs, drills, and arcade games, and users can also enter any **Word pack source URL** later inside **Appearance & Controls**.

---

## Route A: Recommended Cloud Build (GitHub Actions — Zero Local Setup)

GitHub Actions automatically builds both Windows and macOS installers on clean Microsoft and Apple runners, checks for leaked secrets, and attaches everything to a **draft GitHub Release**.

1. Push this repository to GitHub.
2. *(Optional)* In your GitHub repo go to **Settings → Secrets and variables → Actions → Variables** and add `PACKS_URL` with your GitHub Pages packs URL (e.g. `https://USERNAME.github.io/typeverse/packs/`).
3. *(Optional)* If you own Windows or Apple Developer signing certificates, add `CSC_LINK`, `CSC_KEY_PASSWORD`, and Apple notarisation secrets (`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`). If skipped, unsigned installers are built automatically without failing.
4. Create and push a version tag:
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```
   *(Or open the **Actions** tab → **Desktop Release Build** → **Run workflow** manually.)*
5. Wait for both **windows-latest** and **macos-latest** jobs to finish (usually 3–6 minutes).
6. Download the installers from **Actions → Artifacts** or open **Releases** to review and publish the draft release (remember to attach `INSTALL_GUIDE.txt` for students and teachers).

---

## Route B: Local Windows Build

### 1. Prerequisites
- Install **Node.js 22 LTS** from [nodejs.org](https://nodejs.org/).
- Optional: set `VITE_PACKS_URL` in your terminal before building:
  ```powershell
  $env:VITE_PACKS_URL="https://USERNAME.github.io/typeverse/packs/"
  ```

### 2. Install & Quick Unpacked Test
```bash
npm ci
npm run dist:dir
```
Open `release/win-unpacked/TypeVerse.exe` to verify offline startup before building the installer.

### 3. Build Windows Installer & Portable `.exe`
```bash
npm run dist:win
```
Outputs in `release/`:
- `TypeVerse-Setup-1.0.0.exe` (per-user installer, no admin rights required, creates Desktop & Start Menu shortcuts)
- `TypeVerse-Portable-1.0.0.exe` (single portable executable for school/locked-down PCs)

---

## Route C: Local macOS Build

### 1. Prerequisites
- macOS with **Xcode Command Line Tools** (`xcode-select --install`) and **Node.js 22 LTS**.

### 2. Install, Test Unpacked, and Package
```bash
npm ci
npm run dist:dir
npm run dist:mac
```
Outputs in `release/`:
- `TypeVerse-1.0.0-x64.dmg` & `TypeVerse-1.0.0-arm64.dmg` (Intel + Apple Silicon drag-to-Applications installers)
- `TypeVerse-1.0.0-x64.zip` & `TypeVerse-1.0.0-arm64.zip`

---

## Running Desktop Development Mode

To launch Electron directly against the live Vite dev server on port `3000`:
```bash
npm run dev:electron
```

---

## Troubleshooting

- **Blank white screen on launch**: Make sure the frontend bundle was built with `ELECTRON=1` (as `npm run dist:dir`, `dist:win`, and `dist:mac` do automatically) so Vite uses relative `./assets/...` paths instead of root `/assets/...`.
- **Missing or generic app icon**: Run `npm run build:icon` to regenerate the `1024x1024` `build/icon.png` from `build/icon.svg`, then rebuild.
- **Windows `winCodeSign` / symlink privilege error during `dist:win`**: `electron-builder`'s Windows cache archive contains symbolic links. Fix by either:
  1. Enabling **Windows Developer Mode** (*Settings → Privacy & security → For developers → Developer Mode*), OR
  2. Running your terminal once as Administrator, OR
  3. Using `npm run dist:dir` for fast local testing and letting **Route A (GitHub Actions)** build the final `.exe` installers cleanly.
- **Secret scan failure (`check:secrets`)**: Verify there is no `.env` file, hardcoded `AIza...` key, or `GEMINI_API_KEY` reference inside `dist/`, `electron/dist/`, or `release/`.
- **Stuck/glitchy graphics on older school laptops**: Inside TypeVerse open **Appearance & Controls → Desktop Safety & Data**, turn on **Disable hardware acceleration (use if graphics glitch)**, and click **Restart now**.
