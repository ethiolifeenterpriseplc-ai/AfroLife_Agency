import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const chrome = process.env.AFROLIFE_CHROME_PATH
  ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const appUrl = process.env.AFROLIFE_UI_URL ?? 'http://127.0.0.1:3000/';
const credentialFile = join(process.env.LOCALAPPDATA ?? '', 'AfroLife', 'local-test-users.txt');
const adminLine = readFileSync(credentialFile, 'utf8').split(/\r?\n/)
  .find((line) => line.startsWith('super_admin |'));
assert.ok(adminLine, `A local Super Admin login is required in ${credentialFile}`);
const [, phone, password] = adminLine.split('|').map((part) => part.trim());
const profile = mkdtempSync(join(tmpdir(), 'afrolife-ui-smoke-'));
assert.ok(profile.startsWith(tmpdir()), 'Browser profile must be isolated in the system temp directory');
const browser = spawn(chrome, [
  '--headless', '--disable-gpu', '--disable-crash-reporter', '--disable-breakpad', '--no-first-run', '--no-default-browser-check',
  '--disable-background-networking', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  appUrl,
], { stdio: 'ignore', windowsHide: true });

let socket;
try {
  let debuggingPort;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (browser.exitCode !== null) throw new Error(`Chrome exited with code ${browser.exitCode}`);
    try {
      const portFile = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8');
      debuggingPort = Number(portFile.split(/\r?\n/)[0]);
      break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(debuggingPort, 'Chrome did not start its local DevTools endpoint');
  const targets = await fetch(`http://127.0.0.1:${debuggingPort}/json/list`).then((response) => response.json());
  const target = targets.find((item) => item.type === 'page');
  assert.ok(target?.webSocketDebuggerUrl, 'Chrome page target was not found');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let nextId = 0;
  const pending = new Map();
  const pageErrors = [];
  socket.addEventListener('message', ({ data }) => {
    const event = JSON.parse(data);
    if (event.method === 'Runtime.exceptionThrown') pageErrors.push(event.params.exceptionDetails.text);
    if (event.method === 'Log.entryAdded' && event.params.entry.level === 'error') pageErrors.push(event.params.entry.text);
    if (event.id) {
      const callback = pending.get(event.id);
      pending.delete(event.id);
      callback?.(event);
    }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`Chrome DevTools timed out: ${method}`)); }, 10000);
    pending.set(id, (event) => { clearTimeout(timeout); event.error ? reject(new Error(event.error.message)) : resolve(event.result); });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
    return response.result.value;
  };
  const waitFor = async (expression, label) => {
    for (let attempt = 0; attempt < 80; attempt++) {
      if (await evaluate(expression)) return;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error(`Timed out waiting for ${label}`);
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await waitFor("document.readyState === 'complete' && !!document.querySelector('#login-form')", 'login form');
  await evaluate(`(() => {
    const form = document.querySelector('#login-form');
    form.elements.phone.value = ${JSON.stringify(phone)};
    form.elements.password.value = ${JSON.stringify(password)};
    form.requestSubmit();
    return true;
  })()`);
  await waitFor("document.querySelector('#app-view')?.hidden === false", 'successful Super Admin sign in');
  await waitFor("document.querySelector('#mfi-tab')?.hidden === false", 'SACCO tab visibility');
  await waitFor("!!document.querySelector('#workspace .service-launcher-card [data-action=\"open-panel\"][data-panel=\"mfi\"]')", 'role-aware mini-app launcher');
  await evaluate("document.querySelector('#workspace .service-launcher-card [data-action=\"open-panel\"][data-panel=\"mfi\"]').click()");
  await waitFor("!!document.querySelector('#workspace .mfi-workspace')", 'SACCO workspace rendering');
  await evaluate("document.querySelector('#agents-tab').click()");
  await waitFor("!!document.querySelector('#workspace .service-launcher-card [data-action=\"open-panel\"][data-panel=\"commissions\"]')", 'agent mini-app shortcuts');
  await evaluate("document.querySelector('#mfi-tab').click()");
  await waitFor("!!document.querySelector('#workspace .mfi-workspace')", 'SACCO workspace return');
  await waitFor("!!document.querySelector('#workspace [data-mfi-service-search]')", 'accessible service finder');
  const serviceSearch = await evaluate(`(() => {
    const field = document.querySelector('#workspace [data-mfi-service-search]');
    field.value = 'Digital wallet';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    const visible = [...document.querySelectorAll('#workspace .mfi-module-link')].filter((item) => !item.hidden);
    const result = visible.map((item) => item.querySelector('.mfi-module-name')?.textContent);
    field.value = '';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    return result;
  })()`);
  assert.deepEqual(serviceSearch, ['Digital wallet'], 'Service finder should return the matching service and hide unrelated entries');
  await waitFor("!!document.querySelector('#workspace [data-mfi-module=\"members\"]')", 'SACCO service navigation');
  await waitFor("!!document.querySelector('#workspace [data-mfi-module=\"members\"] .mfi-module-status.status-partial')", 'module readiness indicator');
  await evaluate("document.querySelector('#workspace [data-mfi-module=\"members\"]').click()");
  await waitFor("!!document.querySelector('#workspace .mfi-member-form')", 'member registration form');
  await evaluate("document.querySelector('#workspace [data-mfi-module=\"credit\"]').click()");
  await waitFor("!!document.querySelector('#workspace .mfi-submodule-area .mfi-submodule-card')", 'credit service submodules');
  await waitFor("!!document.querySelector('#workspace [data-mfi-form=\"credit-policy\"]')", 'credit policy configuration form');
  await waitFor("!!document.querySelector('#workspace [name=\"monthly_income\"]')", 'credit application affordability inputs');
  await evaluate("document.querySelector('#workspace [data-mfi-focus-target=\"mfi-credit-policy-settings\"]')?.click()");
  await waitFor("document.activeElement?.id === 'mfi-credit-policy-settings'", 'submodule configuration shortcut');
  await evaluate("document.querySelector('#workspace [data-mfi-module=\"collections\"]').click()");
  await waitFor("!!document.querySelector('#workspace .mfi-section')", 'collections workflow screen');
  await evaluate("document.querySelector('#workspace [data-mfi-module=\"risk-fraud\"]').click()");
  await waitFor("!!document.querySelector('#workspace [data-mfi-form=\"npl-classification\"]') || !!document.querySelector('#workspace .mfi-record-list')", 'risk classification screen');
  await evaluate("document.querySelector('#workspace [data-mfi-module=\"staff\"]')?.click()");
  await waitFor("!!document.querySelector('#workspace .mfi-staff-form')", 'institution staff form');
  const edirEnabled = await evaluate("document.querySelector('#edir-tab')?.hidden === false");
  if (edirEnabled) {
    await evaluate("document.querySelector('#edir-tab').click()");
    await waitFor("!!document.querySelector('#workspace .edir-service-nav [data-edir-focus=\"edir-finance\"])", 'Edir mini-app shortcuts');
    await evaluate("document.querySelector('#workspace [data-edir-focus=\"edir-finance\"]').click()");
    await waitFor("document.activeElement?.id === 'edir-finance'", 'Edir savings and accounts shortcut');
  }

  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  const mobileNavigation = await evaluate(`(() => {
    const nav = document.querySelector('#mobile-workspace-nav');
    const more = document.querySelector('#mobile-workspace-more');
    const links = [...nav.querySelectorAll('.workspace-nav-link')];
    return {
      visible: getComputedStyle(nav).display !== 'none',
      count: links.length,
      shortestTarget: Math.min(...links.map((link) => link.getBoundingClientRect().height)),
      labels: links.map((link) => link.getAttribute('aria-label') || link.textContent.trim()),
    };
  })()`);
  assert.equal(mobileNavigation.visible, true, 'Mobile quick navigation should be visible');
  assert.equal(mobileNavigation.count, 4, 'Mobile navigation should keep no more than three primary destinations plus More');
  assert.ok(mobileNavigation.shortestTarget >= 44, `Mobile navigation targets are too small: ${JSON.stringify(mobileNavigation)}`);
  await evaluate("document.querySelector('#mobile-workspace-more').click()");
  await waitFor("document.querySelector('#workspace-more-dialog')?.open === true", 'mobile workspace sections sheet');
  await waitFor("!!document.querySelector('#workspace-more-nav [data-panel=\"admin\"]')", 'additional role-visible sections');
  await evaluate("document.querySelector('#workspace-more-nav [data-panel=\"admin\"]').click()");
  await waitFor("document.querySelector('#workspace-more-dialog')?.open === false && document.querySelector('#page-title')?.textContent === 'Admin workspace'", 'More navigation selection');

  const layouts = [];
  for (const [width, height, label] of [[390, 844, 'mobile'], [768, 1024, 'tablet'], [1440, 900, 'desktop']]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
    layouts.push(await evaluate(`({device:${JSON.stringify(label)},width:innerWidth,documentWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth})`));
  }
  for (const layout of layouts) {
    assert.ok(layout.documentWidth <= layout.width + 1, `${layout.device} page overflows horizontally: ${JSON.stringify(layout)}`);
    assert.ok(layout.bodyWidth <= layout.width + 1, `${layout.device} body overflows horizontally: ${JSON.stringify(layout)}`);
  }
  assert.deepEqual(pageErrors, [], `Browser console/runtime errors: ${pageErrors.join('; ')}`);
  console.log(JSON.stringify({ result: 'PASS', checks: ['Super Admin login', 'role-aware mini-app launcher', 'agent mini-app shortcuts', 'SACCO navigation and workspace', 'accessible service finder', 'service submodules and admin configuration shortcut', 'member, policy, affordability, collections, NPL, and staff screens rendered', 'Edir mini-app shortcuts when enabled', 'mobile bottom navigation visibility and touch target sizing', 'More sections sheet navigation', 'mobile/tablet/desktop horizontal overflow', 'browser console/runtime errors'], mobileNavigation, layouts }, null, 2));
} finally {
  socket?.close();
  if (Number.isInteger(browser.pid)) {
    if (process.platform === 'win32') spawnSync('taskkill.exe', ['/PID', String(browser.pid), '/T', '/F'], { stdio: 'ignore' });
    else browser.kill('SIGTERM');
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
  let removed = false;
  let cleanupError;
  for (let attempt = 0; attempt < 5 && !removed; attempt++) {
    try { rmSync(profile, { recursive: true, force: true }); removed = true; }
    catch (error) { cleanupError = error; await new Promise((resolve) => setTimeout(resolve, 300)); }
  }
  if (!removed) console.warn(`Could not clean isolated Chrome profile (${cleanupError?.code ?? 'unknown filesystem error'}).`);
}
