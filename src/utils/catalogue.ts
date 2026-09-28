/**
 * Search, faceted filtering and sorting for a site's catalogue — the plugins,
 * projects or games its home page lays out as an icon grid.
 *
 * Pure functions over whatever item shape the site already holds: a site
 * describes its facets (category, tag, tested version…) and its sort orders
 * as data, and these helpers do the rest. Nothing here imports React or MUI,
 * so the module can be tested without rendering and loaded from
 * `@kingdom-community/community-site-kit/catalogue` without pulling in the
 * component half of the kit.
 *
 * Generalised from dansplugins.com's `catalogueFilter.ts` and `sortPlugins.ts`,
 * whose behaviour it keeps: every facet composes with the search text, a facet
 * offers only values some item carries, and ties always fall back to title.
 */

/** The minimum an item needs to be searched, filtered and sorted. */
export interface CatalogueItem {
    id: string;
    title: string;
    description: string;
}

/** What a facet reads from an item: one value, several, or none. */
export type FacetValue = string | readonly string[] | null | undefined;

/**
 * One dimension a visitor can narrow the catalogue by, such as a project's
 * category or a plugin's tags. A visitor picks at most one value per facet.
 */
export interface CatalogueFacet<T> {
    /** Stable key for the selection, and for a query string if a site keeps one. */
    key: string;
    /** Human-readable name, e.g. "Category". */
    label: string;
    /** The item's value(s) for this facet. */
    values: (item: T) => FacetValue;
    /**
     * Whether the search text also matches these values. On for tags ("economy"
     * should find a plugin tagged economy), off for values such as version
     * numbers, where a substring match would be noise. Defaults to true.
     */
    searchable?: boolean;
    /** Order of the values offered. Defaults to case-insensitive alphabetical. */
    compare?: (a: string, b: string) => number;
}

/** A selected value per facet key; null or absent means "any". */
export type FacetSelection = Readonly<Record<string, string | null | undefined>>;

export interface CatalogueQuery {
    text?: string;
    facets?: FacetSelection;
}

/** One way to order the catalogue, as a sort control would offer it. */
export interface CatalogueSortOption<T> {
    key: string;
    label: string;
    compare: (a: T, b: T) => number;
}

const valuesOf = <T>(facet: CatalogueFacet<T>, item: T): readonly string[] => {
    const value = facet.values(item);
    if (value == null) return [];
    return typeof value === 'string' ? [value] : value;
};

/** Title order, ignoring case: the tie-break every sort falls back to. */
export const compareTitles = (a: {title: string}, b: {title: string}): number =>
    a.title.localeCompare(b.title, undefined, {sensitivity: 'base'});

const compareAlphabetically = (a: string, b: string): number =>
    a.localeCompare(b, undefined, {sensitivity: 'base'});

const numericParts = (version: string): number[] =>
    version.split('.').map((part) => Number.parseInt(part, 10) || 0);

/** Dotted-version order, oldest first: 1.9 < 1.19.4 < 1.21 < 26.2. */
export const compareDottedVersions = (a: string, b: string): number => {
    const pa = numericParts(a);
    const pb = numericParts(b);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
        if (diff !== 0) return diff;
    }
    return 0;
};

/** Newest version first, for a facet whose values are versions. */
export const compareDottedVersionsDescending = (a: string, b: string): number =>
    compareDottedVersions(b, a);

/**
 * A comparator for "most X first" sorts. An item with no number (null or
 * undefined) comes after every item that has one — "unknown" is not "zero",
 * so a site that means zero should return 0 — and ties fall back to title.
 */
export const descendingBy = <T extends {title: string}>(
    get: (item: T) => number | null | undefined
) => (a: T, b: T): number => {
    const va = get(a);
    const vb = get(b);
    if (va != null && vb != null) return vb - va || compareTitles(a, b);
    if (va != null) return -1;
    if (vb != null) return 1;
    return compareTitles(a, b);
};

const normalisedText = (text: string | undefined): string => text?.trim().toLowerCase() ?? '';

const matchesText = <T extends CatalogueItem>(item: T, facets: readonly CatalogueFacet<T>[], text: string): boolean =>
    item.title.toLowerCase().includes(text) ||
    item.description.toLowerCase().includes(text) ||
    facets.some((facet) =>
        (facet.searchable ?? true) && valuesOf(facet, item).some((value) => value.toLowerCase().includes(text)));

/**
 * The items that match the search text and every selected facet value. The
 * input order is kept, so sort first or after as the page prefers. An item
 * with no value for a selected facet is excluded rather than assumed to match:
 * "does this run on my server?" deserves a no over a guess.
 */
export const filterCatalogue = <T extends CatalogueItem>(
    items: readonly T[],
    facets: readonly CatalogueFacet<T>[],
    query: CatalogueQuery
): T[] => {
    const text = normalisedText(query.text);
    const selected = facets.filter((facet) => query.facets?.[facet.key]);
    return items.filter((item) =>
        (!text || matchesText(item, facets, text)) &&
        selected.every((facet) => valuesOf(facet, item).includes(query.facets![facet.key]!)));
};

/** Whether the query narrows anything — for auto-expanding a folded filter panel. */
export const isCatalogueQueryActive = (query: CatalogueQuery): boolean =>
    Boolean(normalisedText(query.text) || Object.values(query.facets ?? {}).some(Boolean));

export interface FacetValueCount {
    value: string;
    count: number;
}

/**
 * Every value of a facet that some item carries, in the facet's order, with
 * how many items carry it. A filter built from this offers only choices that
 * match something.
 */
export const facetValueCounts = <T>(items: readonly T[], facet: CatalogueFacet<T>): FacetValueCount[] => {
    const counts = new Map<string, number>();
    for (const item of items) {
        // A value listed twice on one item still counts that item once.
        for (const value of new Set(valuesOf(facet, item))) {
            counts.set(value, (counts.get(value) ?? 0) + 1);
        }
    }
    const compare = facet.compare ?? compareAlphabetically;
    return Array.from(counts, ([value, count]) => ({value, count})).sort((a, b) => compare(a.value, b.value));
};

/** Every value of a facet in use, in the facet's order. */
export const facetValues = <T>(items: readonly T[], facet: CatalogueFacet<T>): string[] =>
    facetValueCounts(items, facet).map(({value}) => value);

/** A sorted copy; the input is never mutated. */
export const sortCatalogue = <T>(items: readonly T[], option: Pick<CatalogueSortOption<T>, 'compare'>): T[] =>
    [...items].sort(option.compare);

/**
 * Items sharing values of a facet with the given one: most in common first,
 * ties by title, at most `limit`. On dansplugins.com this is how Currencies
 * and Fiefs, both tagged as Medieval Factions expansions, point at each other.
 */
export const relatedItems = <T extends CatalogueItem>(
    item: T,
    all: readonly T[],
    facet: CatalogueFacet<T>,
    limit = 4
): T[] => {
    const mine = new Set(valuesOf(facet, item));
    if (mine.size === 0) return [];
    return all
        .filter((other) => other.id !== item.id)
        .map((other) => ({other, shared: new Set(valuesOf(facet, other).filter((value) => mine.has(value))).size}))
        .filter(({shared}) => shared > 0)
        .sort((a, b) => b.shared - a.shared || compareTitles(a.other, b.other))
        .slice(0, limit)
        .map(({other}) => other);
};
