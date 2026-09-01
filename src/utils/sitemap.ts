// Builders for the two crawler documents a site serves: `/sitemap.xml` (the list
// of pages worth indexing) and `/robots.txt` (which routes a crawler may visit,
// plus a pointer at the sitemap). Kept pure and separate from the routes in
// `pages/` — the same split as `seo.ts` and the `Seo` component — so the path
// list and the generated text can be unit-tested without a request.
//
// Nothing here reads the filesystem or the network. A sitemap route hands this
// module the paths it already knows about; that keeps the module testable and,
// more importantly, keeps the decision about which URLs are safe to advertise
// where it belongs — with the caller that knows which of them actually resolve.

import {absoluteUrl} from './seo.js';

// The route the sitemap is served from, referenced by both the sitemap route
// itself and the `Sitemap:` line in robots.txt.
export const SITEMAP_ROUTE = '/sitemap.xml';

// Asked-to-skip by default: `/api/` serves JSON rather than pages, so there is
// nothing there for a crawler to index. This is a request, not access control —
// nothing listed here is thereby private. Pass your own list to `robotsTxt` to
// add routes such as a signed-in-only account view, which answers a crawler with
// a redirect and so would advertise a URL that shows a visitor nothing.
export const DEFAULT_DISALLOWED_CRAWL_PATHS: readonly string[] = ['/api/'];

// A set of pages that share a route prefix and are enumerated at build or
// request time rather than written down: guides, resources, news posts, lore
// entries, whatever your site has. `ids` are the concrete last path segments.
//
// Two rules apply to whatever you put in `ids`, and both belong to the caller
// because only the caller can honour them:
//
//   * list only ids whose page a stranger can actually load. A draft or an
//     unpublished document 404s for the public, and advertising its URL both
//     misleads a crawler and confirms that the unannounced thing exists; and
//   * with the source of those ids unreachable, list NONE of them. A sitemap
//     that silently loses one collection for a single crawl is better than one
//     that invents URLs — and the collection's index page, listed among the
//     static paths, still gives the crawler a way in.
export interface SitemapCollection {
    // Route prefix, with or without surrounding slashes: "guides", "/news".
    prefix: string;
    ids: readonly string[];
}

// Map a collection's ids onto their routes. Each id is percent-encoded as a
// single path segment: most ids are plain slugs, but frameworks hand route
// params back decoded, so encoding here is what keeps the advertised URL and the
// route in agreement whatever an id contains.
export const collectionPaths = (prefix: string, ids: readonly string[]): string[] => {
    const trimmed = prefix.replace(/^\/+|\/+$/g, '');
    return ids.map((id) => `/${trimmed}/${encodeURIComponent(id)}`);
};

export interface SitemapPathsOptions {
    // The pages worth offering to a search engine that are known ahead of time.
    // Deliberately a written list rather than something derived from a `pages/`
    // directory — that directory also holds error pages, API routes, dynamic
    // templates and the crawler documents themselves, none of which belong in a
    // sitemap. Add a page here when you add the page.
    staticPaths: readonly string[];
    // Everything enumerated at request time. Empty, missing or unreachable
    // collections simply contribute nothing.
    collections?: readonly SitemapCollection[];
}

// The full path list: the static pages, then each collection in order.
// Duplicates are dropped, keeping first occurrence, so a page that is both
// written down and produced by a collection is advertised once.
export const sitemapPaths = ({staticPaths, collections = []}: SitemapPathsOptions): string[] => {
    const all = [
        ...staticPaths,
        ...collections.flatMap((collection) => collectionPaths(collection.prefix, collection.ids))
    ];
    return [...new Set(all)];
};

export type SitemapPathProblemReason =
    // Not a site-relative path, so `absoluteUrl` would produce nonsense.
    | 'not-site-relative'
    // Still a route template such as `/guides/[id]`, which has no single URL.
    | 'unresolved-dynamic-segment'
    // Offered to crawlers in the sitemap and refused to them in robots.txt.
    | 'disallowed-by-robots';

export interface SitemapPathProblem {
    path: string;
    reason: SitemapPathProblemReason;
}

// Audit a path list against the invariants a sitemap has to hold, so a site can
// assert them in its own test suite instead of discovering a contradiction in
// Search Console weeks later. Returns an empty array when the list is sound.
//
// The contradiction check is the one worth having: a sitemap that offers a route
// robots.txt asks crawlers to skip is not a preference expressed twice, it is
// two contradictory instructions, and which one wins is up to the crawler.
export const sitemapPathProblems = (
    paths: readonly string[],
    disallow: readonly string[] = DEFAULT_DISALLOWED_CRAWL_PATHS
): SitemapPathProblem[] => {
    const problems: SitemapPathProblem[] = [];
    for (const path of paths) {
        if (!path.startsWith('/')) {
            problems.push({path, reason: 'not-site-relative'});
            continue;
        }
        if (path.includes('[')) {
            problems.push({path, reason: 'unresolved-dynamic-segment'});
            continue;
        }
        if (disallow.some((disallowed) => path.startsWith(disallowed))) {
            problems.push({path, reason: 'disallowed-by-robots'});
        }
    }
    return problems;
};

// Escape the five characters XML reserves. Most paths are plain slugs, but one
// carrying a query string or an ampersand would otherwise emit invalid XML that
// a crawler rejects outright. The sitemap and robots.txt are the two sinks that
// a "we use React, so escaping is handled for us" argument misses: neither is
// rendered by React.
const escapeXml = (value: string): string =>
    value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');

// Render a sitemap for the given site-relative paths, absolute against
// `baseUrl` as the sitemap protocol requires. No `lastmod`, `changefreq` or
// `priority`: pages rendered from live data have no per-page modification date
// to report honestly, and Google ignores the latter two.
export const sitemapXml = (baseUrl: string, paths: readonly string[]): string => {
    const urls = paths.map(
        (path) => `    <url>\n        <loc>${escapeXml(absoluteUrl(baseUrl, path))}</loc>\n    </url>`
    );
    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ...urls,
        '</urlset>',
        ''
    ].join('\n');
};

export interface RobotsTxtOptions {
    disallow?: readonly string[];
    sitemapRoute?: string;
}

// Render robots.txt: everything is crawlable except the routes given, and the
// sitemap is advertised as the absolute URL the standard requires.
export const robotsTxt = (
    baseUrl: string,
    {disallow = DEFAULT_DISALLOWED_CRAWL_PATHS, sitemapRoute = SITEMAP_ROUTE}: RobotsTxtOptions = {}
): string =>
    [
        'User-agent: *',
        'Allow: /',
        ...disallow.map((path) => `Disallow: ${path}`),
        '',
        `Sitemap: ${absoluteUrl(baseUrl, sitemapRoute)}`,
        ''
    ].join('\n');
