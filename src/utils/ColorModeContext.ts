import {createContext} from 'react';

export interface ColorModeContextValue {
    // Flip between light and dark, persisting the new choice.
    toggleColorMode: () => void;
    // The mode currently in effect. Components that only need to render a
    // control can read this instead of reaching for the MUI theme.
    mode: 'light' | 'dark';
}

// Defaults to a no-op so a component rendered outside the provider (a unit test
// rendering one bar in isolation, say) still renders rather than throwing.
export const ColorModeContext = createContext<ColorModeContextValue>({
    toggleColorMode: () => {},
    mode: 'dark'
});
