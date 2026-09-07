import {afterEach, describe, expect, it, vi} from 'vitest';
import {cleanup, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {ThemeProvider, createTheme} from '@mui/material/styles';

import {
    ColorModeToggleSwitch,
    createColorModeToggleSwitch
} from '../src/components/ColorModeToggleSwitch.js';
import {switchTrackStyle} from '../src/styles/styles.js';

afterEach(cleanup);

const light = createTheme({palette: {mode: 'light'}});
const dark = createTheme({palette: {mode: 'dark'}});

const renderSwitch = (theme: typeof light, props: Record<string, unknown> = {}) => {
    const {container} = render(
        <ThemeProvider theme={theme}>
            <ColorModeToggleSwitch inputProps={{'aria-label': 'Toggle dark mode'}} {...props}/>
        </ThemeProvider>
    );
    return container.querySelector('.MuiSwitch-root') as HTMLElement;
};

// The colours the switch paints live in nested selectors under a generated
// class, which jsdom does not resolve through getComputedStyle. The stylesheet
// Emotion injects is where they are observable — narrowed to the rules
// generated for this element, so MUI's own base Switch rules cannot be mistaken
// for the component's.
//
// Emotion serializes the styled component's rules once per generated class name
// the element carries, so the leading class is stripped and the results are
// de-duplicated: what is left is one entry per rule the component declares.
const rulesFor = (root: HTMLElement): string[] => {
    const ownClasses = Array.from(root.classList).filter((name) => name.startsWith('css-'));
    const css = Array.from(document.querySelectorAll('style[data-emotion]'))
        .map((tag) => tag.textContent ?? '')
        .join('');
    const rules = css
        .split('}')
        .filter((rule) => ownClasses.some((name) => rule.startsWith(`.${name} `)))
        .map((rule) => `${rule.replace(/^\.[\w-]+ /, '')}}`);
    return Array.from(new Set(rules));
};

const backgroundColorOf = (rule: string): string | undefined =>
    rule.match(/background-color:\s*([^;}]+)/)?.[1];

// Rules whose selector targets the named part — both the plain rule and any
// state-qualified one, since `.Mui-checked + .MuiSwitch-track` ends in the same
// part as `.MuiSwitch-track` and is exactly what a same-shade assertion needs to
// see.
const rulesTargeting = (root: HTMLElement, part: string) =>
    rulesFor(root).filter((rule) => (rule.split('{')[0] ?? '').endsWith(part));

describe('ColorModeToggleSwitch', () => {
    it('renders a checkbox under the accessible name it is given', () => {
        renderSwitch(dark, {checked: true, onChange: () => {}});
        expect(screen.getByRole('checkbox', {name: 'Toggle dark mode'})).toBeTruthy();
        expect(screen.getByRole('checkbox') as HTMLInputElement).toHaveProperty('checked', true);
    });

    it('reports a click to its onChange', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        renderSwitch(light, {checked: false, onChange});

        await user.click(screen.getByRole('checkbox', {name: 'Toggle dark mode'}));

        expect(onChange).toHaveBeenCalledTimes(1);
    });

    // The track was written out as the same literal pair in two places, once for
    // the checked rule and once for the unchecked one. Nothing looked wrong
    // while they agreed; the cost was that they had to be kept in agreement by
    // hand, and a track that changed shade as the switch was toggled would have
    // been nobody's intent and nothing's test failure.
    describe('the track', () => {
        it('is painted the same shade checked and unchecked', () => {
            const root = renderSwitch(dark, {checked: true, onChange: () => {}});
            const tracks = rulesTargeting(root, '.MuiSwitch-track');

            // The `.Mui-checked + .MuiSwitch-track` rule and the plain one.
            expect(tracks).toHaveLength(2);
            const [first, second] = tracks.map(backgroundColorOf);
            expect(first).toBeDefined();
            expect(first).toBe(second);
        });

        // Asserted against the exported factory rather than against a literal:
        // this is what fails if the component goes back to writing the colour
        // out itself and the two definitions drift apart.
        it('takes its colour from switchTrackStyle, in both modes', () => {
            const inDark = renderSwitch(dark, {checked: true, onChange: () => {}});
            expect(rulesTargeting(inDark, '.MuiSwitch-track').map(backgroundColorOf)).toEqual([
                switchTrackStyle(dark).backgroundColor,
                switchTrackStyle(dark).backgroundColor
            ]);
            cleanup();

            const inLight = renderSwitch(light, {checked: false, onChange: () => {}});
            expect(rulesTargeting(inLight, '.MuiSwitch-track').map(backgroundColorOf)).toEqual([
                switchTrackStyle(light).backgroundColor,
                switchTrackStyle(light).backgroundColor
            ]);
        });

        it('stays fully opaque, so the default translucent track does not show through', () => {
            const root = renderSwitch(dark, {checked: true, onChange: () => {}});
            rulesTargeting(root, '.MuiSwitch-track').forEach((rule) => {
                expect(rule).toContain('opacity:1');
            });
        });
    });

    describe('the thumb', () => {
        // Black on dark and white on light, which is what the palette's own
        // `common` pair already holds — so the thumb asks for those rather than
        // restating them as literals that a themed palette cannot reach.
        it('takes its colour from the palette, not from a literal', () => {
            const branded = createTheme({
                palette: {mode: 'dark', common: {black: '#101014', white: '#fbfbfe'}}
            });

            const inBranded = renderSwitch(branded, {checked: true, onChange: () => {}});
            expect(rulesTargeting(inBranded, '.MuiSwitch-thumb').map(backgroundColorOf)).toEqual([
                branded.palette.common.black
            ]);
            cleanup();

            const brandedLight = createTheme({
                palette: {mode: 'light', common: {black: '#101014', white: '#fbfbfe'}}
            });
            const inLight = renderSwitch(brandedLight, {checked: false, onChange: () => {}});
            expect(rulesTargeting(inLight, '.MuiSwitch-thumb').map(backgroundColorOf)).toEqual([
                brandedLight.palette.common.white
            ]);
        });

        // Both icons are inlined rather than served out of /public, so a site
        // that copied no asset files in still gets a drawn thumb.
        it('carries the built-in icons as data URIs, so no asset has to be copied in', () => {
            const root = renderSwitch(light, {checked: false, onChange: () => {}});
            const before = rulesTargeting(root, '.MuiSwitch-thumb:before');

            // The resting sun, and the moon under `.Mui-checked`.
            expect(before).toHaveLength(2);
            before.forEach((rule) => expect(rule).toContain('data:image/svg+xml'));
        });
    });

    it('lets a caller supply its own icon pair', () => {
        const Custom = createColorModeToggleSwitch({
            lightIconUrl: '/colormode/sun.svg',
            darkIconUrl: '/colormode/moon.svg'
        });
        const {container} = render(
            <ThemeProvider theme={light}>
                <Custom checked={false} onChange={() => {}}/>
            </ThemeProvider>
        );
        const root = container.querySelector('.MuiSwitch-root') as HTMLElement;
        const icons = rulesFor(root).filter((rule) => rule.includes('background-image'));

        expect(icons.join('')).toContain('/colormode/sun.svg');
        expect(icons.join('')).toContain('/colormode/moon.svg');
    });
});
