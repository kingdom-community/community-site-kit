import {afterEach, describe, expect, it, vi} from 'vitest';

import {DEFAULT_BASE_URL, absoluteUrl, canonicalPath, siteBaseUrl, socialImageUrl} from '../src/utils/seo.js';

afterEach(() => {
    vi.unstubAllEnvs();
});

describe('canonicalPath', () => {
    it.each([
        ['/', '/'],
        ['/?utm_source=discord', '/'],
        ['/news#latest', '/news'],
        ['news', '/news'],
        ['/news/', '/news']
    ])('normalises %s to %s', (input, expected) => {
        expect(canonicalPath(input)).toBe(expected);
    });

    it('emits nothing for a route whose dynamic segment is still unresolved', () => {
        expect(canonicalPath('/guides/[id]')).toBeNull();
        expect(canonicalPath('')).toBeNull();
    });

    // A route made only of a query string or a fragment has no path left once
    // they are removed, so it gets no canonical URL rather than a guessed one.
    it('emits nothing for a route that is only a query string or a fragment', () => {
        expect(canonicalPath('?utm_source=discord')).toBeNull();
        expect(canonicalPath('#latest')).toBeNull();
    });

    it('drops a query string and a fragment together, and every trailing slash', () => {
        expect(canonicalPath('/news?page=2#top')).toBe('/news');
        expect(canonicalPath('/news//')).toBe('/news');
        expect(canonicalPath('///')).toBe('/');
    });
});

describe('absoluteUrl', () => {
    it('joins the origin and the path without doubling the slash', () => {
        expect(absoluteUrl('https://example.test/', '/news')).toBe('https://example.test/news');
        expect(absoluteUrl('https://example.test', '/')).toBe('https://example.test/');
    });

    it('strips every trailing slash from the origin, not just one', () => {
        expect(absoluteUrl('https://example.test///', '/news')).toBe('https://example.test/news');
        expect(absoluteUrl('https://example.test///', '/')).toBe('https://example.test/');
    });
});

describe('socialImageUrl', () => {
    it('is null when there is no image, so the tag is omitted rather than emitted empty', () => {
        expect(socialImageUrl('https://example.test', null)).toBeNull();
        expect(socialImageUrl('https://example.test', undefined)).toBeNull();
        expect(socialImageUrl('https://example.test', '  ')).toBeNull();
    });

    it('passes an already-absolute URL through and resolves a public/ path', () => {
        expect(socialImageUrl('https://example.test', 'https://cdn.test/x.png')).toBe('https://cdn.test/x.png');
        expect(socialImageUrl('https://example.test', 'card.png')).toBe('https://example.test/card.png');
        expect(socialImageUrl('https://example.test', '/card.png')).toBe('https://example.test/card.png');
    });

    // Copied from a config file or an environment variable, an image path often
    // arrives padded or with an upper-case scheme; neither should break the card.
    it('trims the image and recognises an absolute URL whatever its scheme case', () => {
        expect(socialImageUrl('https://example.test', '  /card.png  ')).toBe('https://example.test/card.png');
        expect(socialImageUrl('https://example.test', ' https://cdn.test/x.png ')).toBe('https://cdn.test/x.png');
        expect(socialImageUrl('https://example.test', 'HTTPS://cdn.test/x.png')).toBe('HTTPS://cdn.test/x.png');
        expect(socialImageUrl('https://example.test', 'http://cdn.test/x.png')).toBe('http://cdn.test/x.png');
    });
});

describe('siteBaseUrl', () => {
    it('falls back to localhost so the site builds and boots with no environment at all', () => {
        vi.stubEnv('NEXT_PUBLIC_BASE_URL', '');
        expect(siteBaseUrl()).toBe('http://localhost:3000');
    });

    it('reads the configured origin, under a caller-chosen variable name', () => {
        vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://example.test');
        expect(siteBaseUrl()).toBe('https://example.test');
        vi.stubEnv('SITE_ORIGIN', 'https://other.test');
        expect(siteBaseUrl('SITE_ORIGIN')).toBe('https://other.test');
    });

    // The README's Configuration table documents this default, and a variable
    // name the caller chose falls back to it exactly as the default name does.
    it('falls back to the exported DEFAULT_BASE_URL, for a caller-chosen variable too', () => {
        expect(DEFAULT_BASE_URL).toBe('http://localhost:3000');
        vi.stubEnv('NEXT_PUBLIC_BASE_URL', '');
        expect(siteBaseUrl()).toBe(DEFAULT_BASE_URL);
        vi.stubEnv('SITE_ORIGIN', '');
        expect(siteBaseUrl('SITE_ORIGIN')).toBe(DEFAULT_BASE_URL);
    });

    // Next.js copies NEXT_PUBLIC_* into browser bundles by textual replacement of
    // a literal member expression, and leaves `process.env[name]` alone. At run
    // time in Node the two are indistinguishable, so the contract is asserted on
    // the function's source: lose the literal and the browser silently gets the
    // localhost fallback (#47).
    it('reads the default variable as a literal access a bundler can inline', () => {
        expect(siteBaseUrl.toString()).toContain('process.env.NEXT_PUBLIC_BASE_URL');
    });
});
