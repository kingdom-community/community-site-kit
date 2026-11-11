# visual-diff: advisory screenshot comparison for a site's pull requests

This tool implements [RFC 0038](https://github.com/Preponderous-Software/rfcs/pull/171), which is still a draft. On every pull request it builds and serves the **base** and the **head** on the same runner, takes the same set of Playwright shots of each, and compares every pair with `strata-imgcmp --json` from the SHA-pinned [Strata](https://github.com/Preponderous-Software/strata) release in [`strata.lock.json`](strata.lock.json). The result goes to the job summary and a `visual-diff` artifact holding the base, head and diff images of each shot that changed.

The check is **advisory**. Changed shots never fail it. It fails only on an error: a head page that does not load, a base that does not build, or a comparison that cannot run.

Because the base is rendered fresh in the same job, nothing is committed as a baseline, and the shots on both sides come from the same machine and fonts.

This tool is not part of the npm package (`files` in `package.json` lists only `dist`, `README.md` and `LICENSE`). Nothing is added to a site's `package.json`. Playwright is installed in a separate directory, and the comparison uses the released Strata binary.

## Opt a site in

1. Commit a `visual-diff.json` at the repository root (see [the config](#the-config)).
2. Add `.github/workflows/visual-diff.yml`, pinned to a kit commit:

   ```yaml
   name: Visual diff
   on:
     pull_request:
       branches: [ main ]
   permissions:
     contents: read
   jobs:
     visual-diff:
       uses: kingdom-community/community-site-kit/.github/workflows/visual-diff.yml@<kit sha>
       with:
         kit-ref: <the same kit sha>
   ```

   `kit-ref` names the commit that `tools/visual-diff/` is taken from. A called workflow cannot see its own ref, so it is passed again. Keep the two the same.

The reusable workflow runs on `ubuntu-24.04` with `contents: read` and no secrets, so pull requests from forks run it unchanged. Its inputs are `config` (default `visual-diff.json`), `kit-ref`, `playwright-version` (default `1.61.1`), and `base-sha` / `head-sha` overrides. The head defaults to the pull request's merge commit.

## What one run does

1. Checks out the base and head side by side and builds each with the config's `install` and `build`. If the base build fails, only head shots are reported and the run is an error.
2. Serves each with `serve` on its own port on `127.0.0.1` (`side.cjs`).
3. `shoot.cjs` runs once per side, in one browser launch. For each viewport and colour scheme it opens a fresh context with reduced motion, UTC, `en-US` and device scale factor 1. Every request whose origin is not the served site is aborted, unless a `fixtures` prefix matches it, in which case it is answered from disk. `Date` is fixed at `clock`, and `localStorage` entries are set before the page loads. Each page is loaded until the network is idle. The tool waits for fonts, walks down the page once so lazy images load, and turns off transitions, animations and the caret. Then it takes a full-page shot and cuts it into **tiles** as tall as the viewport. The last tile is padded with the page background.
4. `compare.cjs` downloads the Strata tarball, checks its SHA-256, and runs this on each tile pair:

   ```sh
   strata-imgcmp base/<tile> head/<tile> --json --diff diff/<tile> --threshold 4 --max-fraction 0
   ```

   A shot that differs is shot again on both sides once. If the retake does not differ, the shot is reported as `flaky`.

Tiles exist because `strata-imgcmp` compares only images of the same size. A page that grows by a few pixels gets an extra tile (`added`), and the tiles above the change still compare normally.

### Results

| Class | Meaning |
|---|---|
| `same` | No pixel over ΔE `threshold` in any tile. |
| `changed` | At least one tile has pixels over the threshold. The summary shows the largest `fraction_over`. |
| `added` / `removed` | The page grew or shrank by whole tiles, or the shot exists on one side only. |
| `flaky` | Differed once, then matched on the retake. That points to nondeterminism to remove at its source. |
| `error` | The head page failed to load, the head threw an uncaught error the base did not, or `strata-imgcmp` could not compare. |

`--max-fraction 0` means any changed pixel counts. Strata's own 0.5 % default is tuned for 3D frames. In the RFC's spike it let a visible heading change through on 7 of 8 tall pages, and two renders of the same commit differed by 0 pixels.

## The config

[`schema.json`](schema.json) describes it, and every key is optional. An unknown key is an error, so a typo fails the run instead of silently taking no shots.

```json
{
  "node": "18",
  "install": "npm ci",
  "build": "npm run build",
  "serve": "npx next start -H 127.0.0.1 -p {port}",
  "env": { "NEXT_TELEMETRY_DISABLED": "1" },
  "pages": ["/", "/projects", "/contact", "/legal"],
  "viewports": {
    "desktop": { "width": 1280, "height": 800 },
    "phone": { "width": 390, "height": 844, "isMobile": true, "hasTouch": true }
  },
  "schemes": ["light", "dark"],
  "clock": "2026-01-01T12:00:00Z",
  "localStorage": { "dpc-experience-chosen": "1" },
  "mask": [],
  "fixtures": { "https://api.example.com/v1/": "visual-diff-fixtures/api" },
  "threshold": 4.0,
  "maxFraction": 0
}
```

| Key | Default | Meaning |
|---|---|---|
| `node` | `"18"` | Node version for the install, build, serve and the tool. |
| `install`, `build` | `npm ci`, `npm run build` | Run in each checkout. The head's config is used for both sides. |
| `serve` | `npx next start -p {port}` | Started in the background. `{port}` is replaced. |
| `env` | `{}` | Set for install, build and serve. `NEXT_TELEMETRY_DISABLED=1` and `CI=1` are set unless overridden. |
| `pages` | `["/"]` | Site-relative paths. A shot is named `<page>.<viewport>.<scheme>`, with `/` named `home`. |
| `viewports` | desktop 1280×800, phone 390×844 | The height is also the tile height. |
| `schemes` | `["light", "dark"]` | `prefers-color-scheme` values. |
| `clock` | `2026-01-01T12:00:00Z` | What `Date.now()` and `new Date()` return in the page. |
| `localStorage` | `{}` | Set on the site's origin before each page loads, for example to dismiss a first-visit splash. |
| `mask` | `[]` | CSS selectors painted over as magenta boxes, for content that changes on its own. Keep this list short. A growing list means nondeterminism is being hidden instead of removed. |
| `fixtures` | `{}` | A URL prefix maps to a directory, relative to the config, of canned responses. `<rest>`, `<rest>.json` and `<rest>/index.json` are tried, and a miss is answered with 404. Use it for a site whose browser code reads an API. Both sides then see the same data. |
| `threshold` | `4.0` | `strata-imgcmp --threshold`: the CIE76 ΔE a pixel must exceed to count. |
| `maxFraction` | `0` | `strata-imgcmp --max-fraction`. |

## Run it locally

Linux x86-64 with Node 18 or later:

```sh
npm install --no-save --no-package-lock --prefix /tmp/pw playwright@1.61.1
/tmp/pw/node_modules/.bin/playwright install chromium
export NODE_PATH=/tmp/pw/node_modules
T=path/to/community-site-kit/tools/visual-diff

node $T/side.cjs build --config visual-diff.json --dir ../site-base
node $T/side.cjs build --config visual-diff.json --dir .
node $T/side.cjs serve --config visual-diff.json --dir ../site-base --port 3101
node $T/side.cjs serve --config visual-diff.json --dir . --port 3102
node $T/shoot.cjs --config visual-diff.json --url http://127.0.0.1:3101 --out /tmp/vd/base
node $T/shoot.cjs --config visual-diff.json --url http://127.0.0.1:3102 --out /tmp/vd/head
node $T/compare.cjs --config visual-diff.json --base /tmp/vd/base --head /tmp/vd/head --out /tmp/vd/report
node $T/side.cjs stop --dir ../site-base; node $T/side.cjs stop --dir .
```

`../site-base` is a second checkout of the base commit, for example from `git worktree add`. `compare.cjs` caches the Strata release in `~/.cache/strata/<version>/`. Pass `--strata-bin path/to/strata-imgcmp` to use a local build instead.

## Files

| File | Role |
|---|---|
| `lib.cjs` | Config validation, shot names, fixture lookup, a small PNG codec, tiling, classification, and the summary. Node standard library only. |
| `side.cjs` | Builds, serves and stops one side. |
| `shoot.cjs` | Takes the shots of one served build. Requires `playwright`. |
| `compare.cjs` | Downloads and verifies `strata-imgcmp`, compares, and writes `report.json`, `summary.md` and `images/`. |
| `strata.lock.json` | The Strata release: version, asset URL and SHA-256 from its `SHA256SUMS`. Bump every field together. |
| `schema.json` | The site config schema. |
| `test.cjs`, `fixture/` | The end-to-end self-test run by the kit's `visual-diff` CI job. It covers an unchanged head, a heading change, a flaky retake, a page that grows, a page that fails to load, and a base that does not build. |

The pure helpers are unit-tested in `__tests__/visualDiff.test.ts`.
