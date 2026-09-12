// ═══════════════════════════════════════════════════ BROWSER TEST HARNESS
// Portable, leak-free automated headless browser runner using Playwright.

import path from 'node:path';
import {stat} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import process from 'node:process';
import {createTestServer} from './test-server.mjs';
import {getDeviceProfile} from './device-profiles.mjs';

async function fileExists(filePath) {
  try {
    const s = await stat(filePath);
    return s.isFile();
  } catch {
    return false;
  }
}

export async function resolvePlaywright() {
  if (process.env.PLAYWRIGHT_PATH) {
    const url = pathToFileURL(path.resolve(process.env.PLAYWRIGHT_PATH)).href;
    const mod = await import(url);
    return mod.chromium || mod.default?.chromium ? mod : null;
  }

  try {
    const mod = await import('playwright');
    if (mod?.chromium || mod?.default?.chromium) return mod;
  } catch (_) {}

  try {
    const mod = await import('@playwright/test');
    if (mod?.chromium || mod?.default?.chromium) return mod;
  } catch (_) {}

  // Local AppData fallback for portable environments
  const localAppData = process.env.LOCALAPPDATA || '';
  const candidatePaths = [
    path.join(localAppData, 'ms-playwright-go', '1.57.0', 'package', 'index.mjs'),
    path.join(localAppData, 'ms-playwright-go', 'package', 'index.mjs')
  ];

  for (const p of candidatePaths) {
    if (await fileExists(p)) {
      const url = pathToFileURL(p).href;
      try {
        const mod = await import(url);
        if (mod?.chromium || mod?.default?.chromium) return mod;
      } catch (_) {}
    }
  }

  return null;
}

export async function resolveBrowserExecutable(chromium) {
  if (process.env.BROWSER_PATH && await fileExists(process.env.BROWSER_PATH)) {
    return process.env.BROWSER_PATH;
  }
  if (process.env.EDGE_PATH && await fileExists(process.env.EDGE_PATH)) {
    return process.env.EDGE_PATH;
  }
  if (process.env.CHROME_PATH && await fileExists(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }

  const standardPaths = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
  ];

  for (const p of standardPaths) {
    if (await fileExists(p)) return p;
  }

  try {
    const bundled = chromium?.executablePath?.();
    if (bundled && await fileExists(bundled)) return bundled;
  } catch (_) {}

  return null;
}

export async function createBrowserSession({
  deviceProfile = 'DESKTOP_STANDARD',
  headless = true,
  rootDir = '.',
  timeoutMs = 15000,
  deterministic = true
} = {}) {
  const profile = typeof deviceProfile === 'string' ? getDeviceProfile(deviceProfile) : deviceProfile;
  const root = path.resolve(rootDir);

  let server = null;
  let browser = null;
  let context = null;
  let page = null;

  const cleanup = async () => {
    if (page) { try { await page.close(); } catch (_) {} page = null; }
    if (context) { try { await context.close(); } catch (_) {} context = null; }
    if (browser) { try { await browser.close(); } catch (_) {} browser = null; }
    if (server) { try { await server.close(); } catch (_) {} server = null; }
  };

  try {
    // 1. Resolve Playwright
    const pwModule = await resolvePlaywright();
    if (!pwModule) {
      throw new Error('Playwright library could not be resolved. Ensure playwright is installed or set PLAYWRIGHT_PATH.');
    }
    const chromium = pwModule.chromium || pwModule.default?.chromium;
    if (!chromium) {
      throw new Error('Chromium launcher not available in resolved Playwright module.');
    }

    // 2. Resolve browser executable
    const executablePath = await resolveBrowserExecutable(chromium);
    if (!executablePath) {
      throw new Error('No Edge or Chrome browser executable found. Set BROWSER_PATH or install a Chromium-based browser.');
    }

    // 3. Start ephemeral static server
    server = await createTestServer(root);

    // 4. Launch browser with sandboxing & background-throttling flags disabled
    browser = await chromium.launch({
      executablePath,
      headless,
      args: [
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--autoplay-policy=no-user-gesture-required'
      ]
    });

    // 5. Create context with device emulation
    context = await browser.newContext({
      viewport: profile.viewport,
      deviceScaleFactor: profile.deviceScaleFactor || 1,
      isMobile: !!profile.isMobile,
      hasTouch: !!profile.hasTouch,
      userAgent: profile.userAgent
    });

    page = await context.newPage();

    // 6. Comprehensive log and error tracking
    const sessionLogs = [];
    const sessionErrors = [];

    page.on('console', msg => {
      const text = msg.text();
      const type = msg.type();
      sessionLogs.push({ type, text, location: msg.location() });
      if (type === 'error' || /\[RENDER\]|\[SIM\] update failed|DISPLAY RECOVERING|fatal/i.test(text)) {
        sessionErrors.push({ kind: 'console.error', text, location: msg.location() });
      }
    });

    page.on('pageerror', error => {
      sessionErrors.push({ kind: 'pageerror', message: error.message, stack: error.stack });
    });

    // 7. Navigate to index.html
    const targetUrl = `${server.baseUrl}index.html`;
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });

    // 8. Wait for game initialization
    await page.waitForFunction(() => {
      return !!globalThis.game && !!globalThis.gameLoop && (
        document.documentElement.dataset.lay === 'desk' ||
        document.documentElement.dataset.lay === 'touch'
      );
    }, { timeout: timeoutMs });

    // 9. Freeze background loop in deterministic mode
    if (deterministic) {
      await page.evaluate(() => {
        globalThis.gameLoop?.setDeterministicMode(true);
      });
    }

    return {
      page,
      context,
      browser,
      server,
      profile,
      logs: sessionLogs,
      errors: sessionErrors,
      close: cleanup
    };
  } catch (err) {
    await cleanup();
    throw err;
  }
}
