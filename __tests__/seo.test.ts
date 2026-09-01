import {afterEach, describe, expect, it, vi} from 'vitest';

import {absoluteUrl, canonicalPath, siteBaseUrl, socialImageUrl} from '../src/utils/seo.js';

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
});

describe('absoluteUrl', () => {
    it('joins the origin and the path without doubling the slash', () => {
        expect(absoluteUrl('https://example.test/', '/news')).toBe('https://example.test/news');
        expect(absoluteUrl('https://example.test', '/')).toBe('https://example.test/');
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
});
