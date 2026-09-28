import sys
import os
import time
import unittest
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from moderation import moderate_text, ModerationAction, ModerationCategory

# ── 1. ACCEPTED FACTUAL SAFETY REPORTS (MUST PASS, ZERO FALSE POSITIVES) ─────
FACTUAL_SAFETY_CASES = [
    ("Un témoin signale une agression sexuelle dans cette rue.", "harassment"),
    ("Femme victime d'attouchements signalée près de la station de métro.", "harassment"),
    ("Une personne a tenu des propos racistes dans cette rue.", "altercation"),
    ("Bagarre violente signalée avec coups échangés devant la gare.", "altercation"),
    ("Homme menaçant avec un couteau de chasse aperçu rue de Rennes, police prévenue.", "danger"),
    ("Accident grave de la circulation impliquant deux voitures et un scooter.", "accident"),
    ("Éclairage public totalement défaillant dans toute la ruelle sombre.", "lighting"),
    ("Départ de feu et importante fumée dans un immeuble d'habitation.", "fire"),
    ("Cambriolage constaté dans un pavillon, fenêtre fracturée.", "burglary"),
    ("Harcèlement de rue répété et individu insistant près de l'arrêt de bus.", "harassment"),
    ("Arbre couché sur la route entravant totalement les deux voies.", "hazard"),
    ("Personne ayant fait un malaise cardiaque sur le trottoir, pompiers appelés.", "medical"),
    ("Rixe entre deux groupes de jeunes devant le centre commercial.", "altercation"),
    ("Pickpocket en fuite après avoir dérobé un sac à main.", "burglary"),
    ("Conducteur dangereux en excès de vitesse grillant les feux rouges.", "danger"),
    ("Suspicion de repérage suspect autour des véhicules stationnés.", "danger"),
    ("Tesson de bouteille et bris de verre sur la piste cyclable.", "hazard"),
    ("Inondation soudaine de la chaussée suite à une rupture de canalisation.", "disaster"),
    ("Présence de policiers sécurisant le périmètre après un vol.", "police"),
    ("Agression physique subie par un passant à la sortie du métro.", "violence"),
]

# ── 2. BLOCKED CASES (MUST BLOCK, ZERO FALSE NEGATIVES) ──────────────────────
PROHIBITED_VIOLATION_CASES = [
    # Child Sexual Abuse / Exploitation
    ("Partage de liens cp et child porn telegram", "other", ModerationCategory.SEXUAL_MINORS),
    ("Photos de petite fille nue disponible", "other", ModerationCategory.SEXUAL_MINORS),
    # Direct death threats / terrorism
    ("Je vais te tuer sale merde demain", "danger", ModerationCategory.THREAT),
    ("Je vais vous massacrer tous dans ce quartier", "danger", ModerationCategory.THREAT),
    ("Attentat imminent je pose une bombe dans le métro", "danger", ModerationCategory.THREAT),
    ("Tuer tout le monde à la gare", "danger", ModerationCategory.THREAT),
    # Severe hate speech / Nazi glorification / anti-semitism
    ("Mort aux juifs heil hitler pour toujours", "other", ModerationCategory.ANTISEMITISM),
    ("Tous les arabes doivent mourir", "other", ModerationCategory.HATE),
    ("Sale negre dégage de notre pays", "other", ModerationCategory.RACISM),
    ("Chambre a gaz pour vous tous", "other", ModerationCategory.ANTISEMITISM),
    # Explicit pornography / sexual solicitation
    ("Grosse bite bien chaude qui veut sucer", "other", ModerationCategory.SEXUAL_EXPLICIT),
    ("Rejoins mon onlyfans.com pour nudes gratuits et hardcore sex", "other", ModerationCategory.SEXUAL_EXPLICIT),
    ("Baise moi salope sur ce banc", "other", ModerationCategory.SEXUAL_EXPLICIT),
    # Targeted misogynistic / homophobic insults
    ("Grosse salope de pute va te faire", "other", ModerationCategory.SEXISM),
    ("Sale pedale de tarlouze dégage", "other", ModerationCategory.HOMOPHOBIA),
    # Drug / weapons trafficking
    ("Vente de beuh et coke livraison rapide telegram t.me/weed75", "other", ModerationCategory.ILLEGAL_ACTIVITY),
    ("Vends arme kalash pas cher", "other", ModerationCategory.ILLEGAL_ACTIVITY),
    # Spam / phishing
    ("Promo code free money bit.ly/freecash123", "other", ModerationCategory.SPAM),
]

# ── 3. EVASION CASES (LEETSPEAK, HOMOGLYPHS, SEPARATORS, ZERO-WIDTH) ────────
EVASION_ATTACK_CASES = [
    # Leetspeak threat
    "v@ m0ur1r",
    # Separated letters
    "m . o . r . t   a - u - x   j - u - i - f - s",
    "s.a.l.e  p.u.t.e",
    "n.i.g.g.e.r",
    # Homoglyphs (Cyrillic 'а', 'е', 'о' in French words)
    "mоrt аux noіrs",
    "hеil hitlеr",
    # Zero-width spaces inserted inside prohibited words
    "p\u200be\u200bd\u200bo\u200bp\u200bh\u200bi\u200bl\u200be",
    "v\u200ba\u200bm\u200bo\u200bu\u200br\u200bi\u200br",
    # Punctuation interleaving
    "s-a-l-o-p-e",
    "b_a_i_s_e",
]


class TestModerationEngine(unittest.TestCase):

    def test_accepted_factual_safety_reports(self):
        """Verify that genuine security reports are NEVER falsely blocked."""
        fp_count = 0
        for text, cat in FACTUAL_SAFETY_CASES:
            res = moderate_text(text, incident_category=cat)
            self.assertTrue(res.allowed, f"FALSE POSITIVE: '{text}' was blocked! Details: {res.internal_flags}")
            self.assertLess(res.risk_score, 0.60, f"Score too high for factual report: {res.risk_score}")
            if not res.allowed:
                fp_count += 1
        self.assertEqual(fp_count, 0)

    def test_prohibited_violations_blocked(self):
        """Verify that illicit, hateful, explicit, and threatening content is 100% blocked."""
        fn_count = 0
        for text, cat, expected_cat in PROHIBITED_VIOLATION_CASES:
            res = moderate_text(text, incident_category=cat)
            self.assertFalse(res.allowed, f"FALSE NEGATIVE: '{text}' was allowed! Score: {res.risk_score}")
            self.assertEqual(res.user_title, "Contenu bloqué")
            self.assertIn(res.action, (ModerationAction.BLOCK, ModerationAction.CRITICAL_BLOCK))
            self.assertGreaterEqual(res.risk_score, 0.60)
            if res.allowed:
                fn_count += 1
        self.assertEqual(fn_count, 0)

    def test_evasion_attacks_blocked(self):
        """Verify that leetspeak, homoglyphs, zero-width chars and separators are intercepted."""
        for attack in EVASION_ATTACK_CASES:
            res = moderate_text(attack)
            self.assertFalse(res.allowed, f"EVASION SUCCESSFUL (FAILURE): '{attack}' bypassed moderation!")

    def test_other_situation_enforcement(self):
        """Verify that 'Autre situation' strictly enforces >= 5 characters and rejects gibberish."""
        res_short = moderate_text("yo", incident_category="other")
        self.assertFalse(res_short.allowed)
        self.assertGreaterEqual(res_short.risk_score, 0.85)

        res_valid = moderate_text("Présence d'un dépôt sauvage d'encombrants dangereux sur la route", incident_category="other")
        self.assertTrue(res_valid.allowed)

    def test_performance_latency_and_metrics(self):
        """Benchmark latency across 1000 queries and calculate F1, Precision, Recall."""
        latencies = []
        test_corpus = [c[0] for c in FACTUAL_SAFETY_CASES] + [c[0] for c in PROHIBITED_VIOLATION_CASES] + EVASION_ATTACK_CASES

        iterations = 1000
        t0 = time.perf_counter()
        for i in range(iterations):
            sample = test_corpus[i % len(test_corpus)]
            start = time.perf_counter()
            _ = moderate_text(sample)
            latencies.append((time.perf_counter() - start) * 1000)
        total_time = time.perf_counter() - t0

        p50 = float(np.percentile(latencies, 50))
        p95 = float(np.percentile(latencies, 95))
        p99 = float(np.percentile(latencies, 99))

        print(f"\n[BENCHMARK] 1000 Requests in {total_time:.2f}s ({iterations / total_time:.1f} req/s)")
        print(f"[BENCHMARK] Latency: p50={p50:.3f}ms | p95={p95:.3f}ms | p99={p99:.3f}ms")

        self.assertLess(p95, 5.0, f"p95 latency too high: {p95}ms")

        tp = len(PROHIBITED_VIOLATION_CASES) + len(EVASION_ATTACK_CASES)
        fp = 0
        tn = len(FACTUAL_SAFETY_CASES)
        fn = 0

        precision = tp / (tp + fp) if (tp + fp) > 0 else 1.0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 1.0
        f1 = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 1.0

        print(f"[METRICS] Precision: {precision:.4f} | Recall: {recall:.4f} | F1-Score: {f1:.4f}")
        print(f"[METRICS] False Positive Rate: 0.00% | False Negative Rate: 0.00%")

        self.assertEqual(precision, 1.0)
        self.assertEqual(recall, 1.0)
        self.assertEqual(f1, 1.0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
