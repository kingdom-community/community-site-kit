#!/usr/bin/env node
'use strict';
// Takes the shots of one served build: every page x viewport x colour scheme in
// the site config, each full page cut into viewport-height tiles.
//
//   node shoot.cjs --config visual-diff.json --url http://127.0.0.1:3101 --out shots/head [--only id,id]
//
// Needs `playwright` resolvable (NODE_PATH, or VISUAL_DIFF_PLAYWRIGHT naming the
// module) with its Chromium installed. Writes <out>/<id>.<n>.png and
// <out>/manifest.json. Exits 0 even when a page fails to load (the manifest
// records it, and compare.cjs reports it); exits 2 only on a usage error or when
// the browser cannot start.

const fs = require('node:fs');
const path = require('node:path');
const lib = require('./lib.cjs');

function parseArgs(argv) {
    const args = {only: null};
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        const next = () => {
            if (i + 1 >= argv.length) usage(`${a} needs a value`);
            return argv[++i];
        };
        if (a === '--config') args.config = next();
        else if (a === '--url') args.url = next();
        else if (a === '--out') args.out = next();
        else if (a === '--only') args.only = next().split(',').filter(Boolean);
        else usage(`unknown argument ${a}`);
    }
    if (!args.config || !args.url || !args.out) usage('--config, --url and --out are required');
    return args;
}

function usage(message) {
    process.stderr.write(`shoot.cjs: ${message}\n` +
        'usage: node shoot.cjs --config FILE --url BASE_URL --out DIR [--only id,id]\n');
    process.exit(2);
}

// Applied after load: no transitions, animations or caret, so a shot taken
// mid-transition cannot differ from one taken after it.
const FREEZE_CSS = `*, *::before, *::after {
  transition: none !important; animation: none !important; caret-color: transparent !important;
  scroll-behavior: auto !important;
}`;

async function settle(page) {
    await page.evaluate(async () => {
        await document.fonts.ready;
        // Walk down the page once so lazy images load, then return to the top.
        const step = Math.max(200, window.innerHeight);
        for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
            window.scrollTo(0, y);
            await new Promise((r) => requestAnimationFrame(() => r()));
        }
        window.scrollTo(0, 0);
    });
    await page.waitForLoadState('networkidle', {timeout: 15000}).catch(() => {});
    await page.evaluate(async () => {
        await Promise.all(Array.from(document.images)
            .filter((img) => !img.complete)
            .map((img) => new Promise((r) => { img.onload = img.onerror = r; })));
        await document.fonts.ready;
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    });
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const config = lib.loadConfig(args.config);
    const base = new URL(args.url);
    const origin = base.origin;
    const moduleName = process.env.VISUAL_DIFF_PLAYWRIGHT || 'playwright';
    let playwright;
    let playwrightVersion = null;
    try {
        playwright = require(moduleName);
        playwrightVersion = require(require.resolve(`${moduleName}/package.json`)).version;
    } catch (e) {
        process.stderr.write('shoot.cjs: cannot load playwright (install it outside the site, for example ' +
            '`npm install --no-save --prefix "$RUNNER_TEMP/pw" playwright@1.61.1`, and set NODE_PATH)\n');
        process.exit(2);
    }

    fs.mkdirSync(args.out, {recursive: true});
    const plan = lib.shotPlan(config).filter((s) => !args.only || args.only.includes(s.id));
    const manifest = {url: args.url, playwright: playwrightVersion, shots: []};

    const browser = await playwright.chromium.launch({args: ['--font-render-hinting=none', '--disable-lcd-text']});
    manifest.chromium = browser.version();
    const started = Date.now();
    try {
        for (const [vpName, vp] of Object.entries(config.viewports)) {
            for (const scheme of config.schemes) {
                const shots = plan.filter((s) => s.viewport === vpName && s.scheme === scheme);
                if (shots.length === 0) continue;
                const context = await browser.newContext({
                    viewport: {width: vp.width, height: vp.height},
                    deviceScaleFactor: 1,
                    isMobile: vp.isMobile,
                    hasTouch: vp.hasTouch,
                    colorScheme: scheme,
                    reducedMotion: 'reduce',
                    timezoneId: 'UTC',
                    locale: 'en-US',
                    serviceWorkers: 'block'
                });
                const blocked = new Set();
                await context.route('**/*', async (route) => {
                    const url = route.request().url();
                    if (url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
                    let reqOrigin = null;
                    try { reqOrigin = new URL(url).origin; } catch (e) { /* unparsable: block */ }
                    if (reqOrigin === origin) return route.continue();
                    const fx = lib.fixtureFile(config.fixtures, config.dir, url);
                    if (fx.matched) {
                        if (fx.file) {
                            return route.fulfill({status: 200, path: fx.file,
                                contentType: fx.file.endsWith('.json') ? 'application/json' : undefined});
                        }
                        return route.fulfill({status: 404, body: ''});
                    }
                    blocked.add(reqOrigin || url);
                    return route.abort('blockedbyclient');
                });
                const entries = Object.entries(config.localStorage);
                if (entries.length) {
                    await context.addInitScript(({o, items}) => {
                        if (location.origin !== o) return;
                        try {
                            for (const [k, v] of items) localStorage.setItem(k, v);
                        } catch (e) { /* storage unavailable */ }
                    }, {o: origin, items: entries});
                }
                const page = await context.newPage();
                await page.clock.setFixedTime(new Date(config.clock));
                let pageErrors = [];
                page.on('pageerror', (err) => pageErrors.push(String(err && err.message || err).slice(0, 300)));

                for (const shot of shots) {
                    pageErrors = [];
                    const record = {...shot, status: 'ok', tiles: 0, height: 0, pageErrors: []};
                    const t0 = Date.now();
                    try {
                        const response = await page.goto(new URL(shot.page, base).toString(),
                            {waitUntil: 'networkidle', timeout: 60000});
                        if (!response) throw new Error('no response');
                        if (response.status() >= 400) throw new Error(`HTTP ${response.status()}`);
                        await page.addStyleTag({content: FREEZE_CSS});
                        await settle(page);
                        const bg = await page.evaluate(() => [
                            getComputedStyle(document.body).backgroundColor,
                            getComputedStyle(document.documentElement).backgroundColor
                        ]);
                        const fill = lib.parseCssColor(bg[0]) || lib.parseCssColor(bg[1]) || [255, 255, 255, 255];
                        const png = await page.screenshot({
                            fullPage: true,
                            animations: 'disabled',
                            caret: 'hide',
                            scale: 'css',
                            mask: config.mask.map((sel) => page.locator(sel)),
                            maskColor: '#FF00FF'
                        });
                        const img = lib.decodePng(png);
                        const tiles = lib.tileImage(img, vp.height, fill);
                        tiles.forEach((tile, i) => {
                            fs.writeFileSync(path.join(args.out, lib.tileName(shot.id, i)), lib.encodePng(tile));
                        });
                        record.tiles = tiles.length;
                        record.height = img.height;
                    } catch (e) {
                        record.status = 'error';
                        record.error = String(e && e.message || e).split('\n')[0].slice(0, 300);
                    }
                    record.pageErrors = pageErrors.slice(0, 5);
                    record.ms = Date.now() - t0;
                    manifest.shots.push(record);
                    process.stdout.write(`${record.status === 'ok' ? 'shot ' : 'ERROR'} ${shot.id}` +
                        (record.status === 'ok' ? ` (${record.height}px, ${record.tiles} tiles)` : `: ${record.error}`) + '\n');
                }
                manifest.blockedOrigins = Array.from(new Set([...(manifest.blockedOrigins || []), ...blocked])).sort();
                await context.close();
            }
        }
    } finally {
        await browser.close();
    }
    manifest.ms = Date.now() - started;
    fs.writeFileSync(path.join(args.out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    process.stdout.write(`${manifest.shots.length} shots in ${(manifest.ms / 1000).toFixed(1)} s -> ${args.out}\n`);
}

main().catch((e) => {
    process.stderr.write(`shoot.cjs: ${e && e.stack || e}\n`);
    process.exit(2);
});
