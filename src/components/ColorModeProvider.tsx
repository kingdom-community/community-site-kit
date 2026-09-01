import React, {useEffect, useMemo, useState} from 'react';
import {createTheme, CssBaseline, ThemeProvider, useTheme} from '@mui/material';
import type {Theme, ThemeOptions} from '@mui/material/styles';

import {ColorModeContext} from '../utils/ColorModeContext.js';
import {DEFAULT_COLOR_MODE_STORAGE_KEY, type ColorMode, resolveInitialColorMode} from '../utils/colorMode.js';
import {ColorModeToggleSwitch} from './ColorModeToggleSwitch.js';
import {toggleSwitchBoxStyle} from '../styles/styles.js';
import {Box} from '@mui/material';

export interface ColorModeProviderProps {
    children?: React.ReactNode;
    // The mode the server renders in, and therefore the mode the first client
    // paint uses before the visitor's real preference is known. See below.
    defaultMode?: ColorMode;
    // localStorage key the explicit choice is saved under.
    storageKey?: string;
    // Build the MUI theme for a mode. Return either plain `ThemeOptions` (passed
    // to `createTheme`) or a fully built `Theme`. Defaults to MUI's own defaults
    // in the requested mode.
    theme?: (mode: ColorMode) => ThemeOptions | Theme;
    // Render MUI's `CssBaseline`. On by default, since the themed background
    // colour is one of the things a colour mode is for.
    cssBaseline?: boolean;
}

const isBuiltTheme = (value: ThemeOptions | Theme): value is Theme =>
    typeof (value as Theme).palette?.mode === 'string' && typeof (value as Theme).spacing === 'function';

/**
 * Wraps an app in a light/dark colour mode that survives a reload and never
 * flashes the wrong theme.
 *
 * The no-flash property comes from *not* reading the visitor's preference during
 * render. Server-side rendering has no `localStorage` and no `matchMedia`, so a
 * render-time lookup would produce different markup on the server and on the
 * client and React would report a hydration mismatch — which, in practice, looks
 * like the page repainting in the other theme a moment after it appears.
 * Instead: render in a stable `defaultMode` on both sides, then resolve the real
 * mode in an effect, which runs only on the client and only after hydration.
 *
 * Pick `defaultMode` to match whichever mode your site's visitors mostly use;
 * that is the one that never repaints at all.
 */
export const ColorModeProvider: React.FC<ColorModeProviderProps> = ({
    children,
    defaultMode = 'dark',
    storageKey = DEFAULT_COLOR_MODE_STORAGE_KEY,
    theme: themeFactory,
    cssBaseline = true
}) => {
    const [mode, setMode] = useState<ColorMode>(defaultMode);

    useEffect(() => {
        let stored: string | null = null;
        try {
            stored = window.localStorage.getItem(storageKey);
        } catch {
            // Storage can be unavailable outright (private browsing, a browser
            // set to block site data). That is a reason to fall back to the
            // system preference, not to fail to render a page.
        }
        const prefersDark = typeof window.matchMedia === 'function'
            ? window.matchMedia('(prefers-color-scheme: dark)').matches
            : defaultMode === 'dark';
        setMode(resolveInitialColorMode(stored, prefersDark));
    }, [storageKey, defaultMode]);

    const contextValue = useMemo(
        () => ({
            mode,
            toggleColorMode: () => {
                setMode((previous) => {
                    const next: ColorMode = previous === 'light' ? 'dark' : 'light';
                    try {
                        // Persist the explicit choice so it survives navigation
                        // and return visits.
                        window.localStorage.setItem(storageKey, next);
                    } catch {
                        // Unwritable storage costs the visitor the memory of the
                        // choice, not the choice itself.
                    }
                    return next;
                });
            }
        }),
        [mode, storageKey]
    );

    const theme = useMemo(() => {
        const built = themeFactory ? themeFactory(mode) : {palette: {mode}};
        return isBuiltTheme(built) ? built : createTheme(built);
    }, [mode, themeFactory]);

    return (
        <ColorModeContext.Provider value={contextValue}>
            <ThemeProvider theme={theme}>
                {cssBaseline ? <CssBaseline/> : null}
                {children}
            </ThemeProvider>
        </ColorModeContext.Provider>
    );
};

export interface ColorModeToggleProps {
    'aria-label'?: string;
}

/**
 * The colour-mode switch, wired to the provider. Reads the current mode from the
 * MUI theme rather than from the context value so it stays correct even in an
 * app that supplies its own `ThemeProvider` below this one.
 */
export const ColorModeToggle: React.FC<ColorModeToggleProps> = ({
    'aria-label': ariaLabel = 'Toggle dark mode'
}) => {
    const colorMode = React.useContext(ColorModeContext);
    const theme = useTheme();
    return (
        <Box sx={toggleSwitchBoxStyle}>
            <ColorModeToggleSwitch
                checked={theme.palette.mode === 'dark'}
                onChange={colorMode.toggleColorMode}
                inputProps={{'aria-label': ariaLabel}}
            />
        </Box>
    );
};
