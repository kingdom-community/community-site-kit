'use strict';
// Pure helpers for tools/visual-diff: the site config, a small PNG codec, tiling,
// shot naming, result classification and the report. Node standard library only,
// so compare.cjs runs without an npm install and the tests need no browser.

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

// ---------------------------------------------------------------------------
// Config

const DEFAULTS = Object.freeze({
    node: '18',
    install: 'npm ci',
    build: 'npm run build',
    serve: 'npx next start -p {port}',
    env: {},
    pages: ['/'],
    viewports: {
        desktop: {width: 1280, height: 800},
        phone: {width: 390, height: 844, isMobile: true, hasTouch: true}
    },
    schemes: ['light', 'dark'],
    clock: '2026-01-01T12:00:00Z',
    localStorage: {},
    mask: [],
    fixtures: {},
    threshold: 4.0,
    maxFraction: 0
});

const CONFIG_KEYS = Object.freeze(Object.keys(DEFAULTS).concat(['$schema', 'comment']));
const VIEWPORT_KEYS = Object.freeze(['width', 'height', 'isMobile', 'hasTouch']);

function fail(where, message) {
    throw new Error(`visual-diff config: ${where}: ${message}`);
}

function isPlainObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function stringMap(v, where) {
    if (!isPlainObject(v)) fail(where, 'must be an object');
    for (const [k, val] of Object.entries(v)) {
        if (typeof val !== 'string') fail(`${where}.${k}`, 'must be a string');
    }
    return {...v};
}

// Validates a parsed config and fills in defaults. Throws on any unknown key or
// wrong type, so a typo fails the job instead of silently taking no shots.
function normalizeConfig(raw) {
    if (!isPlainObject(raw)) fail('(root)', 'must be a JSON object');
    for (const key of Object.keys(raw)) {
        if (!CONFIG_KEYS.includes(key)) fail(key, 'unknown key');
    }
    const c = {...DEFAULTS, ...raw};
    for (const key of ['node', 'install', 'build', 'serve', 'clock']) {
        if (typeof c[key] !== 'string' || c[key] === '') fail(key, 'must be a non-empty string');
    }
    if (!c.serve.includes('{port}')) fail('serve', 'must contain {port}');
    if (Number.isNaN(Date.parse(c.clock))) fail('clock', 'must be an ISO 8601 date-time');
    c.env = stringMap(c.env, 'env');
    c.localStorage = stringMap(c.localStorage, 'localStorage');

    if (!Array.isArray(c.pages) || c.pages.length === 0) fail('pages', 'must be a non-empty array');
    for (const p of c.pages) {
        if (typeof p !== 'string' || !p.startsWith('/') || p.startsWith('//')) {
            fail('pages', `${JSON.stringify(p)} is not a site-relative path`);
        }
    }
    const slugs = c.pages.map(pageSlug);
    const dup = slugs.find((s, i) => slugs.indexOf(s) !== i);
    if (dup) fail('pages', `two pages share the shot name "${dup}"`);

    if (!isPlainObject(c.viewports) || Object.keys(c.viewports).length === 0) {
        fail('viewports', 'must be a non-empty object');
    }
    const viewports = {};
    for (const [name, vp] of Object.entries(c.viewports)) {
        if (!/^[a-z0-9-]+$/.test(name)) fail(`viewports.${name}`, 'name must match [a-z0-9-]+');
        if (!isPlainObject(vp)) fail(`viewports.${name}`, 'must be an object');
        for (const k of Object.keys(vp)) {
            if (!VIEWPORT_KEYS.includes(k)) fail(`viewports.${name}.${k}`, 'unknown key');
        }
        for (const k of ['width', 'height']) {
            if (!Number.isInteger(vp[k]) || vp[k] < 100 || vp[k] > 4000) {
                fail(`viewports.${name}.${k}`, 'must be an integer from 100 to 4000');
            }
        }
        for (const k of ['isMobile', 'hasTouch']) {
            if (vp[k] !== undefined && typeof vp[k] !== 'boolean') fail(`viewports.${name}.${k}`, 'must be a boolean');
        }
        viewports[name] = {width: vp.width, height: vp.height, isMobile: !!vp.isMobile, hasTouch: !!vp.hasTouch};
    }
    c.viewports = viewports;

    if (!Array.isArray(c.schemes) || c.schemes.length === 0) fail('schemes', 'must be a non-empty array');
    for (const s of c.schemes) {
        if (s !== 'light' && s !== 'dark') fail('schemes', `${JSON.stringify(s)} is not "light" or "dark"`);
    }
    if (!Array.isArray(c.mask) || c.mask.some((m) => typeof m !== 'string' || m === '')) {
        fail('mask', 'must be an array of CSS selectors');
    }
    c.fixtures = stringMap(c.fixtures, 'fixtures');
    for (const prefix of Object.keys(c.fixtures)) {
        if (!/^https?:\/\//.test(prefix)) fail(`fixtures.${prefix}`, 'key must be an http(s) URL prefix');
    }
    if (typeof c.threshold !== 'number' || !(c.threshold > 0)) fail('threshold', 'must be a number above 0');
    if (typeof c.maxFraction !== 'number' || c.maxFraction < 0 || c.maxFraction > 1) {
        fail('maxFraction', 'must be a number from 0 to 1');
    }
    delete c.$schema;
    delete c.comment;
    return c;
}

function loadConfig(file) {
    let raw;
    try {
        raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
        throw new Error(`visual-diff config: cannot read ${file}: ${e.message}`);
    }
    const c = normalizeConfig(raw);
    c.dir = path.dirname(path.resolve(file));
    return c;
}

// ---------------------------------------------------------------------------
// Shot names

// "/" -> "home", "/projects" -> "projects", "/a/b/" -> "a-b", "/x?y=1" -> "x-y-1".
function pageSlug(page) {
    const s = page.replace(/^\/+|\/+$/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
    return s === '' ? 'home' : s;
}

function shotId(page, viewport, scheme) {
    return `${pageSlug(page)}.${viewport}.${scheme}`;
}

function tileName(id, index) {
    return `${id}.${index}.png`;
}

// Every shot the config asks for, in a stable order.
function shotPlan(config) {
    const plan = [];
    for (const page of config.pages) {
        for (const viewport of Object.keys(config.viewports)) {
            for (const scheme of config.schemes) {
                plan.push({id: shotId(page, viewport, scheme), page, viewport, scheme});
            }
        }
    }
    return plan;
}

// ---------------------------------------------------------------------------
// Fixtures: a request URL under a configured prefix maps to a file under that
// prefix's directory. "<rest>" is tried as is, then "<rest>.json", then
// "<rest>/index.json". The query string is ignored.

function fixtureFile(fixtures, baseDir, url) {
    const prefixes = Object.keys(fixtures).sort((a, b) => b.length - a.length);
    for (const prefix of prefixes) {
        if (!url.startsWith(prefix)) continue;
        const root = path.resolve(baseDir, fixtures[prefix]);
        let rest = url.slice(prefix.length).split(/[?#]/)[0].replace(/^\/+/, '');
        rest = decodeURIComponent(rest);
        const candidates = rest === '' ? ['index.json'] : [rest, `${rest}.json`, path.join(rest, 'index.json')];
        for (const c of candidates) {
            const file = path.resolve(root, c);
            if (file !== root && !file.startsWith(root + path.sep)) return {matched: true, file: null};
            if (fs.existsSync(file) && fs.statSync(file).isFile()) return {matched: true, file};
        }
        return {matched: true, file: null};
    }
    return {matched: false, file: null};
}

// ---------------------------------------------------------------------------
// PNG: decode 8-bit non-interlaced greyscale/RGB/RGBA (what Chromium writes),
// encode RGBA.

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c >>> 0;
    }
    return t;
})();

function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

function decodePng(buf) {
    if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('not a PNG');
    let off = 8;
    let width = 0, height = 0, colorType = -1;
    const idat = [];
    while (off + 8 <= buf.length) {
        const len = buf.readUInt32BE(off);
        const type = buf.toString('latin1', off + 4, off + 8);
        const data = buf.subarray(off + 8, off + 8 + len);
        off += 12 + len;
        if (type === 'IHDR') {
            width = data.readUInt32BE(0);
            height = data.readUInt32BE(4);
            const depth = data[8];
            colorType = data[9];
            if (depth !== 8) throw new Error(`unsupported PNG bit depth ${depth}`);
            if (data[12] !== 0) throw new Error('interlaced PNGs are not supported');
            if (![0, 2, 4, 6].includes(colorType)) throw new Error(`unsupported PNG colour type ${colorType}`);
        } else if (type === 'IDAT') {
            idat.push(data);
        } else if (type === 'IEND') {
            break;
        }
    }
    if (!width || !height) throw new Error('PNG has no IHDR');
    const channels = {0: 1, 2: 3, 4: 2, 6: 4}[colorType];
    const stride = width * channels;
    const raw = zlib.inflateSync(Buffer.concat(idat));
    if (raw.length < (stride + 1) * height) throw new Error('PNG data is truncated');
    const px = Buffer.alloc(stride * height);
    let prev = Buffer.alloc(stride);
    for (let y = 0; y < height; y++) {
        const filter = raw[y * (stride + 1)];
        const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
        const out = px.subarray(y * stride, (y + 1) * stride);
        for (let x = 0; x < stride; x++) {
            const a = x >= channels ? out[x - channels] : 0;
            const b = prev[x];
            const c = x >= channels ? prev[x - channels] : 0;
            let v = line[x];
            switch (filter) {
                case 0: break;
                case 1: v += a; break;
                case 2: v += b; break;
                case 3: v += (a + b) >> 1; break;
                case 4: {
                    const p = a + b - c;
                    const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
                    v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
                    break;
                }
                default: throw new Error(`bad PNG filter ${filter}`);
            }
            out[x] = v & 0xff;
        }
        prev = out;
    }
    // Expand to RGBA.
    if (channels === 4) return {width, height, data: px};
    const rgba = Buffer.alloc(width * height * 4);
    for (let i = 0, j = 0; i < width * height; i++, j += channels) {
        const o = i * 4;
        if (channels === 3) {
            rgba[o] = px[j]; rgba[o + 1] = px[j + 1]; rgba[o + 2] = px[j + 2]; rgba[o + 3] = 255;
        } else {
            rgba[o] = rgba[o + 1] = rgba[o + 2] = px[j];
            rgba[o + 3] = channels === 2 ? px[j + 1] : 255;
        }
    }
    return {width, height, data: rgba};
}

function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
}

function encodePng({width, height, data}) {
    const stride = width * 4;
    const raw = Buffer.alloc((stride + 1) * height);
    for (let y = 0; y < height; y++) {
        raw[y * (stride + 1)] = 0;
        data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
    return Buffer.concat([
        PNG_SIGNATURE,
        chunk('IHDR', ihdr),
        chunk('IDAT', zlib.deflateSync(raw, {level: 6})),
        chunk('IEND', Buffer.alloc(0))
    ]);
}

// Cuts an RGBA image into tiles of `tileHeight` rows. The last tile is padded to
// full height with `fill` ([r, g, b, a]), so every tile of a shot is the same size
// and a page that grows by a few pixels changes only its last tile(s).
function tileImage(img, tileHeight, fill) {
    const {width, height, data} = img;
    const stride = width * 4;
    const count = Math.max(1, Math.ceil(height / tileHeight));
    const tiles = [];
    for (let i = 0; i < count; i++) {
        const out = Buffer.alloc(stride * tileHeight);
        const y0 = i * tileHeight;
        const rows = Math.min(tileHeight, height - y0);
        data.copy(out, 0, y0 * stride, (y0 + rows) * stride);
        for (let y = rows; y < tileHeight; y++) {
            for (let x = 0; x < width; x++) {
                const o = y * stride + x * 4;
                out[o] = fill[0]; out[o + 1] = fill[1]; out[o + 2] = fill[2]; out[o + 3] = fill[3];
            }
        }
        tiles.push({width, height: tileHeight, data: out});
    }
    return tiles;
}

// "rgb(1, 2, 3)" / "rgba(1, 2, 3, 0.5)" -> [r, g, b, 255]; transparent -> null.
function parseCssColor(s) {
    const m = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+%?))?\s*\)$/.exec(String(s).trim());
    if (!m) return null;
    if (m[4] !== undefined) {
        const a = m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
        if (a === 0) return null;
    }
    return [Number(m[1]), Number(m[2]), Number(m[3]), 255];
}

// ---------------------------------------------------------------------------
// Classification and report

// One strata-imgcmp run -> a tile result. `exitCode` is the process status and
// `stdout` its --json line.
function classifyImgcmp(exitCode, stdout) {
    let json = null;
    try {
        json = JSON.parse(String(stdout).trim().split('\n').pop());
    } catch (e) {
        json = null;
    }
    if (exitCode === 0 && json && json.passed) {
        return {class: 'same', max_delta_e: json.max_delta_e, pixels_over: json.pixels_over, fraction_over: json.fraction_over};
    }
    if (exitCode === 1 && json && json.same_size === true) {
        return {class: 'changed', pixels_over: json.pixels_over, fraction_over: json.fraction_over, max_delta_e: json.max_delta_e};
    }
    if (exitCode === 1 && json && json.same_size === false) {
        return {class: 'error', error: `tile sizes differ (${json.expected_size} vs ${json.actual_size})`};
    }
    const message = json && json.error ? json.error : `strata-imgcmp exited ${exitCode}`;
    return {class: 'error', error: message};
}

const SHOT_ORDER = ['error', 'changed', 'added', 'removed', 'flaky', 'same'];

// The class of a whole shot from its tiles: any error wins, then changed, then
// a pure grow (added) or shrink (removed).
function shotClass(tileClasses) {
    for (const k of ['error', 'changed']) if (tileClasses.includes(k)) return k;
    const added = tileClasses.includes('added');
    const removed = tileClasses.includes('removed');
    if (added || removed) return added ? 'added' : 'removed';
    return 'same';
}

function countBy(items, key) {
    const out = {};
    for (const it of items) out[it[key]] = (out[it[key]] || 0) + 1;
    return out;
}

function fmtPct(f) {
    if (typeof f !== 'number') return '';
    if (f === 0) return '0 %';
    if (f < 0.0001) return '< 0.01 %';
    return `${(f * 100).toFixed(2)} %`;
}

function escapeCell(s) {
    return String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

// "changed 0, 2; added 3" for the tiles of a shot that are not `same`.
function tileSummary(tiles) {
    const groups = new Map();
    for (const t of tiles) {
        if (t.class === 'same') continue;
        if (!groups.has(t.class)) groups.set(t.class, []);
        groups.get(t.class).push(t.index);
    }
    return Array.from(groups, ([k, idx]) => `${k} ${idx.join(', ')}`).join('; ');
}

// Markdown for $GITHUB_STEP_SUMMARY.
function renderSummary(report) {
    const counts = countBy(report.shots, 'class');
    const lines = [];
    lines.push('## Visual diff (advisory)');
    lines.push('');
    const changedTotal = report.shots.filter((s) => s.class !== 'same').length;
    if (report.errors.length === 0 && changedTotal === 0) {
        lines.push(`No visible change: all ${report.shots.length} shots match the base (${report.tiles} tiles, ` +
            `ΔE threshold ${report.threshold}, max fraction ${report.maxFraction}).`);
    } else {
        const parts = SHOT_ORDER.filter((k) => counts[k]).map((k) => `${counts[k]} ${k}`);
        lines.push(`${report.shots.length} shots: ${parts.join(', ')}. ` +
            `ΔE threshold ${report.threshold}, max fraction ${report.maxFraction}.`);
    }
    if (report.errors.length) {
        lines.push('');
        for (const e of report.errors) lines.push(`- **error:** ${escapeCell(e)}`);
    }
    const rows = report.shots
        .filter((s) => s.class !== 'same')
        .sort((a, b) => SHOT_ORDER.indexOf(a.class) - SHOT_ORDER.indexOf(b.class) || a.id.localeCompare(b.id));
    if (rows.length) {
        lines.push('');
        lines.push('| Shot | Page | Viewport | Scheme | Result | Tiles (0 = top) | Largest fraction over |');
        lines.push('|---|---|---|---|---|---|---|');
        for (const s of rows) {
            const notSame = tileSummary(s.tiles);
            const largest = s.tiles.reduce((m, t) => (typeof t.fraction_over === 'number' && t.class === 'changed'
                ? Math.max(m, t.fraction_over) : m), -1);
            const detail = s.error ? ` (${escapeCell(s.error)})` : '';
            lines.push(`| \`${s.id}\` | \`${escapeCell(s.page)}\` | ${s.viewport} | ${s.scheme} | ` +
                `${s.class}${detail} | ${notSame} | ${largest >= 0 ? fmtPct(largest) : ''} |`);
        }
        lines.push('');
        lines.push('Base, head and diff images of these shots are in the `visual-diff` artifact. ' +
            'In a diff image, pixels over the threshold are red on the dimmed base.');
    }
    lines.push('');
    lines.push(`Compared with \`strata-imgcmp\` from Strata ${report.strata}.`);
    return lines.join('\n') + '\n';
}

module.exports = {
    DEFAULTS,
    CONFIG_KEYS,
    normalizeConfig,
    loadConfig,
    pageSlug,
    shotId,
    tileName,
    shotPlan,
    fixtureFile,
    decodePng,
    encodePng,
    tileImage,
    parseCssColor,
    classifyImgcmp,
    shotClass,
    renderSummary,
    tileSummary,
    fmtPct
};
