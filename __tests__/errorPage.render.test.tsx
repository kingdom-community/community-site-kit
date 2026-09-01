import {afterEach, describe, expect, it, vi} from 'vitest';
import {cleanup, render, screen} from '@testing-library/react';

vi.mock('next/router', () => ({useRouter: () => ({pathname: '/404', asPath: '/404'})}));

import {ErrorPage} from '../src/components/ErrorPage.js';
import {TopBar} from '../src/components/TopBar.js';
import {BottomBar} from '../src/components/BottomBar.js';

afterEach(cleanup);

describe('ErrorPage', () => {
    it('renders the code, the title and the message', () => {
        render(<ErrorPage code="404" title="Page not found" message="That page does not exist."/>);
        expect(screen.getByText('404')).toBeTruthy();
        expect(screen.getByText('Page not found')).toBeTruthy();
        expect(screen.getByText('That page does not exist.')).toBeTruthy();
    });

    it('offers a way home, at a caller-chosen route and label', () => {
        const {unmount} = render(<ErrorPage code="500" title="Something broke" message="Try again shortly."/>);
        expect(screen.getByRole('link', {name: 'Back to home'}).getAttribute('href')).toBe('/');
        unmount();

        render(
            <ErrorPage
                code="500"
                title="Something broke"
                message="Try again shortly."
                homeHref="/start"
                homeLabel="Start over"
            />
        );
        expect(screen.getByRole('link', {name: 'Start over'}).getAttribute('href')).toBe('/start');
    });

    // The error page has to look like the rest of the site, which means using the
    // same bars the site configures, not a second copy of them.
    it('renders the site chrome it is handed', () => {
        render(
            <ErrorPage
                code="404"
                title="Page not found"
                message="That page does not exist."
                topBar={<TopBar brand="Ember Hollow" links={[{href: '/news', label: 'News'}]}/>}
                bottomBar={<BottomBar version="1.0.0"/>}
            />
        );
        expect(screen.getByRole('navigation', {name: 'Primary'})).toBeTruthy();
        expect(screen.getByRole('contentinfo')).toBeTruthy();
        expect(screen.getByText('v1.0.0')).toBeTruthy();
    });

    it('marks the message region as the page main content, for the skip link to land on', () => {
        render(<ErrorPage code="404" title="Page not found" message="That page does not exist."/>);
        expect(screen.getByRole('main').getAttribute('id')).toBe('main');
    });

    // An error page must render when the thing that caused the error is exactly
    // what is down, so it reaches nothing on its own.
    it('renders with no network available at all', () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('everything is down')));
        render(<ErrorPage code="500" title="Something broke" message="Try again shortly."/>);
        expect(screen.getByText('500')).toBeTruthy();
        expect(vi.mocked(fetch)).not.toHaveBeenCalled();
        vi.unstubAllGlobals();
    });
});
