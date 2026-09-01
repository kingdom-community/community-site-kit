export {
    ColorModeToggleSwitch,
    createColorModeToggleSwitch,
    type ColorModeToggleSwitchOptions
} from './components/ColorModeToggleSwitch.js';
export {
    ColorModeProvider,
    ColorModeToggle,
    type ColorModeProviderProps,
    type ColorModeToggleProps
} from './components/ColorModeProvider.js';
export {NextLinkComposed, type NextLinkComposedProps} from './components/NextLinkComposed.js';
export {createSeo, type SeoDefaults, type SeoProps} from './components/Seo.js';
export {TopBar, type TopBarProps} from './components/TopBar.js';
export {BottomBar, type BottomBarProps, type FooterLink} from './components/BottomBar.js';
export {ErrorPage, type ErrorPageProps} from './components/ErrorPage.js';
export {UnavailablePanel, type UnavailablePanelProps} from './components/UnavailablePanel.js';
export {SkipLink, type SkipLinkProps} from './components/SkipLink.js';

export {ColorModeContext, type ColorModeContextValue} from './utils/ColorModeContext.js';
export {
    DEFAULT_COLOR_MODE_STORAGE_KEY,
    resolveInitialColorMode,
    type ColorMode
} from './utils/colorMode.js';
export {
    isActiveNavLink,
    isExternalNavLink,
    type NavLink,
    type NavMenu
} from './utils/nav.js';
export {
    DEFAULT_BASE_URL,
    absoluteUrl,
    canonicalPath,
    siteBaseUrl,
    socialImageUrl
} from './utils/seo.js';
export {
    DEFAULT_DISALLOWED_CRAWL_PATHS,
    SITEMAP_ROUTE,
    collectionPaths,
    robotsTxt,
    sitemapPathProblems,
    sitemapPaths,
    sitemapXml,
    type RobotsTxtOptions,
    type SitemapCollection,
    type SitemapPathProblem,
    type SitemapPathProblemReason,
    type SitemapPathsOptions
} from './utils/sitemap.js';

export * as styles from './styles/styles.js';
