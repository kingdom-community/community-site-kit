import {afterEach, describe, expect, it, vi} from 'vitest';
import {cleanup, render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const router = {pathname: '/', asPath: '/'};
vi.mock('next/router', () => ({useRouter: () => router}));

import {TopBar} from '../src/components/TopBar.js';

const LINKS = [
    {href: '/', label: 'Home'},
    {href: '/news', label: 'News'},
    {href: '/guides', label: 'Guides'}
];

const MENUS = [
    {
        label: 'Community',
        links: [
            {href: 'https://chat.example/invite', label: 'Chat'},
            {href: '/contact', label: 'Contact'}
        ]
    }
];

afterEach(cleanup);

describe('TopBar', () => {
    it('renders the brand as a link home', () => {
        render(<TopBar brand="Ember Hollow"/>);
        expect(screen.getByRole('link', {name: 'Ember Hollow'})).toHaveProperty('href', 'http://localhost:3000/');
    });

    it('honours a brand that links somewhere other than the root', () => {
        render(<TopBar brand="Ember Hollow" brandHref="/home"/>);
        expect(screen.getByRole('link', {name: 'Ember Hollow'}).getAttribute('href')).toBe('/home');
    });

    it('renders the nav items it is given, in order, and nothing it is not', () => {
        render(<TopBar brand="Ember Hollow" links={LINKS}/>);
        const nav = screen.getByRole('navigation', {name: 'Primary'});
        const labels = within(nav)
            .getAllByRole('link')
            .map((link) => link.textContent);
        expect(labels).toEqual(['Ember Hollow', 'Home', 'News', 'Guides']);
    });

    it('marks the current page, and only the current page', () => {
        render(<TopBar brand="Ember Hollow" links={LINKS} pathname="/news"/>);
        expect(screen.getByRole('link', {name: 'News'}).getAttribute('aria-current')).toBe('page');
        expect(screen.getByRole('link', {name: 'Guides'}).getAttribute('aria-current')).toBeNull();
    });

    it('takes the current page from the router when no pathname is passed', () => {
        router.pathname = '/guides';
        render(<TopBar brand="Ember Hollow" links={LINKS}/>);
        expect(screen.getByRole('link', {name: 'Guides'}).getAttribute('aria-current')).toBe('page');
        router.pathname = '/';
    });

    // A link that leaves the site opens in a new tab, and rel="noopener" keeps
    // the opened page from reaching back into this one via window.opener.
    it('opens an off-site link in a new tab, safely, and never marks it active', () => {
        const external = 'https://chat.example/invite';
        render(<TopBar brand="Ember Hollow" links={[{href: external, label: 'Chat'}]} pathname={external}/>);
        const link = screen.getByRole('link', {name: /Chat/});
        expect(link.getAttribute('target')).toBe('_blank');
        expect(link.getAttribute('rel')).toBe('noopener noreferrer');
        expect(link.getAttribute('aria-current')).toBeNull();
    });

    it('groups a menu behind a dropdown that opens on click', async () => {
        const user = userEvent.setup();
        render(<TopBar brand="Ember Hollow" links={LINKS} menus={MENUS}/>);
        expect(screen.queryByRole('menuitem', {name: /Chat/})).toBeNull();

        await user.click(screen.getByRole('button', {name: 'Community'}));

        expect(screen.getByRole('menuitem', {name: /Chat/})).toBeTruthy();
        expect(screen.getByRole('menuitem', {name: 'Contact'})).toBeTruthy();
    });

    it('renders whatever is passed as actions', () => {
        render(<TopBar brand="Ember Hollow" actions={<button type="button">Sign in</button>}/>);
        expect(screen.getByRole('button', {name: 'Sign in'})).toBeTruthy();
    });

    it('offers a hamburger that opens a drawer listing every destination', async () => {
        const user = userEvent.setup();
        render(<TopBar brand="Ember Hollow" links={LINKS} menus={MENUS}/>);

        await user.click(screen.getByRole('button', {name: 'Open navigation menu'}));

        const drawer = screen.getByRole('presentation');
        for (const label of ['Home', 'News', 'Guides', 'Chat', 'Contact']) {
            expect(within(drawer).getByText(label)).toBeTruthy();
        }
        // The menu's label becomes a section heading rather than being dropped.
        expect(within(drawer).getByText('Community')).toBeTruthy();
    });

    // A bar with nothing to collapse should not sprout a button that opens an
    // empty drawer.
    it('shows no hamburger when there is nothing to collapse, and none when told not to', () => {
        const {unmount} = render(<TopBar brand="Ember Hollow"/>);
        expect(screen.queryByRole('button', {name: 'Open navigation menu'})).toBeNull();
        unmount();

        render(<TopBar brand="Ember Hollow" links={LINKS} responsive={false}/>);
        expect(screen.queryByRole('button', {name: 'Open navigation menu'})).toBeNull();
    });

    it('carries the colour-mode switch by default, and omits it on request', () => {
        const {unmount} = render(<TopBar brand="Ember Hollow"/>);
        expect(screen.getByRole('checkbox', {name: 'Toggle dark mode'})).toBeTruthy();
        unmount();

        render(<TopBar brand="Ember Hollow" colorModeToggle={false}/>);
        expect(screen.queryByRole('checkbox', {name: 'Toggle dark mode'})).toBeNull();
    });

    it('names the navigation landmark, so a page with two navs distinguishes them', () => {
        render(<TopBar brand="Ember Hollow" ariaLabel="Site"/>);
        expect(screen.getByRole('navigation', {name: 'Site'})).toBeTruthy();
    });
});
