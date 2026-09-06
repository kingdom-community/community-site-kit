import {describe, expect, it} from 'vitest';
import {createTheme} from '@mui/material/styles';

import {
    appBarStyle,
    bottomAppBarStyle,
    brandNameStyle,
    containerPaddingStyle,
    flexContainerStyle,
    footerButtonStyle,
    heroBoxStyle,
    heroTitleStyle,
    navButtonStyle,
    navDrawerDividerStyle,
    navDrawerPaperStyle,
    navDrawerSectionLabelStyle,
    pageStyle,
    panelStyle,
    sectionHeaderStyle,
    toggleSwitchBoxStyle,
    toolbarStyle,
    versionNumberStyle
} from '../src/styles/styles.js';

// Two palettes rather than the default theme, so an assertion that a factory
// reads the palette cannot pass by coincidentally matching a MUI default.
const light = createTheme({palette: {mode: 'light', primary: {main: '#2f5bd8'}}});
const dark = createTheme({palette: {mode: 'dark', primary: {main: '#7aa2f7'}}});

describe('pageStyle', () => {
    it('fills the viewport in the themed background colour', () => {
        expect(pageStyle(light).backgroundColor).toBe(light.palette.background.default);
        expect(pageStyle(dark).backgroundColor).toBe(dark.palette.background.default);
        expect(pageStyle(light).minHeight).toBe('100vh');
    });

    it('stacks its children in a column so a short page still pushes the footer down', () => {
        expect(pageStyle(light).display).toBe('flex');
        expect(pageStyle(light).flexDirection).toBe('column');
        expect(pageStyle(light).flexGrow).toBe(1);
    });
});

describe('appBarStyle', () => {
    it('uses the primary colour in light mode and the paper surface in dark', () => {
        expect(appBarStyle(light).backgroundColor).toBe(light.palette.primary.main);
        expect(appBarStyle(dark).backgroundColor).toBe(dark.palette.background.paper);
    });

    // MUI paints an elevation overlay gradient on a dark app bar; the chrome
    // wants one flat surface, so the factory turns it off in both modes.
    it('suppresses the elevation gradient in both modes', () => {
        expect(appBarStyle(light).backgroundImage).toBe('none');
        expect(appBarStyle(dark).backgroundImage).toBe('none');
    });
});

describe('bottomAppBarStyle', () => {
    it('keeps the top bar surface and pins itself to the bottom of the page', () => {
        expect(bottomAppBarStyle(light).backgroundColor).toBe(appBarStyle(light).backgroundColor);
        expect(bottomAppBarStyle(dark).backgroundColor).toBe(appBarStyle(dark).backgroundColor);
        expect(bottomAppBarStyle(light).top).toBe('auto');
        expect(bottomAppBarStyle(light).bottom).toBe(0);
        expect(bottomAppBarStyle(light).marginTop).toBe('auto');
    });

    it('draws its hairline in whichever direction the palette can see it', () => {
        expect(bottomAppBarStyle(light).borderTop).toBe('1px solid rgba(0,0,0,0.12)');
        expect(bottomAppBarStyle(dark).borderTop).toBe('1px solid rgba(255,255,255,0.12)');
    });
});

describe('navButtonStyle', () => {
    it('inherits the bar colour rather than choosing one of its own', () => {
        expect(navButtonStyle(light).color).toBe('inherit');
        expect(navButtonStyle(light).marginX).toBe(light.spacing(0.5));
    });

    it('washes the hover state dark on light and light on dark', () => {
        expect(navButtonStyle(light)['&:hover'].backgroundColor).toBe('rgba(0,0,0,0.05)');
        expect(navButtonStyle(dark)['&:hover'].backgroundColor).toBe('rgba(255,255,255,0.1)');
        expect(navButtonStyle(light)['&:hover'].transform).toBe('translateY(-2px)');
    });
});

describe('footerButtonStyle', () => {
    // The footer buttons are the nav buttons with more room around them; if the
    // two ever diverge in anything else, the chrome stops looking like one bar.
    it('widens the margin and changes nothing else about a nav button', () => {
        const nav = navButtonStyle(light);
        const footer = footerButtonStyle(light);

        expect(footer.marginX).toBe(light.spacing(1));
        expect(footer.marginX).not.toBe(nav.marginX);
        expect(footer.color).toBe(nav.color);
        expect(footer.transition).toBe(nav.transition);
        expect(footer['&:hover']).toEqual(nav['&:hover']);
    });
});

describe('toolbarStyle', () => {
    it('spreads its contents and wraps them by default', () => {
        expect(toolbarStyle(light).display).toBe('flex');
        expect(toolbarStyle(light).justifyContent).toBe('space-between');
        expect(toolbarStyle(light).flexWrap).toBe('wrap');
        expect(toolbarStyle(light).paddingY).toBe(light.spacing(0.5));
    });

    it('honours a caller-chosen layout', () => {
        const custom = toolbarStyle(light, {justifyContent: 'flex-end', flexWrap: 'nowrap'});
        expect(custom.justifyContent).toBe('flex-end');
        expect(custom.flexWrap).toBe('nowrap');
    });
});

describe('flexContainerStyle', () => {
    it('centres and wraps with a two-step gap by default', () => {
        expect(flexContainerStyle(light).alignItems).toBe('center');
        expect(flexContainerStyle(light).flexWrap).toBe('wrap');
        expect(flexContainerStyle(light).gap).toBe(light.spacing(2));
    });

    // `gap` is defaulted with `??`, not `||`, so a deliberate zero survives —
    // asking for no gap at all must not silently return the default gap.
    it('keeps a caller-chosen gap of zero', () => {
        const custom = flexContainerStyle(light, {gap: 0, alignItems: 'flex-start', flexWrap: 'nowrap'});
        expect(custom.gap).toBe(light.spacing(0));
        expect(custom.gap).not.toBe(light.spacing(2));
        expect(custom.alignItems).toBe('flex-start');
        expect(custom.flexWrap).toBe('nowrap');
    });
});

describe('sectionHeaderStyle', () => {
    it('accents the heading with a bar in the palette primary colour', () => {
        expect(sectionHeaderStyle(light)['&::after'].backgroundColor).toBe(light.palette.primary.main);
        expect(sectionHeaderStyle(dark)['&::after'].backgroundColor).toBe(dark.palette.primary.main);
        expect(sectionHeaderStyle(light)['&::after'].content).toBe('""');
        expect(sectionHeaderStyle(light).marginBottom).toBe(light.spacing(3));
    });
});

describe('navDrawerPaperStyle', () => {
    it('paints the drawer in the app bar colour, so opening it reads as the bar expanding', () => {
        expect(navDrawerPaperStyle(light).backgroundColor).toBe(appBarStyle(light).backgroundColor);
        expect(navDrawerPaperStyle(dark).backgroundColor).toBe(appBarStyle(dark).backgroundColor);
        expect(navDrawerPaperStyle(light).width).toBe(260);
    });

    it('takes the text colour that stays legible on that surface', () => {
        expect(navDrawerPaperStyle(light).color).toBe(light.palette.primary.contrastText);
        expect(navDrawerPaperStyle(dark).color).toBe(dark.palette.text.primary);
    });
});

describe('versionNumberStyle', () => {
    it('sets a monospace chip padded and rounded from the theme', () => {
        expect(versionNumberStyle(light).fontFamily).toBe('monospace');
        expect(versionNumberStyle(light).padding).toBe(`${light.spacing(0.5)} ${light.spacing(2)}`);
        expect(versionNumberStyle(light).borderRadius).toBe(light.shape.borderRadius);
        expect(versionNumberStyle(light).fontWeight).toBe(light.typography.fontWeightMedium);
    });

    it('takes the same palette-aware wash as the nav buttons', () => {
        expect(versionNumberStyle(light).backgroundColor).toBe(navButtonStyle(light)['&:hover'].backgroundColor);
        expect(versionNumberStyle(dark).backgroundColor).toBe(navButtonStyle(dark)['&:hover'].backgroundColor);
    });
});

describe('the plain sx objects', () => {
    it('grows the toggle switch on hover without claiming flex space', () => {
        expect(toggleSwitchBoxStyle.flexGrow).toBe(0);
        expect(toggleSwitchBoxStyle['&:hover'].transform).toBe('scale(1.1)');
    });

    // The drawer surface is the app bar colour in both palette modes, so its
    // divider is a light line in both — it deliberately does not follow the mode.
    it('draws the drawer divider light in both modes', () => {
        expect(navDrawerDividerStyle.borderColor).toBe('rgba(255,255,255,0.12)');
    });
});

describe('the spacing factories', () => {
    // Against a theme with a non-default spacing scale, a factory that had
    // hardcoded pixels instead of asking the theme would fail here.
    it('derive every gap from the theme scale rather than a fixed pixel count', () => {
        const wide = createTheme({spacing: 16});

        expect(containerPaddingStyle(wide).paddingY).toBe(wide.spacing(4));
        expect(heroBoxStyle(wide).paddingTop).toBe(wide.spacing(8));
        expect(heroBoxStyle(wide).paddingBottom).toBe(wide.spacing(4));
        expect(heroTitleStyle(wide).marginBottom).toBe(wide.spacing(2));
        expect(brandNameStyle(wide).marginRight).toBe(wide.spacing(2));
        expect(panelStyle(wide).padding).toBe(wide.spacing(3));
        expect(panelStyle(wide).gap).toBe(wide.spacing(1));
        expect(navDrawerSectionLabelStyle(wide).paddingX).toBe(wide.spacing(2));
        expect(navDrawerSectionLabelStyle(wide).paddingTop).toBe(wide.spacing(2));
    });

    it('lets a panel stretch to the height of its row', () => {
        expect(panelStyle(light).height).toBe('100%');
        expect(panelStyle(light).display).toBe('flex');
        expect(panelStyle(light).flexDirection).toBe('column');
    });
});
