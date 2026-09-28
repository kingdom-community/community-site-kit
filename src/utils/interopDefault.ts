// The default export of a CommonJS module, whichever interop the host applied.
//
// This package's ESM build is "type": "module", so Node and webpack both import
// it with strict ESM semantics: a default import of a CommonJS module is that
// module's whole `module.exports`, even when it was compiled from ESM and marks
// itself `__esModule`. The per-icon files of @mui/icons-material v5
// (`@mui/icons-material/Menu.js`) are such modules, so a default import of one
// is `{default: MenuIcon}` rather than `MenuIcon` — and rendering that fails
// with React error #130 ("element type is invalid ... got: object").
//
// A bundler with loose interop (and this package's own CommonJS build, via
// tsc's `__importDefault`) already hands over the component itself, so this
// only unwraps when the value is visibly the `__esModule` wrapper.
export const interopDefault = <T>(imported: T): T => {
    const candidate = imported as unknown as {__esModule?: unknown; default?: unknown} | null;
    if (
        candidate !== null &&
        (typeof candidate === 'object' || typeof candidate === 'function') &&
        candidate.__esModule === true &&
        'default' in candidate
    ) {
        return candidate.default as T;
    }
    return imported;
};
