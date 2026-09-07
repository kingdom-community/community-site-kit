import {afterEach, describe, expect, it} from 'vitest';
import {cleanup, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {SkipLink} from '../src/components/SkipLink.js';
import {REDUCED_MOTION_QUERY} from '../src/styles/styles.js';

// The reduced-motion rule is inside the component's own `sx`, so the only place
// it is observable is the stylesheet Emotion injects for the rendered element.
const injectedCss = () =>
    Array.from(document.querySelectorAll('style[data-emotion]'))
        .map((tag) => tag.textContent ?? '')
        .join('');

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

    // A visitor who asked for less motion still gets the link — it just arrives
    // instead of sliding. Cancelling its transform under the same query, as the
    // hover styles in styles.ts do, would unpark it and leave it sitting over
    // the page permanently.
    it('drops the slide but not the parking under reduced motion', () => {
        render(<SkipLink/>);
        const reduced = injectedCss().match(
            new RegExp(`${REDUCED_MOTION_QUERY.replace(/[()]/g, '\\$&')}\\{[^}]*\\}`)
        );

        expect(reduced).not.toBeNull();
        expect(reduced?.[0]).toContain('transition:none');
        expect(reduced?.[0]).not.toContain('transform');
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
