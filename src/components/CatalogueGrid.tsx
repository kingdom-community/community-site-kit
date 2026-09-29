// A namespace import, never named ones: see TopBar.tsx and #11.
import * as Mui from '@mui/material';
import CloseIconImport from '@mui/icons-material/Close.js';
import React from 'react';

import {NextLinkComposed} from './NextLinkComposed.js';
import {interopDefault} from '../utils/interopDefault.js';
import {
    catalogueGridStyle,
    cataloguePanelStyle,
    cataloguePopperStyle,
    catalogueSheetCloseStyle,
    catalogueSheetHandleStyle,
    catalogueSheetPaperStyle,
    catalogueTileCaptionStyle,
    catalogueTileIconStyle,
    catalogueTileStyle,
    catalogueTileWrapperStyle,
    visuallyHiddenStyle
} from '../styles/styles.js';

const {Box, ClickAwayListener, IconButton, Paper, Popper, SwipeableDrawer, Typography, useMediaQuery} = Mui;
const CloseIcon = interopDefault(CloseIconImport);

// The icon-grid catalogue a site's home page opens with: one icon per item and
// nothing else. What the old cards carried lives in a details panel that opens
// under a tile on hover or keyboard focus (and, for a button tile, on click).
// A touch screen has no hover, so there a tap opens the same details in a
// bottom sheet instead. The grid owns which one is open, so opening one closes
// the rest.

// A short wait before opening, so sweeping the pointer across the grid does
// not flash a panel under every icon it passes, and a slightly longer one
// before closing, so the pointer can cross the gap into the panel.
export const CATALOGUE_OPEN_DELAY_MS = 120;
export const CATALOGUE_CLOSE_DELAY_MS = 150;

// A device whose only pointer cannot hover: a phone or tablet. False during
// server rendering, so the page is first rendered for a desktop.
export const TOUCH_ONLY_QUERY = '(hover: none)';

export interface CatalogueGridItem {
    id: string;
    title: string;
}

export interface CatalogueDetailsContext {
    // Put this on the details' title, which names the panel or sheet around it.
    titleId: string;
    // Put this on the details' description. With keepPanelsMounted, the tile's
    // aria-describedby points at it.
    descriptionId: string;
    // Whether the details are in the touch bottom sheet rather than the panel.
    inSheet: boolean;
    // Closes the panel or sheet — for an action that changes what is behind
    // it, such as a tag that filters the grid.
    close: () => void;
}

export interface CatalogueGridProps<T extends CatalogueGridItem> {
    items: readonly T[];
    // The icon, drawn into a CATALOGUE_ICON_SIZE box; fill it (width/height 100%).
    renderIcon: (item: T) => React.ReactNode;
    // What a tile reveals: title (with ctx.titleId), description, actions.
    renderDetails: (item: T, ctx: CatalogueDetailsContext) => React.ReactNode;
    // When given, each tile is a link to the item's own page: a click follows
    // it, and hover or focus still opens the panel. A tap on a touch screen
    // opens the sheet instead, so its details should carry a link on.
    // Without it, a tile is a button that toggles its panel.
    getHref?: (item: T) => string;
    // Visually hidden section heading, for screen readers.
    heading: string;
    // Id of the section, for in-page links (e.g. "#projects").
    sectionId?: string;
    // Controls above the grid, inside its section (search and filters).
    toolbar?: React.ReactNode;
    // Shown instead of the grid when there are no items.
    empty?: React.ReactNode;
    // Prefix for the element ids the grid mints; unique per grid on a page.
    idPrefix?: string;
    // Keep every desktop panel mounted (hidden while closed) instead of
    // mounting one on open. For details that hold state worth keeping between
    // openings — a Like and its sign-in notice — and so each tile can be
    // described by its item's description (aria-describedby) at all times.
    keepPanelsMounted?: boolean;
    // Extra sx for the section.
    sx?: Mui.SxProps<Mui.Theme>;
}

interface TileProps<T extends CatalogueGridItem> {
    item: T;
    open: boolean;
    touch: boolean;
    onOpen: (id: string) => void;
    onClose: (id: string) => void;
    renderIcon: CatalogueGridProps<T>['renderIcon'];
    renderDetails: CatalogueGridProps<T>['renderDetails'];
    href?: string;
    idPrefix: string;
    keepMounted: boolean;
}

const CatalogueTile = <T extends CatalogueGridItem>({
    item,
    open,
    touch,
    onOpen,
    onClose,
    renderIcon,
    renderDetails,
    href,
    idPrefix,
    keepMounted
}: TileProps<T>): React.ReactElement => {
    const {id, title} = item;
    const tileRef = React.useRef<HTMLElement | null>(null);
    // The Popper's anchor is kept in state as well as the ref, so the first
    // open after mount has an element to position against.
    const [anchor, setAnchor] = React.useState<HTMLElement | null>(null);
    const setTile = React.useCallback((node: HTMLElement | null) => {
        tileRef.current = node;
        setAnchor(node);
    }, []);
    const wrapperRef = React.useRef<HTMLLIElement>(null);
    const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    // Set on pointerdown so the focus a click brings does not open the panel a
    // moment before the click toggles it shut — and while Escape hands focus
    // back to the tile, so that focus does not reopen what Escape just closed.
    const skipFocusOpen = React.useRef(false);
    // A click only closes a panel it opened itself: when hover has already
    // opened it, the click that follows is the visitor reaching for it.
    const openedByClick = React.useRef(false);
    React.useEffect(() => {
        if (!open) openedByClick.current = false;
    }, [open]);
    const panelId = `${idPrefix}-panel-${id}`;
    const titleId = `${idPrefix}-title-${id}`;
    const descriptionId = `${idPrefix}-description-${id}`;
    const close = () => onClose(id);

    const clearTimer = () => {
        if (timer.current !== undefined) {
            clearTimeout(timer.current);
            timer.current = undefined;
        }
    };
    React.useEffect(() => clearTimer, []);
    const schedule = (action: () => void, delay: number) => {
        clearTimer();
        timer.current = setTimeout(() => {
            timer.current = undefined;
            action();
        }, delay);
    };

    const handleKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === 'Escape' && open) {
            event.stopPropagation();
            clearTimer();
            onClose(id);
            skipFocusOpen.current = true;
            tileRef.current?.focus();
            skipFocusOpen.current = false;
        }
    };
    const handleBlur = (event: React.FocusEvent) => {
        const next = event.relatedTarget as Node | null;
        if (!next || !wrapperRef.current?.contains(next)) {
            skipFocusOpen.current = false;
            clearTimer();
            onClose(id);
        }
    };

    // The sheet is a modal in a portal: focus moving into it is not a blur out
    // of the tile, and the modal already handles Escape, the backdrop and
    // handing focus back — so the desktop handlers stand down on touch.
    const pointerHandlers = touch ? {} : {
        onMouseEnter: () => schedule(() => onOpen(id), CATALOGUE_OPEN_DELAY_MS),
        onMouseLeave: () => schedule(() => onClose(id), CATALOGUE_CLOSE_DELAY_MS),
        onFocus: () => {
            if (!skipFocusOpen.current) onOpen(id);
        },
        onBlur: handleBlur,
        onKeyDown: handleKeyDown
    };

    const handleClick = (event: React.MouseEvent) => {
        skipFocusOpen.current = false;
        clearTimer();
        if (href) {
            // A link follows itself on desktop; on touch the href stays for
            // crawlers and script-less pages, and a tap shows the details.
            if (touch) {
                event.preventDefault();
                onOpen(id);
            }
            return;
        }
        if (open && !touch && openedByClick.current) {
            onClose(id);
        } else {
            openedByClick.current = true;
            onOpen(id);
        }
    };

    const contents = (
        <>
            <Box component="span" className="catalogue-tile-icon" aria-hidden sx={catalogueTileIconStyle}>
                {renderIcon(item)}
            </Box>
            <Box component="span" className="catalogue-tile-caption" sx={catalogueTileCaptionStyle}>
                {title}
            </Box>
        </>
    );
    const tileProps = {
        ref: setTile,
        'data-open': open,
        'data-testid': 'catalogue-tile',
        // A closed, kept-mounted panel is display:none — out of the
        // accessibility tree, while its description still names the tile's.
        'aria-describedby': keepMounted && !touch ? descriptionId : undefined,
        sx: catalogueTileStyle,
        onPointerDown: () => {
            skipFocusOpen.current = true;
        },
        onClick: handleClick
    };

    return (
        <ClickAwayListener onClickAway={() => !touch && open && onClose(id)}>
            <Box ref={wrapperRef} component="li" sx={catalogueTileWrapperStyle} {...pointerHandlers}>
                {href ? (
                    <Box
                        component={NextLinkComposed}
                        to={href}
                        aria-haspopup={touch ? 'dialog' : undefined}
                        {...tileProps}
                    >
                        {contents}
                    </Box>
                ) : (
                    <Box
                        component="button"
                        type="button"
                        aria-expanded={open}
                        aria-haspopup={touch ? 'dialog' : undefined}
                        aria-controls={open ? panelId : undefined}
                        {...tileProps}
                    >
                        {contents}
                    </Box>
                )}
                {touch ? (
                    <SwipeableDrawer
                        anchor="bottom"
                        open={open}
                        onOpen={() => onOpen(id)}
                        onClose={() => onClose(id)}
                        disableSwipeToOpen
                        disableDiscovery
                        // Focus goes back to the tile once the sheet has slid
                        // away. MUI's own restore returns it to whatever had focus
                        // when the sheet opened, and a tap does not reliably focus
                        // the button it lands on (Safari never does), which left
                        // keyboard and screen-reader users at the top of the page.
                        disableRestoreFocus
                        SlideProps={{onExited: () => tileRef.current?.focus({preventScroll: true})}}
                        // Mounted on open: kept mounted, every item's details
                        // would sit hidden in the page, one sheet per tile.
                        ModalProps={{keepMounted: false}}
                        PaperProps={{
                            id: panelId,
                            role: 'dialog',
                            'aria-modal': true,
                            'aria-labelledby': titleId,
                            sx: catalogueSheetPaperStyle
                        } as Mui.PaperProps}
                    >
                        <Box aria-hidden sx={catalogueSheetHandleStyle}/>
                        <IconButton
                            aria-label={`Close ${title}`}
                            onClick={() => onClose(id)}
                            size="small"
                            sx={catalogueSheetCloseStyle}
                        >
                            <CloseIcon fontSize="small"/>
                        </IconButton>
                        {/* The title kept clear of the close button in the corner. */}
                        <Box sx={{'& h3': {pr: 5}}}>
                            {renderDetails(item, {titleId, descriptionId, inSheet: true, close})}
                        </Box>
                    </SwipeableDrawer>
                ) : (
                    <Popper
                        open={open}
                        anchorEl={anchor}
                        placement="bottom"
                        // In DOM order straight after its tile, so Tab moves from
                        // the icon into the panel's actions, and the pointer moving
                        // onto the panel is still inside the wrapper.
                        disablePortal
                        keepMounted={keepMounted}
                        modifiers={[
                            {name: 'flip', enabled: true},
                            // Bounded by the grid rather than the viewport: on a
                            // phone an overflowing panel widens the visual viewport,
                            // and measured against that it never looks out of bounds.
                            {
                                name: 'preventOverflow',
                                options: {boundary: wrapperRef.current?.closest('ul') ?? 'clippingParents', padding: 0}
                            },
                            {name: 'offset', options: {offset: [0, 8]}}
                        ]}
                        sx={cataloguePopperStyle}
                    >
                        <Paper id={panelId} role="group" aria-labelledby={titleId} elevation={8} sx={cataloguePanelStyle}>
                            {renderDetails(item, {titleId, descriptionId, inSheet: false, close})}
                        </Paper>
                    </Popper>
                )}
            </Box>
        </ClickAwayListener>
    );
};

export const CatalogueGrid = <T extends CatalogueGridItem>({
    items,
    renderIcon,
    renderDetails,
    getHref,
    heading,
    sectionId,
    toolbar,
    empty,
    idPrefix = 'catalogue',
    keepPanelsMounted = false,
    sx
}: CatalogueGridProps<T>): React.ReactElement => {
    const [openId, setOpenId] = React.useState<string | null>(null);
    const touch = useMediaQuery(TOUCH_ONLY_QUERY);
    const handleOpen = React.useCallback((id: string) => setOpenId(id), []);
    // Only the tile that is open may close it: a stale close timer from the
    // tile the pointer just left must not shut the panel it moved on to.
    const handleClose = React.useCallback(
        (id: string) => setOpenId((current) => (current === id ? null : current)),
        []
    );
    const headingId = `${idPrefix}-heading`;

    return (
        <Box id={sectionId} component="section" aria-labelledby={headingId} sx={sx}>
            <Typography id={headingId} variant="h2" sx={visuallyHiddenStyle}>
                {heading}
            </Typography>
            {toolbar}
            {items.length === 0 && empty ? empty : (
                <Box component="ul" sx={catalogueGridStyle}>
                    {items.map((item) => (
                        <CatalogueTile
                            key={item.id}
                            item={item}
                            open={openId === item.id}
                            touch={touch}
                            onOpen={handleOpen}
                            onClose={handleClose}
                            renderIcon={renderIcon}
                            renderDetails={renderDetails}
                            href={getHref?.(item)}
                            idPrefix={idPrefix}
                            keepMounted={keepPanelsMounted}
                        />
                    ))}
                </Box>
            )}
        </Box>
    );
};
