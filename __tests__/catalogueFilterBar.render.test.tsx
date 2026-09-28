import {afterEach, describe, expect, it} from 'vitest';
import {cleanup, fireEvent, render, screen, within} from '@testing-library/react';
import React from 'react';

import {CatalogueFilterBar} from '../src/components/CatalogueFilterBar.js';
import {
    compareTitles,
    filterCatalogue,
    type CatalogueFacet,
    type CatalogueQuery,
    type CatalogueSortOption
} from '../src/utils/catalogue.js';

interface Item {
    id: string;
    title: string;
    description: string;
    category: string;
    tech: string[];
}

const ITEMS: Item[] = [
    {id: 'a', title: 'Alpha', description: 'First.', category: 'Games', tech: ['Python']},
    {id: 'b', title: 'Beta', description: 'Second.', category: 'Libraries', tech: ['Java', 'Kotlin']},
    {id: 'c', title: 'Gamma', description: 'Third.', category: 'Games', tech: ['Java']}
];

const category: CatalogueFacet<Item> = {key: 'category', label: 'Category', values: (i) => i.category};
const tech: CatalogueFacet<Item> = {key: 'tech', label: 'Technology', values: (i) => i.tech};
const SORTS: CatalogueSortOption<Item>[] = [
    {key: 'title', label: 'A–Z', compare: compareTitles},
    {key: 'reverse', label: 'Z–A', compare: (a, b) => compareTitles(b, a)}
];

// A page as a site would write one: it owns the state and runs the helpers.
const Page: React.FC<{initial?: CatalogueQuery}> = ({initial = {}}) => {
    const [query, setQuery] = React.useState<CatalogueQuery>(initial);
    const [sortKey, setSortKey] = React.useState('title');
    const shown = filterCatalogue(ITEMS, [category, tech], query);
    return (
        <>
            <CatalogueFilterBar
                items={ITEMS}
                shownCount={shown.length}
                noun="projects"
                facets={[{facet: category, display: 'chips'}, {facet: tech, display: 'menu'}]}
                query={query}
                onQueryChange={setQuery}
                sortOptions={SORTS}
                sortKey={sortKey}
                onSortChange={setSortKey}
            />
            <ul data-testid="shown">{shown.map((i) => <li key={i.id}>{i.title}</li>)}</ul>
            <output data-testid="sort">{sortKey}</output>
        </>
    );
};

const shown = () => within(screen.getByTestId('shown')).queryAllByRole('listitem').map((li) => li.textContent);
const toggle = () => screen.getByRole('button', {name: /search & filter/i});

afterEach(cleanup);

describe('CatalogueFilterBar', () => {
    it('starts folded, says nothing while nothing is filtered, and unfolds on request', () => {
        render(<Page/>);
        expect(toggle().getAttribute('aria-expanded')).toBe('false');
        expect(screen.queryByTestId('filter-summary')).toBeNull();
        fireEvent.click(toggle());
        expect(toggle().getAttribute('aria-expanded')).toBe('true');
    });

    it('unfolds by itself when a filter is already active', () => {
        render(<Page initial={{facets: {category: 'Games'}}}/>);
        expect(toggle().getAttribute('aria-expanded')).toBe('true');
        expect(screen.getByTestId('filter-summary').textContent).toBe('Showing 2 of 3 projects');
    });

    it('searches, and clears the search from its own button', () => {
        render(<Page/>);
        fireEvent.click(toggle());
        fireEvent.change(screen.getByRole('textbox', {name: 'Search projects'}), {target: {value: 'third'}});
        expect(shown()).toEqual(['Gamma']);
        fireEvent.click(screen.getByRole('button', {name: 'Clear search'}));
        expect(shown()).toHaveLength(3);
    });

    it('offers one chip per value in use plus "Any", and a second click on a chip clears it', () => {
        render(<Page/>);
        fireEvent.click(toggle());
        const chips = within(screen.getByRole('group', {name: 'Filter by category'})).getAllByRole('button');
        expect(chips.map((c) => c.textContent)).toEqual(['Any category', 'Games', 'Libraries']);
        fireEvent.click(chips[2]!);
        expect(shown()).toEqual(['Beta']);
        expect(chips[2]!.getAttribute('aria-pressed')).toBe('true');
        fireEvent.click(chips[2]!);
        expect(shown()).toHaveLength(3);
    });

    it('filters from a menu facet', () => {
        render(<Page/>);
        fireEvent.click(toggle());
        fireEvent.mouseDown(within(screen.getByTestId('facet-tech')).getByRole('combobox'));
        const options = within(screen.getByRole('listbox')).getAllByRole('option').map((o) => o.textContent);
        expect(options).toEqual(['Any technology', 'Java', 'Kotlin', 'Python']);
        fireEvent.click(screen.getByRole('option', {name: 'Java'}));
        expect(shown()).toEqual(['Beta', 'Gamma']);
    });

    it('changes the sort order from its toggle', () => {
        render(<Page/>);
        fireEvent.click(toggle());
        fireEvent.click(screen.getByRole('button', {name: 'Z–A'}));
        expect(screen.getByTestId('sort').textContent).toBe('reverse');
    });
});
