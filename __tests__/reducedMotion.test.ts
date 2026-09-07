import {describe, expect, it} from 'vitest';
import {createTheme} from '@mui/material/styles';

import {
    REDUCED_MOTION_QUERY,
    footerButtonStyle,
    navButtonStyle,
    toggleSwitchBoxStyle,
    versionNumberStyle,
    withoutHoverMotion,
    withoutTransition
} from '../src/styles/styles.js';

type StyleObject = Record<string, unknown>;

const theme = createTheme({palette: {mode: 'dark'}});

// Every animated style the chrome ships. They are listed once and asserted over
// as a set, so a new animated factory added without a reduced-motion override
// shows up here as a missing entry rather than as motion a visitor asked not to
// be shown.
const ANIMATED_STYLES: [string, StyleObject][] = [
    ['navButtonStyle', navButtonStyle(theme)],
    ['footerButtonStyle', footerButtonStyle(theme)],
    ['toggleSwitchBoxStyle', toggleSwitchBoxStyle],
    ['versionNumberStyle', versionNumberStyle(theme)]
];

// The subset that moves on hover, and so has movement to cancel as distinct
// from feedback to keep.
const STYLES_WITH_HOVER_MOTION = ANIMATED_STYLES.filter(
    ([name]) => name !== 'versionNumberStyle'
);

const reducedMotionBlock = (style: StyleObject) =>
    style[REDUCED_MOTION_QUERY] as {transition?: string; '&:hover'?: {transform?: string}} | undefined;

const hoverBlock = (style: StyleObject) => style['&:hover'] as StyleObject | undefined;

describe('the reduced-motion helpers', () => {
    it('names the query once, so a consumer need not restate it', () => {
        expect(REDUCED_MOTION_QUERY).toBe('@media (prefers-reduced-motion: reduce)');
        expect(Object.keys(withoutTransition)).toEqual([REDUCED_MOTION_QUERY]);
        expect(Object.keys(withoutHoverMotion)).toEqual([REDUCED_MOTION_QUERY]);
    });

    // withoutTransition is for a style whose transform is its layout rather than
    // its animation: cancelling that transform would break the component.
    it('cancels only the transition, where the transform is load-bearing', () => {
        expect(withoutTransition[REDUCED_MOTION_QUERY]).toEqual({transition: 'none'});
    });

    it('cancels the hover movement as well, where the transform is the animation', () => {
        expect(withoutHoverMotion[REDUCED_MOTION_QUERY].transition).toBe('none');
        expect(withoutHoverMotion[REDUCED_MOTION_QUERY]['&:hover'].transform).toBe('none');
    });
});

describe('reduced-motion overrides', () => {
    it.each(ANIMATED_STYLES)('%s stops transitioning under reduced motion', (_name, style) => {
        expect(reducedMotionBlock(style)?.transition).toBe('none');
    });

    it.each(STYLES_WITH_HOVER_MOTION)('%s cancels its hover movement under reduced motion', (_name, style) => {
        expect(reducedMotionBlock(style)?.['&:hover']?.transform).toBe('none');
    });

    // The override and the rule it overrides carry the same specificity, so it
    // only wins while Emotion serializes it later — and Emotion serializes in
    // key insertion order. A factory that grew another key after the media query
    // would still pass the assertions above while having no effect in a browser.
    it.each(ANIMATED_STYLES)('%s declares the reduced-motion block last', (_name, style) => {
        const keys = Object.keys(style);
        expect(keys[keys.length - 1]).toBe(REDUCED_MOTION_QUERY);
    });

    // Only the movement is dropped. The colour and shadow changes are the
    // hover's feedback rather than its motion, and removing them would cost the
    // affordance without benefiting anyone.
    it.each(STYLES_WITH_HOVER_MOTION)('%s keeps its hover feedback outside the media query', (_name, style) => {
        const hover = hoverBlock(style);
        expect(hover?.transform).toBeDefined();
        expect(hover?.transform).not.toBe('none');
    });
});
