import Head from 'next/head.js';
import {useRouter} from 'next/router.js';
import React from 'react';

import {absoluteUrl, canonicalPath, siteBaseUrl, socialImageUrl} from '../utils/seo.js';

export interface SeoDefaults {
    // The site's name. Appended to every page title, and emitted as
    // `og:site_name`.
    siteName: string;
    // Shown when a page supplies no description of its own: search results, and
    // the grey text under a shared link.
    description: string;
    // The site's own public origin, used to make every advertised URL absolute.
    // Defaults to `siteBaseUrl()`, i.e. `NEXT_PUBLIC_BASE_URL`. Read once, when
    // `createSeo` is called: frameworks inline `NEXT_PUBLIC_*` at build time and
    // the canonical origin does not vary within a running build.
    baseUrl?: string;
    // Site-wide preview image for shared links: a path under `public/`
    // ("/social-card.png") or an absolute URL. Leave it unset when no card
    // exists yet — an `og:image` pointing at a file that does not exist gives
    // every shared link a broken preview, which is worse than no preview.
    socialImage?: string | null;
    // Pixel dimensions of that site-wide card, so a scraper can reserve the right
    // space before the image loads. Only emitted for the default image: a page
    // supplying its own would be misdescribed by hard-coded values.
    socialImageWidth?: number;
    socialImageHeight?: number;
    // Alt text for the site-wide card.
    socialImageAlt?: string;
    // Separator between a page's title and the site name.
    titleSeparator?: string;
}

export interface SeoProps {
    // Page-specific title; the site name is appended automatically. Omit on the
    // home page to use the site name alone.
    title?: string;
    description?: string;
    // Path the canonical URL and og:url should point at. Defaults to the current
    // route. Pages that resolve a dynamic segment on the client should pass the
    // concrete path once they know it. Pass null to emit no canonical URL at all
    // — an error page stands in for a URL that is not a real page, so it must
    // not claim one.
    path?: string | null;
    // Preview image for this page: defaults to the site-wide card; pass a path
    // under `public/` or an absolute URL to override it, or null for no image.
    image?: string | null;
    // Alt text for the preview image. Only meaningful alongside a custom
    // `image` — the site-wide card carries its own description.
    imageAlt?: string;
    // Open Graph type. "website" for most pages; "article" suits a news post.
    type?: string;
    // Extra tags, rendered inside the same <head> block.
    children?: React.ReactNode;
}

/**
 * Build the per-page metadata component for a site: title, description,
 * canonical URL, and Open Graph / Twitter card tags, so browser tabs, search
 * engines and shared links (Discord above all, which is where most communities
 * live) show something meaningful.
 *
 * Call once in your own module, export the result, and render it near the top of
 * every page:
 *
 *   export const Seo = createSeo({siteName: 'Ember Hollow', description: '...'});
 */
export const createSeo = ({
    siteName,
    description: defaultDescription,
    baseUrl = siteBaseUrl(),
    socialImage = null,
    socialImageWidth,
    socialImageHeight,
    socialImageAlt,
    titleSeparator = ' — '
}: SeoDefaults): React.FC<SeoProps> => {
    const Seo: React.FC<SeoProps> = ({title, description, path, image, imageAlt, type = 'website', children}) => {
        const router = useRouter();
        // Optional-chained: a page rendered outside a router (a unit test, a
        // static snapshot) should still emit its metadata rather than throw.
        const asPath = router?.asPath ?? '/';
        const fullTitle = title ? `${title}${titleSeparator}${siteName}` : siteName;
        const desc = description ?? defaultDescription;
        const resolvedPath = path === null ? null : canonicalPath(path ?? asPath);
        const url = resolvedPath === null ? null : absoluteUrl(baseUrl, resolvedPath);
        const usingDefaultImage = image === undefined;
        const imageUrl = socialImageUrl(baseUrl, usingDefaultImage ? socialImage : image);
        const alt = imageAlt ?? (usingDefaultImage ? socialImageAlt : undefined);
        return (
            <Head>
                <title>{fullTitle}</title>
                <meta name="description" content={desc}/>
                {url ? <link rel="canonical" href={url}/> : null}
                <meta property="og:title" content={fullTitle}/>
                <meta property="og:description" content={desc}/>
                <meta property="og:type" content={type}/>
                <meta property="og:site_name" content={siteName}/>
                {url ? <meta property="og:url" content={url}/> : null}
                {imageUrl ? <meta property="og:image" content={imageUrl}/> : null}
                {/* Only the site card's dimensions are known here; a page
                    supplying its own image would be misdescribed by them. */}
                {imageUrl && usingDefaultImage && socialImageWidth
                    ? <meta property="og:image:width" content={String(socialImageWidth)}/> : null}
                {imageUrl && usingDefaultImage && socialImageHeight
                    ? <meta property="og:image:height" content={String(socialImageHeight)}/> : null}
                {imageUrl && alt ? <meta property="og:image:alt" content={alt}/> : null}
                <meta name="twitter:card" content={imageUrl ? 'summary_large_image' : 'summary'}/>
                <meta name="twitter:title" content={fullTitle}/>
                <meta name="twitter:description" content={desc}/>
                {imageUrl ? <meta name="twitter:image" content={imageUrl}/> : null}
                {imageUrl && alt ? <meta name="twitter:image:alt" content={alt}/> : null}
                {children}
            </Head>
        );
    };
    Seo.displayName = 'Seo';
    return Seo;
};
