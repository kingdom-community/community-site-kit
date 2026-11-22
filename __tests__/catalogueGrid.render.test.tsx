import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {act, cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import React from 'react';

vi.mock('next/router', () => ({useRouter: () => ({pathname: '/', asPath: '/'})}));

import {
    CATALOGUE_CLOSE_DELAY_MS,
    CATALOGUE_OPEN_DELAY_MS,
    CatalogueGrid,
    TOUCH_ONLY_QUERY,
    type CatalogueDetailsContext
} from '../src/components/CatalogueGrid.js';

interface Item {
    id: string;
    title: string;
    description: string;
}

const ITEMS: Item[] = [
    {id: 'mf', title: 'Medieval Factions', description: 'Nations and war.'},
    {id: 'roam', title: 'Roam', description: 'A survival game.'}
];

const renderDetails = (item: Item, {titleId, descriptionId, inSheet, close}: CatalogueDetailsContext) => (
    <>
        <h3 id={titleId}>{item.title}</h3>
        <p id={descriptionId}>{item.description}</p>
        <a href={`https://example.test/${item.id}`}>{inSheet ? 'Sheet link' : 'Panel link'}</a>
        <button type="button" onClick={close}>Done with {item.title}</button>
    </>
);

const grid = (props: Partial<React.ComponentProps<typeof CatalogueGrid<Item>>> = {}) =>
    render(
        <CatalogueGrid
            items={ITEMS}
            heading="Projects"
            sectionId="projects"
            renderIcon={(item) => <span data-testid={`icon-${item.id}`}/>}
            renderDetails={renderDetails}
            {...props}
        />
    );

const tile = (title: string) =>
    screen.getAllByTestId('catalogue-tile').find((el) => el.textContent === title)!;

const setTouch = (touch: boolean) => {
    window.matchMedia = ((query: string) => ({
        matches: touch && query.includes(TOUCH_ONLY_QUERY.slice(1, -1)),
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false
    })) as unknown as typeof window.matchMedia;
};

beforeEach(() => setTouch(false));
afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

describe('CatalogueGrid', () => {
    it('renders a named section with one tile per item, in the order given', () => {
        grid();
        const section = screen.getByRole('region', {name: 'Projects'});
        expect(section.id).toBe('projects');
        const tiles = within(within(section).getByRole('list')).getAllByTestId('catalogue-tile');
        expect(tiles.map((t) => t.textContent)).toEqual(['Medieval Factions', 'Roam']);
        expect(screen.getByTestId('icon-mf')).toBeTruthy();
    });

    it('renders the toolbar inside the section, and the empty state instead of an empty grid', () => {
        grid({items: [], toolbar: <div>Filters here</div>, empty: <p>Nothing matches.</p>});
        const section = screen.getByRole('region', {name: 'Projects'});
        expect(within(section).getByText('Filters here')).toBeTruthy();
        expect(within(section).getByText('Nothing matches.')).toBeTruthy();
        expect(within(section).queryByRole('list')).toBeNull();
    });

    it('opens a panel after the hover delay, not before, and closes it after the pointer leaves', () => {
        vi.useFakeTimers();
        grid();
        const mf = tile('Medieval Factions');
        fireEvent.mouseEnter(mf.parentElement!);
        act(() => vi.advanceTimersByTime(CATALOGUE_OPEN_DELAY_MS - 1));
        expect(screen.queryByRole('group', {name: 'Medieval Factions'})).toBeNull();
        act(() => vi.advanceTimersByTime(1));
        expect(screen.getByRole('group', {name: 'Medieval Factions'})).toBeTruthy();
        expect(mf.getAttribute('aria-expanded')).toBe('true');
        fireEvent.mouseLeave(mf.parentElement!);
        act(() => vi.advanceTimersByTime(CATALOGUE_CLOSE_DELAY_MS));
        expect(screen.queryByRole('group', {name: 'Medieval Factions'})).toBeNull();
    });

    it('keeps one panel open at a time', () => {
        grid();
        fireEvent.focus(tile('Medieval Factions'));
        fireEvent.focus(tile('Roam'));
        expect(screen.queryByRole('group', {name: 'Medieval Factions'})).toBeNull();
        expect(screen.getByRole('group', {name: 'Roam'})).toBeTruthy();
    });

    it('opens on keyboard focus, and Escape closes it and hands focus back to the tile', () => {
        grid();
        const mf = tile('Medieval Factions');
        act(() => mf.focus());
        const panel = screen.getByRole('group', {name: 'Medieval Factions'});
        fireEvent.keyDown(panel, {key: 'Escape'});
        expect(screen.queryByRole('group', {name: 'Medieval Factions'})).toBeNull();
        expect(document.activeElement).toBe(mf);
    });

    it('toggles a button tile on click, but a click on a panel hover opened keeps it open', () => {
        vi.useFakeTimers();
        grid();
        const roam = tile('Roam');
        fireEvent.pointerDown(roam);
        fireEvent.click(roam);
        expect(screen.getByRole('group', {name: 'Roam'})).toBeTruthy();
        fireEvent.pointerDown(roam);
        fireEvent.click(roam);
        expect(screen.queryByRole('group', {name: 'Roam'})).toBeNull();

        fireEvent.mouseEnter(roam.parentElement!);
        act(() => vi.advanceTimersByTime(CATALOGUE_OPEN_DELAY_MS));
        fireEvent.click(roam);
        expect(screen.getByRole('group', {name: 'Roam'})).toBeTruthy();
    });

    it('makes each tile a link when given getHref, still opening its panel on focus', () => {
        grid({getHref: (item) => `/resources/${item.id}`});
        const mf = screen.getByRole('link', {name: 'Medieval Factions'});
        expect(mf.getAttribute('href')).toBe('/resources/mf');
        fireEvent.focus(mf);
        expect(screen.getByRole('group', {name: 'Medieval Factions'})).toBeTruthy();
    });

    it('mounts a panel only while open by default, and describes no tile', () => {
        grid();
        expect(screen.queryByText('Nations and war.')).toBeNull();
        expect(tile('Medieval Factions').hasAttribute('aria-describedby')).toBe(false);
    });

    it('with keepPanelsMounted, keeps every panel mounted and describes each tile by its description', () => {
        grid({keepPanelsMounted: true});
        const mf = tile('Medieval Factions');
        const description = document.getElementById(mf.getAttribute('aria-describedby')!);
        expect(description?.textContent).toBe('Nations and war.');
        expect(screen.queryByRole('group', {name: 'Medieval Factions'})).toBeNull();
        fireEvent.focus(mf);
        expect(screen.getByRole('group', {name: 'Medieval Factions'})).toBeTruthy();
        fireEvent.blur(mf);
        expect(screen.queryByRole('group', {name: 'Medieval Factions'})).toBeNull();
        expect(screen.getByText('Nations and war.', {selector: 'p'})).toBeTruthy();
    });

    // Two grids on one page listing the same item ids would otherwise mint the
    // same heading and description ids, and the second section and its tiles
    // would take their names from the first grid's elements.
    it('mints its ids from idPrefix, so two grids on one page keep their own names', () => {
        const GAMES: Item[] = [{id: 'mf', title: 'Medieval Factions', description: 'A board game.'}];
        render(
            <>
                <CatalogueGrid
                    items={ITEMS}
                    heading="Projects"
                    sectionId="projects"
                    renderIcon={() => null}
                    renderDetails={renderDetails}
                    keepPanelsMounted
                />
                <CatalogueGrid
                    items={GAMES}
                    heading="Games"
                    sectionId="games"
                    idPrefix="games"
                    renderIcon={() => null}
                    renderDetails={renderDetails}
                    keepPanelsMounted
                />
            </>
        );

        const projects = screen.getByRole('region', {name: 'Projects'});
        const games = screen.getByRole('region', {name: 'Games'});
        expect(projects.getAttribute('aria-labelledby')).toBe('catalogue-heading');
        expect(games.getAttribute('aria-labelledby')).toBe('games-heading');

        const describedBy = (section: HTMLElement) =>
            within(section).getAllByTestId('catalogue-tile')[0]!.getAttribute('aria-describedby');
        expect(describedBy(projects)).toBe('catalogue-description-mf');
        expect(describedBy(games)).toBe('games-description-mf');
        expect(document.getElementById('catalogue-description-mf')?.textContent).toBe('Nations and war.');
        expect(document.getElementById('games-description-mf')?.textContent).toBe('A board game.');
    });

    it('lets the details close their own panel', () => {
        grid();
        fireEvent.focus(tile('Roam'));
        fireEvent.click(screen.getByRole('button', {name: 'Done with Roam'}));
        expect(screen.queryByRole('group', {name: 'Roam'})).toBeNull();
    });

    describe('on a touch-only screen', () => {
        beforeEach(() => setTouch(true));

        it('opens a bottom sheet dialog on tap, with a close button', () => {
            grid();
            const roam = tile('Roam');
            expect(roam.getAttribute('aria-haspopup')).toBe('dialog');
            fireEvent.click(roam);
            const sheet = screen.getByRole('dialog', {name: 'Roam'});
            expect(within(sheet).getByText('Sheet link')).toBeTruthy();
            fireEvent.click(within(sheet).getByRole('button', {name: 'Close Roam'}));
            expect(screen.queryByRole('dialog', {name: 'Roam'})).toBeNull();
        });

        it('hands focus back to the tile once the sheet has closed, from the button or Escape', async () => {
            grid();
            const roam = () => screen.getAllByTestId('catalogue-tile').find((el) => el.textContent === 'Roam')!;
            fireEvent.click(roam());
            fireEvent.click(within(screen.getByRole('dialog', {name: 'Roam'})).getByRole('button', {name: 'Close Roam'}));
            await waitFor(() => expect(document.activeElement).toBe(roam()));

            act(() => (document.activeElement as HTMLElement).blur());
            fireEvent.click(roam());
            fireEvent.keyDown(screen.getByRole('dialog', {name: 'Roam'}), {key: 'Escape'});
            await waitFor(() => expect(screen.queryByRole('dialog', {name: 'Roam'})).toBeNull());
            await waitFor(() => expect(document.activeElement).toBe(roam()));
        });

        it('does not follow a link tile on tap, opening the sheet instead', () => {
            grid({getHref: (item) => `/resources/${item.id}`});
            const link = screen.getByRole('link', {name: 'Roam'});
            const click = new MouseEvent('click', {bubbles: true, cancelable: true});
            act(() => {
                link.dispatchEvent(click);
            });
            expect(click.defaultPrevented).toBe(true);
            expect(screen.getByRole('dialog', {name: 'Roam'})).toBeTruthy();
        });

        it('opens nothing on hover or focus', () => {
            vi.useFakeTimers();
            grid();
            const roam = tile('Roam');
            fireEvent.mouseEnter(roam.parentElement!);
            fireEvent.focus(roam);
            act(() => vi.advanceTimersByTime(CATALOGUE_OPEN_DELAY_MS * 2));
            expect(screen.queryByRole('dialog')).toBeNull();
            expect(screen.queryByRole('group', {name: 'Roam'})).toBeNull();
        });
    });

    describe('with a page-held open item (openId, onOpenChange)', () => {
        // A page as a site would write one: it holds the open id and shows it.
        const Controlled: React.FC<Partial<React.ComponentProps<typeof CatalogueGrid<Item>>>> = (props) => {
            const [openId, setOpenId] = React.useState<string | null>(null);
            return (
                <>
                    <CatalogueGrid
                        items={ITEMS}
                        heading="Projects"
                        renderIcon={() => null}
                        renderDetails={renderDetails}
                        openId={openId}
                        onOpenChange={setOpenId}
                        {...props}
                    />
                    <output data-testid="open-id">{openId ?? 'none'}</output>
                    <button type="button" onClick={() => setOpenId('roam')}>Open Roam from outside</button>
                </>
            );
        };
        const openIdShown = () => screen.getByTestId('open-id').textContent;

        it('reports what opens and closes, and opens what the page sets', () => {
            render(<Controlled/>);
            fireEvent.focus(tile('Medieval Factions'));
            expect(openIdShown()).toBe('mf');
            expect(screen.getByRole('group', {name: 'Medieval Factions'})).toBeTruthy();
            fireEvent.click(screen.getByRole('button', {name: 'Open Roam from outside'}));
            expect(screen.queryByRole('group', {name: 'Medieval Factions'})).toBeNull();
            expect(screen.getByRole('group', {name: 'Roam'})).toBeTruthy();
            fireEvent.click(screen.getByRole('button', {name: 'Done with Roam'}));
            expect(openIdShown()).toBe('none');
        });

        it('opens nothing the page does not set', () => {
            const onOpenChange = vi.fn();
            grid({openId: null, onOpenChange});
            fireEvent.focus(tile('Roam'));
            expect(onOpenChange).toHaveBeenCalledWith('roam');
            expect(screen.queryByRole('group', {name: 'Roam'})).toBeNull();
        });

        it('still reports to onOpenChange when the grid holds the state itself', () => {
            const onOpenChange = vi.fn();
            grid({onOpenChange});
            fireEvent.focus(tile('Roam'));
            expect(screen.getByRole('group', {name: 'Roam'})).toBeTruthy();
            expect(onOpenChange).toHaveBeenLastCalledWith('roam');
            fireEvent.blur(tile('Roam'));
            expect(onOpenChange).toHaveBeenLastCalledWith(null);
        });

        describe("in detailsMode 'external'", () => {
            it('renders no panel; a click selects a tile and marks it pressed, a second click deselects it', () => {
                render(<Controlled detailsMode="external"/>);
                const roam = tile('Roam');
                expect(roam.getAttribute('aria-pressed')).toBe('false');
                expect(roam.hasAttribute('aria-expanded')).toBe(false);
                fireEvent.pointerDown(roam);
                fireEvent.click(roam);
                expect(openIdShown()).toBe('roam');
                expect(roam.getAttribute('aria-pressed')).toBe('true');
                expect(roam.getAttribute('data-open')).toBe('true');
                expect(screen.queryByRole('group', {name: 'Roam'})).toBeNull();
                expect(screen.queryByText('A survival game.')).toBeNull();

                fireEvent.click(tile('Medieval Factions'));
                expect(openIdShown()).toBe('mf');
                expect(roam.getAttribute('aria-pressed')).toBe('false');
                fireEvent.click(tile('Medieval Factions'));
                expect(openIdShown()).toBe('none');
            });

            it('opens nothing on hover or focus, and keeps the selection when the pointer or focus leaves', () => {
                vi.useFakeTimers();
                render(<Controlled detailsMode="external"/>);
                const mf = tile('Medieval Factions');
                fireEvent.mouseEnter(mf.parentElement!);
                fireEvent.focus(mf);
                act(() => vi.advanceTimersByTime(CATALOGUE_OPEN_DELAY_MS * 2));
                expect(openIdShown()).toBe('none');

                fireEvent.click(mf);
                fireEvent.mouseLeave(mf.parentElement!);
                fireEvent.blur(mf);
                fireEvent.click(document.body);
                act(() => vi.advanceTimersByTime(CATALOGUE_CLOSE_DELAY_MS * 2));
                expect(openIdShown()).toBe('mf');
            });

            it('deselects on Escape', () => {
                render(<Controlled detailsMode="external"/>);
                fireEvent.click(tile('Roam'));
                fireEvent.keyDown(tile('Roam'), {key: 'Escape'});
                expect(openIdShown()).toBe('none');
            });

            it('selects a link tile on a plain click instead of following it, marking it current', () => {
                render(<Controlled detailsMode="external" getHref={(item) => `/resources/${item.id}`}/>);
                const link = screen.getByRole('link', {name: 'Roam'});
                const click = new MouseEvent('click', {bubbles: true, cancelable: true});
                act(() => {
                    link.dispatchEvent(click);
                });
                expect(click.defaultPrevented).toBe(true);
                expect(openIdShown()).toBe('roam');
                expect(link.getAttribute('aria-current')).toBe('true');
                expect(screen.getByRole('link', {name: 'Medieval Factions'}).hasAttribute('aria-current')).toBe(false);
            });

            it('lets a modified click on a link tile through, for a new tab', () => {
                render(<Controlled detailsMode="external" getHref={(item) => `/resources/${item.id}`}/>);
                const link = screen.getByRole('link', {name: 'Roam'});
                const click = new MouseEvent('click', {bubbles: true, cancelable: true, ctrlKey: true});
                act(() => {
                    link.dispatchEvent(click);
                });
                expect(openIdShown()).toBe('none');
            });

            it('does not describe tiles by a panel it never renders', () => {
                grid({detailsMode: 'external', keepPanelsMounted: true});
                expect(tile('Roam').hasAttribute('aria-describedby')).toBe(false);
                expect(screen.queryByText('A survival game.')).toBeNull();
            });

            it('keeps the bottom sheet on a touch-only screen, still reporting the open item', () => {
                setTouch(true);
                render(<Controlled detailsMode="external"/>);
                fireEvent.click(tile('Roam'));
                expect(openIdShown()).toBe('roam');
                const sheet = screen.getByRole('dialog', {name: 'Roam'});
                fireEvent.click(within(sheet).getByRole('button', {name: 'Close Roam'}));
                expect(openIdShown()).toBe('none');
            });
        });
    });
});
