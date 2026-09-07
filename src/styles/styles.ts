import type {Theme} from '@mui/material/styles';

// Shared `sx` factories for the site chrome: layout and chrome live here so a
// page file is about what it says, not how it looks, and so light/dark decisions
// are made in one place rather than per component. Everything is a function of
// the MUI theme, so a site restyles all of it by changing its own palette.

// Media query matching a visitor who has asked their operating system to reduce
// motion. Exported so a consumer writing its own animated `sx` can honour the
// same preference without restating the query string, and so the tests can
// assert the factories below honour it.
export const REDUCED_MOTION_QUERY = '@media (prefers-reduced-motion: reduce)';

// Cancels a transition for reduced-motion visitors, leaving the element's
// resting and active positions alone. For a style whose transform *is* the
// layout — the skip link parked off-screen, say — dropping the transform would
// break the component rather than calm it; only the travel between the two
// states is the motion.
//
// Spread this **last** into a style object: Emotion serializes keys in
// insertion order, and a media query carrying the same specificity as the rule
// it overrides only wins while it comes later in the generated stylesheet.
export const withoutTransition = {
    [REDUCED_MOTION_QUERY]: {
        transition: 'none'
    }
};

// Cancels a hover effect's movement for reduced-motion visitors, leaving the
// colour and shadow feedback of that same hover intact — those are feedback
// rather than motion, and dropping them would cost the affordance without
// benefiting anyone. Spread last, for the reason given above.
export const withoutHoverMotion = {
    [REDUCED_MOTION_QUERY]: {
        transition: 'none',
        '&:hover': {transform: 'none'}
    }
};

const commonTransition = {
    transition: 'all 0.3s ease'
};

// A subtle hover wash that adapts to the palette: 5% black in light mode, 10%
// white in dark.
const commonHoverBg = (theme: Theme) => ({
    backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'
});

// Main page layout: fills the viewport in the themed background colour, so the
// area below short pages is the page's colour rather than the browser's, and
// pushes the footer to the bottom.
export const pageStyle = (theme: Theme) => ({
    flexGrow: 1,
    backgroundColor: theme.palette.background.default,
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column'
});

// Section headers: heading text in the standard text colour with a short
// primary-coloured accent bar underneath.
export const sectionHeaderStyle = (theme: Theme) => ({
    fontWeight: 700,
    letterSpacing: '-0.01em',
    display: 'inline-block',
    marginBottom: theme.spacing(3),
    '&::after': {
        content: '""',
        display: 'block',
        width: '44px',
        height: '3px',
        marginTop: theme.spacing(1),
        borderRadius: '2px',
        backgroundColor: theme.palette.primary.main
    }
});

export const containerPaddingStyle = (theme: Theme) => ({
    paddingY: theme.spacing(4)
});

// App bar surface: solid, and dark enough in light mode that the white contrast
// text on it stays legible.
export const appBarStyle = (theme: Theme) => ({
    backgroundImage: 'none',
    backgroundColor: theme.palette.mode === 'dark' ? theme.palette.background.paper : theme.palette.primary.main
});

export const bottomAppBarStyle = (theme: Theme) => ({
    ...appBarStyle(theme),
    top: 'auto',
    bottom: 0,
    marginTop: 'auto',
    borderTop: `1px solid ${theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'}`
});

export const toolbarStyle = (theme: Theme, options?: {justifyContent?: string; flexWrap?: string}) => ({
    paddingY: theme.spacing(0.5),
    display: 'flex',
    justifyContent: options?.justifyContent || 'space-between',
    flexWrap: options?.flexWrap || 'wrap'
});

export const navButtonStyle = (theme: Theme) => ({
    color: 'inherit',
    marginX: theme.spacing(0.5),
    ...commonTransition,
    '&:hover': {
        transform: 'translateY(-2px)',
        ...commonHoverBg(theme)
    },
    ...withoutHoverMotion
});

export const footerButtonStyle = (theme: Theme) => ({
    ...navButtonStyle(theme),
    marginX: theme.spacing(1)
});

// The brand wordmark in the top bar. `inline-block` rather than `inline`: the
// margin and the box model of an inline box are the text's, so a caller styling
// the wordmark — spacing it, sizing it, lifting it on hover — would find half of
// what it wrote ignored. Every site in the fleet that renders this wordmark
// overrides the value at the call site to get a block box; the helper is where
// that belongs.
export const brandNameStyle = (theme: Theme) => ({
    display: 'inline-block',
    marginRight: theme.spacing(2),
    fontWeight: 700,
    letterSpacing: '-0.01em',
    color: 'inherit'
});

// Track greys for the colour-mode switch, carried over from MUI's iOS-style
// switch demo that ColorModeToggleSwitch is built on. They are not brand
// colours and have no counterpart in a palette, so they are named here rather
// than written out at each rule that needs them.
export const SWITCH_TRACK_DARK = '#8796A5';
export const SWITCH_TRACK_LIGHT = '#aab4be';

// Track of the colour-mode switch. Shared by the checked and the unchecked rule
// in ColorModeToggleSwitch, so the track cannot change shade as the switch is
// toggled — which is what writing the pair out twice invites.
export const switchTrackStyle = (theme: Theme) => ({
    opacity: 1,
    backgroundColor: theme.palette.mode === 'dark' ? SWITCH_TRACK_DARK : SWITCH_TRACK_LIGHT
});

export const toggleSwitchBoxStyle = {
    flexGrow: 0,
    ...commonTransition,
    '&:hover': {transform: 'scale(1.1)'},
    ...withoutHoverMotion
};

export const versionNumberStyle = (theme: Theme) => ({
    display: 'inline-flex',
    alignItems: 'center',
    padding: `${theme.spacing(0.5)} ${theme.spacing(2)}`,
    borderRadius: theme.shape.borderRadius,
    ...commonHoverBg(theme),
    fontFamily: 'monospace',
    fontWeight: theme.typography.fontWeightMedium,
    ...commonTransition,
    ...withoutHoverMotion
});

export const flexContainerStyle = (theme: Theme, options?: {
    gap?: number;
    alignItems?: string;
    flexWrap?: string;
}) => ({
    display: 'flex',
    alignItems: options?.alignItems || 'center',
    gap: theme.spacing(options?.gap ?? 2),
    flexWrap: options?.flexWrap || 'wrap'
});

// The mobile navigation drawer surface. Painted in the app bar's colour rather
// than the default paper background, so opening the menu reads as the top bar
// expanding rather than as a different surface arriving.
export const navDrawerPaperStyle = (theme: Theme) => ({
    width: 260,
    backgroundColor: theme.palette.mode === 'dark' ? theme.palette.background.paper : theme.palette.primary.main,
    color: theme.palette.mode === 'dark' ? theme.palette.text.primary : theme.palette.primary.contrastText
});

// Section label inside the mobile navigation drawer.
export const navDrawerSectionLabelStyle = (theme: Theme) => ({
    paddingX: theme.spacing(2),
    paddingTop: theme.spacing(2),
    opacity: 0.7,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    fontSize: '0.75rem'
});

// Divider between sections in the mobile navigation drawer. Always a light line,
// since the drawer surface is the app bar colour rather than the default paper
// background in both palette modes.
export const navDrawerDividerStyle = {
    borderColor: 'rgba(255,255,255,0.12)'
};

// The hero: the pitch, and the first thing a visitor reads.
export const heroBoxStyle = (theme: Theme) => ({
    paddingTop: theme.spacing(8),
    paddingBottom: theme.spacing(4)
});

export const heroTitleStyle = (theme: Theme) => ({
    fontWeight: 700,
    letterSpacing: '-0.02em',
    marginBottom: theme.spacing(2)
});

// Flat card surface: a hairline border rather than heavy MUI elevation, which
// reads as muddy in dark mode.
export const panelStyle = (theme: Theme) => ({
    padding: theme.spacing(3),
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1)
});
