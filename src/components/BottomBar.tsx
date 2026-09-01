import {AppBar, Box, Button, Toolbar, Typography} from '@mui/material';
import React from 'react';

import {ColorModeToggle} from './ColorModeProvider.js';
import {NextLinkComposed} from './NextLinkComposed.js';
import {isExternalNavLink} from '../utils/nav.js';
import {
    bottomAppBarStyle,
    flexContainerStyle,
    footerButtonStyle,
    toolbarStyle,
    versionNumberStyle
} from '../styles/styles.js';

export interface FooterLink {
    href: string;
    label: string;
    // Optional leading icon — a MUI icon element, say `<CodeIcon/>`. The kit
    // does not pick icons for you: which ones say "source code" or "report a
    // bug" on your site is your call, and hard-coding them here would drag a
    // dependency on @mui/icons-material into every consumer.
    icon?: React.ReactNode;
}

const FooterButton: React.FC<{link: FooterLink}> = ({link}) => {
    const isExternal = isExternalNavLink(link.href);
    return (
        <Button
            color="inherit"
            {...(isExternal
                ? {href: link.href, target: '_blank', rel: 'noopener noreferrer'}
                : {component: NextLinkComposed, to: link.href})}
            startIcon={link.icon}
            sx={footerButtonStyle}
        >
            {link.label}
        </Button>
    );
};

export interface BottomBarProps {
    // Rendered as "v<version>". Omitted entirely when unset — half a label
    // reading "v" is worse than no label. Feed it your package version; the kit
    // deliberately does not read package.json for you, because the version a
    // visitor cares about is the site's, not this library's.
    version?: string;
    links?: readonly FooterLink[];
    // Anything else that belongs in the footer beside the version — a visitor
    // counter, a "since 2019", a status pill. Rendered next to the version.
    children?: React.ReactNode;
    colorModeToggle?: boolean;
    ariaLabel?: string;
}

export const BottomBar: React.FC<BottomBarProps> = ({
    version,
    links = [],
    children,
    colorModeToggle = true,
    ariaLabel = 'Footer'
}) => (
    <AppBar position="static" component="footer" sx={bottomAppBarStyle}>
        <Toolbar aria-label={ariaLabel} sx={toolbarStyle}>
            <Box sx={flexContainerStyle}>
                <Box sx={{display: 'flex', alignItems: 'center', gap: 2}}>
                    {version ? (
                        <Typography variant="body1" color="inherit" component="div" sx={versionNumberStyle}>
                            v{version}
                        </Typography>
                    ) : null}
                    {children}
                </Box>
                <Box sx={(theme) => flexContainerStyle(theme, {gap: 1})}>
                    {links.map((link) => (
                        <FooterButton key={link.href} link={link}/>
                    ))}
                </Box>
            </Box>
            {colorModeToggle ? <ColorModeToggle/> : null}
        </Toolbar>
    </AppBar>
);

export default BottomBar;
