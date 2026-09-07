export type ColorMode = 'light' | 'dark';

// Default localStorage key under which the visitor's explicit colour-mode choice
// is saved, so the selection survives navigation (full page loads) and return
// visits. Keyed per site rather than a bare "color-mode": two sites served from
// the same origin (a staging host, a path-mounted app) would otherwise fight
// over one value. Override it via `storageKey` on the provider.
export const DEFAULT_COLOR_MODE_STORAGE_KEY = 'community-site-color-mode';

const isColorMode = (value: string | null): value is ColorMode =>
    value === 'light' || value === 'dark';

// Decide the colour mode to start in: honour a previously-saved explicit choice,
// otherwise fall back to the operating system's prefers-color-scheme setting.
// Kept pure (no window access) so it can be unit-tested and reused on both the
// initial client render and the toggle path.
export const resolveInitialColorMode = (
    stored: string | null,
    prefersDark: boolean
): ColorMode => {
    if (isColorMode(stored)) {
        return stored;
    }
    return prefersDark ? 'dark' : 'light';
};

// Attribute stamped onto <html> to describe the mode the document is painted
// in. Fixed rather than configurable: a plain CSS file selecting on it
// (`html[data-color-mode="dark"] { ... }`) has to agree with what the bootstrap
// script writes, and a name that can differ per call is a name that can
// disagree.
export const COLOR_MODE_ATTRIBUTE = 'data-color-mode';

// Read the saved colour-mode choice, or null when there is none.
//
// Reaching localStorage is not guaranteed to work: a browser configured to
// block site data for the origin throws a SecurityError from the
// `window.localStorage` property access itself, before getItem is called, and
// during server rendering `window` does not exist at all. Both are reported as
// "nothing saved", so `resolveInitialColorMode` falls through to the operating
// system preference.
export const readStoredColorMode = (
    storageKey: string = DEFAULT_COLOR_MODE_STORAGE_KEY
): string | null => {
    if (typeof window === 'undefined') {
        return null;
    }
    try {
        return window.localStorage.getItem(storageKey);
    } catch {
        return null;
    }
};

// Persist an explicit colour-mode choice. Best-effort by design: the write
// throws when storage is blocked (as above) or full (QuotaExceededError), and a
// visitor who cannot have the choice remembered should still be able to switch
// modes for the current session. Letting it throw would take down the page —
// the call sits inside a React state updater, with no error boundary above it.
export const storeColorMode = (
    mode: ColorMode,
    storageKey: string = DEFAULT_COLOR_MODE_STORAGE_KEY
): void => {
    if (typeof window === 'undefined') {
        return;
    }
    try {
        window.localStorage.setItem(storageKey, mode);
    } catch {
        // Deliberately ignored: persistence is a nice-to-have, switching is not.
    }
};

// Stamp the mode now in effect onto <html>, exactly as the bootstrap script
// below does before first paint. That script runs once per document load, so
// without this a site's own [data-color-mode] rules — and the `color-scheme`
// the browser paints scrollbars, form controls and the overscroll area with —
// would keep describing the mode the page booted in once the visitor toggles.
// A no-op where there is no document, so it is safe to call from shared code.
export const applyColorModeToDocument = (mode: ColorMode): void => {
    if (typeof document === 'undefined') {
        return;
    }
    document.documentElement.setAttribute(COLOR_MODE_ATTRIBUTE, mode);
    document.documentElement.style.colorScheme = mode;
};

export interface ColorModeBootstrapScriptOptions {
    // localStorage key the explicit choice is saved under. Must match the
    // `storageKey` given to `ColorModeProvider`.
    storageKey?: string;
    // Mode to settle on when neither a saved choice nor a usable media query is
    // available. Must match the provider's `defaultMode`, which is the mode the
    // server rendered in.
    defaultMode?: ColorMode;
}

// Build a blocking inline script to render into <head>, which runs before the
// browser parses and paints <body> — before any bundle, and so before
// `resolveInitialColorMode` and `readStoredColorMode` have loaded. It
// duplicates their "stored choice, else prefers-color-scheme" logic in plain JS
// and stamps the answer onto <html>, so a site's own CSS can paint the right
// background on the very first paint. The provider's effect then resolves to
// the same value, making its correction visually a no-op.
//
// The two lookups are guarded separately so that one failing does not discard
// the other's answer: a browser that blocks site data throws on the storage
// read, and that visitor's prefers-color-scheme is still the best available
// signal — the same fallback `resolveInitialColorMode` makes when
// `readStoredColorMode` reports "nothing saved". Only when the media query is
// unavailable too does the script settle on `defaultMode`.
export const colorModeBootstrapScript = ({
    storageKey = DEFAULT_COLOR_MODE_STORAGE_KEY,
    defaultMode = 'dark'
}: ColorModeBootstrapScriptOptions = {}): string =>
    `(function(){var m=${JSON.stringify(defaultMode)};` +
    `try{var p=window.matchMedia?window.matchMedia('(prefers-color-scheme: dark)').matches:${JSON.stringify(
        defaultMode === 'dark'
    )};m=p?'dark':'light';}catch(e){}` +
    `try{var s=window.localStorage.getItem(${JSON.stringify(storageKey)});` +
    `if(s==='light'||s==='dark'){m=s;}}catch(e){}` +
    `document.documentElement.setAttribute(${JSON.stringify(COLOR_MODE_ATTRIBUTE)},m);` +
    `document.documentElement.style.colorScheme=m;})();`;

// The bootstrap script for the default storage key and a dark server render.
// `colorModeBootstrapScript` above is the same thing with the knobs exposed.
export const COLOR_MODE_BOOTSTRAP_SCRIPT = colorModeBootstrapScript();
