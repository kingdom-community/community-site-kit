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

// --- Catalogue icon grid -----------------------------------------------------
// The icon-grid home page shared by the sites: bare tiles, no cards or visible
// headings, details in a panel under a tile (desktop) or a bottom sheet (touch).
// Taken from the most-fixed of the three copies it replaces; each comment
// below records the bug its rule exists for.

// Edge of a tile's icon in pixels, per breakpoint. A site's icon fills this box.
export const CATALOGUE_ICON_SIZE = {xs: 56, sm: 64};

// Hides content visually while keeping it in the accessibility tree — the
// grid's section heading, which a screen reader needs and the page does not.
// Pixel values are strings on purpose: in `sx` a bare 1 means 100% for width
// and height, and a bare -1 means one negative spacing unit for margin.
export const visuallyHiddenStyle = {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: 0,
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0 0 0 0)',
    whiteSpace: 'nowrap',
    border: 0
};

// auto-fill packs as many columns as fit, so the grid needs no breakpoint table.
export const catalogueGridStyle = {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'grid',
    gridTemplateColumns: {
        xs: 'repeat(auto-fill, minmax(76px, 1fr))',
        sm: 'repeat(auto-fill, minmax(96px, 1fr))'
    },
    gap: {xs: 2, sm: 3}
};

// Anchor for a tile's panel: the Popper renders in place (disablePortal), so it
// positions against this box.
export const catalogueTileWrapperStyle = {
    position: 'relative',
    display: 'flex',
    justifyContent: 'center',
    minWidth: 0
};

// The tile — a bare button or link holding the icon and a caption. Hover, focus
// and an open panel (data-open) grow the icon slightly and lift the caption to full
// contrast; reduced motion keeps the colour change and drops the scale.
export const catalogueTileStyle = (theme: Theme) => ({
    all: 'unset',
    boxSizing: 'border-box',
    cursor: 'pointer',
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: theme.spacing(1),
    padding: theme.spacing(0.5),
    borderRadius: '14px',
    '& .catalogue-tile-icon': {
        transition: 'transform 0.15s ease'
    },
    '& .catalogue-tile-caption': {
        color: theme.palette.text.secondary,
        transition: 'color 0.15s ease'
    },
    '&:hover .catalogue-tile-icon, &:focus-visible .catalogue-tile-icon, &[data-open="true"] .catalogue-tile-icon': {
        transform: 'scale(1.06)'
    },
    '&:hover .catalogue-tile-caption, &:focus-visible .catalogue-tile-caption, &[data-open="true"] .catalogue-tile-caption': {
        color: theme.palette.text.primary
    },
    '&:focus-visible': {
        outline: `2px solid ${theme.palette.primary.main}`,
        outlineOffset: '2px'
    },
    [REDUCED_MOTION_QUERY]: {
        '& .catalogue-tile-icon, & .catalogue-tile-caption': {transition: 'none'},
        '&:hover .catalogue-tile-icon, &:focus-visible .catalogue-tile-icon, &[data-open="true"] .catalogue-tile-icon': {
            transform: 'none'
        }
    }
});

// The box a site's icon is drawn into.
export const catalogueTileIconStyle = {
    display: 'flex',
    width: CATALOGUE_ICON_SIZE,
    height: CATALOGUE_ICON_SIZE,
    borderRadius: '14px',
    flexShrink: 0
};

// One line, ellipsized, so a long title never makes its row taller; the full
// title is in the panel. On a phone one line cut most titles to a stub, so
// there it wraps to two before clamping.
export const catalogueTileCaptionStyle = {
    fontSize: '0.75rem',
    lineHeight: 1.3,
    textAlign: 'center',
    width: '100%',
    overflow: 'hidden',
    whiteSpace: {xs: 'normal', sm: 'nowrap'},
    textOverflow: {xs: 'clip', sm: 'ellipsis'},
    display: {xs: '-webkit-box', sm: 'block'},
    WebkitLineClamp: {xs: 2, sm: 'unset'},
    WebkitBoxOrient: 'vertical',
    overflowWrap: 'anywhere'
};

// The width sits on the Popper, not the Paper: rendered in place inside a
// narrow grid cell, an unsized Popper shrinks to the cell, Popper.js measures
// that instead of the panel, and its overflow correction never fires — the
// panel ran off the right of a phone screen.
export const cataloguePopperStyle = {
    width: 320,
    maxWidth: 'calc(100vw - 32px)',
    zIndex: 1500
};

export const cataloguePanelStyle = {
    padding: 2
};

// Full width, rounded top, capped so a long description scrolls rather than
// covering the page, and padded clear of the home indicator on notched phones.
export const catalogueSheetPaperStyle = {
    position: 'fixed',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '80vh',
    overflowY: 'auto',
    px: 2,
    pt: 1.5,
    pb: 'calc(16px + env(safe-area-inset-bottom))'
};

// The grab handle: the cue that the sheet swipes down.
export const catalogueSheetHandleStyle = {
    width: 36,
    height: 4,
    borderRadius: 2,
    bgcolor: 'divider',
    mx: 'auto',
    mb: 1.5
};

export const catalogueSheetCloseStyle = {
    position: 'absolute',
    top: 8,
    right: 8
};
