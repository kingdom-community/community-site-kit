import {afterEach, describe, expect, it, vi} from 'vitest';
import {cleanup, render, screen} from '@testing-library/react';

vi.mock('next/router', () => ({useRouter: () => ({pathname: '/', asPath: '/'})}));

import {BottomBar} from '../src/components/BottomBar.js';

afterEach(cleanup);

describe('BottomBar', () => {
    it('shows the site version it is given', () => {
        render(<BottomBar version="1.4.0"/>);
        expect(screen.getByText('v1.4.0')).toBeTruthy();
    });

    // Half a label reading "v" is worse than no label.
    it('shows no version at all when none is given', () => {
        const {container} = render(<BottomBar/>);
        expect(container.textContent).not.toContain('v');
    });

    it('renders the footer links it is given', () => {
        render(
            <BottomBar
                links={[
                    {href: 'https://github.example/site', label: 'Source Code'},
                    {href: '/contact', label: 'Contact'}
                ]}
            />
        );
        const source = screen.getByRole('link', {name: 'Source Code'});
        expect(source.getAttribute('target')).toBe('_blank');
        expect(source.getAttribute('rel')).toBe('noopener noreferrer');

        const contact = screen.getByRole('link', {name: 'Contact'});
        expect(contact.getAttribute('href')).toBe('/contact');
        expect(contact.getAttribute('target')).toBeNull();
    });

    it('renders extra footer content beside the version', () => {
        render(<BottomBar version="1.0.0">{<span>1,204 visits since 2019</span>}</BottomBar>);
        expect(screen.getByText('1,204 visits since 2019')).toBeTruthy();
    });

    it('is a footer landmark', () => {
        render(<BottomBar version="1.0.0"/>);
        expect(screen.getByRole('contentinfo')).toBeTruthy();
    });

    it('carries the colour-mode switch by default, and omits it on request', () => {
        const {unmount} = render(<BottomBar version="1.0.0"/>);
        expect(screen.getByRole('checkbox', {name: 'Toggle dark mode'})).toBeTruthy();
        unmount();

        render(<BottomBar version="1.0.0" colorModeToggle={false}/>);
        expect(screen.queryByRole('checkbox', {name: 'Toggle dark mode'})).toBeNull();
    });
});
