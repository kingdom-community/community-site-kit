import {
    AppBar,
    Box,
    Button,
    Divider,
    Drawer,
    IconButton,
    List,
    ListItemButton,
    ListItemText,
    Menu,
    MenuItem,
    Toolbar,
    Typography
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu.js';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore.js';
import OpenInNewIcon from '@mui/icons-material/OpenInNew.js';
import {useRouter} from 'next/router.js';
import React, {useState} from 'react';

import {NextLinkComposed} from './NextLinkComposed.js';
import {ColorModeToggle} from './ColorModeProvider.js';
import {isActiveNavLink, isExternalNavLink, type NavLink, type NavMenu} from '../utils/nav.js';
import {
    appBarStyle,
    brandNameStyle,
    flexContainerStyle,
    navButtonStyle,
    navDrawerDividerStyle,
    navDrawerPaperStyle,
    navDrawerSectionLabelStyle,
    toolbarStyle
} from '../styles/styles.js';

// Internal routes navigate in the same tab; off-site links open in a new tab
// (with rel="noopener noreferrer") and carry an external-link icon so they are
// visually distinguishable from the in-site navigation they sit beside.
const NavButton: React.FC<{href: string; active?: boolean; children: React.ReactNode}> = ({
    href,
    active = false,
    children
}) => {
    const isExternal = isExternalNavLink(href);
    return (
        <Button
            color="inherit"
            {...(isExternal
                ? {href, target: '_blank', rel: 'noopener noreferrer'}
                : {component: NextLinkComposed, to: href})}
            endIcon={isExternal ? <OpenInNewIcon fontSize="small"/> : undefined}
            aria-current={active ? 'page' : undefined}
            sx={(theme) => ({
                ...navButtonStyle(theme),
                // "You are here", carried by weight and an underline rather than
                // colour alone, so it survives both palettes and colour-blind
                // vision.
                fontWeight: active ? 700 : 500,
                textDecoration: active ? 'underline' : 'none',
                textUnderlineOffset: '6px'
            })}
        >
            {children}
        </Button>
    );
};

// Desktop-only dropdown, so a group of related destinations costs one slot in
// the always-visible nav rather than one slot each.
const NavDropdown: React.FC<{menu: NavMenu}> = ({menu}) => {
    const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
    return (
        <>
            <Button
                color="inherit"
                endIcon={<ExpandMoreIcon fontSize="small"/>}
                onClick={(event) => setAnchorEl(event.currentTarget)}
                sx={(theme) => navButtonStyle(theme)}
            >
                {menu.label}
            </Button>
            <Menu anchorEl={anchorEl} open={!!anchorEl} onClose={() => setAnchorEl(null)}>
                {menu.links.map((link) => {
                    const isExternal = isExternalNavLink(link.href);
                    return (
                        <MenuItem
                            key={link.href}
                            {...(isExternal
                                ? {component: 'a' as const, href: link.href, target: '_blank', rel: 'noopener noreferrer'}
                                : {component: NextLinkComposed, to: link.href})}
                            onClick={() => setAnchorEl(null)}
                        >
                            {link.label}
                            {isExternal ? <OpenInNewIcon fontSize="small" sx={{marginLeft: 1}}/> : null}
                        </MenuItem>
                    );
                })}
            </Menu>
        </>
    );
};

// Below the `md` breakpoint the inline nav is replaced by a hamburger button
// that opens this drawer, the conventional mobile navigation pattern.
const NavDrawer: React.FC<{
    open: boolean;
    onClose: () => void;
    pathname: string;
    links: readonly NavLink[];
    menus: readonly NavMenu[];
}> = ({open, onClose, pathname, links, menus}) => (
    <Drawer anchor="right" open={open} onClose={onClose} PaperProps={{sx: navDrawerPaperStyle}}>
        <List sx={{width: 260}} onClick={onClose}>
            {links.map((link) =>
                isExternalNavLink(link.href) ? (
                    <ListItemButton key={link.href} component="a" href={link.href} target="_blank" rel="noopener noreferrer">
                        <ListItemText primary={link.label}/>
                        <OpenInNewIcon fontSize="small"/>
                    </ListItemButton>
                ) : (
                    <ListItemButton
                        key={link.href}
                        component={NextLinkComposed}
                        to={link.href}
                        selected={isActiveNavLink(pathname, link.href)}
                    >
                        <ListItemText primary={link.label}/>
                    </ListItemButton>
                )
            )}
            {menus.map((menu) => (
                <React.Fragment key={menu.label}>
                    <Divider sx={navDrawerDividerStyle}/>
                    <Typography variant="overline" sx={navDrawerSectionLabelStyle} component="div">
                        {menu.label}
                    </Typography>
                    {menu.links.map((link) =>
                        isExternalNavLink(link.href) ? (
                            <ListItemButton
                                key={link.href}
                                component="a"
                                href={link.href}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                <ListItemText primary={link.label}/>
                                <OpenInNewIcon fontSize="small"/>
                            </ListItemButton>
                        ) : (
                            <ListItemButton
                                key={link.href}
                                component={NextLinkComposed}
                                to={link.href}
                                selected={isActiveNavLink(pathname, link.href)}
                            >
                                <ListItemText primary={link.label}/>
                            </ListItemButton>
                        )
                    )}
                </React.Fragment>
            ))}
        </List>
    </Drawer>
);

export interface TopBarProps {
    // The wordmark. A string is rendered as the site name; pass a node for a
    // logo. It links home — the near-universal "click the logo to go home"
    // convention.
    brand: React.ReactNode;
    brandHref?: string;
    // The primary destinations, in the order they should appear. Any entry whose
    // href starts with http is treated as off-site.
    links?: readonly NavLink[];
    // Groups of related destinations, each behind its own dropdown on desktop
    // and its own labelled section in the mobile drawer. Use one when the
    // top-level item count stops being scannable.
    menus?: readonly NavMenu[];
    // A slot at the right-hand end, before the colour-mode toggle, for anything
    // that depends on state the kit does not own — a sign-in link, a cart, a
    // notification bell. Resolve such things client-side: the top bar appears on
    // every page, and making the chrome depend on a session lookup gives every
    // page a dependency it probably was not meant to have.
    actions?: React.ReactNode;
    // Show the colour-mode switch. Requires a `ColorModeProvider` above it.
    colorModeToggle?: boolean;
    // Collapse the nav into a hamburger drawer below the `md` breakpoint.
    responsive?: boolean;
    // The current route, for the "you are here" indication. Defaults to the
    // Next.js router's pathname; pass it explicitly when rendering outside a
    // router.
    pathname?: string;
    // Accessible name for the navigation landmark. Give each nav on the page a
    // distinct one if there is more than one.
    ariaLabel?: string;
    menuButtonLabel?: string;
}

export const TopBar: React.FC<TopBarProps> = ({
    brand,
    brandHref = '/',
    links = [],
    menus = [],
    actions,
    colorModeToggle = true,
    responsive = true,
    pathname,
    ariaLabel = 'Primary',
    menuButtonLabel = 'Open navigation menu'
}) => {
    const router = useRouter();
    const currentPath = pathname ?? router?.pathname ?? '/';
    const [drawerOpen, setDrawerOpen] = useState(false);
    // Nothing to collapse means no hamburger: a bar with only a wordmark should
    // not sprout a button that opens an empty drawer.
    const collapsible = responsive && (links.length > 0 || menus.length > 0);

    return (
        <AppBar position="static" sx={appBarStyle}>
            <Toolbar component="nav" aria-label={ariaLabel} sx={toolbarStyle}>
                <Box sx={(theme) => flexContainerStyle(theme, {gap: 1})}>
                    <Typography
                        variant="h6"
                        component={NextLinkComposed}
                        to={brandHref}
                        sx={(theme) => ({...brandNameStyle(theme), textDecoration: 'none'})}
                    >
                        {brand}
                    </Typography>
                    <Box
                        sx={(theme) => ({
                            ...flexContainerStyle(theme, {gap: 1}),
                            ...(collapsible ? {display: {xs: 'none', md: 'flex'}} : {})
                        })}
                    >
                        {links.map((link) => (
                            <NavButton key={link.href} href={link.href} active={isActiveNavLink(currentPath, link.href)}>
                                {link.label}
                            </NavButton>
                        ))}
                        {menus.map((menu) => (
                            <NavDropdown key={menu.label} menu={menu}/>
                        ))}
                    </Box>
                </Box>
                <Box sx={(theme) => flexContainerStyle(theme, {gap: 1})}>
                    {actions}
                    {colorModeToggle ? <ColorModeToggle/> : null}
                    {collapsible ? (
                        <IconButton
                            color="inherit"
                            aria-label={menuButtonLabel}
                            onClick={() => setDrawerOpen(true)}
                            sx={{display: {xs: 'inline-flex', md: 'none'}}}
                        >
                            <MenuIcon/>
                        </IconButton>
                    ) : null}
                </Box>
            </Toolbar>
            {collapsible ? (
                <NavDrawer
                    open={drawerOpen}
                    onClose={() => setDrawerOpen(false)}
                    pathname={currentPath}
                    links={links}
                    menus={menus}
                />
            ) : null}
        </AppBar>
    );
};

export default TopBar;
