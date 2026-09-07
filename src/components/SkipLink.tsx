import React from 'react';
import {Box} from '@mui/material';

import {withoutTransition} from '../styles/styles.js';

export interface SkipLinkProps {
    // The id of the page's main content element. Render `<main id="main">` (or
    // whatever you pass here) on every page for the link to land somewhere.
    targetId?: string;
    label?: string;
}

/**
 * The first focusable element on the page, hidden until focused, letting
 * keyboard and screen-reader users jump past the navigation to the page's main
 * content (WCAG 2.4.1, "Bypass Blocks"). Render it once, immediately inside the
 * app's root — the "first focusable element" part is the whole point, so it must
 * come before the top bar in DOM order.
 */
export const SkipLink: React.FC<SkipLinkProps> = ({targetId = 'main', label = 'Skip to main content'}) => (
    <Box
        component="a"
        href={`#${targetId}`}
        sx={{
            position: 'fixed',
            top: 8,
            left: 8,
            zIndex: (t) => t.zIndex.tooltip + 1,
            px: 2,
            py: 1,
            borderRadius: 1,
            boxShadow: 3,
            bgcolor: 'background.paper',
            color: 'primary.main',
            // Parked off-screen rather than `display: none`, which would take it
            // out of the tab order and defeat the purpose.
            transform: 'translateY(-150%)',
            transition: 'transform 0.2s ease',
            '&:focus': {transform: 'translateY(0)'},
            // Reduced motion drops the slide, not the parking: the link still
            // sits off-screen and still arrives on focus, it just stops
            // travelling there. Cancelling the transform instead would leave it
            // permanently visible over the page.
            ...withoutTransition
        }}
    >
        {label}
    </Box>
);
