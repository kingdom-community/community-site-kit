"""Tests for og_card.py. Run from this directory: python3 -m unittest -v

The spec, scene and layout tests need only the standard library (and Pillow for
the text tests). The render tests need the strata-engine binding, libEGL and a
Mesa driver; they skip when those are missing, unless OG_CARD_REQUIRE_RENDER=1
(CI sets it), when a missing renderer fails instead.
"""

from __future__ import annotations

import json
import os
import random
import tempfile
import unittest
from pathlib import Path

import og_card

REQUIRE_RENDER = os.environ.get("OG_CARD_REQUIRE_RENDER") == "1"


def spec(**overrides):
    base = {
        "output": "card.png",
        "scene": "castle",
        "seed": 3,
        "sun": {"azimuth": 100, "elevation": 16},
        "wordmark": "Example",
        "title": "Example Site",
        "subtitle": "A short line under the title",
        "url": "example.org",
        "accent": "#c9a227",
        "alt": "A stone castle on a green hill, with the title Example Site.",
    }
    base.update(overrides)
    return base


class SpecTests(unittest.TestCase):
    def test_defaults_are_filled_in(self):
        minimal = {k: spec()[k] for k in og_card.REQUIRED}
        out = og_card.validate_spec(minimal)
        self.assertEqual(out["seed"], 1)
        self.assertEqual(out["sun"], {"azimuth": 225.0, "elevation": 20.0})
        self.assertEqual(out["credit"], "Rendered with Strata")

    def test_missing_keys_are_named(self):
        bad = spec()
        del bad["alt"]
        del bad["url"]
        with self.assertRaises(og_card.CardError) as ctx:
            og_card.validate_spec(bad)
        self.assertEqual(ctx.exception.code, og_card.EXIT_SPEC)
        self.assertIn("url, alt", str(ctx.exception))

    def test_rejects_unknown_keys_scene_colour_and_output(self):
        for bad in (spec(tittle="typo"), spec(scene="spaceship"), spec(accent="gold"), spec(output="card.jpg")):
            with self.assertRaises(og_card.CardError):
                og_card.validate_spec(bad)

    def test_alt_text_must_describe_the_picture(self):
        with self.assertRaises(og_card.CardError) as ctx:
            og_card.validate_spec(spec(alt="castle"))
        self.assertIn("og:image:alt", str(ctx.exception))

    def test_sun_below_the_horizon_is_rejected(self):
        with self.assertRaises(og_card.CardError):
            og_card.validate_spec(spec(sun={"azimuth": 0, "elevation": -30}))


class NoiseTests(unittest.TestCase):
    def test_same_seed_same_field(self):
        a, b = og_card.Noise(9), og_card.Noise(9)
        samples = [(x * 0.37, z * 0.53) for x in range(20) for z in range(20)]
        self.assertEqual([a.fbm(x, z) for x, z in samples], [b.fbm(x, z) for x, z in samples])

    def test_values_stay_in_unit_range_and_seeds_differ(self):
        a, b = og_card.Noise(1), og_card.Noise(2)
        values = [a.fbm(x * 0.21, z * 0.17) for x in range(40) for z in range(40)]
        self.assertTrue(all(0.0 <= v <= 1.0 for v in values))
        self.assertNotEqual(values, [b.fbm(x * 0.21, z * 0.17) for x in range(40) for z in range(40)])


class GeometryTests(unittest.TestCase):
    def test_every_box_face_points_outward(self):
        mesh = og_card.MeshBuilder()
        center = (1.0, 2.0, 3.0)
        mesh.box(center, (2.0, 4.0, 6.0), (1.0, 0.0, 0.0))
        self.assertEqual(len(mesh), 12)
        p = mesh.positions
        for t in range(12):
            a, b, c = (tuple(p[9 * t + 3 * k: 9 * t + 3 * k + 3]) for k in range(3))
            normal = og_card._cross(og_card._sub(b, a), og_card._sub(c, a))
            self.assertGreater(og_card._dot(normal, og_card._sub(a, center)), 0)

    def test_every_scene_is_deterministic_and_within_strata_limits(self):
        for name in sorted(og_card.SCENES):
            with self.subTest(scene=name):
                one = og_card.build_scene(og_card.validate_spec(spec(scene=name)))
                two = og_card.build_scene(og_card.validate_spec(spec(scene=name)))
                self.assertEqual(one.mesh.positions, two.mesh.positions)
                self.assertEqual(one.lines, two.lines)
                self.assertGreater(len(one.mesh), 0)
                self.assertLessEqual(len(one.mesh.positions) // 3, 16777216)  # STRATA_MAX_MESH_VERTICES
                self.assertLessEqual(len(one.lights), 32)  # STRATA_MAX_POINT_LIGHTS
                self.assertEqual(len(one.lines) % 2, 0)
                self.assertEqual(len(one.mesh.colors), len(one.mesh.positions))

    def test_a_different_seed_changes_the_scene(self):
        for name in ("castle", "terrain", "claims", "coast"):
            with self.subTest(scene=name):
                a = og_card.build_scene(og_card.validate_spec(spec(scene=name, seed=1)))
                b = og_card.build_scene(og_card.validate_spec(spec(scene=name, seed=2)))
                self.assertNotEqual(a.mesh.positions, b.mesh.positions)


class TextTests(unittest.TestCase):
    def test_accent_is_lifted_until_it_reads_on_the_scrim(self):
        worst = og_card.scrim_over((255, 255, 255))
        for accent in ((20, 30, 120), (66, 99, 235), (201, 162, 39), (12, 166, 120)):
            self.assertGreaterEqual(og_card.contrast(og_card._lift(accent), worst), 4.5)
        self.assertEqual(og_card._lift((250, 250, 250)), (250, 250, 250))

    def test_the_scrim_is_solid_under_the_whole_text_column(self):
        column_end = og_card.TEXT_LEFT + og_card.TEXT_COLUMN
        self.assertEqual(og_card.scrim_alpha(column_end), og_card.SCRIM_ALPHA)
        self.assertEqual(og_card.scrim_alpha(og_card.WIDTH - 1), 0)
        # white and the subtitle grey over a white scene, through the scrim: WCAG AA for large and body text
        worst = og_card.scrim_over((255, 255, 255))
        self.assertGreaterEqual(og_card.contrast((248, 248, 248), worst), 4.5)
        self.assertGreaterEqual(og_card.contrast((214, 216, 222), worst), 4.5)

    def test_a_subtitle_too_long_for_two_lines_is_an_error(self):
        from PIL import Image, ImageDraw, ImageFont

        draw = ImageDraw.Draw(Image.new("RGB", (10, 10)))
        font = ImageFont.truetype(str(og_card.find_font(og_card.REGULAR)), 32)
        self.assertEqual(len(og_card.wrap(draw, "A short line", font, 560)), 1)
        with self.assertRaises(og_card.CardError):
            og_card.wrap(draw, "word " * 60, font, 560)

    def test_blank_frames_are_detected(self):
        self.assertTrue(og_card.is_blank(bytes([7, 8, 9, 255]) * 64 * 64, 64, 64))
        varied = bytearray([7, 8, 9, 255]) * 64 * 64
        varied[4 * 2000] = 200
        self.assertFalse(og_card.is_blank(bytes(varied), 64, 64))


def renderer_or_skip(test: unittest.TestCase):
    try:
        return og_card.load_strata(None)
    except og_card.CardError as exc:
        if REQUIRE_RENDER:
            raise
        test.skipTest("no Strata renderer here: %s" % exc)


class RenderTests(unittest.TestCase):
    def test_every_scene_renders_something(self):
        strata, lib = renderer_or_skip(self)
        for name in sorted(og_card.SCENES):
            with self.subTest(scene=name):
                s = og_card.validate_spec(spec(scene=name))
                rgba = og_card.render_scene(og_card.build_scene(s), strata, lib, s["sun"], 400, 210)
                self.assertEqual(len(rgba), 400 * 210 * 4)
                self.assertFalse(og_card.is_blank(rgba, 400, 210))

    def test_a_card_is_byte_stable_and_carries_its_provenance(self):
        renderer_or_skip(self)
        from PIL import Image

        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "og-card.json"
            path.write_text(json.dumps(spec(output="public/og-image.png")), encoding="utf-8")
            out = og_card.make_card(path)
            first = out.read_bytes()
            with Image.open(out) as image:
                self.assertEqual(image.size, (1200, 630))
                self.assertEqual(image.mode, "RGB")
            self.assertEqual(og_card.make_card(path, check=True), out)  # a fresh render matches byte for byte
            record = json.loads((Path(tmp) / "og-card.provenance.json").read_text(encoding="utf-8"))
            self.assertEqual(record["output"]["sha256"], og_card.sha256_file(out))
            self.assertEqual(record["renderer"]["asset_sha256"], og_card.strata_lock()["sha256"])
            self.assertEqual(record["spec"]["alt"], spec()["alt"])
            out.write_bytes(first[:-10] + b"0123456789")
            with self.assertRaises(og_card.CardError):
                og_card.make_card(path, check=True)


class LockTests(unittest.TestCase):
    def test_lock_names_one_release_asset_and_its_hash(self):
        lock = og_card.strata_lock()
        self.assertEqual(lock["asset"], "libstrata-%s-linux-x64.so" % lock["version"])
        self.assertTrue(lock["url"].endswith("/v%s/%s" % (lock["version"], lock["asset"])))
        self.assertRegex(lock["sha256"], r"^[0-9a-f]{64}$")

    def test_requirements_pin_the_binding_to_the_locked_release(self):
        text = (Path(og_card.__file__).parent / "requirements.txt").read_text(encoding="utf-8")
        self.assertIn("strata-engine @ git+https://github.com/Preponderous-Software/strata@", text)
        self.assertRegex(text, r"(?m)^Pillow==\d+\.\d+\.\d+$")


if __name__ == "__main__":
    random.seed(0)
    unittest.main()
