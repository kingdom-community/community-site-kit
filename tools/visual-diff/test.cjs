#!/usr/bin/env node
'use strict';
// End-to-end self-test: serves the fixture site as base and as several heads,
// shoots both with Playwright and compares them with the pinned strata-imgcmp.
// Run by the kit's `visual-diff` CI job. Needs playwright on NODE_PATH with its
// Chromium installed; downloads the Strata release unless STRATA_IMGCMP is set.
//
//   NODE_PATH=/path/to/node_modules node tools/visual-diff/test.cjs

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const here = __dirname;
const config = path.join(here, 'fixture', 'visual-diff.json');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'visual-diff-test-'));
let nextPort = 3301;
const servers = [];

function node(script, args, opts = {}) {
    const r = spawnSync(process.execPath, [path.join(here, script), ...args], {encoding: 'utf8', ...opts});
    if (opts.echo !== false) process.stdout.write(r.stdout + r.stderr);
    return r;
}

// A copy of the fixture site with `edit(dir)` applied, built and served.
function side(name, edit) {
    const dir = path.join(work, name);
    fs.cpSync(path.join(here, 'fixture', 'site'), dir, {recursive: true});
    if (edit) edit(dir);
    assert.equal(node('side.cjs', ['build', '--config', config, '--dir', dir]).status, 0, `${name}: build`);
    const port = String(nextPort++);
    assert.equal(node('side.cjs', ['serve', '--config', config, '--dir', dir, '--port', port]).status, 0,
        `${name}: serve`);
    servers.push(dir);
    const shots = path.join(work, `shots-${name}`);
    const r = node('shoot.cjs', ['--config', config, '--url', `http://127.0.0.1:${port}`, '--out', shots]);
    assert.equal(r.status, 0, `${name}: shoot`);
    return {dir, port, shots};
}

function compare(name, base, head, extra = []) {
    const out = path.join(work, `report-${name}`);
    const strata = process.env.STRATA_IMGCMP ? ['--strata-bin', process.env.STRATA_IMGCMP] : [];
    const r = node('compare.cjs', ['--config', config, '--base', base.shots, '--head', head.shots, '--out', out,
        ...strata, ...extra], {env: {...process.env, GITHUB_STEP_SUMMARY: ''}});
    const report = JSON.parse(fs.readFileSync(path.join(out, 'report.json'), 'utf8'));
    return {status: r.status, report, out};
}

function classes(report) {
    return Object.fromEntries(report.shots.map((s) => [s.id, s.class]));
}

function edit(file, from, to) {
    const s = fs.readFileSync(file, 'utf8');
    assert.ok(s.includes(from), `${file} contains ${from}`);
    fs.writeFileSync(file, s.replace(from, to));
}

const results = [];
function check(name, fn) {
    fn();
    results.push(name);
    process.stdout.write(`\nPASS ${name}\n\n`);
}

try {
    const base = side('base');
    const manifest = JSON.parse(fs.readFileSync(path.join(base.shots, 'manifest.json'), 'utf8'));

    check('every planned shot was taken, off-origin requests were blocked', () => {
        assert.equal(manifest.shots.length, 8);
        assert.ok(manifest.shots.every((s) => s.status === 'ok'), JSON.stringify(manifest.shots));
        assert.ok(manifest.blockedOrigins.includes('https://fonts.googleapis.com'), manifest.blockedOrigins.join());
        // 600-px desktop tiles: the tall page needs more than one.
        assert.ok(manifest.shots.find((s) => s.id === 'tall.desktop.light').tiles > 1);
    });

    check('an unchanged head reports no change (same runner, fresh browser)', () => {
        const head = side('same');
        const r = compare('same', base, head);
        assert.equal(r.status, 0);
        assert.deepEqual(r.report.errors, []);
        assert.ok(r.report.shots.every((s) => s.class === 'same'), JSON.stringify(classes(r.report)));
        assert.ok(!fs.existsSync(path.join(r.out, 'images')));
        assert.match(fs.readFileSync(path.join(r.out, 'summary.md'), 'utf8'), /No visible change: all 8 shots/);
    });

    let headingHead;
    check('a heading colour change is reported on every shot, and stays advisory (exit 0)', () => {
        headingHead = side('heading', (dir) => edit(path.join(dir, 'style.css'),
            'h1 { color: var(--accent);', 'h1 { color: #c0392b;'));
        const r = compare('heading', base, headingHead);
        assert.equal(r.status, 0);
        assert.ok(r.report.shots.every((s) => s.class === 'changed'), JSON.stringify(classes(r.report)));
        const tile0 = r.report.shots[0].tiles[0];
        assert.ok(tile0.pixels_over > 0 && tile0.max_delta_e > 4, JSON.stringify(tile0));
        for (const kind of ['base', 'head', 'diff']) {
            assert.ok(fs.existsSync(path.join(r.out, 'images', kind, 'home.desktop.light.0.png')), kind);
        }
        assert.equal(fs.readFileSync(path.join(r.out, 'retake.txt'), 'utf8').trim().split(',').length, 8);
    });

    check('a change that vanishes on the retake is marked flaky', () => {
        const r = compare('flaky', base, headingHead, ['--retake-base', base.shots, '--retake-head', base.shots]);
        assert.equal(r.status, 0);
        assert.ok(r.report.shots.every((s) => s.class === 'flaky'), JSON.stringify(classes(r.report)));
    });

    check('a page that grows changes only the tiles from the change down', () => {
        const head = side('grown', (dir) => edit(path.join(dir, 'tall.html'),
            '<footer id="footer">', '<div class="row"></div><div class="row"></div><div class="row"></div>' +
            '<div class="row"></div><div class="row"></div><footer id="footer">'));
        const r = compare('grown', base, head);
        assert.equal(r.status, 0);
        const c = classes(r.report);
        assert.equal(c['home.desktop.light'], 'same');
        const tall = r.report.shots.find((s) => s.id === 'tall.desktop.light');
        assert.equal(tall.class, 'changed');
        assert.equal(tall.tiles[0].class, 'same', JSON.stringify(tall.tiles));
        assert.equal(tall.tiles[tall.tiles.length - 1].class, 'added', JSON.stringify(tall.tiles));
    });

    check('a page that fails to load on the head is an error (exit 1)', () => {
        const head = side('broken', (dir) => fs.rmSync(path.join(dir, 'tall.html')));
        const r = compare('broken', base, head);
        assert.equal(r.status, 1);
        assert.equal(classes(r.report)['tall.desktop.light'], 'error');
        assert.equal(classes(r.report)['home.desktop.light'], 'same');
        assert.match(r.report.errors.join('\n'), /HTTP 404/);
    });

    check('a failed base build still reports the head shots, as an error', () => {
        const out = path.join(work, 'report-nobase');
        const strata = process.env.STRATA_IMGCMP ? ['--strata-bin', process.env.STRATA_IMGCMP] : [];
        const r = node('compare.cjs', ['--config', config, '--base-error', 'base build failed',
            '--head', base.shots, '--out', out, ...strata], {env: {...process.env, GITHUB_STEP_SUMMARY: ''}});
        assert.equal(r.status, 1);
        const report = JSON.parse(fs.readFileSync(path.join(out, 'report.json'), 'utf8'));
        assert.deepEqual(report.errors, ['base build failed']);
        assert.ok(report.shots.every((s) => s.class === 'added'));
        assert.ok(fs.existsSync(path.join(out, 'images', 'head', 'home.phone.dark.0.png')));
    });
} finally {
    for (const dir of servers) node('side.cjs', ['stop', '--dir', dir], {echo: false});
    if (!process.env.VISUAL_DIFF_KEEP) fs.rmSync(work, {recursive: true, force: true});
    else process.stdout.write(`kept ${work}\n`);
}
process.stdout.write(`${results.length} self-test checks passed\n`);
