/* WHAT THE PUBLISHED WORLD ACTUALLY DOES, loaded the way a phone loads it.

   Two loads, reported separately, because they fail for different reasons and the difference is the
   whole diagnosis:

     1. The Pages deploy of world-nav.html, direct. If this is broken, the lab shipped it.
     2. The app page that embeds it. If (1) is fine and (2) is not, the fault is the embed — the
        iframe URL, the CORS HEAD that builds its cache-bust key, the app's own build, or a
        Content-Security-Policy that will not let the frame load at all.

   Every console message, page error and failed request is captured on both. A module that 404s
   takes the whole graph down silently otherwise: the page stays up, the canvas stays empty, and
   nothing in the UI says why. */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const WORLD = 'https://heinrichvanwyk101-lab.github.io/where2hang-hero-lab/world-nav.html?embed=1&rail=0&fp&view=day';
const APP   = process.argv[2] || 'https://where2hang.ae/home';
const OUT   = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const lines = [];
const say = (...a) => { const s = a.join(' '); lines.push(s); console.log(s); };

function watch(page, tag){
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR ' + String(e.stack || e.message).split('\n').slice(0, 3).join(' | ')));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type().toUpperCase() + ' ' + m.text().slice(0, 400)); });
  page.on('requestfailed', r => errs.push('REQFAIL ' + r.url().slice(0, 200) + ' — ' + (r.failure()?.errorText || '?')));
  page.on('response', r => { if (r.status() >= 400) errs.push('HTTP ' + r.status() + ' ' + r.url().slice(0, 200)); });
  return errs;
}

const browser = await chromium.launch();

/* ---- 1. the published world, on its own ---------------------------------------------------- */
{
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
  const errs = watch(page, 'world');
  let ok = true;
  try { await page.goto(WORLD, { waitUntil: 'load', timeout: 120000 }); }
  catch (e){ ok = false; say('WORLD goto failed:', e.message); }
  const state = await page.evaluate(() => {
    const W = window.W2H;
    if (!W) return { W2H: false };
    return {
      W2H: true,
      districts: (W.DISTRICTS || []).length,
      built: (W.DISTRICTS || []).filter(d => d.built).length,
      ids: (W.DISTRICTS || []).map(d => d.id).join(','),
      builds: (window.W2H_BUILDS || null),
    };
  }).catch(e => ({ W2H: false, evalError: e.message }));
  say('--- PUBLISHED WORLD ---');
  say('url:', WORLD);
  say('state:', JSON.stringify(state));
  /* HOW LONG UNTIL EVERY DISTRICT IS UP, sampled rather than waited on in one lump. The first run
     of this check reported "5 of 9 after 20 s" and that number alone cannot tell you whether the
     world is broken or merely slow — which is the entire question when the complaint is "no model
     loading". A curve can: if the count climbs, it is load time; if it stalls, it is a fault. */
  const t0 = Date.now();
  let last = -1;
  for (let i = 0; i < 36; i++){
    const n = await page.evaluate(() => {
      const W = window.W2H; if (!W) return null;
      return { b: (W.DISTRICTS || []).filter(d => d.built).length, of: (W.DISTRICTS || []).length,
               fp: (W.DISTRICTS || []).reduce((a, d) => a + (d.fpCount || 0), 0) };
    }).catch(() => null);
    if (n && n.b !== last){ say('  t+' + ((Date.now()-t0)/1000).toFixed(0) + 's  built ' + n.b + '/' + n.of + '  footprints ' + n.fp); last = n.b; }
    if (n && n.of && n.b >= n.of) break;
    await page.waitForTimeout(5000);
  }
  say('time to all built:', ((Date.now() - t0) / 1000).toFixed(0) + 's');
  say('errors:', errs.length);
  errs.slice(0, 40).forEach(e => say('  ' + e));
  /* Software GL on a runner makes a full-page capture slow enough to blow the 30 s default, which
     is what killed the first run BEFORE it ever reached the app page — the half of the check that
     matters most. Generous timeout, and non-fatal either way. */
  try { await page.screenshot({ path: OUT + 'world.png', timeout: 120000 }); }
  catch (e){ say('world screenshot skipped:', e.message.split('\n')[0]); }
  await page.close();
  if (!ok) process.exitCode = 1;
}

/* ---- 2. the app page that embeds it --------------------------------------------------------- */
{
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
  const errs = watch(page, 'app');
  try { await page.goto(APP, { waitUntil: 'load', timeout: 120000 }); }
  catch (e){ say('APP goto failed:', e.message); }
  await page.waitForTimeout(25000);
  const frames = page.frames().map(f => f.url()).filter(u => u && u !== 'about:blank');
  const iframe = await page.evaluate(() => {
    const f = document.querySelector('iframe');
    if (!f) return null;
    const cs = getComputedStyle(f);
    return { src: f.getAttribute('src'), opacity: cs.opacity, display: cs.display,
             visibility: cs.visibility, w: f.clientWidth, h: f.clientHeight };
  }).catch(() => null);
  say('');
  say('--- APP PAGE ---');
  say('url:', APP);
  say('iframe:', JSON.stringify(iframe));
  say('frames:', JSON.stringify(frames));
  const inner = page.frames().find(f => /world-nav\.html/.test(f.url() || ''));
  if (inner){
    const st = await inner.evaluate(() => {
      const W = window.W2H; if (!W) return { W2H: false };
      return { W2H: true, built: (W.DISTRICTS || []).filter(d => d.built).length, of: (W.DISTRICTS || []).length };
    }).catch(e => ({ evalError: e.message }));
    say('embedded world:', JSON.stringify(st));
  } else {
    say('embedded world: NO world-nav frame on the page');
  }
  say('errors:', errs.length);
  errs.slice(0, 40).forEach(e => say('  ' + e));
  try { await page.screenshot({ path: OUT + 'app.png', fullPage: false, timeout: 120000 }); }
  catch (e){ say('app screenshot skipped:', e.message.split('\n')[0]); }
  await page.close();
}

await browser.close();
writeFileSync(OUT + 'report.txt', lines.join('\n') + '\n');
