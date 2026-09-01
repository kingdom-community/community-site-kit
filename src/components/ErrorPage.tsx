import React from 'react';
import {Box, Button, Container, Typography} from '@mui/material';

import {NextLinkComposed} from './NextLinkComposed.js';
import {pageStyle, sectionHeaderStyle} from '../styles/styles.js';

export interface ErrorPageProps {
    // The status code, shown large: "404", "500".
    code: string;
    title: string;
    message: string;
    // The site chrome. Passed in rather than imported so an error page uses the
    // *same* bars as the rest of the site, configured the same way, without this
    // component having to know how they are configured.
    topBar?: React.ReactNode;
    bottomBar?: React.ReactNode;
    // Your page-metadata element. Render it with `path={null}`: an error page
    // stands in for a URL that is not a real page, so it must not claim a
    // canonical one.
    seo?: React.ReactNode;
    homeHref?: string;
    homeLabel?: string;
    // Leading icon on the home button, e.g. `<HomeIcon/>`.
    homeIcon?: React.ReactNode;
    // The id the site's skip link points at.
    mainId?: string;
    children?: React.ReactNode;
}

/**
 * Shared layout for a site's error pages (404 / 500). Renders the standard page
 * chrome around a centred message and a link home, so a thrown or missing route
 * still looks like the rest of the site instead of the framework's unstyled
 * default.
 *
 * Nothing here reaches the network, by construction: an error page has to render
 * when the thing that caused the error is exactly what is down.
 */
export const ErrorPage: React.FC<ErrorPageProps> = ({
    code,
    title,
    message,
    topBar,
    bottomBar,
    seo,
    homeHref = '/',
    homeLabel = 'Back to home',
    homeIcon,
    mainId = 'main',
    children
}) => (
    <Box sx={pageStyle}>
        {seo}
        {topBar}
        <Container component="main" id={mainId} maxWidth="sm" sx={{py: 8, textAlign: 'center', flexGrow: 1}}>
            <Typography variant="h1" color="primary" sx={{fontWeight: 700}}>
                {code}
            </Typography>
            <Typography variant="h4" gutterBottom sx={sectionHeaderStyle}>
                {title}
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{mb: 3}}>
                {message}
            </Typography>
            <Button variant="contained" startIcon={homeIcon} component={NextLinkComposed} to={homeHref}>
                {homeLabel}
            </Button>
            {children}
        </Container>
        {bottomBar}
    </Box>
);

export default ErrorPage;
