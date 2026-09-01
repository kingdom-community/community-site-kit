// Helpers for the URLs a page advertises to search engines and link scrapers —
// the canonical URL (`<link rel="canonical">` and `og:url`) and the social
// preview image (`og:image`). Kept pure and separate from the Seo component so
// the URL-normalisation rules can be unit-tested.

// Normalise a route into the single path a page should claim as canonical:
// query string and fragment removed (so `?utm_source=discord` is not a separate
// resource), a leading slash guaranteed, and any trailing slash dropped except
// on the root. Returns null when there is no honest canonical path to emit —
// an empty route, or one still containing an unresolved dynamic segment such as
// `/guides/[id]`, which Next.js reports before the concrete value is known.
export const canonicalPath = (path: string): string | null => {
    const withoutFragment = path.split('#')[0] ?? '';
    const withoutQuery = withoutFragment.split('?')[0] ?? '';
    if (withoutQuery === '' || withoutQuery.includes('[')) {
        return null;
    }
    const withLeadingSlash = withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;
    const withoutTrailingSlash = withLeadingSlash.replace(/\/+$/, '');
    return withoutTrailingSlash === '' ? '/' : withoutTrailingSlash;
};

// Fallback origin when no base URL is configured, so the site builds and boots
// with no environment at all.
export const DEFAULT_BASE_URL = 'http://localhost:3000';

// The site's own public origin. Every absolute URL the site advertises — the
// canonical URL, og:url, og:image, and the crawler documents built in
// `sitemap.ts` — is built from this. Read through a function rather than a
// constant so each caller decides when to read it: a component created once at
// module scope reads it once (the canonical origin never varies within a running
// build, and Next.js inlines NEXT_PUBLIC_* at build time), while the sitemap and
// robots.txt routes read it per request.
//
// `NEXT_PUBLIC_BASE_URL` is the default name because Next.js only exposes
// `NEXT_PUBLIC_*` to browser code; pass `envVar` if your site uses another name.
export const siteBaseUrl = (envVar = 'NEXT_PUBLIC_BASE_URL'): string =>
    process.env[envVar] || DEFAULT_BASE_URL;

// Join the site's own origin to a canonical path. `baseUrl` may or may not carry
// a trailing slash; `path` is the output of `canonicalPath`.
export const absoluteUrl = (baseUrl: string, path: string): string => {
    const origin = baseUrl.replace(/\/+$/, '');
    return path === '/' ? `${origin}/` : `${origin}${path}`;
};

// Resolve the social preview image (`og:image`) to the absolute URL scrapers
// require — Discord, Twitter/X and friends will not follow a site-relative path.
// Accepts either a path under `public/` ("/social-card.png", the usual case,
// resolved against the base URL) or an already-absolute URL, which is passed
// through so a page can point at an externally hosted image. Returns null when
// there is no image to advertise, so the caller omits the tag rather than
// emitting an empty one.
export const socialImageUrl = (baseUrl: string, image: string | null | undefined): string | null => {
    if (!image) {
        return null;
    }
    const trimmed = image.trim();
    if (trimmed === '') {
        return null;
    }
    if (/^https?:\/\//i.test(trimmed)) {
        return trimmed;
    }
    return absoluteUrl(baseUrl, trimmed.startsWith('/') ? trimmed : `/${trimmed}`);
};
