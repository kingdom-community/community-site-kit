import {describe, expect, it} from 'vitest';

import {
    DEFAULT_DISALLOWED_CRAWL_PATHS,
    SITEMAP_ROUTE,
    collectionPaths,
    robotsTxt,
    sitemapPathProblems,
    sitemapPaths,
    sitemapXml
} from '../src/utils/sitemap.js';

const BASE_URL = 'https://emberhollow.example';

describe('sitemapXml', () => {
    it('renders a well-formed urlset with one absolute loc per path', () => {
        expect(sitemapXml(BASE_URL, ['/', '/about'])).toBe(
            '<?xml version="1.0" encoding="UTF-8"?>\n' +
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
            `    <url>\n        <loc>${BASE_URL}/</loc>\n    </url>\n` +
            `    <url>\n        <loc>${BASE_URL}/about</loc>\n    </url>\n` +
            '</urlset>\n'
        );
    });

    it('does not double up slashes when the base URL has a trailing slash', () => {
        expect(sitemapXml(`${BASE_URL}/`, ['/news'])).toContain(`<loc>${BASE_URL}/news</loc>`);
    });

    it('escapes the characters XML reserves', () => {
        const xml = sitemapXml(BASE_URL, ['/news?a=1&b=2']);
        expect(xml).toContain(`<loc>${BASE_URL}/news?a=1&amp;b=2</loc>`);
        expect(xml).not.toContain('a=1&b=2');
    });

    it('opens with the XML declaration a crawler expects', () => {
        expect(sitemapXml(BASE_URL, ['/'])).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    });

    it('still renders a valid empty urlset when given no paths', () => {
        expect(sitemapXml(BASE_URL, [])).toBe(
            '<?xml version="1.0" encoding="UTF-8"?>\n' +
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
            '</urlset>\n'
        );
    });
});

describe('collectionPaths', () => {
    it('maps ids onto their routes under the prefix', () => {
        expect(collectionPaths('guides', ['getting-started', 'rules']))
            .toEqual(['/guides/getting-started', '/guides/rules']);
    });

    it('accepts a prefix written with or without slashes', () => {
        expect(collectionPaths('/news/', ['wipe-day'])).toEqual(['/news/wipe-day']);
        expect(collectionPaths('news', ['wipe-day'])).toEqual(['/news/wipe-day']);
    });

    it('returns nothing when the collection is empty or unreachable', () => {
        expect(collectionPaths('guides', [])).toEqual([]);
    });

    it('percent-encodes an id so the advertised URL still resolves to the route', () => {
        expect(collectionPaths('guides', ['a b', 'a/b'])).toEqual(['/guides/a%20b', '/guides/a%2Fb']);
    });
});

describe('sitemapPaths', () => {
    const STATIC = ['/', '/news', '/guides', '/lore'];

    it('is the static list alone when there are no collections', () => {
        expect(sitemapPaths({staticPaths: STATIC})).toEqual(STATIC);
        expect(sitemapPaths({staticPaths: STATIC, collections: []})).toEqual(STATIC);
    });

    it('appends each collection in order after the static pages', () => {
        expect(
            sitemapPaths({
                staticPaths: STATIC,
                collections: [
                    {prefix: 'news', ids: ['wipe-day']},
                    {prefix: 'lore', ids: ['the-land', 'first-era']}
                ]
            })
        ).toEqual([...STATIC, '/news/wipe-day', '/lore/the-land', '/lore/first-era']);
    });

    // A collection whose source could not be reached contributes nothing, and
    // its index page — written down among the static paths — still gives the
    // crawler a way in.
    it('loses only the collection when its source is unreachable, never the index page', () => {
        const paths = sitemapPaths({staticPaths: STATIC, collections: [{prefix: 'news', ids: []}]});
        expect(paths).toContain('/news');
        expect(paths.filter((path) => path.startsWith('/news/'))).toEqual([]);
    });

    it('advertises a page once even when it is both written down and produced by a collection', () => {
        expect(
            sitemapPaths({
                staticPaths: ['/', '/guides/rules'],
                collections: [{prefix: 'guides', ids: ['rules', 'commands']}]
            })
        ).toEqual(['/', '/guides/rules', '/guides/commands']);
    });
});

describe('sitemapPathProblems', () => {
    it('finds nothing wrong with a sound path list', () => {
        expect(sitemapPathProblems(['/', '/news', '/guides/rules'])).toEqual([]);
    });

    it('rejects a path that is not site-relative', () => {
        expect(sitemapPathProblems(['https://elsewhere.test/page']))
            .toEqual([{path: 'https://elsewhere.test/page', reason: 'not-site-relative'}]);
    });

    it('rejects a dynamic route template, which has no single canonical URL', () => {
        expect(sitemapPathProblems(['/guides/[id]']))
            .toEqual([{path: '/guides/[id]', reason: 'unresolved-dynamic-segment'}]);
    });

    // Two contradictory instructions, not a preference expressed twice.
    it('catches a page offered in the sitemap and refused in robots.txt', () => {
        expect(sitemapPathProblems(['/', '/api/status', '/account'], ['/api/', '/account'])).toEqual([
            {path: '/api/status', reason: 'disallowed-by-robots'},
            {path: '/account', reason: 'disallowed-by-robots'}
        ]);
    });

    it('defaults to the same disallow list robotsTxt does', () => {
        expect(sitemapPathProblems(['/api/status'])).toEqual([
            {path: '/api/status', reason: 'disallowed-by-robots'}
        ]);
        expect(DEFAULT_DISALLOWED_CRAWL_PATHS).toEqual(['/api/']);
    });

    it('reports one problem per path, taking the first that applies', () => {
        expect(sitemapPathProblems(['api/[id]'])).toEqual([{path: 'api/[id]', reason: 'not-site-relative'}]);
    });
});

describe('robotsTxt', () => {
    it('allows crawling and points at the absolute sitemap URL', () => {
        expect(robotsTxt(BASE_URL)).toBe(
            'User-agent: *\n' +
            'Allow: /\n' +
            'Disallow: /api/\n' +
            '\n' +
            `Sitemap: ${BASE_URL}/sitemap.xml\n`
        );
    });

    it('disallows every route the caller lists', () => {
        const robots = robotsTxt(BASE_URL, {disallow: ['/api/', '/account', '/staff/']});
        for (const path of ['/api/', '/account', '/staff/']) {
            expect(robots).toContain(`Disallow: ${path}`);
        }
    });

    it('does not double up slashes when the base URL has a trailing slash', () => {
        expect(robotsTxt(`${BASE_URL}/`)).toContain(`Sitemap: ${BASE_URL}/sitemap.xml`);
    });

    it('works with the local development default', () => {
        expect(robotsTxt('http://localhost:3000')).toContain('Sitemap: http://localhost:3000/sitemap.xml');
    });

    it('advertises a sitemap served from a non-default route', () => {
        expect(robotsTxt(BASE_URL, {sitemapRoute: '/sitemap-index.xml'}))
            .toContain(`Sitemap: ${BASE_URL}/sitemap-index.xml`);
    });
});

describe('SITEMAP_ROUTE', () => {
    it('is the route a sitemap is conventionally served from', () => {
        expect(SITEMAP_ROUTE).toBe('/sitemap.xml');
    });
});
