// True when a navigation link points at the page currently being viewed.
// External links (http/https) are never treated as "active" — only in-site
// routes participate in the "you are here" indication. Kept pure so it can be
// unit-tested and reused by the navigation bars.
export const isActiveNavLink = (pathname: string, href: string): boolean =>
    !href.startsWith('http') && pathname === href;

// True when a link leaves the site, which is what decides whether it navigates
// client-side or opens in a new tab with `rel="noopener noreferrer"`.
export const isExternalNavLink = (href: string): boolean => href.startsWith('http');

export interface NavLink {
    // Either an in-site route ("/news") or an absolute off-site URL.
    href: string;
    label: string;
}

export interface NavMenu {
    label: string;
    links: readonly NavLink[];
}
