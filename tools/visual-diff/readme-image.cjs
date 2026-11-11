#!/usr/bin/env node
'use strict';
// Draws the README's example of a changed tile: base, head and diff side by side,
// taken from the self-test's heading-change report. A docs tool; CI never runs it.
//
//   VISUAL_DIFF_KEEP=1 NODE_PATH=/path/to/node_modules node tools/visual-diff/test.cjs
//   node tools/visual-diff/readme-image.cjs /tmp/visual-diff-test-XXXXXX docs/images/visual-diff-example.png
//
// The first argument is the directory test.cjs prints as "kept". Node standard library only.

const fs = require('node:fs');
const path = require('node:path');
const {decodePng, encodePng} = require('./lib.cjs');

const TILE = 'home.desktop.light.0.png';
// The heading, the text and the box; the rest of the 800x600 tile is empty page.
const ROWS = 270;
const COLS = 650;
const GAP = 12;
const GAP_RGBA = [128, 128, 128, 255];

function main() {
    const [kept, out] = process.argv.slice(2);
    if (!kept || !out) {
        process.stderr.write('usage: readme-image.cjs <kept self-test dir> <out.png>\n');
        process.exit(2);
    }
    const images = path.join(kept, 'report-heading', 'images');
    const panels = ['base', 'head', 'diff'].map((side) => decodePng(fs.readFileSync(path.join(images, side, TILE))));
    const rows = Math.min(ROWS, ...panels.map((p) => p.height));
    const cols = Math.min(COLS, ...panels.map((p) => p.width));
    const width = cols * panels.length + GAP * (panels.length - 1);
    const data = Buffer.alloc(width * rows * 4);
    for (let i = 0; i < data.length; i += 4) GAP_RGBA.forEach((v, k) => { data[i + k] = v; });
    let x0 = 0;
    for (const p of panels) {
        for (let y = 0; y < rows; y++) {
            p.data.copy(data, (y * width + x0) * 4, y * p.width * 4, (y * p.width + cols) * 4);
        }
        x0 += cols + GAP;
    }
    fs.mkdirSync(path.dirname(out), {recursive: true});
    fs.writeFileSync(out, encodePng({width, height: rows, data}));
    process.stdout.write(`wrote ${out} (${width}x${rows})\n`);
}

main();
