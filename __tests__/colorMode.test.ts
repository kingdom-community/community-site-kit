import {describe, expect, it} from 'vitest';

import {DEFAULT_COLOR_MODE_STORAGE_KEY, resolveInitialColorMode} from '../src/utils/colorMode.js';

// The "the choice survives a reload" half of a colour mode: an explicit choice
// is read back out of storage and beats the operating system's preference.
describe('resolveInitialColorMode', () => {
    it('honours a saved explicit choice over the system preference', () => {
        expect(resolveInitialColorMode('light', true)).toBe('light');
        expect(resolveInitialColorMode('dark', false)).toBe('dark');
    });

    it('falls back to the system preference when nothing has been chosen', () => {
        expect(resolveInitialColorMode(null, true)).toBe('dark');
        expect(resolveInitialColorMode(null, false)).toBe('light');
    });

    it('ignores a stored value that is not a colour mode', () => {
        expect(resolveInitialColorMode('purple', false)).toBe('light');
        expect(resolveInitialColorMode('', true)).toBe('dark');
    });

    it('keys storage per site, so it cannot collide with another site on the same origin', () => {
        expect(DEFAULT_COLOR_MODE_STORAGE_KEY).toBe('community-site-color-mode');
    });
});
