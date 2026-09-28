import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {act, cleanup, fireEvent, render, screen, within} from '@testing-library/react';

vi.mock('next/router', () => ({useRouter: () => ({pathname: '/', asPath: '/'})}));

import {
    CATALOGUE_CLOSE_DELAY_MS,
    CATALOGUE_OPEN_DELAY_MS,
    CatalogueGrid,
    TOUCH_ONLY_QUERY
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

const renderDetails = (item: Item, {titleId, inSheet}: {titleId: string; inSheet: boolean}) => (
    <>
        <h3 id={titleId}>{item.title}</h3>
        <p>{item.description}</p>
        <a href={`https://example.test/${item.id}`}>{inSheet ? 'Sheet link' : 'Panel link'}</a>
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
});
