import {readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';

import {interopDefault} from '../src/utils/interopDefault.js';

describe('interopDefault', () => {
    it('unwraps the __esModule wrapper a strict-ESM default import of CommonJS yields', () => {
        const Icon = {$$typeof: Symbol.for('react.memo')};
        const wrapper = Object.defineProperty({default: Icon}, '__esModule', {value: true});
        expect(interopDefault(wrapper)).toBe(Icon);
    });

    it('passes through a value that is already the component', () => {
        const Icon = {$$typeof: Symbol.for('react.memo')};
        const fn = () => null;
        expect(interopDefault(Icon)).toBe(Icon);
        expect(interopDefault(fn)).toBe(fn);
    });

    it('does not unwrap an object that merely has a default key', () => {
        const value = {default: 1};
        expect(interopDefault(value)).toBe(value);
    });
});

// A consumer's `next build` (not `next dev`, and not this test suite) failed at
// prerender with React #130 until these two import shapes were removed from the
// components. Only a real Next build proves the fix; this guards the shapes.
describe('component import shapes (#11)', () => {
    const dir = join(__dirname, '..', 'src', 'components');
    const sources = readdirSync(dir)
        .filter((name) => name.endsWith('.tsx'))
        .map((name) => ({name, source: readFileSync(join(dir, name), 'utf8')}));

    it('imports @mui/material as a namespace, never by name', () => {
        for (const {name, source} of sources) {
            expect(source, name).not.toMatch(/import\s*\{[^}]*\}\s*from\s*'@mui\/material'/);
        }
    });

    it('passes every @mui/icons-material default import through interopDefault', () => {
        for (const {name, source} of sources) {
            const icons = [...source.matchAll(/import\s+(\w+)\s+from\s+'@mui\/icons-material\/[^']+'/g)];
            for (const [, binding] of icons) {
                expect(source, `${name}: ${binding}`).toContain(`interopDefault(${binding})`);
            }
        }
    });
});
