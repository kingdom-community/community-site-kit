import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {
    COLOR_MODE_ATTRIBUTE,
    COLOR_MODE_BOOTSTRAP_SCRIPT,
    DEFAULT_COLOR_MODE_STORAGE_KEY,
    applyColorModeToDocument,
    colorModeBootstrapScript,
    readStoredColorMode,
    resolveInitialColorMode,
    storeColorMode
} from '../src/utils/colorMode.js';

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

// A storage that refuses every operation, standing in for a browser configured
// to block site data — which throws from the `window.localStorage` property
// access itself, not from getItem.
const blockedStorage = () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
        throw new Error('site data is blocked for this origin');
    });
};

const stubMatchMedia = (prefersDark: boolean) => {
    vi.stubGlobal('matchMedia', (query: string) => ({
        matches: prefersDark && query.includes('dark'),
        media: query
    }));
};

beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute(COLOR_MODE_ATTRIBUTE);
    document.documentElement.style.colorScheme = '';
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('readStoredColorMode', () => {
    it('reads the default key, and a caller-chosen one', () => {
        window.localStorage.setItem(DEFAULT_COLOR_MODE_STORAGE_KEY, 'light');
        window.localStorage.setItem('ember-hollow-mode', 'dark');

        expect(readStoredColorMode()).toBe('light');
        expect(readStoredColorMode('ember-hollow-mode')).toBe('dark');
    });

    it('reports nothing saved when there is nothing saved', () => {
        expect(readStoredColorMode()).toBeNull();
    });

    // The point of the guard: an unreadable store is "nothing saved", so the
    // caller falls through to the operating system preference rather than the
    // page failing to render.
    it('reports nothing saved rather than throwing when storage is blocked', () => {
        blockedStorage();
        expect(() => readStoredColorMode()).not.toThrow();
        expect(readStoredColorMode()).toBeNull();
    });
});

describe('storeColorMode', () => {
    it('writes to the default key, and to a caller-chosen one', () => {
        storeColorMode('light');
        storeColorMode('dark', 'ember-hollow-mode');

        expect(window.localStorage.getItem(DEFAULT_COLOR_MODE_STORAGE_KEY)).toBe('light');
        expect(window.localStorage.getItem('ember-hollow-mode')).toBe('dark');
    });

    // Persistence is a nice-to-have; switching modes is not. The call sits in a
    // React state updater with no error boundary above it, so a throw here would
    // take down the page.
    it('swallows a refused write', () => {
        blockedStorage();
        expect(() => storeColorMode('dark')).not.toThrow();
    });
});

describe('applyColorModeToDocument', () => {
    it('stamps the mode and the colour scheme onto the document element', () => {
        applyColorModeToDocument('dark');
        expect(document.documentElement.getAttribute(COLOR_MODE_ATTRIBUTE)).toBe('dark');
        expect(document.documentElement.style.colorScheme).toBe('dark');

        applyColorModeToDocument('light');
        expect(document.documentElement.getAttribute(COLOR_MODE_ATTRIBUTE)).toBe('light');
        expect(document.documentElement.style.colorScheme).toBe('light');
    });
});

// The script is plain JS text meant to run in <head> before any bundle loads,
// so it is exercised by running it — asserting on the substrings it is built
// from would pass for a script that throws.
describe('colorModeBootstrapScript', () => {
    const runBootstrap = (script: string) => {
        new Function(script)();
        return document.documentElement.getAttribute(COLOR_MODE_ATTRIBUTE);
    };

    it('honours a saved explicit choice over the system preference', () => {
        window.localStorage.setItem(DEFAULT_COLOR_MODE_STORAGE_KEY, 'light');
        stubMatchMedia(true);

        expect(runBootstrap(COLOR_MODE_BOOTSTRAP_SCRIPT)).toBe('light');
        expect(document.documentElement.style.colorScheme).toBe('light');
    });

    it('falls back to the system preference when nothing has been chosen', () => {
        stubMatchMedia(true);
        expect(runBootstrap(COLOR_MODE_BOOTSTRAP_SCRIPT)).toBe('dark');
    });

    it('ignores a stored value that is not a colour mode', () => {
        window.localStorage.setItem(DEFAULT_COLOR_MODE_STORAGE_KEY, 'purple');
        stubMatchMedia(false);
        expect(runBootstrap(COLOR_MODE_BOOTSTRAP_SCRIPT)).toBe('light');
    });

    // The two lookups are guarded separately on purpose: a visitor whose browser
    // blocks site data still has a prefers-color-scheme worth honouring, and a
    // single try/catch around both would discard it and leave every such visitor
    // on the default mode.
    it('still honours the system preference when storage is blocked', () => {
        blockedStorage();
        stubMatchMedia(false);
        expect(runBootstrap(COLOR_MODE_BOOTSTRAP_SCRIPT)).toBe('light');
    });

    it('settles on the default mode only when neither signal is available', () => {
        blockedStorage();
        vi.stubGlobal('matchMedia', undefined);

        expect(runBootstrap(COLOR_MODE_BOOTSTRAP_SCRIPT)).toBe('dark');
        expect(runBootstrap(colorModeBootstrapScript({defaultMode: 'light'}))).toBe('light');
    });

    it('reads the caller-chosen storage key, and only that one', () => {
        window.localStorage.setItem('ember-hollow-mode', 'light');
        window.localStorage.setItem(DEFAULT_COLOR_MODE_STORAGE_KEY, 'dark');
        stubMatchMedia(true);

        expect(runBootstrap(colorModeBootstrapScript({storageKey: 'ember-hollow-mode'}))).toBe('light');
    });

    // A key or default mode carrying a quote would otherwise end the string
    // literal it is pasted into and produce a script that throws at parse time.
    it('escapes the values it interpolates', () => {
        stubMatchMedia(false);
        const script = colorModeBootstrapScript({storageKey: "it's \"quoted\""});
        window.localStorage.setItem('it\'s "quoted"', 'dark');

        expect(runBootstrap(script)).toBe('dark');
    });
});
