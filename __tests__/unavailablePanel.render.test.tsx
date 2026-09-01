import {afterEach, describe, expect, it} from 'vitest';
import {cleanup, render, screen} from '@testing-library/react';

import {UnavailablePanel} from '../src/components/UnavailablePanel.js';

afterEach(cleanup);

describe('UnavailablePanel', () => {
    it('names the unavailable capability and explains the state', () => {
        render(
            <UnavailablePanel title="The player list is unavailable">
                We could not reach the server just now. Nothing you did caused this; try again shortly.
            </UnavailablePanel>
        );
        expect(screen.getByText('The player list is unavailable')).toBeTruthy();
        expect(screen.getByText(/Nothing you did caused this/)).toBeTruthy();
    });

    // A polite announcement about the site's state, not an interruption
    // demanding the visitor drop what they are doing.
    it('announces itself as a status rather than an alert', () => {
        render(<UnavailablePanel title="Temporarily unavailable"/>);
        expect(screen.getByRole('status')).toBeTruthy();
        expect(screen.queryByRole('alert')).toBeNull();
    });
});
