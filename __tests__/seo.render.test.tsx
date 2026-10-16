import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {cleanup, render} from '@testing-library/react';

// next/head only collects tags when a Next.js head manager is present; inline
// them so the assertions below can read them out of the rendered DOM.
vi.mock('next/head', () => ({
    default: ({children}: {children?: React.ReactNode}) => <>{children}</>
}));
const router = {asPath: '/', pathname: '/'};
vi.mock('next/router', () => ({useRouter: () => router}));

import {createSeo} from '../src/components/Seo.js';

const Seo = createSeo({
    siteName: 'Ember Hollow',
    description: 'A small survival server and the people on it.',
    baseUrl: 'https://emberhollow.example',
    socialImage: '/social-card.png',
    socialImageWidth: 1200,
    socialImageHeight: 630,
    socialImageAlt: 'Ember Hollow'
});

const meta = (container: HTMLElement, selector: string): string | null =>
    container.querySelector(selector)?.getAttribute('content') ?? null;

beforeEach(() => {
    router.asPath = '/';
    router.pathname = '/';
});

afterEach(cleanup);

describe('createSeo', () => {
    it('uses the site name alone when a page supplies no title', () => {
        const {container} = render(<Seo/>);
        expect(container.querySelector('title')?.textContent).toBe('Ember Hollow');
        expect(meta(container, 'meta[property="og:site_name"]')).toBe('Ember Hollow');
    });

    it('appends the site name to a page title', () => {
        const {container} = render(<Seo title="News"/>);
        expect(container.querySelector('title')?.textContent).toBe('News — Ember Hollow');
        expect(meta(container, 'meta[property="og:title"]')).toBe('News — Ember Hollow');
    });

    it('claims the current route as canonical by default', () => {
        router.asPath = '/news?utm_source=discord';
        const {container} = render(<Seo/>);
        expect(container.querySelector('link[rel="canonical"]')?.getAttribute('href'))
            .toBe('https://emberhollow.example/news');
        expect(meta(container, 'meta[property="og:url"]')).toBe('https://emberhollow.example/news');
    });

    // An error page stands in for a URL that is not a real page.
    it('claims no canonical URL at all when path is null', () => {
        const {container} = render(<Seo title="404" path={null}/>);
        expect(container.querySelector('link[rel="canonical"]')).toBeNull();
        expect(container.querySelector('meta[property="og:url"]')).toBeNull();
    });

    it('falls back to the site description and advertises the site card', () => {
        const {container} = render(<Seo/>);
        expect(meta(container, 'meta[name="description"]')).toBe('A small survival server and the people on it.');
        expect(meta(container, 'meta[property="og:image"]')).toBe('https://emberhollow.example/social-card.png');
        expect(meta(container, 'meta[property="og:image:width"]')).toBe('1200');
        expect(meta(container, 'meta[property="og:image:height"]')).toBe('630');
        expect(meta(container, 'meta[name="twitter:card"]')).toBe('summary_large_image');
    });

    it('drops the site card dimensions when a page supplies its own image', () => {
        const {container} = render(<Seo image="/news/wipe-day.png" imageAlt="A map of the new world"/>);
        expect(meta(container, 'meta[property="og:image"]')).toBe('https://emberhollow.example/news/wipe-day.png');
        expect(container.querySelector('meta[property="og:image:width"]')).toBeNull();
        expect(meta(container, 'meta[property="og:image:alt"]')).toBe('A map of the new world');
    });

    it('emits no image tags, and a plain summary card, when a page opts out', () => {
        const {container} = render(<Seo image={null}/>);
        expect(container.querySelector('meta[property="og:image"]')).toBeNull();
        expect(meta(container, 'meta[name="twitter:card"]')).toBe('summary');
    });

    it('emits no image tags at all for a site that has no card yet', () => {
        const Bare = createSeo({siteName: 'Ember Hollow', description: 'x', baseUrl: 'https://emberhollow.example'});
        const {container} = render(<Bare/>);
        expect(container.querySelector('meta[property="og:image"]')).toBeNull();
        expect(meta(container, 'meta[name="twitter:card"]')).toBe('summary');
    });

    it('joins the page title and site name with the configured separator', () => {
        const Piped = createSeo({
            siteName: 'Ember Hollow',
            description: 'x',
            baseUrl: 'https://emberhollow.example',
            titleSeparator: ' | '
        });
        const {container} = render(<Piped title="News"/>);
        expect(container.querySelector('title')?.textContent).toBe('News | Ember Hollow');
        expect(meta(container, 'meta[name="twitter:title"]')).toBe('News | Ember Hollow');
    });

    it('describes a page as a website unless it says otherwise', () => {
        const {container} = render(<Seo/>);
        expect(meta(container, 'meta[property="og:type"]')).toBe('website');
        cleanup();
        const {container: article} = render(<Seo type="article"/>);
        expect(meta(article, 'meta[property="og:type"]')).toBe('article');
    });

    // A page resolving a dynamic segment on the client knows its concrete path
    // before the router's asPath does.
    it('prefers an explicit path over the current route', () => {
        router.asPath = '/news/[slug]';
        const {container} = render(<Seo path="/news/wipe-day#comments"/>);
        expect(container.querySelector('link[rel="canonical"]')?.getAttribute('href'))
            .toBe('https://emberhollow.example/news/wipe-day');
    });

    it('carries a page description into every description tag', () => {
        const {container} = render(<Seo description="What changed while you were away."/>);
        expect(meta(container, 'meta[name="description"]')).toBe('What changed while you were away.');
        expect(meta(container, 'meta[property="og:description"]')).toBe('What changed while you were away.');
        expect(meta(container, 'meta[name="twitter:description"]')).toBe('What changed while you were away.');
    });

    it('describes the site card with its own alt text', () => {
        const {container} = render(<Seo/>);
        expect(meta(container, 'meta[property="og:image:alt"]')).toBe('Ember Hollow');
        expect(meta(container, 'meta[name="twitter:image:alt"]')).toBe('Ember Hollow');
    });

    // The site card's alt text describes the site card, not whatever a page
    // swapped in for it.
    it('does not lend the site card alt text to a page image', () => {
        const {container} = render(<Seo image="/news/wipe-day.png"/>);
        expect(container.querySelector('meta[property="og:image:alt"]')).toBeNull();
        expect(container.querySelector('meta[name="twitter:image:alt"]')).toBeNull();
    });

    it('renders extra tags inside the same head block', () => {
        const {container} = render(<Seo><meta name="robots" content="noindex"/></Seo>);
        expect(meta(container, 'meta[name="robots"]')).toBe('noindex');
    });
});
