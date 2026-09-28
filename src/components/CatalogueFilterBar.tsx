// A namespace import, never named ones: see TopBar.tsx and #11.
import * as Mui from '@mui/material';
import SearchIconImport from '@mui/icons-material/Search.js';
import TuneIconImport from '@mui/icons-material/Tune.js';
import ClearIconImport from '@mui/icons-material/Clear.js';
import React from 'react';

import {interopDefault} from '../utils/interopDefault.js';
import {
    facetValues,
    isCatalogueQueryActive,
    type CatalogueFacet,
    type CatalogueQuery,
    type CatalogueSortOption
} from '../utils/catalogue.js';

const {
    Box,
    Button,
    Chip,
    Collapse,
    FormControl,
    IconButton,
    InputAdornment,
    InputLabel,
    MenuItem,
    Select,
    Stack,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Typography
} = Mui;
const SearchIcon = interopDefault(SearchIconImport);
const TuneIcon = interopDefault(TuneIconImport);
const ClearIcon = interopDefault(ClearIconImport);

// Search, sort and facet filters for an icon-grid catalogue, folded behind one
// "Search & filter" button so the grid stays the first thing on the page. The
// same controls, in the same order, as dansplugins.com's plugin catalogue.
//
// Pair it with CatalogueGrid's `toolbar` prop; the page owns the query and sort
// state and runs filterCatalogue/sortCatalogue itself.

export interface CatalogueFilterBarFacet<T> {
    facet: CatalogueFacet<T>;
    // Chips suit a handful of values; a menu keeps a long list off the page.
    display: 'chips' | 'menu';
}

export interface CatalogueFilterBarProps<T> {
    items: readonly T[];
    shownCount: number;
    // Plural noun for the summary and placeholder, e.g. "projects".
    noun: string;
    facets: readonly CatalogueFilterBarFacet<T>[];
    query: CatalogueQuery;
    onQueryChange: (query: CatalogueQuery) => void;
    sortOptions?: readonly CatalogueSortOption<T>[];
    sortKey?: string;
    onSortChange?: (key: string) => void;
    // Prefix for element ids, so two bars on one page cannot collide.
    idPrefix?: string;
}

export const CatalogueFilterBar = <T, >({
    items,
    shownCount,
    noun,
    facets,
    query,
    onQueryChange,
    sortOptions,
    sortKey,
    onSortChange,
    idPrefix = 'catalogue',
}: CatalogueFilterBarProps<T>): React.ReactElement => {
    const [open, setOpen] = React.useState(false);
    const active = isCatalogueQueryActive(query);
    // A filter that is narrowing the grid must be on screen, however it was set.
    React.useEffect(() => {
        if (active) setOpen(true);
    }, [active]);

    const text = query.text ?? '';
    const setText = (next: string) => onQueryChange({...query, text: next});
    const selected = (key: string): string | null => query.facets?.[key] ?? null;
    const select = (key: string, value: string | null) =>
        onQueryChange({...query, facets: {...query.facets, [key]: value}});
    const panelId = `${idPrefix}-filters`;

    return (
        <>
            <Box sx={{display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 1, minHeight: 40, mb: 1}}>
                {active && (
                    <Typography variant="body2" color="text.secondary" sx={{mr: 'auto'}} role="status" data-testid="filter-summary">
                        Showing {shownCount} of {items.length} {noun}
                    </Typography>
                )}
                <Button
                    size="small"
                    startIcon={<SearchIcon fontSize="small"/>}
                    endIcon={<TuneIcon fontSize="small"/>}
                    aria-expanded={open}
                    aria-controls={panelId}
                    onClick={() => setOpen((was) => !was)}
                    color={open || active ? 'primary' : 'inherit'}
                    sx={{color: open || active ? undefined : 'text.secondary'}}
                >
                    Search &amp; filter
                </Button>
            </Box>

            <Collapse in={open} id={panelId} data-testid="catalogue-filters">
                <Box sx={{display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 2, flexWrap: 'wrap', mb: 3}}>
                    <TextField
                        size="small"
                        placeholder={`Search ${noun}…`}
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        inputProps={{'aria-label': `Search ${noun}`}}
                        sx={{minWidth: 240}}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <SearchIcon fontSize="small"/>
                                </InputAdornment>
                            ),
                            endAdornment: text ? (
                                <InputAdornment position="end">
                                    <IconButton size="small" aria-label="Clear search" onClick={() => setText('')}>
                                        <ClearIcon fontSize="small"/>
                                    </IconButton>
                                </InputAdornment>
                            ) : undefined,
                        }}
                    />
                    {sortOptions && sortOptions.length > 1 && onSortChange ? (
                        <ToggleButtonGroup
                            value={sortKey}
                            exclusive
                            onChange={(_e, next: string | null) => {
                                if (next !== null) onSortChange(next);
                            }}
                            aria-label="Sort order"
                            size="small"
                        >
                            {sortOptions.map((option) => (
                                <ToggleButton key={option.key} value={option.key}>
                                    {option.label}
                                </ToggleButton>
                            ))}
                        </ToggleButtonGroup>
                    ) : null}
                </Box>

                <Stack spacing={1.5} sx={{alignItems: 'center', mb: 3}}>
                    {facets.map(({facet, display}) => {
                        const values = facetValues(items, facet);
                        if (values.length === 0) return null;
                        const current = selected(facet.key);
                        if (display === 'menu') {
                            const labelId = `${idPrefix}-${facet.key}-label`;
                            return (
                                <FormControl key={facet.key} size="small" sx={{minWidth: 220}}>
                                    <InputLabel id={labelId}>{facet.label}</InputLabel>
                                    <Select
                                        labelId={labelId}
                                        label={facet.label}
                                        value={current ?? ''}
                                        onChange={(e) => select(facet.key, e.target.value === '' ? null : String(e.target.value))}
                                        data-testid={`facet-${facet.key}`}
                                    >
                                        <MenuItem value="">Any {facet.label.toLowerCase()}</MenuItem>
                                        {values.map((value) => (
                                            <MenuItem key={value} value={value}>{value}</MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            );
                        }
                        return (
                            <Stack
                                key={facet.key}
                                direction="row"
                                useFlexGap
                                sx={{justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap', gap: 1}}
                                role="group"
                                aria-label={`Filter by ${facet.label.toLowerCase()}`}
                            >
                                <Chip
                                    label={`Any ${facet.label.toLowerCase()}`}
                                    size="small"
                                    clickable
                                    color={current === null ? 'primary' : 'default'}
                                    variant={current === null ? 'filled' : 'outlined'}
                                    onClick={() => select(facet.key, null)}
                                    aria-pressed={current === null}
                                />
                                {values.map((value) => (
                                    <Chip
                                        key={value}
                                        label={value}
                                        size="small"
                                        clickable
                                        color={current === value ? 'primary' : 'default'}
                                        variant={current === value ? 'filled' : 'outlined'}
                                        onClick={() => select(facet.key, current === value ? null : value)}
                                        aria-pressed={current === value}
                                    />
                                ))}
                            </Stack>
                        );
                    })}
                </Stack>
            </Collapse>
        </>
    );
};

