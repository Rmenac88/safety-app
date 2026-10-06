import re
import unicodedata
from dataclasses import dataclass, field
from typing import List, Dict

# Zero-width & invisible unicode characters
ZERO_WIDTH_REGEX = re.compile(
    r"[​‌‍‎‏﻿‪‫‬‭‮­⁠⁡⁢⁣⁤]"
)

# Visual homoglyphs (Cyrillic / Greek letters that LOOK like Latin letters).
# Applied after lowercasing, so only lowercase forms are needed.
# The mapping is visual, not phonetic: Cyrillic "р" looks like "p" (not "r"),
# "с" looks like "c", "у" looks like "y", "н" looks like a small-caps "h", etc.
HOMOGLYPHS_MAP: Dict[str, str] = {
    # Cyrillic
    "а": "a", "в": "b", "г": "r", "д": "d", "е": "e", "ё": "e", "з": "3",
    "и": "u", "й": "u", "і": "i", "ї": "i", "ј": "j", "к": "k", "л": "n",
    "м": "m", "н": "h", "о": "o", "п": "n", "р": "p", "с": "c", "т": "t",
    "у": "y", "х": "x", "ѕ": "s", "ԁ": "d", "һ": "h", "ӏ": "l", "ԛ": "q",
    "ԝ": "w", "ь": "b", "ъ": "b",
    # Greek
    "α": "a", "β": "b", "γ": "y", "δ": "d", "ε": "e", "ζ": "z", "η": "n",
    "ι": "i", "κ": "k", "μ": "u", "ν": "v", "ο": "o", "ρ": "p", "σ": "o",
    "ς": "c", "τ": "t", "υ": "u", "χ": "x", "ω": "w",
}

# Standard leetspeak mapping: only digits, symbols, and non-alpha lookalikes to Latin letters
LEET_MAP: Dict[str, str] = {
    "@": "a", "4": "a", "^": "a",
    "8": "b",
    "(": "c", "<": "c", "[": "c", "{": "c",
    "3": "e", "&": "e", "€": "e",
    "6": "g", "9": "g",
    "1": "i", "!": "i", "|": "i",
    "0": "o",
    "5": "s", "$": "s", "§": "s",
    "7": "t", "+": "t",
    "2": "z", "%": "z",
}

# Elongation: 3+ identical characters ("puuuute", "saaalope", "connnnard")
ELONGATION_REGEX = re.compile(r"(.)\1{2,}")


@dataclass
class NormalizedBundle:
    original_text: str
    cleaned_text: str
    normalized_text: str
    leetspeak_text: str
    collapsed_text: str
    collapsed_leet: str
    reduced_text: str
    tokens: List[str]
    # Every textual variant the regex rules must be evaluated against.
    regex_variants: List[str] = field(default_factory=list)
    # Every collapsed (separator-free) variant the substring rules must be evaluated against.
    collapsed_variants: List[str] = field(default_factory=list)


def strip_accents(text: str) -> str:
    """Removes diacritics while preserving base characters."""
    nfkd = unicodedata.normalize("NFKD", text)
    return "".join(c for c in nfkd if not unicodedata.combining(c))


def replace_homoglyphs(text: str) -> str:
    """Replaces known look-alike unicode characters with Latin equivalents."""
    return "".join(HOMOGLYPHS_MAP.get(c, c) for c in text)


def decode_leetspeak(text: str) -> str:
    """Converts standard leet patterns into equivalent latin letters."""
    return "".join(LEET_MAP.get(c, c) for c in text)


def _elongation_variants(text: str) -> List[str]:
    """'puuuute' -> ['puute', 'pute'] : covers both natural double letters and stretched words."""
    return [ELONGATION_REGEX.sub(r"\1\1", text), ELONGATION_REGEX.sub(r"\1", text)]


def _unique(values: List[str]) -> List[str]:
    seen, out = set(), []
    for v in values:
        if v not in seen:
            seen.add(v)
            out.append(v)
    return out


def normalize_content(raw_text: str) -> NormalizedBundle:
    """
    Performs full multi-stage normalization against evasion techniques.
    Does NOT mutate original_text.
    """
    if not raw_text:
        return NormalizedBundle("", "", "", "", "", "", "", [], [], [])

    # 1. Strip zero-width & non-printable control characters
    cleaned = ZERO_WIDTH_REGEX.sub("", raw_text)
    cleaned = "".join(c for c in cleaned if c.isprintable() or c in "\n\r\t ")

    # 2. Canonical NFKC normalization (also folds fullwidth / mathematical letters to ASCII)
    nfkc = unicodedata.normalize("NFKC", cleaned)

    # 3. Lowercase BEFORE homoglyph replacement so uppercase Cyrillic/Greek are covered too
    # 4. Replace homoglyphs, then strip accents
    no_accents = strip_accents(replace_homoglyphs(nfkc.lower()))

    # 5. Decode leetspeak on the lowercased text
    leet_decoded = decode_leetspeak(no_accents)

    # 6. Collapsed text (plain and leet-decoded)
    collapsed_plain = re.sub(r"[^a-z0-9]", "", no_accents)
    collapsed_leet = re.sub(r"[^a-z0-9]", "", leet_decoded)

    # 7. Collapse character repetitions (e.g. coooool -> cool, heeeelp -> help)
    reduced = ELONGATION_REGEX.sub(r"\1\1", no_accents)

    # 8. Tokenize into normalized words
    tokens = [t for t in re.split(r"[^a-z0-9]+", no_accents) if t]

    regex_variants = _unique(
        [no_accents.strip(), leet_decoded.strip()]
        + _elongation_variants(no_accents.strip())
        + _elongation_variants(leet_decoded.strip())
    )
    collapsed_variants = _unique(
        [collapsed_plain, collapsed_leet]
        + _elongation_variants(collapsed_plain)
        + _elongation_variants(collapsed_leet)
    )

    return NormalizedBundle(
        original_text=raw_text,
        cleaned_text=cleaned.strip(),
        normalized_text=no_accents.strip(),
        leetspeak_text=leet_decoded.strip(),
        collapsed_text=collapsed_plain,
        collapsed_leet=collapsed_leet,
        reduced_text=reduced.strip(),
        tokens=tokens,
        regex_variants=regex_variants,
        collapsed_variants=collapsed_variants,
    )
