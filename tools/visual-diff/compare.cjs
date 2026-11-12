#!/usr/bin/env node
'use strict';
// Pairs the base and head shots, compares every tile pair with strata-imgcmp
// from the SHA-pinned Strata release, and writes the report.
//
//   node compare.cjs --config visual-diff.json --base shots/base --head shots/head --out report
//       [--strata-bin path/to/strata-imgcmp] [--base-error "base build failed"]
//       [--retake-base DIR --retake-head DIR]
//
// Writes <out>/report.json, <out>/summary.md (also appended to
// $GITHUB_STEP_SUMMARY when set), <out>/retake.txt (the shots worth retaking) and
// <out>/images/{base,head,diff}/ for every shot that is not `same`.
// Advisory: exits 0 when shots changed, 1 only on an error (a page that failed to
// load on the head, a failed base build, a broken comparison), 2 on usage errors.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const https = require('node:https');
const {spawnSync} = require('node:child_process');
const lib = require('./lib.cjs');

function usage(message) {
    process.stderr.write(`compare.cjs: ${message}\n` +
        'usage: node compare.cjs --config FILE --base DIR --head DIR --out DIR [--strata-bin FILE]\n' +
        '       [--base-error MESSAGE] [--retake-base DIR --retake-head DIR]\n');
    process.exit(2);
}

function parseArgs(argv) {
    const args = {};
    const keys = {
        '--config': 'config', '--base': 'base', '--head': 'head', '--out': 'out', '--strata-bin': 'strataBin',
        '--base-error': 'baseError', '--retake-base': 'retakeBase', '--retake-head': 'retakeHead', '--lock': 'lock'
    };
    for (let i = 0; i < argv.length; i++) {
        const key = keys[argv[i]];
        if (!key) usage(`unknown argument ${argv[i]}`);
        if (i + 1 >= argv.length) usage(`${argv[i]} needs a value`);
        args[key] = argv[++i];
    }
    if (!args.config || !args.head || !args.out) usage('--config, --head and --out are required');
    if (!args.base && !args.baseError) usage('--base is required unless --base-error is given');
    if (!!args.retakeBase !== !!args.retakeHead) usage('--retake-base and --retake-head go together');
    return args;
}

function download(url, file, redirects = 5) {
    return new Promise((resolve, reject) => {
        https.get(url, {headers: {'User-Agent': 'community-site-kit-visual-diff'}}, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
                res.resume();
                resolve(download(new URL(res.headers.location, url).toString(), file, redirects - 1));
                return;
            }
            if (res.statusCode !== 200) {
                res.resume();
                reject(new Error(`GET ${url}: HTTP ${res.statusCode}`));
                return;
            }
            const out = fs.createWriteStream(file);
            res.pipe(out);
            out.on('finish', () => out.close(resolve));
            out.on('error', reject);
        }).on('error', reject);
    });
}

function sha256(file) {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

// Downloads the Strata tarball named in strata.lock.json (once, cached), checks
// its SHA-256 and extracts bin/strata-imgcmp. Never falls back to anything
// unpinned.
async function strataImgcmp(lockFile) {
    const lock = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
    const cacheRoot = process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache');
    const dir = path.join(cacheRoot, 'strata', lock.version);
    const bin = path.join(dir, 'bin', 'strata-imgcmp');
    const tarball = path.join(dir, lock.asset);
    fs.mkdirSync(dir, {recursive: true});
    if (!fs.existsSync(tarball) || sha256(tarball) !== lock.sha256) {
        process.stdout.write(`Downloading ${lock.url}\n`);
        await download(lock.url, tarball + '.part');
        fs.renameSync(tarball + '.part', tarball);
    }
    const got = sha256(tarball);
    if (got !== lock.sha256) {
        fs.rmSync(tarball, {force: true});
        throw new Error(`${lock.asset}: SHA-256 ${got} does not match strata.lock.json (${lock.sha256})`);
    }
    if (!fs.existsSync(bin)) {
        const r = spawnSync('tar', ['-xzf', tarball, '-C', dir, './bin/strata-imgcmp'], {stdio: 'inherit'});
        if (r.status !== 0) throw new Error(`could not extract bin/strata-imgcmp from ${lock.asset}`);
    }
    return {bin, version: lock.version};
}

function readManifest(dir) {
    if (!dir) return null;
    const file = path.join(dir, 'manifest.json');
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function imgcmp(bin, a, b, diff, config) {
    const r = spawnSync(bin, [a, b, '--json', '--diff', diff,
        '--threshold', String(config.threshold), '--max-fraction', String(config.maxFraction)],
    {encoding: 'utf8'});
    if (r.error) return {class: 'error', error: `strata-imgcmp: ${r.error.message}`};
    return lib.classifyImgcmp(r.status, r.stdout);
}

// Compares one shot's tiles. `diffDir` receives diff PNGs of changed tiles.
function compareShot(bin, config, id, baseDir, baseRec, headDir, headRec, diffDir) {
    const n = Math.max(baseRec ? baseRec.tiles : 0, headRec ? headRec.tiles : 0);
    const tiles = [];
    for (let i = 0; i < n; i++) {
        const name = lib.tileName(id, i);
        const inBase = baseRec && i < baseRec.tiles;
        const inHead = headRec && i < headRec.tiles;
        if (inBase && inHead) {
            const t = imgcmp(bin, path.join(baseDir, name), path.join(headDir, name), path.join(diffDir, name), config);
            tiles.push({index: i, ...t});
        } else {
            tiles.push({index: i, class: inHead ? 'added' : 'removed'});
        }
    }
    return tiles;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const config = lib.loadConfig(args.config);
    const strata = args.strataBin
        ? {bin: args.strataBin, version: '(local binary)'}
        : await strataImgcmp(args.lock || path.join(__dirname, 'strata.lock.json'));

    const baseManifest = args.baseError ? null : readManifest(args.base);
    const headManifest = readManifest(args.head);
    const errors = [];
    if (args.baseError) errors.push(args.baseError);
    else if (!baseManifest) errors.push(`no base shots (${path.join(args.base, 'manifest.json')} is missing)`);
    if (!headManifest) {
        errors.push(`no head shots (${path.join(args.head, 'manifest.json')} is missing)`);
    }
    const retakeBase = readManifest(args.retakeBase);
    const retakeHead = readManifest(args.retakeHead);

    const out = path.resolve(args.out);
    const images = path.join(out, 'images');
    fs.rmSync(images, {recursive: true, force: true});
    const diffWork = path.join(out, '.diff-work');
    fs.rmSync(diffWork, {recursive: true, force: true});
    fs.mkdirSync(diffWork, {recursive: true});

    const byId = (m) => new Map((m ? m.shots : []).map((s) => [s.id, s]));
    const baseShots = byId(baseManifest);
    const headShots = byId(headManifest);
    const retakeBaseShots = byId(retakeBase);
    const retakeHeadShots = byId(retakeHead);
    const ids = [...headShots.keys(), ...[...baseShots.keys()].filter((id) => !headShots.has(id))];

    const shots = [];
    let tileCount = 0;
    for (const id of ids) {
        const b = baseShots.get(id);
        const h = headShots.get(id);
        const meta = h || b;
        const shot = {id, page: meta.page, viewport: meta.viewport, scheme: meta.scheme, tiles: []};
        const baseOk = b && b.status === 'ok' ? b : null;
        const headOk = h && h.status === 'ok' ? h : null;
        // A head page that failed to load is an error on its own; its missing
        // tiles are not reported as removed.
        shot.tiles = h && !headOk ? []
            : compareShot(strata.bin, config, id, args.base, baseOk, args.head, headOk, diffWork);
        tileCount += shot.tiles.length;
        shot.class = lib.shotClass(shot.tiles.map((t) => t.class));
        if (h && h.status !== 'ok') {
            shot.class = 'error';
            shot.error = `head: ${h.error}`;
        } else if (!h) {
            shot.class = 'removed';
        } else {
            const baseErrors = new Set(b ? b.pageErrors || [] : []);
            const fresh = (h.pageErrors || []).filter((e) => !baseErrors.has(e));
            if (fresh.length) {
                shot.class = 'error';
                shot.error = `uncaught error on head: ${fresh[0]}`;
            } else if (b && b.status !== 'ok') {
                shot.note = `base: ${b.error}`;
            }
        }
        const tileError = shot.tiles.find((t) => t.class === 'error');
        if (tileError && !shot.error) shot.error = tileError.error;

        // A retaken shot that no longer differs is flaky: a source of
        // nondeterminism to remove, reported but not counted as a change.
        if (shot.class === 'changed' && retakeBaseShots.has(id) && retakeHeadShots.has(id)) {
            const rb = retakeBaseShots.get(id);
            const rh = retakeHeadShots.get(id);
            if (rb.status === 'ok' && rh.status === 'ok') {
                const retake = compareShot(strata.bin, config, id, args.retakeBase, rb, args.retakeHead, rh,
                    path.join(diffWork, 'retake'));
                if (lib.shotClass(retake.map((t) => t.class)) === 'same') shot.class = 'flaky';
            }
        }
        shots.push(shot);
    }

    // Copy the images of every shot that is not `same` into the artifact folder.
    for (const shot of shots) {
        if (shot.class === 'same') continue;
        for (const t of shot.tiles) {
            const name = lib.tileName(shot.id, t.index);
            const copies = [[args.base, 'base'], [args.head, 'head'], [diffWork, 'diff']];
            for (const [from, to] of copies) {
                if (!from) continue;
                const src = path.join(from, name);
                if (fs.existsSync(src)) {
                    fs.mkdirSync(path.join(images, to), {recursive: true});
                    fs.copyFileSync(src, path.join(images, to, name));
                }
            }
        }
    }
    fs.rmSync(diffWork, {recursive: true, force: true});

    for (const shot of shots) if (shot.class === 'error' && shot.error) errors.push(`\`${shot.id}\`: ${shot.error}`);
    const report = {
        strata: strata.version,
        threshold: config.threshold,
        maxFraction: config.maxFraction,
        base: baseManifest ? {url: baseManifest.url, chromium: baseManifest.chromium} : null,
        head: headManifest ? {url: headManifest.url, chromium: headManifest.chromium} : null,
        tiles: tileCount,
        errors,
        shots
    };
    const summary = lib.renderSummary(report);
    fs.mkdirSync(out, {recursive: true});
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    fs.writeFileSync(path.join(out, 'summary.md'), summary);
    fs.writeFileSync(path.join(out, 'retake.txt'),
        shots.filter((s) => s.class === 'changed').map((s) => s.id).join(',') + '\n');
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
    process.stdout.write(summary);
    process.exit(errors.length ? 1 : 0);
}

main().catch((e) => {
    process.stderr.write(`compare.cjs: ${e && e.message || e}\n`);
    process.exit(1);
});
