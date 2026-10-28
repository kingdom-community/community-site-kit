// A namespace import, never named ones: see TopBar.tsx and #11.
import * as Mui from '@mui/material';
import React from 'react';

import {CatalogueGrid, type CatalogueGridItem, type CatalogueGridProps} from './CatalogueGrid.js';
import {groupByTier, type CatalogueTier} from '../utils/catalogue.js';
import {visuallyHiddenStyle} from '../styles/styles.js';

const {Box, Typography} = Mui;

// A catalogue laid out in tiers, most finished first: one CatalogueGrid per
// tier under a visible heading and blurb, all inside one section that holds
// the search and filters. The toolbar filters across every tier; a tier the
// filter leaves empty is not shown, and `empty` stands in when every tier is.

export interface TieredCatalogueGridProps<T extends CatalogueGridItem>
    extends Omit<CatalogueGridProps<T>, 'heading' | 'sectionId' | 'idPrefix'> {
    // The tiers, most finished first.
    tiers: readonly CatalogueTier[];
    // An item's tier key; unknown or absent files it under the last tier.
    tierOf: (item: T) => string | null | undefined;
    // Visually hidden heading of the whole section, for screen readers.
    heading: string;
    // Id of the whole section; each tier's grid is `<sectionId>-<tier key>`.
    sectionId: string;
}

export const TieredCatalogueGrid = <T extends CatalogueGridItem>({
    items,
    tiers,
    tierOf,
    heading,
    sectionId,
    toolbar,
    empty,
    sx,
    ...grid
}: TieredCatalogueGridProps<T>): React.ReactElement => {
    const headingId = `${sectionId}-heading`;
    const groups = groupByTier(items, tiers, tierOf);
    return (
        <Box id={sectionId} component="section" aria-labelledby={headingId} sx={sx}>
            <Typography id={headingId} variant="h2" sx={visuallyHiddenStyle}>
                {heading}
            </Typography>
            {toolbar}
            {groups.length === 0
                ? empty
                : groups.map(({tier, items: tierItems}) => (
                    <CatalogueGrid
                        {...grid}
                        key={tier.key}
                        items={tierItems}
                        heading={tier.heading}
                        sectionId={`${sectionId}-${tier.key}`}
                        idPrefix={`${sectionId}-${tier.key}`}
                        toolbar={
                            // The grid's own h2 (visually hidden) names the
                            // tier for screen readers; this is its visible twin.
                            <Box className="catalogue-tier-header" sx={{mt: 3, mb: 1}}>
                                <Typography variant="h5" component="p" aria-hidden="true">
                                    {tier.heading}
                                </Typography>
                                {tier.blurb ? (
                                    <Typography variant="body2" color="text.secondary">
                                        {tier.blurb}
                                    </Typography>
                                ) : null}
                            </Box>
                        }
                    />
                ))}
        </Box>
    );
};
