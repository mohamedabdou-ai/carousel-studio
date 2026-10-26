"""voice_check.py (B7): fingerprint comparison, drift flags, machine-written tells."""
import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path

import b7_support as support

BRAND = {
    "slug": "demo-brand",
    "locale": {"dialect": "eg"},
    "voice": {
        "avoid": ["ثورة", "revolutionary tool"],
        "fingerprint": {
            "sentLen": {"p25": 5, "p50": 7, "p75": 9, "p90": 12},
            "emojiPer100w": 0.0,
            "latinMixPct": 8.0,
            "ellipsisRate": 0.2,
            "questionBangRate": 0.2,
            "captionLenBand": [300, 700],
        },
    },
}

# Short sentences, a little Latin, one ellipsis, one question: close to BRAND's fingerprint.
ON_VOICE = (
    "جرّبت أداة Claude الأسبوع ده. وفّرت عليا ساعة كل يوم… ومحدش قالي.\n"
    "ليه الناس لسه بتدفع؟ لأنهم مش عارفين البديل. الفكرة بسيطة جدا.\n"
    "ابدأ بأداة واحدة. وجرّبها أسبوع قبل ما تدفع."
)

# Very long sentences, no Latin, heavy emoji, no punctuation play: far from BRAND.
OFF_VOICE = (
    "في هذا المنشور سنتعرف على مجموعة كبيرة من الأدوات التي تساعدك على إنجاز عملك بشكل أسرع وأفضل من أي وقت مضى. "
    "🔥🔥🔥 كما أن استخدام هذه الأدوات بشكل منتظم يؤدي إلى تحسين النتائج بصورة ملحوظة على المدى الطويل لجميع أنواع الحسابات. "
    "ولذلك ننصحك بتجربة كل أداة من هذه الأدوات خلال الأسابيع القادمة مع متابعة التغيرات في الأداء بدقة عالية. 🔥🔥"
)


class VoiceCheckTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.vc = support.load_script("carousel-create", "voice_check.py")

    def run_cli(self, brand, **flags):
        with tempfile.TemporaryDirectory() as tmp:
            bpath = Path(tmp) / "brand.json"
            bpath.write_text(json.dumps(brand, ensure_ascii=False), encoding="utf-8")
            argv = ["--brand", str(bpath), "--format", "json"]
            for key, value in flags.items():
                if key == "spec":
                    spath = Path(tmp) / "spec.json"
                    spath.write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")
                    argv += ["--spec", str(spath)]
                else:
                    argv += ["--" + key.replace("_", "-"), value]
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                code = self.vc.main(argv)
            return code, json.loads(out.getvalue())

    def test_on_voice_copy_passes(self):
        code, rep = self.run_cli(BRAND, text=ON_VOICE)
        self.assertEqual(code, 0, rep)
        self.assertTrue(rep["ok"])
        self.assertEqual(rep["flags"], [])
        self.assertFalse(any(m["flagged"] for m in rep["metrics"].values()))

    def test_off_voice_copy_is_flagged(self):
        code, rep = self.run_cli(BRAND, text=OFF_VOICE)
        self.assertEqual(code, 1)
        self.assertFalse(rep["ok"])
        self.assertTrue(rep["metrics"]["sentLen"]["flagged"])
        self.assertTrue(rep["metrics"]["emojiPer100w"]["flagged"])
        self.assertGreater(rep["metrics"]["sentLen"]["iqrDistance"], 1.5)

    def test_metric_entry_shape(self):
        _, rep = self.run_cli(BRAND, text=ON_VOICE)
        for entry in rep["metrics"].values():
            self.assertTrue({"value", "p25", "p75", "iqrDistance", "flagged"} <= set(entry))

    def test_emoji_runs_are_counted_one_by_one(self):
        fire = chr(0x1F525)
        self.assertEqual(self.vc.count_emoji(fire * 3), 3)
        family = chr(0x1F468) + chr(0x200D) + chr(0x1F469) + chr(0x200D) + chr(0x1F467)
        self.assertEqual(self.vc.count_emoji(family), 1)                    # a ZWJ sequence is one emoji
        self.assertEqual(self.vc.count_emoji(chr(0x1F44D) + chr(0x1F3FD)), 1)   # skin-tone modifier
        self.assertEqual(self.vc.count_emoji(chr(0x2764) + chr(0xFE0F)), 1)     # variation selector

    def test_ai_words_stock_openers_and_brand_avoid_list(self):
        text = "في هذا المنشور سنتعرف على أدوات تطلق العنان لإبداعك. أطلق العنان للأداة، وهي ثورة في التصميم."
        _, rep = self.run_cli(BRAND, text=text)
        kinds = {f["kind"] for f in rep["flags"]}
        self.assertTrue({"stock-opener", "ai-word", "avoid-word"} <= kinds, rep["flags"])

    def test_english_flags_follow_the_post_dialect(self):
        en = dict(BRAND, locale={"dialect": "en"})
        _, rep = self.run_cli(en, text="Let us delve into a game-changer for your hooks today.")
        self.assertTrue(any(f["kind"] == "ai-word" for f in rep["flags"]))

    def test_short_text_is_skipped_not_flagged(self):
        _, rep = self.run_cli(BRAND, text="جملة قصيرة.")
        self.assertEqual(rep["metrics"]["sentLen"].get("skipped"), "too-short")
        self.assertFalse(rep["metrics"]["sentLen"]["flagged"])

    def test_missing_fingerprint_is_a_note_not_a_failure(self):
        code, rep = self.run_cli({"slug": "x", "locale": {"dialect": "eg"}}, text=ON_VOICE)
        self.assertEqual(code, 0)
        self.assertTrue(any("fingerprint" in n for n in rep["notes"]))

    def test_spec_uses_caption_for_metrics_and_slides_for_flags(self):
        spec = {
            "locale": {"dialect": "eg", "digits": "western"},
            "captionPack": {"firstLine": "جرّبت أداة Claude الأسبوع ده.", "keywordLine": "وفّرت عليا ساعة كل يوم.",
                            "body": "ليه الناس لسه بتدفع؟ لأنهم مش عارفين البديل. الفكرة بسيطة جدا.", "cta": "ابدأ بأداة واحدة.",
                            "hashtags": ["#كاروسيل"]},
            "slides": [{"id": "s01", "n": 1, "type": "cover", "headline": "هل تعلم أن الأدوات المجانية كتير؟"}],
        }
        code, rep = self.run_cli(BRAND, spec=spec)
        self.assertEqual(set(rep["metrics"]), {"sentLen", "emojiPer100w", "latinMixPct", "ellipsisRate", "questionBangRate"})
        self.assertTrue(any(f["kind"] == "stock-opener" and f["where"] == "s01" for f in rep["flags"]), rep["flags"])
        self.assertEqual(code, 1)

    def deck(self, slides, cta_text="ابدأ بأداة واحدة.", **extra):
        spec = {"locale": {"dialect": "eg", "digits": "western"},
                "captionPack": {"firstLine": "جرّبت أداة Claude الأسبوع ده.", "keywordLine": "وفّرت عليا ساعة كل يوم.",
                                "body": "ليه الناس لسه بتدفع؟ لأنهم مش عارفين البديل. الفكرة بسيطة جدا.", "cta": cta_text},
                "slides": [{"id": "s%02d" % (i + 1), "n": i + 1, "type": "item", "title": "عنوان", "body": text} for i, text in enumerate(slides)]}
        spec["slides"].append({"id": "s%02d" % (len(slides) + 1), "n": len(slides) + 1, "type": "cta", "title": "احفظ",
                               "cta": {"kind": "save", "text": cta_text}})
        spec.update(extra)
        return spec

    def test_a_long_deck_with_no_first_person_beat_gets_advice_for_an_ana_brand(self):
        ana = json.loads(json.dumps(BRAND))
        ana["voice"]["fingerprint"]["person"] = "ana"
        flat = ["اكتب فكرة واحدة في كل سلايد."] * 9
        code, rep = self.run_cli(ana, spec=self.deck(flat))
        self.assertEqual([a["kind"] for a in rep["advice"]], ["first-person-missing"], rep["advice"])
        self.assertEqual(code == 0, rep["ok"], "advice never changes the exit code")
        said = flat[:4] + ["أنا جرّبت ده على بوستين وفرق معايا."] + flat[5:]
        self.assertEqual(self.run_cli(ana, spec=self.deck(said))[1]["advice"], [])
        self.assertEqual(self.run_cli(ana, spec=self.deck(flat[:7]))[1]["advice"], [], "short decks are not asked for it")
        other = json.loads(json.dumps(BRAND))
        other["voice"]["fingerprint"]["person"] = "ehna"
        self.assertEqual(self.run_cli(other, spec=self.deck(flat))[1]["advice"], [], "only person = ana")

    def test_the_call_to_action_should_echo_a_stored_signature(self):
        sig = json.loads(json.dumps(BRAND))
        sig["voice"]["fingerprint"]["signatures"] = ["قولّي رأيك", "ابعت البوست ده لصاحبك"]
        flat = ["اكتب فكرة واحدة في كل سلايد."] * 4
        advice = self.run_cli(sig, spec=self.deck(flat, cta_text="احفظه قبل كل نشر."))[1]["advice"]
        self.assertEqual([a["kind"] for a in advice], ["signature-not-echoed"])
        self.assertEqual(self.run_cli(sig, spec=self.deck(flat, cta_text="احفظه وقولي رأيك فيه."))[1]["advice"], [], "folding: قولّي and قولي match")
        self.assertEqual(self.run_cli(BRAND, spec=self.deck(flat))[1]["advice"], [], "no stored signature, nothing to echo")

    def test_band_arithmetic(self):
        fp = BRAND["voice"]["fingerprint"]
        entry = self.vc.compare("sentLen", 15.0, fp, 1.5)       # IQR 4, 6 above p75 = 1.5 IQR: not yet drift
        self.assertAlmostEqual(entry["iqrDistance"], 1.5)
        self.assertFalse(entry["flagged"])
        self.assertTrue(self.vc.compare("sentLen", 15.5, fp, 1.5)["flagged"])
        self.assertFalse(self.vc.compare("sentLen", 5.0, fp, 1.5)["flagged"])

    def test_usage_errors(self):
        for argv, expected in (([], 64), (["--brand", "nope.json", "--text", "x"], 66)):
            err = io.StringIO()
            with contextlib.redirect_stderr(err), self.assertRaises(SystemExit) as ctx:
                self.vc.main(argv)
            self.assertEqual(ctx.exception.code, expected)


@unittest.skipUnless(support.real_qa_available("carousel-create") and support.real_cs_dir("brand-setup"),
                     "needs brand-setup's fingerprint.py and the genuine _cs package")
class ParityWithFingerprint(unittest.TestCase):
    """voice_check measures with the algorithm fingerprint.py stored the brand's numbers with."""

    def test_same_numbers_as_fingerprint_py(self):
        fingerprint = support.load_script("brand-setup", "fingerprint.py", "b7_fingerprint")
        vc = support.load_script("carousel-create", "voice_check.py", "b7_voice_check_parity")
        captions = [ON_VOICE, ON_VOICE.replace("Claude", "ChatGPT"),
                    "كلمة… وكلمة؟ وفي 3.5 ساعات! #كاروسيل @brand\nجملة تانية قصيرة."]
        fp, _report = fingerprint.compute(captions, "eg", "2026-10-22T00:00:00Z")
        measured = vc.measure("\n".join(captions))
        self.assertAlmostEqual(measured["sentLen"], fp["sentLen"]["p50"], delta=0.06)
        for name in ("emojiPer100w", "latinMixPct", "ellipsisRate", "questionBangRate"):
            self.assertAlmostEqual(measured[name], fp[name], delta=0.06, msg=name)    # fingerprint.py rounds to 1-2 decimals


@unittest.skipUnless(support.real_cs_dir("brand-setup"), "needs brand-setup's fingerprint.py")
class SingularListParity(unittest.TestCase):
    def test_same_first_person_words_as_fingerprint_py(self):
        fingerprint = support.load_script("brand-setup", "fingerprint.py", "b7_fingerprint_singular")
        vc = support.load_script("carousel-create", "voice_check.py", "b7_voice_check_singular")
        self.assertEqual(list(vc.SINGULAR), list(fingerprint.SINGULAR))


def tearDownModule():
    support.cleanup()


if __name__ == "__main__":
    unittest.main()
