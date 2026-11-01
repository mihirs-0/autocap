// End-to-end check of the built app in a real browser (Chromium, iPhone screen size).
// Usage: npm run build && npm run e2e
import { createRequire } from 'node:module';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const { chromium, devices } = createRequire(import.meta.url)('playwright');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'e2e', 'out');
mkdirSync(out, { recursive: true });
const PORT = 4179;
const URL = `http://localhost:${PORT}/`;

const server = spawn(join(root, 'node_modules', '.bin', 'vite'), ['preview', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'pipe' });
await new Promise((resolve, reject) => {
  server.stdout.on('data', (d) => String(d).includes(String(PORT)) && resolve());
  server.on('exit', () => reject(new Error('preview server stopped')));
  setTimeout(() => reject(new Error('preview server did not start')), 15000);
});

const browser = await chromium.launch();
const { defaultBrowserType, ...iphone } = devices['iPhone 14'];
const context = await browser.newContext({ ...iphone, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('dialog', (d) => d.accept());
let step = 0;
const ok = (msg) => console.log(`  ✓ ${++step}. ${msg}`);
const shot = (name) => page.screenshot({ path: join(out, `${name}.png`), fullPage: false });
const notice = () => page.locator('.notice').last();
const card = (text) => page.locator('.meal-card', { hasText: text });

try {
  await page.goto(URL);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  assert.ok(await page.evaluate(() => !!navigator.serviceWorker.controller), 'service worker controls the page');
  ok('app loads and the service worker is active');

  // make a real JPEG test photo, 3000x2000
  const b64 = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 3000; c.height = 2000;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 3000, 2000);
    g.addColorStop(0, '#d9822b'); g.addColorStop(1, '#2b8a3e');
    x.fillStyle = g; x.fillRect(0, 0, 3000, 2000);
    x.fillStyle = '#fff'; x.font = 'bold 300px sans-serif'; x.fillText('FOOD', 900, 1100);
    return c.toDataURL('image/jpeg', 0.95).split(',')[1];
  });
  const photoPath = join(out, 'test-photo.jpg');
  writeFileSync(photoPath, Buffer.from(b64, 'base64'));

  // 1. plan breakfast
  await page.getByRole('button', { name: '+ Add breakfast' }).click();
  await page.getByRole('radio', { name: 'Plan a meal' }).click();
  await page.getByRole('button', { name: 'New plan' }).click();
  await page.getByPlaceholder('e.g. Chicken salad').fill('Oatmeal');
  await page.getByPlaceholder(/One per line/).fill('60 g oats\n200 ml milk');
  await shot('01-editor');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await card('Oatmeal').waitFor();
  ok('plan a meal with only some fields filled');

  // 2. one-tap "ate as planned"
  await card('Oatmeal').getByRole('button', { name: '✓ Ate as planned' }).click();
  await page.locator('.meal-card .tag-ate + .entry-name', { hasText: 'Oatmeal' }).waitFor();
  ok('record "ate as planned" in one tap');

  // 3. edit the plan + add a photo to what was eaten; eaten record must stay "Oatmeal"
  await card('Oatmeal').click();
  await page.getByRole('tab', { name: /Planned/ }).click();
  await page.getByPlaceholder('e.g. Chicken salad').fill('Oatmeal with banana');
  await page.getByRole('tab', { name: /What I ate/ }).click();
  await page.getByTestId('photo-input-eaten').setInputFiles(photoPath);
  await page.locator('.entry-form .thumb img').waitFor();
  await shot('02-editor-photo');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.locator('.sheet').waitFor({ state: 'detached' });
  const lines = await card('Oatmeal').locator('.entry-name').allInnerTexts();
  assert.deepEqual(lines, ['Oatmeal with banana', 'Oatmeal'], 'plan edited, eaten record kept');
  ok('edit the plan without overwriting what was eaten; photo attached');

  // 4. thumbnail -> enlarge; check compression size
  await card('Oatmeal').locator('.thumb').click();
  const img = page.locator('.lightbox img');
  await img.waitFor();
  const size = await img.evaluate((el) => [el.naturalWidth, el.naturalHeight]);
  assert.deepEqual(size, [1600, 1067], 'photo resized to 1600 px on the long side');
  await shot('03-lightbox');
  await page.getByRole('button', { name: 'Close photo' }).click();
  ok(`tap thumbnail to enlarge (stored at ${size[0]}x${size[1]} from 3000x2000)`);

  // 5. unplanned snack, then save as favorite
  await page.getByRole('button', { name: '+ Add snack' }).click();
  await page.getByRole('radio', { name: 'Log what I ate' }).click();
  await page.getByRole('button', { name: 'New entry' }).click();
  await page.getByPlaceholder('e.g. Chicken salad and bread').fill('Apple');
  await page.getByPlaceholder('e.g. 1 large bowl, about 350 g').fill('1 medium');
  await page.getByRole('button', { name: '☆ Save as favorite' }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await card('Apple').waitFor();
  assert.equal(await card('Apple').locator('.entry-empty').innerText().then((t) => t.includes('Not planned')), true);
  ok('add an unplanned meal and save it as a favorite');

  // 6. reuse favorite for lunch
  await page.getByRole('button', { name: '+ Add lunch' }).click();
  await page.getByRole('radio', { name: 'Plan a meal' }).click();
  await page.getByRole('button', { name: /^Apple/ }).click();
  assert.equal(await page.getByPlaceholder('e.g. 1 large bowl, about 350 g').inputValue(), '1 medium');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.locator('.slot', { hasText: 'Lunch' }).locator('.meal-card', { hasText: 'Apple' }).waitFor();
  ok('reuse a favorite');
  await shot('04-day');
  await page.screenshot({ path: join(out, '04-day-full.png'), fullPage: true });

  // 7. copy the day's plan to tomorrow
  await page.getByRole('button', { name: "Copy this day's plan to another day" }).click();
  await page.getByRole('button', { name: /^Copy 2 meals/ }).click();
  await page.getByRole('heading', { name: 'Tomorrow' }).waitFor();
  assert.equal(await page.locator('.meal-card').count(), 2);
  assert.equal(await page.locator('.tag-ate + .entry-name:not(.muted)').count(), 0, 'copies are plans only');
  ok("copy a day's plan to another day (plans only, no eaten records)");
  await page.getByRole('button', { name: 'Go to today' }).click();

  // 8. copy day for LLM
  await page.getByRole('button', { name: 'Copy day for LLM / Export' }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Copy for LLM' }).click();
  await notice().waitFor();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  writeFileSync(join(out, 'copied-day.txt'), clip);
  for (const s of ['INSTRUCTION: Estimate calories', 'PLANNED', 'EATEN: not recorded', 'Meal: Oatmeal with banana', 'Portions: unknown', '1 in the app (not included in this text)', 'DINNER: nothing planned or recorded']) {
    assert.ok(clip.includes(s), `copied text has "${s}"`);
  }
  await shot('05-export');
  ok('Copy for LLM (day) puts readable text on the clipboard');

  // 9. export with photos
  await page.getByRole('button', { name: /Export with photos/ }).click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download ZIP' }).click()]);
  const zipPath = join(out, dl.suggestedFilename());
  await dl.saveAs(zipPath);
  const zipInfo = execFileSync('python3', ['-c', `
import zipfile,sys
z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None
names=z.namelist(); md=z.read('meal-log.md').decode()
photos=[n for n in names if n.startswith('photos/')]
assert len(photos)==1, names
assert photos[0] in md, 'photo name beside meal'
assert 'Estimate calories' in md
print(len(names), photos[0], z.getinfo(photos[0]).file_size)
`, zipPath]).toString().trim();
  await page.getByRole('button', { name: 'Done' }).click();
  ok(`Export with photos makes a valid ZIP (${zipInfo})`);

  // 10. gallery
  await page.getByRole('button', { name: /Photos/ }).click();
  await page.locator('.gallery-grid .thumb img').waitFor();
  await shot('06-gallery');
  ok('photo gallery shows the photo by date');

  // 11. backup -> delete -> restore
  await page.getByRole('button', { name: /Data/ }).click();
  await page.getByRole('button', { name: 'Create backup' }).click();
  const [bdl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download backup' }).click()]);
  const backupPath = join(out, bdl.suggestedFilename());
  await bdl.saveAs(backupPath);
  const backup = JSON.parse(readFileSync(backupPath, 'utf8'));
  assert.equal(backup.meals.length, 5);
  assert.equal(backup.photos.length, 1);
  await shot('07-data');
  // delete the breakfast meal (and its photo)
  await page.getByRole('button', { name: /Day/ }).click();
  await card('Oatmeal').click();
  await page.getByRole('button', { name: 'Delete meal' }).click();
  await card('Oatmeal').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: /Data/ }).click();
  await page.getByText('4 meals · 0 photos · 1 favorite').waitFor();
  await page.getByTestId('restore-input').setInputFiles(backupPath);
  await page.getByRole('button', { name: 'Replace all my data' }).click();
  await page.getByText('5 meals · 1 photo · 1 favorite').waitFor();
  await page.getByRole('button', { name: /Day/ }).click();
  await card('Oatmeal').locator('.thumb img').waitFor();
  ok('backup includes photos; restore brings back a deleted meal and its photo');

  // 12. storage full: the error is shown and the typed data stays in the editor
  await page.evaluate(() => {
    window.__put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function () {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    };
  });
  await page.getByRole('button', { name: '+ Add dinner' }).click();
  await page.getByRole('radio', { name: 'Plan a meal' }).click();
  await page.getByRole('button', { name: 'New plan' }).click();
  await page.getByPlaceholder('e.g. Chicken salad').fill('Fish tacos');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.locator('.notice-error', { hasText: 'not enough storage space' }).waitFor();
  assert.equal(await page.getByPlaceholder('e.g. Chicken salad').inputValue(), 'Fish tacos', 'typed data kept');
  await shot('08-storage-error');
  await page.evaluate(() => (IDBObjectStore.prototype.put = window.__put));
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await card('Fish tacos').waitFor();
  await page.getByRole('button', { name: 'Close message' }).click();
  ok('storage-full error is shown, nothing is lost, and saving works after space is back');

  // 13. offline
  await context.setOffline(true);
  await page.reload();
  await card('Fish tacos').waitFor();
  const page2 = await context.newPage();
  await page2.goto(URL);
  await page2.locator('.meal-card', { hasText: 'Oatmeal with banana' }).waitFor();
  await page2.close();
  await context.setOffline(false);
  ok('works offline: reload and a fresh open both show the data');

  // 14. manifest
  const manifest = await (await page.request.get(URL + 'manifest.webmanifest')).json();
  assert.equal(manifest.display, 'standalone');
  ok('manifest is valid for "Add to Home Screen"');

  assert.deepEqual(errors, [], 'no script errors on the page');
  console.log(`\nAll ${step} checks passed. Screenshots in e2e/out/`);
} catch (e) {
  await page.screenshot({ path: join(out, 'failure.png'), timeout: 5000 }).catch(() => {});
  console.error('\nFAILED at step', step + 1, '\n', e);
  if (errors.length) console.error('Page errors:', errors);
  process.exitCode = 1;
} finally {
  server.kill();
  await browser.close();
  process.exit();
}
