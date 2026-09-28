import {describe, expect, it} from 'vitest';

import {
    compareDottedVersions,
    compareDottedVersionsDescending,
    descendingBy,
    facetValueCounts,
    facetValues,
    filterCatalogue,
    isCatalogueQueryActive,
    relatedItems,
    sortCatalogue,
    type CatalogueFacet
} from '../src/catalogue.js';

interface Project {
    id: string;
    title: string;
    description: string;
    category?: string;
    tags?: string[] | null;
    testedVersions?: string[] | null;
    servers?: number | null;
}

const projects: Project[] = [
    {id: 'mf', title: 'Medieval Factions', description: 'Nations and war.', category: 'Minecraft', tags: ['factions', 'pvp'], testedVersions: ['1.21.11', '26.2'], servers: 120},
    {id: 'cur', title: 'Currencies', description: 'Coins for factions.', category: 'Minecraft', tags: ['economy', 'factions'], testedVersions: ['1.19.4'], servers: 8},
    {id: 'fiefs', title: 'Fiefs', description: 'Vassal lands.', category: 'Minecraft', tags: ['factions'], testedVersions: null, servers: null},
    {id: 'roam', title: 'roam', description: 'A survival game.', category: 'Games', tags: null, servers: null},
    {id: 'apex', title: 'Apex', description: 'An ecosystem simulator.', category: 'Simulations', tags: ['ecology']}
];

const category: CatalogueFacet<Project> = {key: 'category', label: 'Category', values: (p) => p.category};
const tag: CatalogueFacet<Project> = {key: 'tag', label: 'Tag', values: (p) => p.tags};
const version: CatalogueFacet<Project> = {
    key: 'version',
    label: 'Minecraft version',
    values: (p) => p.testedVersions,
    searchable: false,
    compare: compareDottedVersionsDescending
};
const facets = [category, tag, version];

const ids = (items: Project[]) => items.map((p) => p.id);

describe('filterCatalogue', () => {
    it('returns everything, in the input order, for an empty query', () => {
        expect(ids(filterCatalogue(projects, facets, {}))).toEqual(['mf', 'cur', 'fiefs', 'roam', 'apex']);
        expect(ids(filterCatalogue(projects, facets, {text: '   ', facets: {tag: null}}))).toHaveLength(5);
    });

    it('matches the search text in the title, the description or a searchable facet value, ignoring case', () => {
        expect(ids(filterCatalogue(projects, facets, {text: 'FIEF'}))).toEqual(['fiefs']);
        expect(ids(filterCatalogue(projects, facets, {text: 'ecosystem'}))).toEqual(['apex']);
        expect(ids(filterCatalogue(projects, facets, {text: 'econ'}))).toEqual(['cur']);
        expect(ids(filterCatalogue(projects, facets, {text: 'games'}))).toEqual(['roam']);
    });

    it('does not match the search text against a facet marked unsearchable', () => {
        expect(ids(filterCatalogue(projects, facets, {text: '1.19'}))).toEqual([]);
    });

    it('keeps only items carrying the selected value, whether the facet reads one value or several', () => {
        expect(ids(filterCatalogue(projects, facets, {facets: {category: 'Minecraft'}}))).toEqual(['mf', 'cur', 'fiefs']);
        expect(ids(filterCatalogue(projects, facets, {facets: {tag: 'economy'}}))).toEqual(['cur']);
    });

    it('excludes an item with no value for a selected facet rather than assuming a match', () => {
        expect(ids(filterCatalogue(projects, facets, {facets: {version: '26.2'}}))).toEqual(['mf']);
    });

    it('composes the search text with every selected facet', () => {
        expect(ids(filterCatalogue(projects, facets, {text: 'coins', facets: {category: 'Minecraft', tag: 'factions'}}))).toEqual(['cur']);
        expect(ids(filterCatalogue(projects, facets, {text: 'coins', facets: {tag: 'pvp'}}))).toEqual([]);
    });

    it('ignores a selection for a key no facet declares', () => {
        expect(filterCatalogue(projects, facets, {facets: {status: 'Active'}})).toHaveLength(5);
    });
});

describe('isCatalogueQueryActive', () => {
    it('is false for no text and no selection, and true for either', () => {
        expect(isCatalogueQueryActive({})).toBe(false);
        expect(isCatalogueQueryActive({text: '  ', facets: {tag: null, category: undefined}})).toBe(false);
        expect(isCatalogueQueryActive({text: 'x'})).toBe(true);
        expect(isCatalogueQueryActive({facets: {tag: 'pvp'}})).toBe(true);
    });
});

describe('facetValueCounts and facetValues', () => {
    it('offers only values in use, alphabetically by default, with a count of items', () => {
        expect(facetValueCounts(projects, category)).toEqual([
            {value: 'Games', count: 1},
            {value: 'Minecraft', count: 3},
            {value: 'Simulations', count: 1}
        ]);
        expect(facetValues(projects, tag)).toEqual(['ecology', 'economy', 'factions', 'pvp']);
    });

    it('uses the facet order when one is given', () => {
        expect(facetValues(projects, version)).toEqual(['26.2', '1.21.11', '1.19.4']);
    });

    it('counts an item once for a value it lists twice', () => {
        const dup: Project[] = [{id: 'x', title: 'X', description: '', tags: ['a', 'a']}];
        expect(facetValueCounts(dup, tag)).toEqual([{value: 'a', count: 1}]);
    });
});

describe('sortCatalogue and descendingBy', () => {
    it('puts larger numbers first, unknown numbers last, and breaks ties by title', () => {
        const byServers = {compare: descendingBy<Project>((p) => p.servers)};
        expect(ids(sortCatalogue(projects, byServers))).toEqual(['mf', 'cur', 'apex', 'fiefs', 'roam']);
    });

    it('treats a zero as a number, not as unknown', () => {
        const items: Project[] = [
            {id: 'b', title: 'B', description: '', servers: null},
            {id: 'a', title: 'A', description: '', servers: 0}
        ];
        expect(ids(sortCatalogue(items, {compare: descendingBy<Project>((p) => p.servers)}))).toEqual(['a', 'b']);
    });

    it('never mutates its input', () => {
        const input = [...projects];
        sortCatalogue(input, {compare: (a, b) => b.title.localeCompare(a.title)});
        expect(ids(input)).toEqual(ids(projects));
    });
});

describe('compareDottedVersions', () => {
    it('orders by each numeric part rather than as text', () => {
        expect(['1.21', '1.9', '26.2', '1.19.4'].sort(compareDottedVersions)).toEqual(['1.9', '1.19.4', '1.21', '26.2']);
        expect(compareDottedVersions('1.21', '1.21.0')).toBe(0);
    });
});

describe('relatedItems', () => {
    it('ranks by values in common, then title, excluding the item itself', () => {
        expect(ids(relatedItems(projects[0]!, projects, tag))).toEqual(['cur', 'fiefs']);
    });

    it('returns nothing for an item with no values, and respects the limit', () => {
        expect(relatedItems(projects[3]!, projects, tag)).toEqual([]);
        expect(ids(relatedItems(projects[0]!, projects, tag, 1))).toEqual(['cur']);
    });
});
