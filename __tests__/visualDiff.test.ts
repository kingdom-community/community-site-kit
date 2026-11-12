// @vitest-environment node
// tools/visual-diff's pure helpers (lib.cjs). The browser and strata-imgcmp parts
// are covered end to end by tools/visual-diff/test.cjs in the `visual-diff` CI job.
import {createRequire} from 'node:module';
import {readFileSync, mkdtempSync, mkdirSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {deflateSync} from 'node:zlib';
import {describe, expect, it} from 'vitest';

const require = createRequire(import.meta.url);
const lib = require('../tools/visual-diff/lib.cjs');
const schema = JSON.parse(readFileSync(new URL('../tools/visual-diff/schema.json', import.meta.url), 'utf8'));
const lock = JSON.parse(readFileSync(new URL('../tools/visual-diff/strata.lock.json', import.meta.url), 'utf8'));

function rgba(width: number, height: number, f: (x: number, y: number) => number[]) {
    const data = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) data.set(f(x, y), (y * width + x) * 4);
    }
    return {width, height, data};
}

describe('config', () => {
    it('fills in the defaults', () => {
        const c = lib.normalizeConfig({});
        expect(c.pages).toEqual(['/']);
        expect(c.schemes).toEqual(['light', 'dark']);
        expect(c.threshold).toBe(4);
        expect(c.maxFraction).toBe(0);
        expect(Object.keys(c.viewports)).toEqual(['desktop', 'phone']);
    });

    it('rejects unknown keys and typos', () => {
        expect(() => lib.normalizeConfig({page: ['/']})).toThrow(/page: unknown key/);
        expect(() => lib.normalizeConfig({viewports: {d: {width: 800, height: 600, scale: 2}}}))
            .toThrow(/viewports\.d\.scale: unknown key/);
    });

    it('rejects bad values', () => {
        expect(() => lib.normalizeConfig({pages: []})).toThrow(/pages/);
        expect(() => lib.normalizeConfig({pages: ['projects']})).toThrow(/site-relative/);
        expect(() => lib.normalizeConfig({pages: ['//evil.example/']})).toThrow(/site-relative/);
        expect(() => lib.normalizeConfig({pages: ['/a-b', '/a/b']})).toThrow(/share the shot name "a-b"/);
        expect(() => lib.normalizeConfig({serve: 'next start'})).toThrow(/\{port\}/);
        expect(() => lib.normalizeConfig({schemes: ['sepia']})).toThrow(/schemes/);
        expect(() => lib.normalizeConfig({clock: 'noon'})).toThrow(/clock/);
        expect(() => lib.normalizeConfig({maxFraction: 2})).toThrow(/maxFraction/);
        expect(() => lib.normalizeConfig({threshold: 0})).toThrow(/threshold/);
        expect(() => lib.normalizeConfig({env: {A: 1}})).toThrow(/env\.A/);
        expect(() => lib.normalizeConfig({fixtures: {'/api/': 'x'}})).toThrow(/URL prefix/);
        expect(() => lib.normalizeConfig({viewports: {desktop: {width: 50, height: 600}}})).toThrow(/width/);
    });

    it('agrees with schema.json on the keys and defaults', () => {
        expect(Object.keys(schema.properties).sort()).toEqual([...lib.CONFIG_KEYS].sort());
        for (const [key, value] of Object.entries(lib.DEFAULTS)) {
            if (key === 'viewports') continue;
            expect(schema.properties[key].default, key).toEqual(value);
        }
    });

    it('loads a file and remembers its directory', () => {
        const dir = mkdtempSync(join(tmpdir(), 'vd-'));
        writeFileSync(join(dir, 'visual-diff.json'), JSON.stringify({pages: ['/', '/about']}));
        const c = lib.loadConfig(join(dir, 'visual-diff.json'));
        expect(c.dir).toBe(dir);
        expect(c.pages).toEqual(['/', '/about']);
        writeFileSync(join(dir, 'broken.json'), '{');
        expect(() => lib.loadConfig(join(dir, 'broken.json'))).toThrow(/cannot read/);
    });
});

describe('shot names', () => {
    it('slugs pages', () => {
        expect(lib.pageSlug('/')).toBe('home');
        expect(lib.pageSlug('/projects')).toBe('projects');
        expect(lib.pageSlug('/a/b/')).toBe('a-b');
        expect(lib.pageSlug('/Search?q=x')).toBe('search-q-x');
    });

    it('plans pages x viewports x schemes in a stable order', () => {
        const plan = lib.shotPlan(lib.normalizeConfig({pages: ['/', '/legal']}));
        expect(plan).toHaveLength(8);
        expect(plan[0]).toEqual({id: 'home.desktop.light', page: '/', viewport: 'desktop', scheme: 'light'});
        expect(plan.map((s: {id: string}) => s.id)).toContain('legal.phone.dark');
        expect(lib.tileName('home.desktop.light', 2)).toBe('home.desktop.light.2.png');
    });
});

describe('fixtures', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vd-fx-'));
    mkdirSync(join(dir, 'api', 'plugins'), {recursive: true});
    writeFileSync(join(dir, 'api', 'plugins.json'), '[]');
    writeFileSync(join(dir, 'api', 'plugins', 'index.json'), '[1]');
    writeFileSync(join(dir, 'api', 'status'), 'ok');
    const fixtures = {'https://api.example.com/v1/': 'api'};

    it('maps a URL under a prefix to a file, ignoring the query', () => {
        expect(lib.fixtureFile(fixtures, dir, 'https://api.example.com/v1/status?x=1').file)
            .toBe(join(dir, 'api', 'status'));
        expect(lib.fixtureFile(fixtures, dir, 'https://api.example.com/v1/plugins').file)
            .toBe(join(dir, 'api', 'plugins.json'));
    });

    it('answers a missing fixture as matched with no file (served as 404)', () => {
        expect(lib.fixtureFile(fixtures, dir, 'https://api.example.com/v1/nope')).toEqual({matched: true, file: null});
    });

    it('never leaves the fixture directory', () => {
        writeFileSync(join(dir, 'secret.json'), '{}');
        expect(lib.fixtureFile(fixtures, dir, 'https://api.example.com/v1/..%2Fsecret').file).toBeNull();
    });

    it('does not match other URLs', () => {
        expect(lib.fixtureFile(fixtures, dir, 'https://cdn.example.com/x.js').matched).toBe(false);
    });
});

describe('PNG and tiles', () => {
    it('round-trips RGBA through encode and decode', () => {
        const img = rgba(7, 5, (x, y) => [x * 30, y * 50, (x * y) % 256, 255 - x]);
        const back = lib.decodePng(lib.encodePng(img));
        expect(back.width).toBe(7);
        expect(back.height).toBe(5);
        expect(Buffer.compare(back.data, img.data)).toBe(0);
    });

    it('decodes RGB scanlines with every filter type', () => {
        // Hand-build a 3x5 RGB PNG whose rows use filters 0..4.
        const w = 3, h = 5, ch = 3;
        const bytes = Buffer.alloc(w * h * ch);
        for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 37) % 251;
        const px = (i: number) => bytes[i] ?? 0;
        const raw = Buffer.alloc((w * ch + 1) * h);
        for (let y = 0; y < h; y++) {
            raw[y * (w * ch + 1)] = y;
            for (let x = 0; x < w * ch; x++) {
                const cur = px(y * w * ch + x);
                const a = x >= ch ? px(y * w * ch + x - ch) : 0;
                const b = y > 0 ? px((y - 1) * w * ch + x) : 0;
                const c = x >= ch && y > 0 ? px((y - 1) * w * ch + x - ch) : 0;
                const p = a + b - c;
                const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
                const pred = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][y] ?? 0;
                raw[y * (w * ch + 1) + 1 + x] = (cur - pred) & 0xff;
            }
        }
        const rgbaPng = lib.encodePng(rgba(w, h, () => [0, 0, 0, 255]));
        // Keep the signature, swap in an RGB IHDR and the hand-filtered IDAT.
        const decoded = lib.decodePng(rebuild(rgbaPng, w, h, 2, deflateSync(raw)));
        for (let i = 0; i < w * h; i++) {
            expect([...decoded.data.subarray(i * 4, i * 4 + 4)])
                .toEqual([px(i * 3), px(i * 3 + 1), px(i * 3 + 2), 255]);
        }
    });

    it('refuses what it cannot decode', () => {
        expect(() => lib.decodePng(Buffer.from('nope'))).toThrow(/not a PNG/);
    });

    it('cuts a tall image into equal tiles and pads the last with the fill colour', () => {
        const img = rgba(4, 10, (x, y) => [y, 0, 0, 255]);
        const tiles = lib.tileImage(img, 4, [9, 8, 7, 255]);
        expect(tiles).toHaveLength(3);
        expect(tiles.every((t: {height: number}) => t.height === 4)).toBe(true);
        expect(tiles[1].data[0]).toBe(4);
        expect([...tiles[2].data.subarray(4 * 4, 4 * 4 + 4)]).toEqual([9, 0, 0, 255]); // row 9
        expect([...tiles[2].data.subarray(2 * 16, 2 * 16 + 4)]).toEqual([9, 8, 7, 255]); // padding
        expect(lib.tileImage(rgba(4, 4, () => [0, 0, 0, 255]), 4, [0, 0, 0, 255])).toHaveLength(1);
    });

    it('parses computed background colours', () => {
        expect(lib.parseCssColor('rgb(21, 22, 26)')).toEqual([21, 22, 26, 255]);
        expect(lib.parseCssColor('rgba(1, 2, 3, 0.5)')).toEqual([1, 2, 3, 255]);
        expect(lib.parseCssColor('rgba(0, 0, 0, 0)')).toBeNull();
        expect(lib.parseCssColor('transparent')).toBeNull();
    });
});

// Replaces the IHDR colour type and IDAT of a PNG built by encodePng.
function rebuild(png: Buffer, w: number, h: number, colorType: number, idat: Buffer): Buffer {
    const crcTable = Array.from({length: 256}, (_, n) => {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        return c >>> 0;
    });
    const crc = (b: Buffer) => {
        let c = 0xffffffff;
        for (const v of b) c = (crcTable[(c ^ v) & 0xff] ?? 0) ^ (c >>> 8);
        return (c ^ 0xffffffff) >>> 0;
    };
    const chunk = (type: string, data: Buffer) => {
        const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
        const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
        const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
        return Buffer.concat([len, td, c]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = colorType;
    return Buffer.concat([png.subarray(0, 8), chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

describe('classification', () => {
    const json = (o: object) => JSON.stringify(o);

    it('reads strata-imgcmp --json output', () => {
        expect(lib.classifyImgcmp(0, json({passed: true, same_size: true, pixels_over: 0, fraction_over: 0, max_delta_e: 0})).class)
            .toBe('same');
        const changed = lib.classifyImgcmp(1, json({passed: false, same_size: true, pixels_over: 12, fraction_over: 0.001, max_delta_e: 80}));
        expect(changed).toEqual({class: 'changed', pixels_over: 12, fraction_over: 0.001, max_delta_e: 80});
        expect(lib.classifyImgcmp(1, json({passed: false, same_size: false, expected_size: [1, 2], actual_size: [1, 3]})).class)
            .toBe('error');
        expect(lib.classifyImgcmp(2, json({passed: false, error: 'cannot read a.png'})))
            .toEqual({class: 'error', error: 'cannot read a.png'});
        expect(lib.classifyImgcmp(139, '').error).toMatch(/exited 139/);
    });

    it('gives a shot the most important class of its tiles', () => {
        expect(lib.shotClass(['same', 'same'])).toBe('same');
        expect(lib.shotClass(['same', 'added'])).toBe('added');
        expect(lib.shotClass(['same', 'removed'])).toBe('removed');
        expect(lib.shotClass(['changed', 'added'])).toBe('changed');
        expect(lib.shotClass(['changed', 'error'])).toBe('error');
    });
});

describe('summary', () => {
    const shot = (id: string, cls: string, tiles: object[]) => ({
        id, page: '/', viewport: 'desktop', scheme: 'light', class: cls, tiles
    });

    it('says so when nothing changed', () => {
        const md = lib.renderSummary({strata: '0.7.0', threshold: 4, maxFraction: 0, tiles: 2, errors: [],
            shots: [shot('home.desktop.light', 'same', [{index: 0, class: 'same'}, {index: 1, class: 'same'}])]});
        expect(md).toMatch(/No visible change: all 1 shots match the base \(2 tiles/);
        expect(md).not.toMatch(/\| Shot \|/);
        expect(md).toMatch(/Strata 0\.7\.0/);
    });

    it('lists every shot that is not same, errors first', () => {
        const md = lib.renderSummary({strata: '0.7.0', threshold: 4, maxFraction: 0, tiles: 4, errors: ['`x`: head: HTTP 500'],
            shots: [
                shot('a.desktop.light', 'changed', [{index: 0, class: 'same'}, {index: 1, class: 'changed', fraction_over: 0.0123},
                    {index: 2, class: 'added'}]),
                shot('x.desktop.light', 'error', []),
                shot('z.desktop.light', 'same', [{index: 0, class: 'same'}])
            ]});
        expect(md).toMatch(/3 shots: 1 error, 1 changed, 1 same/);
        expect(md).toMatch(/\*\*error:\*\* `x`: head: HTTP 500/);
        const rows = md.split('\n').filter((l: string) => l.startsWith('| `'));
        expect(rows).toHaveLength(2);
        expect(rows[0]).toMatch(/x\.desktop\.light/);
        expect(rows[1]).toMatch(/changed 1; added 2 \| 1\.23 % \|$/);
    });

    it('formats fractions', () => {
        expect(lib.fmtPct(0)).toBe('0 %');
        expect(lib.fmtPct(0.00001)).toBe('< 0.01 %');
        expect(lib.fmtPct(0.5)).toBe('50.00 %');
    });
});

describe('strata.lock.json', () => {
    it('pins the v0.7.0 Linux tarball by SHA-256', () => {
        expect(lock.version).toBe('0.7.0');
        expect(lock.url).toBe(`https://github.com/Preponderous-Software/strata/releases/download/v${lock.version}/${lock.asset}`);
        expect(lock.sha256).toMatch(/^[0-9a-f]{64}$/);
    });
});
