# @kingdom-community/community-site-kit

Shared [Next.js](https://nextjs.org/) + [MUI](https://mui.com/) building blocks
for a community website: an SSR-safe colour-mode provider and toggle, prop-driven
top and bottom navigation bars, a `next/link` bridge for MUI's `component` prop,
per-page SEO metadata, a generic "temporarily unavailable" panel, and pure
builders for `sitemap.xml` and `robots.txt`.

Nothing here knows what your community is about. You pass in your brand, your nav
items and your links; the kit supplies the chrome, the accessibility details and
the fiddly parts (no flash of the wrong theme, no nested anchors, no sitemap that
contradicts your robots.txt).

## Install

```bash
npm install @kingdom-community/community-site-kit
```

`react`, `react-dom`, `next` (13+) and `@mui/material` (5+) are peer
dependencies, so the kit uses the copies your site already has.
`@mui/icons-material` is declared an optional peer, but `TopBar` imports
`Menu`, `ExpandMore` and `OpenInNew` from it directly, so install it too unless
you never import the package's entry point.

```bash
npm install react react-dom next @mui/material @mui/icons-material @emotion/react @emotion/styled
```

## Usage

### 1. Wrap the app in a colour mode

`pages/_app.tsx`:

```tsx
import type {AppProps} from 'next/app';
import {ColorModeProvider, SkipLink} from '@kingdom-community/community-site-kit';

export default function App({Component, pageProps}: AppProps) {
    return (
        <ColorModeProvider
            storageKey="ember-hollow-color-mode"
            defaultMode="dark"
            theme={(mode) => ({
                palette: {
                    mode,
                    primary: {main: mode === 'dark' ? '#7aa2f7' : '#2f5bd8'}
                },
                shape: {borderRadius: 10}
            })}
        >
            <SkipLink/>
            <Component {...pageProps} />
        </ColorModeProvider>
    );
}
```

`ColorModeProvider` renders in a stable `defaultMode` on the server and resolves
the visitor's real preference — an explicit saved choice first, the operating
system's `prefers-color-scheme` second — in an effect after hydration. That is
what stops a page painting in one theme and repainting in the other a moment
later. Pick the `defaultMode` most of your visitors use.

`SkipLink` is the first focusable element on the page; render your page's content
inside `<main id="main">` for it to land on.

The provider also stamps the mode in effect onto `<html>` as
`data-color-mode="light|dark"`, and sets the document's `color-scheme`, so plain
CSS and the browser-painted furniture (scrollbars, form controls, the overscroll
area) follow the toggle.

Everything above happens after hydration. If your site paints anything from CSS
rather than from the MUI theme — a `<html[data-color-mode]>` rule in a global
stylesheet, most often the page background — that first paint still needs the
answer before any bundle has loaded. Render the bootstrap script into `<head>`,
in `pages/_document.tsx`:

```tsx
import {Head, Html, Main, NextScript} from 'next/document';
import {colorModeBootstrapScript} from '@kingdom-community/community-site-kit';

const bootstrap = colorModeBootstrapScript({
    storageKey: 'ember-hollow-color-mode',
    defaultMode: 'dark'
});

export default function Document() {
    return (
        <Html lang="en">
            <Head>
                <script dangerouslySetInnerHTML={{__html: bootstrap}}/>
            </Head>
            <body>
                <Main/>
                <NextScript/>
            </body>
        </Html>
    );
}
```

It is a blocking script that resolves the same "saved choice, else
`prefers-color-scheme`, else `defaultMode`" question the provider does, and
stamps the same attribute — so the provider's later answer is visually a no-op.
Pass it the same `storageKey` and `defaultMode` as the provider.

### 2. Build your page chrome

```tsx
import CodeIcon from '@mui/icons-material/Code';
import ForumIcon from '@mui/icons-material/Forum';
import {BottomBar, TopBar} from '@kingdom-community/community-site-kit';

const NAV = [
    {href: '/', label: 'Home'},
    {href: '/news', label: 'News'},
    {href: '/guides', label: 'Guides'},
    {href: '/map', label: 'Map'}
];

const COMMUNITY = {
    label: 'Community',
    links: [
        {href: 'https://chat.example/invite', label: 'Chat'},
        {href: 'https://forum.example', label: 'Forum'}
    ]
};

export const SiteTopBar = () => (
    <TopBar brand="Ember Hollow" links={NAV} menus={[COMMUNITY]} actions={<SignInLink/>}/>
);

export const SiteBottomBar = () => (
    <BottomBar
        version="1.4.0"
        links={[
            {href: 'https://chat.example/invite', label: 'Chat', icon: <ForumIcon/>},
            {href: 'https://github.example/site', label: 'Source Code', icon: <CodeIcon/>}
        ]}
    />
);
```

Any link whose `href` starts with `http` is treated as off-site: it opens in a
new tab with `rel="noopener noreferrer"`, and in the top bar it also gets an
external-link icon. In-site links navigate client-side through `next/link`, and
the one matching the current route is marked with `aria-current="page"` plus
weight and an underline — never colour alone.

Below the `md` breakpoint the top bar collapses into a hamburger drawer. Pass
`responsive={false}` if you would rather it did not.

### 3. Per-page metadata

```tsx
// components/Seo.tsx
import {createSeo} from '@kingdom-community/community-site-kit';

export const Seo = createSeo({
    siteName: 'Ember Hollow',
    description: 'A small survival server and the people on it.',
    socialImage: '/social-card.png',
    socialImageWidth: 1200,
    socialImageHeight: 630,
    socialImageAlt: 'Ember Hollow'
});
```

```tsx
<Seo title="News" description="What changed while you were away."/>
```

`createSeo` reads the site's origin once, at module scope. Pass `path={null}` on
an error page: it stands in for a URL that is not a real page, so it must not
claim a canonical one.

### 4. Crawler documents

`pages/sitemap.xml.ts`:

```ts
import type {GetServerSidePropsContext} from 'next';
import {siteBaseUrl, sitemapPaths, sitemapXml} from '@kingdom-community/community-site-kit';

const STATIC_PATHS = ['/', '/news', '/guides', '/map'];

export const getServerSideProps = async ({res}: GetServerSidePropsContext) => {
    // Only pages a stranger can actually load, and none at all if the source is
    // unreachable — a sitemap that quietly loses one collection for a crawl is
    // better than one that invents URLs.
    const postSlugs = await publishedPostSlugs().catch(() => []);

    const xml = sitemapXml(
        siteBaseUrl(),
        sitemapPaths({
            staticPaths: STATIC_PATHS,
            collections: [{prefix: 'news', ids: postSlugs}]
        })
    );

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.write(xml);
    res.end();
    return {props: {}};
};

export default function Sitemap() {
    return null;
}
```

`pages/robots.txt.ts`:

```ts
import {robotsTxt, siteBaseUrl} from '@kingdom-community/community-site-kit';

const DISALLOW = ['/api/', '/account'];

export const getServerSideProps = async ({res}) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.write(robotsTxt(siteBaseUrl(), {disallow: DISALLOW}));
    res.end();
    return {props: {}};
};

export default function Robots() {
    return null;
}
```

`sitemapPathProblems` audits a path list against the invariants a sitemap has to
hold — every path site-relative, no unresolved `[dynamic]` templates, and nothing
offered to crawlers that `robots.txt` asks them to skip. Assert it in your own
test suite:

```ts
it('offers a sound set of paths', () => {
    expect(sitemapPathProblems(STATIC_PATHS, DISALLOW)).toEqual([]);
});
```

### 5. Error pages

```tsx
// pages/404.tsx
import HomeIcon from '@mui/icons-material/Home';
import {ErrorPage} from '@kingdom-community/community-site-kit';

export default function NotFound() {
    return (
        <ErrorPage
            code="404"
            title="Page not found"
            message="That page does not exist, or it moved."
            seo={<Seo title="404 — Page not found" path={null}/>}
            topBar={<SiteTopBar/>}
            bottomBar={<SiteBottomBar/>}
            homeIcon={<HomeIcon/>}
        />
    );
}
```

### 6. Degraded states

```tsx
<UnavailablePanel title="The player list is unavailable">
    We could not reach the game server just now. Nothing you did caused this —
    try again in a few minutes.
</UnavailablePanel>
```

A dependency being down should produce a page that still renders, in the site's
own chrome, saying plainly which capability is unavailable and that nothing the
visitor did caused it — not a stack trace, not a spinner that never resolves, and
never a message that blames the user.

## Configuration

The kit reads exactly one environment variable, and only through `siteBaseUrl()`:

| Variable | Default | Used for |
|---|---|---|
| `NEXT_PUBLIC_BASE_URL` | `http://localhost:3000` | The site's own public origin. Every absolute URL the site advertises — the canonical URL, `og:url`, `og:image`, and the `<loc>` entries in `sitemap.xml` — is built from it. Must be `NEXT_PUBLIC_*` for browser code to see it; pass another name to `siteBaseUrl('MY_VAR')` if you prefer. |

Everything else is a prop.

## API

**Components** — `ColorModeProvider`, `ColorModeToggle`, `ColorModeToggleSwitch`,
`createColorModeToggleSwitch`, `TopBar`, `BottomBar`, `ErrorPage`,
`UnavailablePanel`, `SkipLink`, `NextLinkComposed`, `createSeo`.

**Utilities** — `resolveInitialColorMode`, `readStoredColorMode`,
`storeColorMode`, `applyColorModeToDocument`, `colorModeBootstrapScript`,
`COLOR_MODE_BOOTSTRAP_SCRIPT`, `COLOR_MODE_ATTRIBUTE`,
`DEFAULT_COLOR_MODE_STORAGE_KEY`, `ColorModeContext`, `isActiveNavLink`, `isExternalNavLink`, `canonicalPath`,
`absoluteUrl`, `siteBaseUrl`, `socialImageUrl`, `DEFAULT_BASE_URL`,
`sitemapPaths`, `collectionPaths`, `sitemapXml`, `robotsTxt`,
`sitemapPathProblems`, `SITEMAP_ROUTE`, `DEFAULT_DISALLOWED_CRAWL_PATHS`.

**Styles** — `import {styles} from '@kingdom-community/community-site-kit'` for
the shared `sx` factories the chrome is built from (`pageStyle`,
`sectionHeaderStyle`, `panelStyle`, `heroBoxStyle`, and the rest). Most are
functions of the MUI theme, so restyling them means restyling your palette; a
few (`toggleSwitchBoxStyle`, `navDrawerDividerStyle`) are plain `sx` objects.

Everything the kit animates honours `prefers-reduced-motion` already. For your
own animated `sx`, the same three pieces are exported alongside them:

```tsx
import {styles} from '@kingdom-community/community-site-kit';

const cardStyle = {
    transition: 'all 0.3s ease',
    '&:hover': {transform: 'translateY(-4px)', boxShadow: 6},
    ...styles.withoutHoverMotion    // spread LAST — see below
};
```

`withoutHoverMotion` cancels the transition and the hover's movement while
leaving its colour and shadow feedback intact; `withoutTransition` cancels only
the transition, for a style whose transform is its layout rather than its
animation (the skip link, parked off-screen, is the kit's own example — undoing
that transform would leave it sitting over the page). `REDUCED_MOTION_QUERY` is
the query string itself, if you would rather write the block by hand.

Spread either one **last**. Emotion serializes keys in insertion order, and the
override carries the same specificity as the rule it overrides, so it only wins
while it comes later in the generated stylesheet.

## Development

```bash
npm install
npm test        # vitest, jsdom
npm run typecheck
npm run build
```

## Origins

Extracted from the website and infrastructure stack behind a Minecraft community
server, generalised and released under MIT. The same components had been written
twice, for two sites, and had drifted; this package is the reconciled version.
