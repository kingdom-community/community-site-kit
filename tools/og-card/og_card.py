#!/usr/bin/env python3
"""Draw a site's link-preview card (og:image): a Strata-rendered 3D scene with the
site's title and wordmark over it, as a 1200x630 PNG.

    python3 og_card.py path/to/og-card.json

A card spec is a JSON file kept in the site's repository. It names a scene from
SCENES below, a seed, a fixed sun, the text, and where the PNG goes:

    {
      "output": "../public/og-image.png",
      "scene": "castle",
      "seed": 7,
      "sun": {"azimuth": 235, "elevation": 14},
      "wordmark": "kingdomfirstera.com",
      "title": "Kingdom: First Era",
      "subtitle": "A medieval Minecraft community",
      "url": "kingdomfirstera.com",
      "accent": "#c9a227",
      "alt": "A stone castle with gold banners on a green hill at golden hour ..."
    }

Paths are relative to the spec file. The card's provenance (tool commit, Strata
release and SHA-256, Pillow and font hashes, the spec and the PNG's SHA-256) is
written beside the spec as <spec stem>.provenance.json.

Nothing here is live: the scene is built from the seed alone (no clock, no data
from the site), rendered once, headless, by Strata's official Python binding
(strata-engine, pure ctypes over the C ABI), and committed. With the pinned
Strata release, the pinned Pillow, the same font files and the same Mesa
llvmpipe, two runs write the same bytes; `--check` re-renders and compares.

Strata is the release in strata.lock.json beside this file, downloaded once into
a per-user cache and checked against the pinned SHA-256 (a mismatch is deleted,
never loaded). `--strata PATH` or STRATA_LIBRARY uses a local libstrata instead.
Headless rendering needs libEGL and a Mesa driver; without a GPU set
LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=llvmpipe (the default here).

Exit status: 0 written (or --check matched); 1 render failed, came out blank or
--check differed; 2 bad spec; 3 Strata, EGL or Mesa could not be loaded.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import platform
import random
import subprocess
import sys
from pathlib import Path
from typing import Callable, Dict, List, Optional, Sequence, Tuple

HERE = Path(__file__).resolve().parent
LOCK = HERE / "strata.lock.json"

WIDTH, HEIGHT = 1200, 630
SUPERSAMPLE = 2  # rendered at 2400x1260 and reduced, for clean edges
FONT_DIRS = ("/usr/share/fonts/truetype/dejavu", "/usr/share/fonts/dejavu", "/usr/share/fonts/TTF")
BOLD, REGULAR = "DejaVuSans-Bold.ttf", "DejaVuSans.ttf"

EXIT_RENDER, EXIT_SPEC, EXIT_STRATA = 1, 2, 3

Vec = Tuple[float, float, float]
Color = Tuple[float, float, float]


class CardError(Exception):
    def __init__(self, message: str, code: int = EXIT_RENDER):
        super().__init__(message)
        self.code = code


# --------------------------------------------------------------------------- spec

REQUIRED = ("output", "scene", "title", "url", "alt")
OPTIONAL = ("seed", "sun", "wordmark", "subtitle", "accent", "palette", "logo", "credit")


def hex_rgb(value: str) -> Tuple[int, int, int]:
    text = value.strip().lstrip("#")
    if len(text) != 6 or any(c not in "0123456789abcdefABCDEF" for c in text):
        raise CardError("colour %r is not #rrggbb" % value, EXIT_SPEC)
    return int(text[0:2], 16), int(text[2:4], 16), int(text[4:6], 16)


def validate_spec(spec: dict) -> dict:
    """The spec with defaults filled in. Raises CardError(EXIT_SPEC) on anything wrong."""
    if not isinstance(spec, dict):
        raise CardError("a card spec is a JSON object", EXIT_SPEC)
    missing = [k for k in REQUIRED if not str(spec.get(k, "")).strip()]
    if missing:
        raise CardError("card spec is missing %s" % ", ".join(missing), EXIT_SPEC)
    unknown = sorted(set(spec) - set(REQUIRED) - set(OPTIONAL) - {"comment"})
    if unknown:
        raise CardError("card spec has unknown keys %s" % ", ".join(unknown), EXIT_SPEC)
    if spec["scene"] not in SCENES:
        raise CardError("scene %r is not one of %s" % (spec["scene"], ", ".join(sorted(SCENES))), EXIT_SPEC)
    if not str(spec["output"]).lower().endswith(".png"):
        raise CardError("output must be a .png", EXIT_SPEC)
    alt = str(spec["alt"]).strip()
    if len(alt) < 20 or len(alt) > 420:
        raise CardError("alt text should describe the picture in 20-420 characters (it is og:image:alt)", EXIT_SPEC)
    out = dict(spec)
    out["seed"] = int(spec.get("seed", 1))
    sun = spec.get("sun") or {}
    out["sun"] = {"azimuth": float(sun.get("azimuth", 225.0)), "elevation": float(sun.get("elevation", 20.0))}
    if not -10.0 <= out["sun"]["elevation"] <= 90.0:
        raise CardError("sun elevation must be -10..90 degrees", EXIT_SPEC)
    out["accent"] = spec.get("accent", "#4263eb")
    hex_rgb(out["accent"])
    out.setdefault("wordmark", "")
    out.setdefault("subtitle", "")
    out.setdefault("credit", "Rendered with Strata")
    return out


# --------------------------------------------------------------------------- noise


class Noise:
    """Seeded 2D value noise; the same seed gives the same field on every machine
    (integer hashing and float arithmetic only, no platform random)."""

    def __init__(self, seed: int):
        rng = random.Random(seed)
        self.perm = list(range(256))
        rng.shuffle(self.perm)
        self.perm += self.perm
        self.values = [rng.random() for _ in range(256)]

    def _lattice(self, x: int, z: int) -> float:
        return self.values[self.perm[(self.perm[x & 255] + z) & 255]]

    def value(self, x: float, z: float) -> float:
        x0, z0 = math.floor(x), math.floor(z)
        fx, fz = x - x0, z - z0
        sx, sz = fx * fx * (3 - 2 * fx), fz * fz * (3 - 2 * fz)
        a, b = self._lattice(x0, z0), self._lattice(x0 + 1, z0)
        c, d = self._lattice(x0, z0 + 1), self._lattice(x0 + 1, z0 + 1)
        top, bottom = a + (b - a) * sx, c + (d - c) * sx
        return top + (bottom - top) * sz

    def fbm(self, x: float, z: float, octaves: int = 4) -> float:
        total, amplitude, frequency, norm = 0.0, 1.0, 1.0, 0.0
        for _ in range(octaves):
            total += amplitude * self.value(x * frequency, z * frequency)
            norm += amplitude
            amplitude *= 0.5
            frequency *= 2.0
        return total / norm


# --------------------------------------------------------------------------- geometry


def _sub(a: Vec, b: Vec) -> Vec:
    return a[0] - b[0], a[1] - b[1], a[2] - b[2]


def _cross(a: Vec, b: Vec) -> Vec:
    return a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]


def _dot(a: Vec, b: Vec) -> float:
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


class MeshBuilder:
    """Flat-shaded triangles with per-vertex colours, sent to Strata as one mesh.
    Each triangle is wound outward from the solid's centre it is given, so callers
    never think about winding (Strata culls back faces)."""

    def __init__(self) -> None:
        self.positions: List[float] = []
        self.colors: List[float] = []

    def __len__(self) -> int:
        return len(self.positions) // 9

    def tri(self, a: Vec, b: Vec, c: Vec, color: Color, inside: Vec) -> None:
        normal = _cross(_sub(b, a), _sub(c, a))
        if _dot(normal, _sub(a, inside)) < 0:
            b, c = c, b
        for p in (a, b, c):
            self.positions.extend(p)
            self.colors.extend(color)

    def quad(self, a: Vec, b: Vec, c: Vec, d: Vec, color: Color, inside: Vec) -> None:
        self.tri(a, b, c, color, inside)
        self.tri(a, c, d, color, inside)

    def box(self, center: Vec, size: Vec, color: Color, top: Optional[Color] = None) -> None:
        cx, cy, cz = center
        hx, hy, hz = size[0] / 2, size[1] / 2, size[2] / 2
        v = [(cx + sx * hx, cy + sy * hy, cz + sz * hz) for sx in (-1, 1) for sy in (-1, 1) for sz in (-1, 1)]
        faces = (((0, 1, 3, 2), color), ((4, 6, 7, 5), color), ((0, 4, 5, 1), color),
                 ((2, 3, 7, 6), top or color), ((0, 2, 6, 4), color), ((1, 5, 7, 3), color))
        for (i, j, k, m), col in faces:
            self.quad(v[i], v[j], v[k], v[m], col, center)

    def cylinder(self, base: Vec, radius: float, height: float, color: Color, segments: int = 16,
                 top: Optional[Color] = None) -> None:
        bx, by, bz = base
        inside = (bx, by + height / 2, bz)
        ring = [(bx + radius * math.cos(2 * math.pi * i / segments), bz + radius * math.sin(2 * math.pi * i / segments))
                for i in range(segments)]
        for i in range(segments):
            (x0, z0), (x1, z1) = ring[i], ring[(i + 1) % segments]
            self.quad((x0, by, z0), (x1, by, z1), (x1, by + height, z1), (x0, by + height, z0), color, inside)
            self.tri((bx, by + height, bz), (x0, by + height, z0), (x1, by + height, z1), top or color, inside)

    def cone(self, base: Vec, radius: float, height: float, color: Color, segments: int = 12) -> None:
        bx, by, bz = base
        apex = (bx, by + height, bz)
        inside = (bx, by + height / 4, bz)
        for i in range(segments):
            a0, a1 = 2 * math.pi * i / segments, 2 * math.pi * (i + 1) / segments
            p0 = (bx + radius * math.cos(a0), by, bz + radius * math.sin(a0))
            p1 = (bx + radius * math.cos(a1), by, bz + radius * math.sin(a1))
            self.tri(p0, p1, apex, color, inside)
            self.tri(p0, p1, base, color, inside)

    def roof(self, center: Vec, width: float, depth: float, height: float, color: Color, gable: Color) -> None:
        """A gabled roof whose ridge runs along x, sitting on center (the eaves' middle)."""
        cx, cy, cz = center
        hw, hd = width / 2, depth / 2
        a, b = (cx - hw, cy, cz - hd), (cx + hw, cy, cz - hd)
        c, d = (cx + hw, cy, cz + hd), (cx - hw, cy, cz + hd)
        r0, r1 = (cx - hw, cy + height, cz), (cx + hw, cy + height, cz)
        inside = (cx, cy + height / 3, cz)
        self.quad(a, b, r1, r0, color, inside)
        self.quad(d, c, r1, r0, color, inside)
        self.tri(a, d, r0, gable, inside)
        self.tri(b, c, r1, gable, inside)

    def sphere(self, center: Vec, radius: float, color: Color, rings: int = 10, segments: int = 16,
               squash: float = 1.0) -> None:
        cx, cy, cz = center

        def point(i: int, j: int) -> Vec:
            theta, phi = math.pi * i / rings, 2 * math.pi * j / segments
            return (cx + radius * math.sin(theta) * math.cos(phi), cy + radius * squash * math.cos(theta),
                    cz + radius * math.sin(theta) * math.sin(phi))

        for i in range(rings):
            for j in range(segments):
                a, b, c, d = point(i, j), point(i, j + 1), point(i + 1, j + 1), point(i + 1, j)
                if i > 0:
                    self.tri(a, b, c, color, center)
                if i < rings - 1:
                    self.tri(a, c, d, color, center)

    def flag(self, base: Vec, pole: float, color: Color, toward: float = 1.0, size: Tuple[float, float] = (1.6, 1.0)) -> None:
        """A pole with a pennant hanging from its top, flying along +x (toward=1) or -x."""
        bx, by, bz = base
        self.box((bx, by + pole / 2, bz), (0.12, pole, 0.12), (0.25, 0.2, 0.16))
        w, h = size
        self.box((bx + toward * (w / 2 + 0.06), by + pole - h / 2 - 0.1, bz), (w, h, 0.08), color)

    def ring(self, center: Vec, inner: float, outer: float, color: Color, segments: int = 48) -> None:
        cx, cy, cz = center
        for i in range(segments):
            a0, a1 = 2 * math.pi * i / segments, 2 * math.pi * (i + 1) / segments
            p = [(cx + r * math.cos(a), cy, cz + r * math.sin(a)) for r, a in ((inner, a0), (outer, a0), (outer, a1), (inner, a1))]
            self.quad(p[0], p[1], p[2], p[3], color, (cx, cy - 1, cz))
            self.quad(p[0], p[1], p[2], p[3], color, (cx, cy + 1, cz))


# --------------------------------------------------------------------------- scenes


class Scene:
    """Everything a scene hands the renderer. Lighting is "sun" (a fixed sun, sky,
    fog and shadows) or "space" (point lights over a flat ambient)."""

    def __init__(self) -> None:
        self.eye: Vec = (20.0, 14.0, 20.0)
        self.target: Vec = (0.0, 0.0, 0.0)
        self.fov = 40.0
        self.far = 400.0
        self.lighting = "sun"
        self.ambient = 0.25
        self.sky = True
        self.fog = True
        self.clear: Tuple[float, float, float, float] = (0.55, 0.7, 0.9, 1.0)
        self.terrain: Optional[dict] = None
        self.mesh = MeshBuilder()
        self.unlit = MeshBuilder()
        self.lines: List[Tuple[Vec, Tuple[float, float, float, float]]] = []
        # (position, size in pixels, rgba, world diameter): a world diameter > 0 draws a soft glow
        self.points: List[Tuple[Vec, float, Tuple[float, float, float, float], float]] = []
        self.lights: List[Tuple[Vec, float, Color, float, bool]] = []
        self.shadow_distance = 120.0
        # A lens shift, in NDC units: moves the whole picture right without turning the
        # camera, so the scene's subject lands in the half of the card the text leaves clear.
        self.shift = 0.4


def _blend(a: Color, b: Color, t: float) -> Color:
    t = max(0.0, min(1.0, t))
    return a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t


def _shade(c: Color, k: float) -> Color:
    return min(1.0, c[0] * k), min(1.0, c[1] * k), min(1.0, c[2] * k)


def _accent(spec: dict) -> Color:
    r, g, b = hex_rgb(spec["accent"])
    return r / 255.0, g / 255.0, b / 255.0


def _heightfield(scene: Scene, n: int, cell: float, height: Callable[[float, float], float],
                 color: Callable[[float, float, float], Color]) -> Callable[[float, float], float]:
    """A smooth terrain tile centred on the origin; returns a height lookup for placing things."""
    half = (n - 1) * cell / 2
    heights, colors = [], []
    for zi in range(n):
        for xi in range(n):
            x, z = xi * cell - half, zi * cell - half
            h = height(x, z)
            heights.append(h)
            colors.extend(color(x, z, h))
    scene.terrain = {"origin": (-half, 0.0, -half), "cell": cell, "n": n, "heights": heights, "colors": colors}

    def at(x: float, z: float) -> float:
        fx, fz = (x + half) / cell, (z + half) / cell
        xi, zi = max(0, min(n - 2, int(fx))), max(0, min(n - 2, int(fz)))
        tx, tz = fx - xi, fz - zi
        h00, h10 = heights[zi * n + xi], heights[zi * n + xi + 1]
        h01, h11 = heights[(zi + 1) * n + xi], heights[(zi + 1) * n + xi + 1]
        return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz

    return at


def _tree(mesh: MeshBuilder, x: float, y: float, z: float, scale: float, leaf: Color) -> None:
    mesh.box((x, y + 0.5 * scale, z), (0.35 * scale, 1.0 * scale, 0.35 * scale), (0.33, 0.22, 0.13))
    mesh.cone((x, y + 0.8 * scale, z), 1.1 * scale, 2.4 * scale, leaf, segments=8)
    mesh.cone((x, y + 1.9 * scale, z), 0.8 * scale, 1.8 * scale, _shade(leaf, 1.12), segments=8)


GRASS, DRY, ROCK, SAND, WATER, DEEP = ((0.29, 0.52, 0.22), (0.52, 0.55, 0.28), (0.48, 0.47, 0.45),
                                       (0.80, 0.74, 0.52), (0.18, 0.42, 0.62), (0.08, 0.24, 0.45))
STONE, STONE_DARK, WOOD, PLASTER = (0.66, 0.64, 0.6), (0.5, 0.49, 0.47), (0.42, 0.28, 0.17), (0.86, 0.82, 0.72)


def scene_castle(spec: dict, rng: random.Random, noise: Noise) -> Scene:
    """A walled stone castle on a green hill, banners in the accent colour (KFE)."""
    s = Scene()
    accent = _accent(spec)

    def height(x: float, z: float) -> float:
        d = math.hypot(x, z)
        hill = 6.0 * math.exp(-(d / 16.0) ** 2)
        return hill + 3.0 * (noise.fbm(x * 0.05, z * 0.05) - 0.5) + (0 if d < 11 else 0)

    def color(x: float, z: float, h: float) -> Color:
        return _blend(GRASS, DRY, noise.fbm(x * 0.09 + 50, z * 0.09) * 1.3 - 0.35)

    at = _heightfield(s, 129, 1.0, height, color)
    m = s.mesh
    base = at(0, 0) - 0.6
    wall, half = 4.2, 7.0
    # curtain walls with crenellations
    for side in range(4):
        horizontal = side < 2
        sign = -1 if side % 2 == 0 else 1
        for i in range(-6, 7):
            x, z = (i, sign * half) if horizontal else (sign * half, i)
            m.box((x, base + wall / 2, z), (1.02, wall, 1.02), STONE if (i + side) % 3 else STONE_DARK)
            if i % 2 == 0:
                m.box((x, base + wall + 0.35, z), (0.8, 0.7, 0.8), STONE)
    # gate
    m.box((0, base + 1.3, half + 0.05), (2.0, 2.6, 1.1), (0.22, 0.16, 0.1))
    # corner towers with conical roofs
    for x in (-half, half):
        for z in (-half, half):
            m.cylinder((x, base, z), 1.7, wall + 2.6, STONE, segments=14)
            m.cone((x, base + wall + 2.6, z), 2.1, 3.2, _shade(accent, 0.55), segments=14)
            m.flag((x, base + wall + 5.6, z), 2.4, accent, toward=1.0, size=(1.5, 0.9))
    # keep
    m.box((-1.0, base + 4.8, -1.5), (6.0, 9.6, 5.0), STONE, top=STONE_DARK)
    for i in range(-2, 3):
        for zz in (-4.0, 1.0):
            m.box((-1.0 + i * 1.3, base + 10.0, zz), (0.7, 0.8, 0.7), STONE)
    m.cylinder((2.4, base, -3.2), 1.3, 12.5, STONE_DARK, segments=12)
    m.cone((2.4, base + 12.5, -3.2), 1.7, 3.0, _shade(accent, 0.55), segments=12)
    m.flag((-1.0, base + 9.6, -1.5), 4.6, accent, toward=1.0, size=(2.6, 1.6))
    m.flag((2.4, base + 15.5, -3.2), 2.0, (0.92, 0.9, 0.84), toward=1.0, size=(1.3, 0.8))
    # hall roof inside the walls
    m.box((-1.5, base + 1.5, 4.0), (6.0, 3.0, 3.0), PLASTER)
    m.roof((-1.5, base + 3.0, 4.0), 6.4, 3.4, 1.8, (0.55, 0.25, 0.18), PLASTER)
    # trees on the slopes
    for _ in range(70):
        a, r = rng.uniform(0, 2 * math.pi), rng.uniform(13, 40)
        x, z = r * math.cos(a), r * math.sin(a)
        if x > 8 and z > 8:  # keep the camera's foreground open
            continue
        _tree(m, x, at(x, z) - 0.2, z, rng.uniform(0.8, 1.4), _shade(GRASS, rng.uniform(0.6, 0.85)))
    s.eye, s.target, s.fov = (30.0, 15.0, 28.0), (-4.0, base + 4.0, -3.0), 36.0
    return s


def _voxel_world(s: Scene, noise: Noise, cols: int, rows: int, sea: int, palette: dict,
                 tint: Optional[Callable[[int, int], Optional[Color]]] = None) -> Dict[Tuple[int, int], int]:
    """Blocky columns, one unit per block, the top faces coloured by height band."""
    tops: Dict[Tuple[int, int], int] = {}
    for zi in range(rows):
        for xi in range(cols):
            x, z = xi - cols / 2, zi - rows / 2
            h = int(round(1 + 9 * noise.fbm(x * 0.045 + 7, z * 0.045 + 3)))
            tops[(xi, zi)] = h
    for (xi, zi), h in tops.items():
        x, z = xi - cols / 2 + 0.5, zi - rows / 2 + 0.5
        if h <= sea:
            top_color = palette["water"] if h == sea else palette["deep"]
            s.mesh.box((x, sea / 2, z), (1.0, sea, 1.0), _shade(palette["sand"], 0.8), top=top_color)
            continue
        band = palette["sand"] if h == sea + 1 else palette["grass"] if h < sea + 6 else palette["rock"]
        jitter = 0.94 + 0.12 * noise.value(xi * 0.9 + 11, zi * 0.9)
        top = _shade(band, jitter)
        if tint:
            claim = tint(xi, zi)
            if claim:
                top = _blend(top, claim, 0.6)
        s.mesh.box((x, h / 2, z), (1.0, h, 1.0), _shade(palette["dirt"], jitter), top=top)
    return tops


def scene_terrain(spec: dict, rng: random.Random, noise: Noise) -> Scene:
    """A blocky island of grass, sand and water with trees, rocks and a cottage (Roam)."""
    s = Scene()
    palette = {"grass": (0.36, 0.62, 0.26), "sand": SAND, "rock": (0.55, 0.55, 0.52), "dirt": (0.45, 0.33, 0.22),
               "water": (0.22, 0.5, 0.75), "deep": (0.14, 0.36, 0.6)}
    cols, rows, sea = 96, 72, 3
    tops = _voxel_world(s, noise, cols, rows, sea, palette)
    m = s.mesh
    for (xi, zi), h in sorted(tops.items()):
        x, z = xi - cols / 2 + 0.5, zi - rows / 2 + 0.5
        if sea + 1 < h < sea + 6 and rng.random() < 0.07:
            _tree(m, x, h, z, rng.uniform(0.55, 0.8), _shade((0.2, 0.45, 0.18), rng.uniform(0.85, 1.1)))
        elif h >= sea + 6 and rng.random() < 0.05:
            m.box((x, h + 0.3, z), (0.7, 0.6, 0.6), (0.6, 0.6, 0.58))
    # a cottage on the flattest dry ground near the middle
    best = min(((abs(xi - cols * 0.55) + abs(zi - rows * 0.5), xi, zi) for (xi, zi), h in tops.items()
                if sea + 2 <= h <= sea + 4), default=None)
    if best:
        _, xi, zi = best
        h = tops[(xi, zi)]
        x, z = xi - cols / 2 + 0.5, zi - rows / 2 + 0.5
        m.box((x, h + 1.0, z), (3.0, 2.0, 2.4), PLASTER)
        m.roof((x, h + 2.0, z), 3.5, 2.9, 1.4, (0.62, 0.26, 0.16), PLASTER)
        m.box((x + 0.5, h + 0.6, z + 1.21), (0.6, 1.2, 0.05), WOOD)
    s.eye, s.target, s.fov = (34.0, 36.0, 40.0), (0.0, 0.0, -2.0), 38.0
    return s


def scene_claims(spec: dict, rng: random.Random, noise: Noise) -> Scene:
    """A blocky world split into tinted 8x8 claims with outlined borders and banners
    (Minecraft factions; the factions are invented, not anyone's real data)."""
    s = Scene()
    palette = {"grass": (0.37, 0.58, 0.27), "sand": (0.84, 0.79, 0.58), "rock": (0.5, 0.5, 0.5), "dirt": (0.47, 0.34, 0.23),
               "water": (0.2, 0.38, 0.75), "deep": (0.14, 0.27, 0.62)}
    factions = [_accent(spec), (0.85, 0.22, 0.2), (0.95, 0.75, 0.15), (0.55, 0.3, 0.8)]
    cols, rows, sea, chunk = 96, 72, 3, 8
    seeds = [(rng.randrange(1, cols // chunk - 1), rng.randrange(1, rows // chunk - 1)) for _ in factions]
    owner: Dict[Tuple[int, int], int] = {}
    for i, (cx, cz) in enumerate(seeds):
        for dx in (-1, 0, 1):
            for dz in (-1, 0, 1):
                if abs(dx) + abs(dz) < 2 or rng.random() < 0.45:
                    key = (cx + dx, cz + dz)
                    if 0 <= key[0] < cols // chunk and 0 <= key[1] < rows // chunk:
                        owner.setdefault(key, i)

    def tint(xi: int, zi: int) -> Optional[Color]:
        o = owner.get((xi // chunk, zi // chunk))
        return factions[o] if o is not None else None

    tops = _voxel_world(s, noise, cols, rows, sea, palette, tint)
    for (ck, o) in sorted(owner.items()):
        cx, cz = ck
        for nx, nz, edge in ((cx - 1, cz, "w"), (cx + 1, cz, "e"), (cx, cz - 1, "n"), (cx, cz + 1, "s")):
            if owner.get((nx, nz)) == o:
                continue
            for i in range(chunk):
                if edge in "we":
                    xi = cx * chunk + (0 if edge == "w" else chunk - 1)
                    zi = cz * chunk + i
                    x = xi - cols / 2 + (0.0 if edge == "w" else 1.0)
                    a, b = (x, None, zi - rows / 2), (x, None, zi - rows / 2 + 1)
                else:
                    xi = cx * chunk + i
                    zi = cz * chunk + (0 if edge == "n" else chunk - 1)
                    z = zi - rows / 2 + (0.0 if edge == "n" else 1.0)
                    a, b = (xi - cols / 2, None, z), (xi - cols / 2 + 1, None, z)
                y = max(tops[(xi, zi)], sea) + 0.08
                col = factions[o] + (1.0,)
                s.lines.append(((a[0], y, a[2]), col))
                s.lines.append(((b[0], y, b[2]), col))
    for i, (cx, cz) in enumerate(seeds):
        xi, zi = cx * chunk + chunk // 2, cz * chunk + chunk // 2
        if owner.get((cx, cz)) != i:
            continue
        x, z = xi - cols / 2 + 0.5, zi - rows / 2 + 0.5
        h = max(tops[(xi, zi)], sea)
        s.mesh.flag((x, h, z), 4.0, factions[i], toward=1.0, size=(1.8, 1.2))
        s.mesh.box((x - 1.5, h + 0.9, z + 1.5), (2.4, 1.8, 2.0), (0.7, 0.66, 0.6))
        s.mesh.roof((x - 1.5, h + 1.8, z + 1.5), 2.8, 2.4, 1.1, _shade(factions[i], 0.6), (0.7, 0.66, 0.6))
    s.eye, s.target, s.fov = (30.0, 40.0, 42.0), (0.0, 1.0, -2.0), 40.0
    return s


def scene_coast(spec: dict, rng: random.Random, noise: Noise) -> Scene:
    """A green gulf: headlands around a bay of viridian water, with a lighthouse
    and banners on the hills (an invented landscape, no real map data)."""
    s = Scene()
    accent = _accent(spec)
    sea_level = 0.0

    def height(x: float, z: float) -> float:
        bay = math.exp(-((x + 4) / 22.0) ** 2 - ((z + 10) / 34.0) ** 2) * 9.0
        land = 7.5 * noise.fbm(x * 0.035 + 20, z * 0.035 - 5, 5) - 1.0
        return max(land + 3.0 - bay, -2.5)

    def color(x: float, z: float, h: float) -> Color:
        if h < -0.8:
            return _blend(_shade((0.06, 0.42, 0.38), 1.0), (0.03, 0.22, 0.28), (-h - 0.8) / 2)
        if h < sea_level:
            return (0.1, 0.55, 0.48)
        if h < 0.6:
            return (0.82, 0.77, 0.58)
        return _blend((0.27, 0.55, 0.3), (0.42, 0.5, 0.33), noise.fbm(x * 0.1, z * 0.1 + 9) * 1.4 - 0.4)

    raw = _heightfield(s, 161, 1.0, height, color)
    terrain = s.terrain
    assert terrain is not None
    terrain["heights"] = [max(h, sea_level - 0.05) if h < sea_level else h for h in terrain["heights"]]

    def at(x: float, z: float) -> float:
        return max(raw(x, z), sea_level)

    m = s.mesh
    spots = []
    for _ in range(400):
        x, z = rng.uniform(-60, 60), rng.uniform(-60, 40)
        if raw(x, z) > 2.0:
            spots.append((x, z))
    for x, z in spots[:60]:
        _tree(m, x, at(x, z) - 0.2, z, rng.uniform(0.7, 1.2), _shade((0.16, 0.42, 0.24), rng.uniform(0.8, 1.1)))
    flags = [(x, z) for x, z in spots[60:] if raw(x, z) > 3.5][:5]
    colors = [accent, (0.85, 0.3, 0.25), (0.95, 0.8, 0.3), (0.3, 0.45, 0.85), (0.9, 0.9, 0.9)]
    for (x, z), col in zip(flags, colors):
        m.flag((x, at(x, z) - 0.1, z), 3.4, col, toward=1.0, size=(1.6, 1.0))
    # lighthouse on the shore nearest the camera side of the bay
    shore = min(((abs(raw(x, z) - 0.8) + abs(x - 6) * 0.05, x, z) for x in range(-20, 30, 2) for z in range(5, 40, 2)),
                default=(0, 8.0, 20.0))
    _, lx, lz = shore
    ly = at(lx, lz)
    for i in range(6):
        m.cylinder((lx, ly + i * 1.2, lz), 1.0 - i * 0.06, 1.2, (0.92, 0.92, 0.9) if i % 2 == 0 else (0.75, 0.2, 0.18))
    m.cylinder((lx, ly + 7.2, lz), 0.75, 0.9, (0.98, 0.92, 0.6))
    m.cone((lx, ly + 8.1, lz), 0.95, 1.1, (0.2, 0.2, 0.22))
    s.eye, s.target, s.fov = (lx + 30.0, ly + 22.0, lz + 30.0), (-6.0, 0.0, -10.0), 42.0
    return s


def scene_village(spec: dict, rng: random.Random, noise: Noise) -> Scene:
    """A small village of houses around a square, roofs in the site's palette, lamps lit."""
    s = Scene()
    def height(x: float, z: float) -> float:
        return 2.2 * (noise.fbm(x * 0.04 + 3, z * 0.04) - 0.5) + 0.02 * math.hypot(x, z) ** 1.3 * 0.2

    def color(x: float, z: float, h: float) -> Color:
        if abs(x) < 1.4 or abs(z) < 1.4:
            return (0.62, 0.56, 0.45)  # the two crossing streets
        return _blend(GRASS, DRY, noise.fbm(x * 0.08, z * 0.08 + 4) * 1.2 - 0.35)

    at = _heightfield(s, 97, 1.0, height, color)
    m = s.mesh
    roofs = [(r / 255.0, g / 255.0, b / 255.0) for r, g, b in _spec_palette(spec)]
    k = 0
    for gx in range(-4, 5):
        for gz in range(-4, 5):
            if gx == 0 or gz == 0 or rng.random() < 0.25:
                continue
            x, z = gx * 6.0 + rng.uniform(-0.8, 0.8), gz * 6.0 + rng.uniform(-0.8, 0.8)
            y = at(x, z) - 0.3
            w, d, h = rng.uniform(3.0, 4.2), rng.uniform(2.6, 3.4), rng.uniform(2.0, 3.6)
            m.box((x, y + h / 2, z), (w, h, d), _shade(PLASTER, rng.uniform(0.9, 1.05)))
            m.roof((x, y + h, z), w + 0.5, d + 0.5, rng.uniform(1.2, 1.8), roofs[k % len(roofs)], PLASTER)
            m.box((x + w / 4, y + 0.7, z + d / 2 + 0.01), (0.6, 1.4, 0.05), WOOD)
            k += 1
    for _ in range(60):
        x, z = rng.uniform(-40, 40), rng.uniform(-40, 40)
        if max(abs(x), abs(z)) > 27:
            _tree(m, x, at(x, z) - 0.2, z, rng.uniform(0.9, 1.4), _shade(GRASS, rng.uniform(0.6, 0.85)))
    m.cylinder((0, at(0, 0), 0), 1.5, 0.7, STONE, segments=16, top=(0.25, 0.45, 0.62))  # the well
    lamp_spots = [(-2.2, -9.0), (2.2, 9.0), (-9.0, 2.2), (9.0, -2.2), (2.2, -15.0), (-15.0, -2.2), (15.0, 2.2)]
    night = spec["sun"]["elevation"] < 8
    for x, z in lamp_spots:
        y = at(x, z)
        m.box((x, y + 1.3, z), (0.15, 2.6, 0.15), (0.2, 0.2, 0.22))
        s.unlit.box((x, y + 2.75, z), (0.45, 0.45, 0.45), (1.0, 0.85, 0.5))
        if night:
            s.lights.append(((x, y + 2.75, z), 9.0, (1.0, 0.78, 0.45), 1.6, False))
    s.eye, s.target, s.fov = (34.0, 22.0, 30.0), (-2.0, 0.0, -3.0), 40.0
    return s


def _spec_palette(spec: dict) -> List[Tuple[int, int, int]]:
    raw = spec.get("palette") or []
    return [hex_rgb(c) for c in raw] or [hex_rgb(spec["accent"])]


def scene_orbit(spec: dict, rng: random.Random, noise: Noise) -> Scene:
    """A star lighting its planets, their orbits traced, under a field of stars (orrery)."""
    s = Scene()
    s.lighting, s.sky, s.fog, s.ambient = "space", False, False, 0.06
    s.clear = (0.01, 0.012, 0.03, 1.0)
    s.unlit.sphere((0, 0, 0), 3.2, (1.0, 0.86, 0.5), rings=16, segments=28)
    for diameter, alpha in ((8.5, 0.5), (12.0, 0.25), (17.0, 0.12)):
        s.points.append(((0.0, 0.0, 0.0), 1.0, (1.0, 0.8, 0.45, alpha), diameter))
    s.lights.append(((0.0, 0.0, 0.0), 200.0, (1.0, 0.95, 0.85), 6.0, False))
    planets = [(6.5, 0.45, (0.7, 0.66, 0.6)), (9.5, 0.8, (0.9, 0.75, 0.5)), (13.5, 0.85, (0.3, 0.5, 0.85)),
               (17.5, 0.6, (0.8, 0.4, 0.25)), (25.0, 2.0, (0.85, 0.72, 0.55)), (33.0, 1.6, (0.9, 0.82, 0.6))]
    for i, (radius, size, col) in enumerate(planets):
        angle = rng.uniform(0, 2 * math.pi)
        if i == 2:
            angle = math.radians(35)  # keep the blue one in view
        px, pz = radius * math.cos(angle), radius * math.sin(angle)
        s.mesh.sphere((px, 0, pz), size, col, rings=14, segments=24)
        if i == 5:
            s.mesh.ring((px, 0, pz), size * 1.4, size * 2.3, (0.8, 0.72, 0.55))
        steps = 128
        for j in range(steps):
            a0, a1 = 2 * math.pi * j / steps, 2 * math.pi * (j + 1) / steps
            col4 = (0.45, 0.55, 0.8, 1.0)
            s.lines.append(((radius * math.cos(a0), 0, radius * math.sin(a0)), col4))
            s.lines.append(((radius * math.cos(a1), 0, radius * math.sin(a1)), col4))
    for _ in range(900):
        u, v = rng.uniform(-1, 1), rng.uniform(0, 2 * math.pi)
        r = math.sqrt(1 - u * u)
        p = (180 * r * math.cos(v), 180 * u, 180 * r * math.sin(v))
        b = rng.uniform(0.4, 1.0)
        s.points.append((p, rng.choice((1.0, 1.5, 2.0, 2.5)), (b, b, min(1.0, b * 1.05), 1.0), 0.0))
    s.eye, s.target, s.fov, s.far = (30.0, 14.0, 34.0), (-15.0, -2.0, 9.0), 44.0, 400.0
    s.shift = 0.0  # already framed to the right
    return s


def scene_arcade(spec: dict, rng: random.Random, noise: Noise) -> Scene:
    """Arcade cabinets on a checkered floor at night, each screen glowing its own colour."""
    s = Scene()
    s.lighting, s.sky, s.fog, s.ambient = "space", False, False, 0.12
    s.clear = (0.03, 0.03, 0.07, 1.0)
    m = s.mesh
    for xi in range(-12, 13):
        for zi in range(-10, 11):
            col = (0.16, 0.16, 0.22) if (xi + zi) % 2 else (0.24, 0.24, 0.32)
            m.box((xi * 2.0, -0.1, zi * 2.0), (2.0, 0.2, 2.0), col)
    colors = [hex_rgb(c) for c in (spec.get("palette") or ["#4263eb", "#7048e8", "#1098ad", "#f59f00", "#e8590c", "#0ca678"])]
    colors_f = [(r / 255.0, g / 255.0, b / 255.0) for r, g, b in colors]
    k = 0
    for row, z in enumerate((-6.0, 2.0)):
        for i in range(7):
            x = (i - 3) * 3.2 + (1.6 if row else 0.0)
            col = colors_f[k % len(colors_f)]
            k += 1
            body = _shade(col, 0.35)
            m.box((x, 1.6, z), (2.0, 3.2, 1.6), body)
            m.box((x, 3.45, z + 0.1), (2.1, 0.5, 1.8), _shade(col, 0.6))
            m.box((x, 1.35, z + 1.0), (2.0, 0.25, 0.6), (0.12, 0.12, 0.14))
            s.unlit.box((x, 2.35, z + 0.81), (1.5, 1.1, 0.02), _shade(col, 1.25))
            s.unlit.box((x, 3.45, z + 1.01), (1.7, 0.3, 0.02), (1.0, 0.95, 0.8))
            for bx in (-0.4, 0.0, 0.4):
                s.unlit.box((x + bx, 1.5, z + 1.15), (0.16, 0.08, 0.16), colors_f[(k + int(bx * 10)) % len(colors_f)])
            s.lights.append(((x, 2.4, z + 2.2), 7.0, col, 2.2, False))
    s.lights.append(((0.0, 9.0, 10.0), 40.0, (0.6, 0.62, 0.8), 0.8, False))
    s.eye, s.target, s.fov = (12.0, 9.0, 17.0), (-1.0, 1.5, -1.5), 46.0
    s.shift = 0.25
    return s


def scene_microbiome(spec: dict, rng: random.Random, noise: Noise) -> Scene:
    """Microorganisms on a shared grid: alive, foraging and low-energy cells and
    biomatter left by the dead, in the simulation's own four colours (Microbiome)."""
    s = Scene()
    s.lighting, s.sky, s.fog, s.ambient = "space", False, False, 0.3
    s.clear = (0.04, 0.06, 0.06, 1.0)
    m = s.mesh
    cols, rows, cell = 22, 14, 2.0
    states = {"alive": (0.29, 0.87, 0.5), "foraging": (0.29, 0.66, 0.85), "low": (0.88, 0.32, 0.32),
              "biomatter": (0.72, 0.53, 0.3)}
    m.box((0, -0.35, 0), (cols * cell + 1.0, 0.5, rows * cell + 1.0), (0.09, 0.13, 0.12))
    for xi in range(cols):
        for zi in range(rows):
            x, z = (xi - cols / 2 + 0.5) * cell, (zi - rows / 2 + 0.5) * cell
            m.box((x, -0.05, z), (cell - 0.12, 0.1, cell - 0.12), (0.11, 0.17, 0.155))
            crowd = noise.fbm(xi * 0.25, zi * 0.25)
            roll = rng.random()
            if roll > crowd * 0.9:
                continue
            kind = rng.random()
            if kind < 0.18:
                m.cylinder((x, 0.0, z), 0.5, 0.12, states["biomatter"], segments=12)
                continue
            state = "foraging" if kind < 0.62 else "alive" if kind < 0.88 else "low"
            radius = 0.72 if state != "low" else 0.6
            m.sphere((x, radius, z), radius, states[state], rings=10, segments=18)
    s.lights.append(((-12.0, 26.0, 16.0), 90.0, (1.0, 0.98, 0.94), 2.0, True))
    s.lights.append(((26.0, 10.0, -12.0), 60.0, (0.6, 0.85, 0.9), 0.9, False))
    s.eye, s.target, s.fov = (15.0, 17.0, 20.0), (-10.0, 0.0, 2.0), 44.0
    s.shift = 0.0  # already framed to the right
    return s


SCENES: Dict[str, Callable[[dict, random.Random, Noise], Scene]] = {
    "arcade": scene_arcade,
    "castle": scene_castle,
    "claims": scene_claims,
    "coast": scene_coast,
    "microbiome": scene_microbiome,
    "orbit": scene_orbit,
    "terrain": scene_terrain,
    "village": scene_village,
}


def build_scene(spec: dict) -> Scene:
    seed = spec["seed"]
    return SCENES[spec["scene"]](spec, random.Random(seed), Noise(seed))


# --------------------------------------------------------------------------- strata


def strata_lock() -> dict:
    with open(LOCK, encoding="utf-8") as f:
        return json.load(f)


def load_strata(library: Optional[str]):
    """The strata module and a loaded, ABI-checked library."""
    os.environ.setdefault("LIBGL_ALWAYS_SOFTWARE", "1")
    os.environ.setdefault("GALLIUM_DRIVER", "llvmpipe")
    try:
        import strata  # noqa: WPS433 (an optional dependency, imported when rendering)
    except ImportError as exc:
        raise CardError("the strata-engine binding is not installed (pip install -r requirements.txt): %s" % exc,
                        EXIT_STRATA)
    lock = strata_lock()
    try:
        path = library or os.environ.get("STRATA_LIBRARY")
        lib = strata.load(path) if path else strata.load_release(lock["version"], lock["sha256"])
    except Exception as exc:  # StrataLoadError, OSError from dlopen, StrataAbiError
        raise CardError("could not load Strata: %s" % exc, EXIT_STRATA)
    return strata, lib


def render_scene(scene: Scene, strata, lib, sun: dict, width: int, height: int) -> bytes:
    """RGBA8 bytes, top row first."""
    import ctypes

    try:
        engine = strata.Engine(lib, width, height)
    except Exception as exc:
        raise CardError("could not create a headless Strata engine (is libEGL/Mesa installed?): %s" % exc, EXIT_STRATA)
    keep = []
    try:
        camera = lib.look_at(scene.eye, scene.target, fov_y_degrees=scene.fov, aspect=width / height,
                             near_plane=0.5, far_plane=scene.far)
        camera.projection[8] = -scene.shift  # column-major m[2][0]: x_ndc += shift
        engine.set_camera(camera)
        if scene.lighting == "space":
            lighting = lib.lighting_defaults(strata.LIGHTING_SPACE)
            lighting.legacy_ambient = scene.ambient
            engine.set_lighting(lighting)
        else:
            lighting = lib.lighting_defaults(strata.LIGHTING_SUN)
            lighting.cascade_count = 3
            lighting.shadow_map_size = 2048
            lighting.shadow_distance = scene.shadow_distance
            lighting.fog = 1 if scene.fog else 0
            engine.set_lighting(lighting)
            az, el = math.radians(sun["azimuth"]), math.radians(sun["elevation"])
            engine.set_sun_direction((math.cos(el) * math.sin(az), math.sin(el), math.cos(el) * math.cos(az)))
        if scene.lights:
            lights = []
            for pos, rng_, col, intensity, shadows in scene.lights[: strata.MAX_POINT_LIGHTS]:
                light = strata.PointLight()
                light.position, light.range, light.color, light.intensity = pos, rng_, col, intensity
                light.flags = strata.POINT_LIGHT_CAST_SHADOWS if shadows else 0
                lights.append(light)
            engine.set_point_lights(lights)
        if scene.terrain:
            t = scene.terrain
            n = t["n"]
            heights = (ctypes.c_float * (n * n))(*t["heights"])
            colors = (ctypes.c_float * (n * n * 3))(*t["colors"])
            keep += [heights, colors]
            tile = strata.TerrainTile()
            tile.origin, tile.cell_size, tile.samples_x, tile.samples_z = t["origin"], t["cell"], n, n
            tile.heights, tile.colors, tile.color = heights, colors, (1.0, 1.0, 1.0, 1.0)
            engine.set_terrain(tile)
        for builder, flags in ((scene.mesh, 0), (scene.unlit, strata.MESH_UNLIT)):
            if len(builder):
                count = len(builder.positions) // 3
                engine.add_mesh(builder.positions, list(range(count)), colors=builder.colors, flags=flags)
        clear_flags = strata.CLEAR_COLOR | strata.CLEAR_DEPTH | (strata.CLEAR_SKY if scene.sky else 0)
        engine.begin_frame(clear_color=scene.clear, clear_flags=clear_flags)
        if scene.points:
            points = []
            for pos, size, col, diameter in scene.points:
                p = strata.Point()
                p.position, p.size_pixels, p.world_diameter, p.color = pos, size * SUPERSAMPLE, diameter, col
                p.flags = strata.POINT_SOFT if diameter > 0 else 0
                points.append(p)
            engine.submit_points(points)
        if scene.lines:
            engine.submit_lines([strata.LineVertex(pos, col) for pos, col in scene.lines])
        engine.end_frame()
        rgba, w, h = engine.read_pixels()
    except CardError:
        raise
    except Exception as exc:
        raise CardError("Strata failed while rendering: %s" % exc)
    finally:
        engine.close()
    if (w, h) != (width, height):
        raise CardError("Strata returned a %dx%d frame for a %dx%d request" % (w, h, width, height))
    return rgba


# --------------------------------------------------------------------------- card


def find_font(name: str, dirs: Sequence[str] = FONT_DIRS) -> Path:
    for directory in dirs:
        path = Path(directory) / name
        if path.is_file():
            return path
    raise CardError("font %s not found in %s (install fonts-dejavu-core)" % (name, ", ".join(dirs)), EXIT_SPEC)


def fit_font(draw, text: str, path: Path, start: int, max_width: float, minimum: int):
    from PIL import ImageFont

    size = start
    while size > minimum:
        candidate = ImageFont.truetype(str(path), size)
        if draw.textlength(text, font=candidate) <= max_width:
            return candidate
        size -= 2
    return ImageFont.truetype(str(path), minimum)


def wrap(draw, text: str, font, max_width: float, max_lines: int = 2) -> List[str]:
    words, lines, line = text.split(), [], ""
    for word in words:
        candidate = (line + " " + word).strip()
        if draw.textlength(candidate, font=font) <= max_width or not line:
            line = candidate
        else:
            lines.append(line)
            line = word
    if line:
        lines.append(line)
    if len(lines) > max_lines:
        raise CardError("subtitle %r needs more than %d lines; shorten it" % (text, max_lines), EXIT_SPEC)
    return lines


def compose(scene_rgba: bytes, size: Tuple[int, int], spec: dict, spec_dir: Path, strata_version: str):
    """The finished 1200x630 RGB card: the render reduced, a scrim on the left, the text on it."""
    from PIL import Image, ImageDraw, ImageFont

    render = Image.frombytes("RGBA", size, scene_rgba).convert("RGB")
    card = render.resize((WIDTH, HEIGHT), Image.LANCZOS) if size != (WIDTH, HEIGHT) else render
    # A left-to-right scrim so white text holds 4.5:1 or better over any scene.
    row = bytes(scrim_alpha(x) for x in range(WIDTH))
    scrim = Image.frombytes("L", (WIDTH, 1), row).resize((WIDTH, HEIGHT), Image.NEAREST)
    card = Image.composite(Image.new("RGB", (WIDTH, HEIGHT), SCRIM_COLOR), card, scrim)
    draw = ImageDraw.Draw(card)
    bold, regular = find_font(BOLD), find_font(REGULAR)
    accent = hex_rgb(spec["accent"])
    left, column = TEXT_LEFT, TEXT_COLUMN

    top = 70
    if spec.get("logo"):
        logo = Image.open(spec_dir / spec["logo"]).convert("RGBA")
        logo.thumbnail((56, 56), Image.LANCZOS)
        card.paste(logo, (left, top - 8), logo)
        word_left = left + logo.width + 16
    else:
        word_left = left
    if spec["wordmark"]:
        draw.text((word_left, top + 20), spec["wordmark"].upper(), font=ImageFont.truetype(str(bold), 24),
                  fill=_lift(accent), anchor="lm")

    title_font = fit_font(draw, spec["title"], bold, 76, column, 44)
    draw.text((left, 250), spec["title"], font=title_font, fill=(248, 248, 248), anchor="ls")
    draw.rectangle([left, 278, left + 110, 284], fill=accent)
    if spec["subtitle"]:
        sub_font = ImageFont.truetype(str(regular), 32)
        for i, line in enumerate(wrap(draw, spec["subtitle"], sub_font, column)):
            draw.text((left, 336 + i * 44), line, font=sub_font, fill=(214, 216, 222), anchor="ls")
    draw.text((left, HEIGHT - 64), spec["url"], font=ImageFont.truetype(str(bold), 30), fill=(248, 248, 248), anchor="ls")
    credit = "%s %s" % (spec["credit"], strata_version)
    credit_font = ImageFont.truetype(str(regular), 18)
    cw = draw.textlength(credit, font=credit_font)
    x, y = WIDTH - 28 - cw, HEIGHT - 28
    draw.rounded_rectangle([x - 10, y - 26, x + cw + 10, y + 8], radius=6, fill=(10, 12, 18))
    draw.text((x, y), credit, font=credit_font, fill=(220, 222, 228), anchor="ls")
    return card


TEXT_LEFT, TEXT_COLUMN = 64, 520
SCRIM_SOLID, SCRIM_CLEAR, SCRIM_ALPHA = 0.5, 0.78, 215


def scrim_alpha(x: int) -> int:
    """The scrim's opacity at column x: solid under the whole text column, then fading out."""
    t = x / WIDTH
    if t < SCRIM_SOLID:
        return SCRIM_ALPHA
    return max(0, int(SCRIM_ALPHA * (1 - (t - SCRIM_SOLID) / (SCRIM_CLEAR - SCRIM_SOLID))))


def contrast(fg: Tuple[int, int, int], bg: Tuple[int, int, int]) -> float:
    """WCAG contrast ratio of two sRGB colours."""

    def lum(c: Tuple[int, int, int]) -> float:
        ch = [v / 255.0 for v in c]
        ch = [v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in ch]
        return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]

    hi, lo = sorted((lum(fg), lum(bg)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)


def _lift(rgb: Tuple[int, int, int]) -> Tuple[int, int, int]:
    """The accent lightened until it reads on the scrim over a white scene (4.5:1)."""
    worst = scrim_over((255, 255, 255))
    r, g, b = rgb
    for _ in range(20):
        if contrast((r, g, b), worst) >= 4.5:
            break
        r, g, b = int(r + (255 - r) * 0.2), int(g + (255 - g) * 0.2), int(b + (255 - b) * 0.2)
    return r, g, b


SCRIM_COLOR = (10, 12, 18)


def scrim_over(bg: Tuple[int, int, int], alpha: int = SCRIM_ALPHA) -> Tuple[int, int, int]:
    """What the scrim leaves of a background colour where its opacity is alpha."""
    a = alpha / 255.0
    return tuple(int(round(a * s + (1 - a) * c)) for s, c in zip(SCRIM_COLOR, bg))  # type: ignore[return-value]


def is_blank(rgba: bytes, width: int, height: int) -> bool:
    """True when the render is one flat colour (a failed context draws nothing)."""
    step = max(1, (width * height) // 4096) * 4
    first = rgba[0:3]
    return all(rgba[i:i + 3] == first for i in range(0, len(rgba), step))


# --------------------------------------------------------------------------- provenance


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def tool_commit() -> str:
    try:
        out = subprocess.run(["git", "-C", str(HERE), "rev-parse", "HEAD"], capture_output=True, text=True, timeout=10)
        return out.stdout.strip() or "unknown"
    except (OSError, subprocess.SubprocessError):
        return "unknown"


def _site_relative(spec_path: Path) -> str:
    """The spec's path inside its git checkout (og-card/card.json), else its name."""
    resolved = spec_path.resolve()
    for parent in resolved.parents:
        if (parent / ".git").exists():
            return resolved.relative_to(parent).as_posix()
    return resolved.name


def provenance(spec: dict, spec_path: Path, png: Path, library_path: str, gpu: str) -> dict:
    import PIL

    lock = strata_lock()
    return {
        "tool": "community-site-kit tools/og-card/og_card.py",
        "tool_repository": "https://github.com/kingdom-community/community-site-kit",
        "tool_commit": tool_commit(),
        "command": "python3 tools/og-card/og_card.py <site>/%s" % _site_relative(spec_path),
        "renderer": {"engine": "Strata", "version": lock["version"], "asset": lock["asset"],
                     "asset_sha256": lock["sha256"], "library_sha256": sha256_file(Path(library_path)),
                     "binding": "strata-engine %s" % lock["version"], "gpu": gpu},
        "text": {"pillow": PIL.__version__, "fonts": {BOLD: sha256_file(find_font(BOLD)),
                                                      REGULAR: sha256_file(find_font(REGULAR))}},
        "python": platform.python_version(),
        "spec": {k: spec[k] for k in sorted(spec) if k != "comment"},
        "output": {"path": spec["output"], "width": WIDTH, "height": HEIGHT, "sha256": sha256_file(png)},
    }


# --------------------------------------------------------------------------- main


def read_spec(path: Path) -> dict:
    try:
        with open(path, encoding="utf-8") as f:
            return validate_spec(json.load(f))
    except (OSError, ValueError) as exc:
        if isinstance(exc, CardError):
            raise
        raise CardError("could not read %s: %s" % (path, exc), EXIT_SPEC)


def make_card(spec_path: Path, library: Optional[str] = None, check: bool = False) -> Path:
    spec = read_spec(spec_path)
    spec_dir = spec_path.resolve().parent
    out = (spec_dir / spec["output"]).resolve()
    strata, lib = load_strata(library)
    scene = build_scene(spec)
    w, h = WIDTH * SUPERSAMPLE, HEIGHT * SUPERSAMPLE
    rgba = render_scene(scene, strata, lib, spec["sun"], w, h)
    if is_blank(rgba, w, h):
        raise CardError("the render came out blank; is the EGL/Mesa driver working?")
    card = compose(rgba, (w, h), spec, spec_dir, strata_lock()["version"])
    with strata.Engine(lib, 16, 16) as probe:
        gpu = probe.gpu_description()
    if check:
        import io

        buf = io.BytesIO()
        card.save(buf, format="PNG", optimize=True)
        if not out.is_file() or out.read_bytes() != buf.getvalue():
            raise CardError("%s differs from a fresh render" % out)
        return out
    out.parent.mkdir(parents=True, exist_ok=True)
    card.save(out, format="PNG", optimize=True)
    record = provenance(spec, spec_path, out, lib.path or "", gpu)
    prov = spec_path.with_name(spec_path.stem + ".provenance.json")
    prov.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
    return out


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("spec", nargs="+", type=Path, help="card spec JSON file(s)")
    parser.add_argument("--strata", help="a local libstrata to load instead of the pinned release")
    parser.add_argument("--check", action="store_true", help="re-render and fail if the committed PNG differs")
    args = parser.parse_args(argv)
    for spec_path in args.spec:
        if spec_path.name.endswith(".provenance.json"):
            continue  # this tool's own output, matched by a glob such as og-card/*.json
        try:
            out = make_card(spec_path, args.strata, args.check)
        except CardError as exc:
            print("og_card: %s: %s" % (spec_path, exc), file=sys.stderr)
            return exc.code
        print(("matches %s" if args.check else "wrote %s") % out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
