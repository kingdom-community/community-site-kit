import React from 'react';
import {Button} from '@mui/material';
import {afterEach, describe, expect, it} from 'vitest';
import {cleanup, render, screen} from '@testing-library/react';

import {NextLinkComposed} from '../src/components/NextLinkComposed.js';

afterEach(cleanup);

describe('NextLinkComposed', () => {
    // `to` rather than `href`, so it does not collide with the `href` most MUI
    // components already accept.
    it('renders a single anchor at the route given as `to`', () => {
        const {container} = render(<NextLinkComposed to="/guides">Guides</NextLinkComposed>);
        expect(container.querySelectorAll('a')).toHaveLength(1);
        expect(screen.getByRole('link', {name: 'Guides'}).getAttribute('href')).toBe('/guides');
    });

    it('drives a MUI component through its `component` prop', () => {
        render(
            <Button component={NextLinkComposed} to="/news">
                News
            </Button>
        );
        const link = screen.getByRole('link', {name: 'News'});
        expect(link.getAttribute('href')).toBe('/news');
        expect(link.tagName).toBe('A');
    });

    it('passes anchor attributes through and forwards a ref to the anchor', () => {
        const ref = React.createRef<HTMLAnchorElement>();
        render(
            <NextLinkComposed to="/news" ref={ref} className="custom" aria-label="Latest news">
                News
            </NextLinkComposed>
        );
        expect(ref.current?.tagName).toBe('A');
        expect(ref.current?.className).toContain('custom');
        expect(screen.getByRole('link', {name: 'Latest news'})).toBeTruthy();
    });
});
