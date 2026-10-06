"""
Regression tests for the moderation audit of 2026-10-06.
Each case below was wrongly handled before the fix (false positive or bypass).

    python3 tests/test_moderation_regressions.py
"""
import sys
import os
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from moderation import moderate_text, ModerationAction, ModerationCategory  # noqa: E402

# Legitimate safety reports that used to be BLOCKED
MUST_BE_PUBLISHED = [
    ("Homme en salopette qui casse des vitres rue de la Paix", "danger"),
    ("Homme armé d'un pistolet", "danger"),
    ("Individu avec une machette devant l'école", "violence"),
    ("Blessé grave, il va mourir si les secours n'arrivent pas", "medical"),
    ("Convoi sous escorte policière, route bloquée", "police"),
    ("Crotte et merde de chien partout sur le trottoir", "hazard"),
    ("Une grève des transports bloque la station", "other"),
    ("Une grêle violente, chaussée glissante", "hazard"),
    ("Pneu crevé, voiture arrêtée sur la voie de gauche", "hazard"),
    ("La baisse de l'éclairage rend la rue dangereuse", "lighting"),
    ("Victime d'une agression sexuelle près du parc", "harassment"),
    ("Un raton laveur blessé sur la route", "hazard"),
    ("L'homme s'est enfui avec un fusil vers la gare", "danger"),
]

# Violations that used to be PUBLISHED
MUST_BE_BLOCKED = [
    # "agression sexuelle" / "propos racistes" used to unlock anything
    ("Agression sexuelle. Rejoins mon canal telegram t.me/arnaque75", "harassment"),
    ("Propos racistes : sale bicot", "altercation"),
    # stretched letters
    ("saaaalope", "other"),
    ("puuuute", "danger"),
    # second-person death threats
    ("tu vas mourir", "danger"),
    ("vous allez crever", "danger"),
    ("il va mourir toi aussi tu vas y passer", "medical"),
    # homoglyphs: Cyrillic "с" and "р" look like Latin "c" and "p"
    ("сon de рute", "other"),
    ("ЅАLОРЕ", "other"),
    # bare "va mourir" without any emergency context
    ("v@ m0ur1r", None),
    ("escort girl dispo 24h", "other"),
]


class TestModerationRegressions(unittest.TestCase):

    def test_legitimate_reports_are_published(self):
        for text, cat in MUST_BE_PUBLISHED:
            with self.subTest(text=text):
                res = moderate_text(text, incident_category=cat)
                self.assertTrue(res.allowed, f"FALSE POSITIVE: {text!r} -> {res.internal_flags}")

    def test_violations_are_blocked(self):
        for text, cat in MUST_BE_BLOCKED:
            with self.subTest(text=text):
                res = moderate_text(text, incident_category=cat)
                self.assertFalse(res.allowed, f"BYPASS: {text!r} -> score {res.risk_score}")
                self.assertIn(res.action, (ModerationAction.BLOCK, ModerationAction.CRITICAL_BLOCK))

    def test_mild_vulgarity_is_flagged_for_review(self):
        res = moderate_text("De la merde partout sur le trottoir", incident_category="hazard")
        self.assertTrue(res.allowed)
        self.assertEqual(res.action, ModerationAction.REVIEW)
        # the moderator queue shows why it was flagged
        self.assertEqual(res.primary_category, ModerationCategory.ABUSE)

    def test_block_message_never_leaks_internal_rules(self):
        res = moderate_text("sale bicot", incident_category="other")
        self.assertFalse(res.allowed)
        self.assertNotIn("bicot", (res.user_message or "") + (res.user_title or ""))


if __name__ == "__main__":
    unittest.main(verbosity=2)
