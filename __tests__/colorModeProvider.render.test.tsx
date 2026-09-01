import React, {useContext} from 'react';
import {renderToString} from 'react-dom/server';
import {useTheme} from '@mui/material';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {cleanup, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {ColorModeProvider, ColorModeToggle} from '../src/components/ColorModeProvider.js';
import {ColorModeContext} from '../src/utils/ColorModeContext.js';

// Reports the mode actually in effect, from the theme rather than from the
// context, so the tests check what a real component would see.
const ModeProbe: React.FC = () => {
    const theme = useTheme();
    const {mode} = useContext(ColorModeContext);
    return <span data-testid="mode">{`${theme.palette.mode}/${mode}`}</span>;
};

// jsdom makes React's server renderer think it is in a browser, so MUI's
// ThemeProvider logs its "useLayoutEffect does nothing on the server" warning
// during the two renderToString tests below. It says nothing about this code —
// quiet it so a real warning would stand out in CI.
const serverRender = (element: React.ReactElement): string => {
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
        return renderToString(element);
    } finally {
        warn.mockRestore();
    }
};

const stubMatchMedia = (prefersDark: boolean) => {
    vi.stubGlobal('matchMedia', (query: string) => ({
        matches: prefersDark && query.includes('dark'),
        media: query,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false
    }));
};

beforeEach(() => {
    window.localStorage.clear();
    stubMatchMedia(false);
});

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

describe('ColorModeProvider', () => {
    // The no-flash property: the markup a server produces must not depend on
    // anything only a browser knows. If the stored choice leaked into render,
    // this would come back 'light' and a real page would repaint after hydration.
    it('renders the stable default on the server, whatever the browser would prefer', () => {
        window.localStorage.setItem('community-site-color-mode', 'light');
        stubMatchMedia(true);

        const html = serverRender(
            <ColorModeProvider cssBaseline={false}>
                <ModeProbe/>
            </ColorModeProvider>
        );

        expect(html).toContain('dark/dark');
    });

    it('renders a caller-chosen default on the server', () => {
        const html = serverRender(
            <ColorModeProvider defaultMode="light" cssBaseline={false}>
                <ModeProbe/>
            </ColorModeProvider>
        );
        expect(html).toContain('light/light');
    });

    it('applies a saved explicit choice once mounted in the browser', () => {
        window.localStorage.setItem('community-site-color-mode', 'light');
        render(
            <ColorModeProvider cssBaseline={false}>
                <ModeProbe/>
            </ColorModeProvider>
        );
        expect(screen.getByTestId('mode').textContent).toBe('light/light');
    });

    it('falls back to the operating system preference when nothing has been chosen', () => {
        stubMatchMedia(true);
        const {unmount} = render(
            <ColorModeProvider defaultMode="light" cssBaseline={false}>
                <ModeProbe/>
            </ColorModeProvider>
        );
        expect(screen.getByTestId('mode').textContent).toBe('dark/dark');
        unmount();

        stubMatchMedia(false);
        render(
            <ColorModeProvider cssBaseline={false}>
                <ModeProbe/>
            </ColorModeProvider>
        );
        expect(screen.getByTestId('mode').textContent).toBe('light/light');
    });

    it('reads and writes a caller-chosen storage key', async () => {
        const user = userEvent.setup();
        window.localStorage.setItem('ember-hollow-mode', 'light');
        render(
            <ColorModeProvider storageKey="ember-hollow-mode" cssBaseline={false}>
                <ModeProbe/>
                <ColorModeToggle/>
            </ColorModeProvider>
        );
        expect(screen.getByTestId('mode').textContent).toBe('light/light');

        await user.click(screen.getByRole('checkbox', {name: 'Toggle dark mode'}));

        expect(screen.getByTestId('mode').textContent).toBe('dark/dark');
        expect(window.localStorage.getItem('ember-hollow-mode')).toBe('dark');
        // The default key is left alone, so two sites on one origin do not fight.
        expect(window.localStorage.getItem('community-site-color-mode')).toBeNull();
    });

    it('flips back and forth, persisting each explicit choice', async () => {
        const user = userEvent.setup();
        render(
            <ColorModeProvider cssBaseline={false}>
                <ModeProbe/>
                <ColorModeToggle/>
            </ColorModeProvider>
        );
        const toggle = screen.getByRole('checkbox', {name: 'Toggle dark mode'});

        await user.click(toggle);
        expect(window.localStorage.getItem('community-site-color-mode')).toBe('dark');
        await user.click(toggle);
        expect(window.localStorage.getItem('community-site-color-mode')).toBe('light');
        expect(screen.getByTestId('mode').textContent).toBe('light/light');
    });

    // Storage can be unavailable outright: a private window, or a browser set to
    // block site data. That costs the visitor the memory of the choice, not the
    // page.
    it('still renders and still toggles when storage throws', async () => {
        const user = userEvent.setup();
        const storage = {
            getItem: () => {
                throw new Error('storage is blocked');
            },
            setItem: () => {
                throw new Error('storage is blocked');
            }
        };
        vi.spyOn(window, 'localStorage', 'get').mockReturnValue(storage as unknown as Storage);

        render(
            <ColorModeProvider cssBaseline={false}>
                <ModeProbe/>
                <ColorModeToggle/>
            </ColorModeProvider>
        );
        expect(screen.getByTestId('mode').textContent).toBe('light/light');

        await user.click(screen.getByRole('checkbox', {name: 'Toggle dark mode'}));

        expect(screen.getByTestId('mode').textContent).toBe('dark/dark');
        vi.restoreAllMocks();
    });

    it('works in a browser with no matchMedia at all', () => {
        vi.stubGlobal('matchMedia', undefined);
        render(
            <ColorModeProvider defaultMode="light" cssBaseline={false}>
                <ModeProbe/>
            </ColorModeProvider>
        );
        expect(screen.getByTestId('mode').textContent).toBe('light/light');
    });

    it("builds the theme from the caller's factory, for both modes", async () => {
        const user = userEvent.setup();
        render(
            <ColorModeProvider
                cssBaseline={false}
                theme={(mode) => ({palette: {mode, primary: {main: mode === 'dark' ? '#7aa2f7' : '#2f5bd8'}}})}
            >
                <PaletteProbe/>
                <ColorModeToggle/>
            </ColorModeProvider>
        );
        expect(screen.getByTestId('primary').textContent).toBe('#2f5bd8');

        await user.click(screen.getByRole('checkbox', {name: 'Toggle dark mode'}));

        expect(screen.getByTestId('primary').textContent).toBe('#7aa2f7');
    });
});

const PaletteProbe: React.FC = () => {
    const theme = useTheme();
    return <span data-testid="primary">{theme.palette.primary.main}</span>;
};
