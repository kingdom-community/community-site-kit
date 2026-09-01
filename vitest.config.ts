import {defineConfig} from 'vitest/config';

export default defineConfig({
    esbuild: {
        // The components use the automatic JSX runtime, so no test file needs to
        // import React just to render one.
        jsx: 'automatic'
    },
    test: {
        // jsdom rather than node: the nav bars, the colour-mode provider and the
        // toggle switch are all interactive, and their tests click things.
        environment: 'jsdom',
        include: ['__tests__/**/*.test.ts', '__tests__/**/*.test.tsx'],
        globals: false
    }
});
