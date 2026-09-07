import {styled, Switch} from '@mui/material';

import {switchTrackStyle} from '../styles/styles.js';

// A sun/moon toggle for the colour mode, styled as an iOS-shaped switch with the
// icon drawn on the thumb.
//
// The icons are inlined as data URIs rather than referenced out of `public/`, so
// the switch works in a site that has not been asked to copy any asset files in
// — a component that silently renders a blank thumb until you notice the 404 is
// a poor thing to ship in a library. Override either one if you would rather
// serve your own.
const SUN_ICON =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' height='20' width='20' viewBox='0 0 20 20'%3E%3Cpath fill='%23000' d='M9.305 1.667V3.75h1.389V1.667h-1.39zm-4.707 1.95l-.982.982L5.09 6.072l.982-.982-1.473-1.473zm10.802 0L13.927 5.09l.982.982 1.473-1.473-.982-.982zM10 5.139a4.872 4.872 0 00-4.862 4.86A4.872 4.872 0 0010 14.862 4.872 4.872 0 0014.86 10 4.872 4.872 0 0010 5.139zm0 1.389A3.462 3.462 0 0113.471 10a3.462 3.462 0 01-3.473 3.472A3.462 3.462 0 016.527 10 3.462 3.462 0 0110 6.528zM1.665 9.305v1.39h2.083v-1.39H1.666zm14.583 0v1.39h2.084v-1.39h-2.084zM5.09 13.928L3.616 15.4l.982.982 1.473-1.473-.982-.982zm9.82 0l-.982.982 1.473 1.473.982-.982-1.473-1.473zM9.305 16.25v2.083h1.389V16.25h-1.39z'/%3E%3C/svg%3E";
const MOON_ICON =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' height='20' width='20' viewBox='0 0 20 20'%3E%3Cpath fill='%23fff' d='M4.2 2.5l-.7 1.8-1.8.7 1.8.7.7 1.8.6-1.8L6.7 5l-1.9-.7-.6-1.8zm15 8.3a6.7 6.7 0 11-6.6-6.6 5.8 5.8 0 006.6 6.6z'/%3E%3C/svg%3E";

export interface ColorModeToggleSwitchOptions {
    // URL of the icon shown while the switch is off (light mode).
    lightIconUrl?: string;
    // URL of the icon shown while the switch is on (dark mode).
    darkIconUrl?: string;
}

// Build a toggle switch with your own icons. `ColorModeToggleSwitch` below is
// this called with the built-in pair.
export const createColorModeToggleSwitch = ({
    lightIconUrl = SUN_ICON,
    darkIconUrl = MOON_ICON
}: ColorModeToggleSwitchOptions = {}) =>
    styled(Switch)(({theme}) => ({
        width: 62,
        height: 34,
        padding: 7,
        '& .MuiSwitch-switchBase': {
            margin: 1,
            padding: 0,
            transform: 'translateX(6px)',
            '&.Mui-checked': {
                color: '#fff',
                transform: 'translateX(22px)',
                '& .MuiSwitch-thumb:before': {
                    backgroundImage: `url("${darkIconUrl}")`
                },
                '& + .MuiSwitch-track': switchTrackStyle(theme)
            }
        },
        '& .MuiSwitch-thumb': {
            // The palette already carries exactly these two values, so the thumb
            // asks it rather than restating them.
            backgroundColor: theme.palette.mode === 'dark' ? theme.palette.common.black : theme.palette.common.white,
            width: 32,
            height: 32,
            '&:before': {
                content: "''",
                position: 'absolute',
                width: '100%',
                height: '100%',
                left: 0,
                top: 0,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'center',
                backgroundImage: `url("${lightIconUrl}")`
            }
        },
        '& .MuiSwitch-track': {
            ...switchTrackStyle(theme),
            borderRadius: 20 / 2
        }
    }));

export const ColorModeToggleSwitch = createColorModeToggleSwitch();
