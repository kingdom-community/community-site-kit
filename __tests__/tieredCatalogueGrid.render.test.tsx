import {afterEach, describe, expect, it, vi} from 'vitest';
import {cleanup, render, screen, within} from '@testing-library/react';

vi.mock('next/router', () => ({useRouter: () => ({pathname: '/', asPath: '/'})}));

import {TieredCatalogueGrid} from '../src/components/TieredCatalogueGrid.js';
import {groupByTier, type CatalogueTier} from '../src/catalogue.js';

interface Item {
    id: string;
    title: string;
    tier?: string;
}

const TIERS: CatalogueTier[] = [
    {key: 'complete', heading: 'Most complete', blurb: 'Start here.'},
    {key: 'growing', heading: 'Still growing'},
    {key: 'small', heading: 'Small things'}
];

const ITEMS: Item[] = [
    {id: 'b', title: 'Beta', tier: 'small'},
    {id: 'r', title: 'Roam', tier: 'complete'},
    {id: 'a', title: 'Alpha', tier: 'small'},
    {id: 'x', title: 'Mystery', tier: 'nonsense'}
];

const tierOf = (item: Item) => item.tier;

afterEach(cleanup);

describe('groupByTier', () => {
    it('keeps tier order and the given order within a tier, and drops empty tiers', () => {
        expect(groupByTier(ITEMS, TIERS, tierOf).map((g) => [g.tier.key, g.items.map((i) => i.id)])).toEqual([
            ['complete', ['r']],
            ['small', ['b', 'a', 'x']]
        ]);
    });

    it('files an item with no tier, or an unknown one, under the last tier', () => {
        expect(groupByTier([{id: 'n', title: 'N'}], TIERS, tierOf)[0]?.tier.key).toBe('small');
    });

    it('files an item whose tier is null under the last tier too', () => {
        expect(groupByTier([{id: 'n', title: 'N'}], TIERS, () => null)[0]?.tier.key).toBe('small');
    });

    it('is empty with no tiers', () => {
        expect(groupByTier(ITEMS, [], tierOf)).toEqual([]);
    });
});

describe('TieredCatalogueGrid', () => {
    const renderGrid = (items: Item[]) =>
        render(
            <TieredCatalogueGrid
                items={items}
                tiers={TIERS}
                tierOf={tierOf}
                heading="Games"
                sectionId="games"
                renderIcon={() => null}
                renderDetails={(item, {titleId}) => <h3 id={titleId}>{item.title}</h3>}
                toolbar={<div>the toolbar</div>}
                empty={<p>Nothing matches.</p>}
            />
        );

    it('puts one named section per non-empty tier inside the whole, in tier order', () => {
        renderGrid(ITEMS);
        const whole = screen.getByRole('region', {name: 'Games'});
        expect(whole.id).toBe('games');
        expect(within(whole).getByText('the toolbar')).toBeTruthy();
        const tiers = within(whole).getAllByRole('region');
        expect(tiers.map((t) => t.id)).toEqual(['games-complete', 'games-small']);
        expect(within(tiers[0]!).getByText('Start here.')).toBeTruthy();
        expect(within(tiers[1]!).getAllByRole('button').map((b) => b.textContent)).toEqual(['Beta', 'Alpha', 'Mystery']);
        expect(screen.queryByRole('region', {name: 'Still growing'})).toBeNull();
    });

    it('shows the visible tier heading to sighted readers only once for assistive tech', () => {
        renderGrid(ITEMS);
        expect(screen.getAllByRole('heading', {name: 'Most complete'})).toHaveLength(1);
    });

    // Each tier is a CatalogueGrid of its own; without a per-tier id prefix
    // every one would label itself by the same `catalogue-heading` id, and
    // every tier would be announced under the first tier's name.
    it('names each tier by its own heading, with no id repeated across tiers', () => {
        renderGrid(ITEMS);
        expect(screen.getByRole('region', {name: 'Most complete'}).id).toBe('games-complete');
        expect(screen.getByRole('region', {name: 'Small things'}).id).toBe('games-small');
        const ids = Array.from(document.querySelectorAll('[id]'), (element) => element.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('shows `empty`, with the toolbar still there, when no item is left', () => {
        renderGrid([]);
        expect(screen.getByText('Nothing matches.')).toBeTruthy();
        expect(screen.getByText('the toolbar')).toBeTruthy();
    });
});
