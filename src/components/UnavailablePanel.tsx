import React from 'react';
import {Alert, AlertTitle, Typography} from '@mui/material';

// The panel a degraded path renders instead of an error.
//
// "Everything degrades" is a rule with a shape: a dependency being down produces
// a page that still renders, in the site's own chrome, saying plainly which
// capability is unavailable and that nothing the visitor did caused it. What it
// must never produce is a stack trace, a spinner that never resolves, or a
// message that blames the user — telling somebody their password is wrong
// because the authentication service is restarting is worse than telling them
// nothing.
//
// `role="status"` rather than `role="alert"`: this is information about the
// site's state, not something demanding the visitor drop what they are doing, so
// a screen reader should announce it politely rather than interrupt.
export interface UnavailablePanelProps {
    title: string;
    children?: React.ReactNode;
}

export const UnavailablePanel: React.FC<UnavailablePanelProps> = ({title, children}) => (
    <Alert severity="warning" variant="outlined" sx={{mb: 3}} role="status">
        <AlertTitle>{title}</AlertTitle>
        <Typography variant="body2" component="div">
            {children}
        </Typography>
    </Alert>
);

export default UnavailablePanel;
