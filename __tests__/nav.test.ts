import {describe, expect, it} from 'vitest';

import {isActiveNavLink, isExternalNavLink} from '../src/utils/nav.js';

describe('isActiveNavLink', () => {
    it('marks an internal link active when it matches the current route', () => {
        expect(isActiveNavLink('/news', '/news')).toBe(true);
        expect(isActiveNavLink('/', '/')).toBe(true);
    });

    it('does not mark an internal link active on a different route', () => {
        expect(isActiveNavLink('/news', '/about')).toBe(false);
        expect(isActiveNavLink('/', '/news')).toBe(false);
    });

    it('never marks an external link active, even on a matching string', () => {
        expect(isActiveNavLink('https://example.test/x', 'https://example.test/x')).toBe(false);
        expect(isActiveNavLink('/', 'https://example.test')).toBe(false);
    });
});

describe('isExternalNavLink', () => {
    it('recognises absolute http(s) URLs and nothing else', () => {
        expect(isExternalNavLink('https://example.test')).toBe(true);
        expect(isExternalNavLink('http://example.test')).toBe(true);
        expect(isExternalNavLink('/guides')).toBe(false);
        expect(isExternalNavLink('/http-headers')).toBe(false);
    });
});
