import {afterEach, describe, expect, it} from 'vitest';
import {cleanup, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {SkipLink} from '../src/components/SkipLink.js';

afterEach(cleanup);

describe('SkipLink', () => {
    it('links to the page main content by default, under a label a visitor can act on', () => {
        render(<SkipLink/>);
        const link = screen.getByRole('link', {name: 'Skip to main content'});
        expect(link.getAttribute('href')).toBe('#main');
    });

    it('follows a caller-chosen main element and label', () => {
        render(<SkipLink targetId="content" label="Jump to the article"/>);
        const link = screen.getByRole('link', {name: 'Jump to the article'});
        expect(link.getAttribute('href')).toBe('#content');
    });

    // An in-page fragment rather than a route: the link moves focus within the
    // page it is already on, so it must not go through the router.
    it('is a plain anchor to an in-page fragment', () => {
        render(<SkipLink/>);
        const link = screen.getByRole('link', {name: 'Skip to main content'});
        expect(link.tagName).toBe('A');
        expect(link.getAttribute('href')?.startsWith('#')).toBe(true);
    });

    // The whole point of the component (WCAG 2.4.1): the very first Tab press on
    // a page must land here, ahead of the navigation it exists to bypass.
    it('takes the first Tab press, ahead of the chrome rendered after it', async () => {
        const user = userEvent.setup();
        render(
            <>
                <SkipLink/>
                <a href="/news">News</a>
                <a href="/guides">Guides</a>
            </>
        );

        await user.tab();

        expect(document.activeElement).toBe(screen.getByRole('link', {name: 'Skip to main content'}));
    });

    // It is parked off-screen with a transform rather than `display: none`, so
    // nothing may re-hide it from the tab order or the accessibility tree —
    // either would leave a link that keyboard users can never reach.
    it('stays in the tab order and the accessibility tree while parked off-screen', () => {
        render(<SkipLink/>);
        const link = screen.getByRole('link', {name: 'Skip to main content'});
        expect(link.getAttribute('tabindex')).toBeNull();
        expect(link.getAttribute('aria-hidden')).toBeNull();
        expect(link.hasAttribute('hidden')).toBe(false);
    });
});
