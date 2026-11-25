import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {chromium} from 'playwright';

const ROOT_DIR = process.cwd();
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const SCREENSHOT_DIR = path.join(ROOT_DIR, 'artifacts', 'playwright-screenshots');

const TARGET_VIEWPORTS = [
  {width: 1024, height: 600, label: '1024x600'},
  {width: 1366, height: 768, label: '1366x768'},
  {width: 1920, height: 1080, label: '1920x1080'},
  {width: 2560, height: 1440, label: '2560x1440'},
  {width: 3440, height: 1440, label: '3440x1440'},
  {width: 5120, height: 1440, label: '5120x1440'},
  {width: 1080, height: 1920, label: '1080x1920'},
];

const ARCADE_GAMES = [
  {id: 'turbo-racer', title: 'Turbo Racer', hasTypingViewport: true},
  {id: 'star-defender', title: 'Star Defender', hasTypingViewport: false},
  {id: 'word-rain', title: 'Word Rain', hasTypingViewport: false},
  {id: 'bubble-pop', title: 'Bubble Pop', hasTypingViewport: false},
  {id: 'beat-typer', title: 'Beat Typer', hasTypingViewport: false},
];

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

async function startStaticServer() {
  try {
    await fs.access(path.join(DIST_DIR, 'index.html'));
  } catch {
    throw new Error(
      `Missing dist/index.html. Run "npm run build:web" before "npm run test:layout".`,
    );
  }

  const server = http.createServer(async (req, res) => {
    const reqUrl = new URL(req.url || '/', 'http://127.0.0.1');
    let relPath = decodeURIComponent(reqUrl.pathname);
    if (relPath === '/' || relPath === '') {
      relPath = '/index.html';
    }
    const candidate = path.normalize(path.join(DIST_DIR, relPath));
    const safePath = candidate.startsWith(DIST_DIR)
      ? candidate
      : path.join(DIST_DIR, 'index.html');

    let targetFile = safePath;
    try {
      const stat = await fs.stat(targetFile);
      if (stat.isDirectory()) {
        targetFile = path.join(DIST_DIR, 'index.html');
      }
    } catch {
      targetFile = path.join(DIST_DIR, 'index.html');
    }

    try {
      const data = await fs.readFile(targetFile);
      const ext = path.extname(targetFile).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(data);
    } catch (err) {
      res.writeHead(500);
      res.end(String(err));
    }
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to bind static server port');
  }
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

async function waitForSettledLayout(page) {
  await page.waitForTimeout(160);
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
}

async function assertScreenGeometry(page, contextLabel, options = {}) {
  const {requireTypingViewport = false, requireSessionResults = false} = options;
  await waitForSettledLayout(page);

  const report = await page.evaluate(
    ({reqTyping, reqResults}) => {
      const vw = document.documentElement.clientWidth;
      const vh = document.documentElement.clientHeight;
      const docOverflowX =
        document.documentElement.scrollWidth - document.documentElement.clientWidth;
      const shell = document.getElementById('app-shell-root');
      const shellRect = shell ? shell.getBoundingClientRect() : null;
      const shellOverflowX = shell ? shell.scrollWidth - shell.clientWidth : 0;

      const checkInViewport = (selector, label) => {
        const el = document.querySelector(selector);
        if (!el) {
          return {found: false, label, visible: false};
        }
        const rect = el.getBoundingClientRect();
        const visible =
          rect.width > 0 &&
          rect.height > 0 &&
          rect.left >= -2 &&
          rect.top >= -2 &&
          rect.right <= vw + 2 &&
          rect.bottom <= vh + 2;
        return {
          found: true,
          label,
          visible,
          rect: {
            left: Math.round(rect.left),
            top: Math.round(rect.top),
            right: Math.round(rect.right),
            bottom: Math.round(rect.bottom),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
        };
      };

      const wpmHud = checkInViewport('[data-testid="wpm-hud"]', 'WPM HUD');
      const typingViewport = reqTyping
        ? checkInViewport('[data-testid="typing-text-viewport"]', 'Typing text viewport')
        : null;
      const keyboard = checkInViewport(
        '[aria-label="On-screen keyboard and finger guide"]',
        'On-screen keyboard',
      );
      const sessionResults = reqResults
        ? Boolean(document.querySelector('[data-testid="session-results"]'))
        : null;

      return {
        vw,
        vh,
        docOverflowX,
        shellOverflowX,
        shellRect: shellRect
          ? {
              width: Math.round(shellRect.width),
              height: Math.round(shellRect.height),
            }
          : null,
        wpmHud,
        typingViewport,
        keyboard,
        sessionResults,
      };
    },
    {reqTyping: requireTypingViewport, reqResults: requireSessionResults},
  );

  const errors = [];
  if (report.docOverflowX > 1) {
    errors.push(`document horizontal overflow (${report.docOverflowX}px at width ${report.vw})`);
  }
  if (report.shellOverflowX > 1) {
    errors.push(`#app-shell-root horizontal overflow (${report.shellOverflowX}px)`);
  }
  if (!report.wpmHud.found || !report.wpmHud.visible) {
    errors.push(`WPM HUD missing or outside viewport: ${JSON.stringify(report.wpmHud)}`);
  }
  if (requireTypingViewport && (!report.typingViewport?.found || !report.typingViewport?.visible)) {
    errors.push(
      `Typing text missing or outside viewport: ${JSON.stringify(report.typingViewport)}`,
    );
  }
  if (report.typingViewport?.found && report.keyboard?.found) {
    const typingRect = report.typingViewport.rect;
    const kbRect = report.keyboard.rect;
    if (typingRect.bottom > kbRect.top + 1) {
      errors.push(
        `Typing viewport overlaps virtual keyboard (typing bottom=${typingRect.bottom}, keyboard top=${kbRect.top})`,
      );
    }
  }
  if (requireSessionResults && !report.sessionResults) {
    errors.push(`Session results panel did not mount`);
  }

  if (errors.length > 0) {
    throw new Error(`[${contextLabel}] Layout check failed:\n  - ${errors.join('\n  - ')}`);
  }
}

async function dismissFirstRunIfPresent(page) {
  const firstRunDialog = page.locator('[aria-labelledby="first-run-graphics-title"]');
  try {
    await firstRunDialog.waitFor({state: 'visible', timeout: 2000});
    await firstRunDialog.getByRole('button', {name: /2D Classic/i}).click();
    await firstRunDialog.waitFor({state: 'hidden', timeout: 3000});
  } catch {
    // Already dismissed or not shown
  }
}

async function ensureForced2DInSettings(page, shotPath) {
  await page.locator('header button:has-text("Appearance")').click();
  const drawer = page.locator('[aria-labelledby="appearance-title"]');
  await drawer.waitFor({state: 'visible', timeout: 5000});

  const mode2DButton = drawer.getByRole('group', {name: 'Graphics mode'}).getByRole('button', {
    name: '2D Classic',
  });
  await mode2DButton.click();

  // Expand Display info & Layout tester so it is also covered visually
  const displayToggle = drawer.getByRole('button', {name: /Display info & Layout tester/i});
  if ((await displayToggle.getAttribute('aria-expanded')) !== 'true') {
    await displayToggle.click();
  }
  await waitForSettledLayout(page);

  await page.screenshot({path: shotPath});
  await drawer.getByRole('button', {name: 'Close appearance settings'}).click();
  await drawer.waitFor({state: 'hidden', timeout: 3000});
}

async function navigateHeaderScene(page, label) {
  await page.locator(`header button:has-text("${label}")`).first().click();
  await waitForSettledLayout(page);
}

async function runAuditForViewport(browser, baseUrl, viewport) {
  const vpDir = path.join(SCREENSHOT_DIR, viewport.label);
  await fs.mkdir(vpDir, {recursive: true});

  const context = await browser.newContext({
    viewport: {width: viewport.width, height: viewport.height},
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  try {
    await page.goto(baseUrl, {waitUntil: 'networkidle'});
    await dismissFirstRunIfPresent(page);

    // 1. Settings (Appearance + Graphics 2D Classic + Display info)
    await ensureForced2DInSettings(page, path.join(vpDir, '01-settings.png'));

    // 2. Hub
    await navigateHeaderScene(page, 'Hub');
    await assertScreenGeometry(page, `${viewport.label} hub`);
    await page.screenshot({path: path.join(vpDir, '02-hub.png')});

    // 3. Classroom (curriculum -> open Lesson 1)
    await navigateHeaderScene(page, 'Classroom');
    await page.getByRole('button', {name: /Start Lesson|Practise Again/i}).first().click();
    await page.locator('[data-testid="typing-text-viewport"]').waitFor({
      state: 'visible',
      timeout: 5000,
    });
    await assertScreenGeometry(page, `${viewport.label} classroom`, {
      requireTypingViewport: true,
    });
    await page.screenshot({path: path.join(vpDir, '03-classroom.png')});

    // 4. Speed Test
    await navigateHeaderScene(page, 'Speed Test');
    await page.locator('[data-testid="typing-text-viewport"]').waitFor({
      state: 'visible',
      timeout: 5000,
    });
    await assertScreenGeometry(page, `${viewport.label} speed-test`, {
      requireTypingViewport: true,
    });
    await page.screenshot({path: path.join(vpDir, '04-speed-test.png')});

    // 5. Results (configure quick 5-word speed test and complete it)
    const testSetupPanel = page.locator('[aria-label="Test setup"]').first();
    if (!(await testSetupPanel.isVisible().catch(() => false))) {
      await page
        .locator('main button:has-text("Setup"), main button:has-text("Text & Tier")')
        .first()
        .click();
    }
    const visibleSetup = page.locator('[aria-label="Test setup"]:visible').first();
    await visibleSetup.getByRole('button', {name: 'Custom', exact: true}).click();
    const countInput = visibleSetup.locator('[aria-label="Custom word count"]');
    await countInput.fill('5');
    await visibleSetup.getByRole('button', {name: 'Words', exact: true}).click();
    const closeSetupBtn = page.locator('[aria-label="Close Speed Test Setup"]');
    if (await closeSetupBtn.isVisible().catch(() => false)) {
      await closeSetupBtn.click();
    }
    await waitForSettledLayout(page);

    const chars = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid="typing-text-viewport"] .tv-char'))
        .map((el) => (el.textContent === '\u00A0' ? ' ' : el.textContent || ''))
        .join(''),
    );
    if (!chars || chars.length < 5) {
      throw new Error(`[${viewport.label}] Expected Speed Test characters, got "${chars}"`);
    }
    await page.locator('[data-testid="typing-text-viewport"]').click();
    await page.keyboard.type(chars, {delay: 6});
    await page.locator('[data-testid="session-results"]').waitFor({
      state: 'visible',
      timeout: 6000,
    });
    await assertScreenGeometry(page, `${viewport.label} results`, {
      requireSessionResults: true,
    });
    await page.screenshot({path: path.join(vpDir, '05-results.png')});

    // 6. Dashboard
    await navigateHeaderScene(page, 'Progress');
    await assertScreenGeometry(page, `${viewport.label} dashboard`);
    await page.screenshot({path: path.join(vpDir, '06-dashboard.png')});

    // 7. Each Arcade Game forced to 2D Classic
    await navigateHeaderScene(page, 'Arcade');
    for (let i = 0; i < ARCADE_GAMES.length; i++) {
      const game = ARCADE_GAMES[i];
      if (i > 0) {
        await page.getByRole('button', {name: /All Arcade Games/i}).click();
        await waitForSettledLayout(page);
      }
      await page.getByRole('button', {name: new RegExp(`Launch ${game.title}`, 'i')}).click();
      const banner = page.locator(`[data-testid="arcade-start-${game.id}"]`);
      await banner.waitFor({state: 'visible', timeout: 5000});

      const button2d = banner
        .locator(`[aria-label="Visuals override for ${game.id}"] button:has-text("2D")`)
        .first();
      await button2d.click();
      await banner.getByRole('button', {name: /Start Round/i}).click();
      await waitForSettledLayout(page);

      await assertScreenGeometry(page, `${viewport.label} arcade-${game.id}`, {
        requireTypingViewport: game.hasTypingViewport,
      });
      await page.screenshot({
        path: path.join(vpDir, `07-arcade-${i + 1}-${game.id}.png`),
      });
    }

    if (consoleErrors.length > 0) {
      throw new Error(`[${viewport.label}] Uncaught page errors:\n  - ${consoleErrors.join('\n  - ')}`);
    }
    console.log(`PASS ${viewport.label} (Settings, Hub, Classroom, Speed Test, Results, Dashboard, 5 Arcade games)`);
  } finally {
    await context.close();
  }
}

async function main() {
  await fs.rm(SCREENSHOT_DIR, {recursive: true, force: true});
  await fs.mkdir(SCREENSHOT_DIR, {recursive: true});

  const {server, baseUrl} = await startStaticServer();
  const browser = await chromium.launch({headless: true});

  try {
    for (const vp of TARGET_VIEWPORTS) {
      await runAuditForViewport(browser, baseUrl, vp);
    }
    console.log(`All ${TARGET_VIEWPORTS.length} viewports passed layout audit cleanly.`);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
