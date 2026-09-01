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
