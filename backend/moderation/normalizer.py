import re
import unicodedata
from dataclasses import dataclass
from typing import List, Dict, Set

# Zero-width & invisible unicode characters
ZERO_WIDTH_REGEX = re.compile(
    r"[\u200B\u200C\u200D\u200E\u200F\uFEFF\u202A\u202B\u202C\u202D\u202E\u00AD\u2060\u2061\u2062\u2063\u2064]"
)

# Common homoglyphs mapping (Cyrillic, Greek, Math Alphanumeric to Latin)
HOMOGLYPHS_MAP: Dict[str, str] = {
    # Cyrillic lowercase
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e", "ж": "zh",
    "з": "z", "и": "i", "й": "i", "і": "i", "ї": "i", "І": "i", "Ї": "i", "ј": "j", "ѕ": "s", "к": "k", "л": "l", "м": "m", "н": "n", "о": "o",
    "п": "p", "р": "r", "с": "s", "т": "t", "у": "u", "ф": "f", "х": "x", "ц": "c",
    "ч": "ch", "ш": "sh", "щ": "sh", "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya",
    # Cyrillic uppercase
    "А": "a", "В": "b", "Е": "e", "К": "k", "М": "m", "Н": "h", "О": "o", "Р": "p",
    "С": "s", "Т": "t", "У": "y", "Х": "x",
    # Greek
    "α": "a", "β": "b", "γ": "g", "δ": "d", "ε": "e", "ζ": "z", "η": "h", "θ": "th",
    "ι": "i", "κ": "k", "λ": "l", "μ": "m", "ν": "n", "ξ": "x", "ο": "o", "π": "p",
    "ρ": "r", "σ": "s", "τ": "t", "υ": "u", "φ": "ph", "χ": "ch", "ψ": "ps", "ω": "o",
    "Α": "a", "Β": "b", "Ε": "e", "Ζ": "z", "Η": "h", "Ι": "i", "Κ": "k", "Μ": "m",
    "Ν": "n", "Ο": "o", "Ρ": "p", "Τ": "t", "Υ": "u", "Χ": "x",
    # Common mathematical variants & fullwidth
    "ａ": "a", "ｂ": "b", "ｃ": "c", "ｄ": "d", "ｅ": "e", "ｆ": "f", "ｇ": "g", "ｈ": "h",
    "ｉ": "i", "ｊ": "j", "ｋ": "k", "ｌ": "l", "ｍ": "m", "ｎ": "n", "ｏ": "o", "ｐ": "p",
    "ｑ": "q", "ｒ": "r", "ｓ": "s", "ｔ": "t", "ｕ": "u", "ｖ": "v", "ｗ": "w", "ｘ": "x",
    "ｙ": "y", "ｚ": "z",
}

# Standard leetspeak mapping: only digits, symbols, and non-alpha lookalikes to Latin letters
LEET_MAP: Dict[str, str] = {
    "@": "a", "4": "a", "^": "a",
    "8": "b",
    "(": "c", "<": "c", "[": "c", "{": "c",
    "3": "e", "&": "e",
    "6": "g", "9": "g",
    "1": "i", "!": "i", "|": "i",
    "0": "o",
    "5": "s", "$": "s", "§": "s",
    "7": "t", "+": "t",
    "2": "z", "%": "z",
}

REPEATED_CHARS_REGEX = re.compile(r"(.)\1{2,}", re.IGNORECASE)

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


def strip_accents(text: str) -> str:
    """Removes diacritics while preserving base characters."""
    nfkd = unicodedata.normalize("NFKD", text)
    return "".join(c for c in nfkd if not unicodedata.combining(c))


def replace_homoglyphs(text: str) -> str:
    """Replaces known look-alike unicode characters with Latin equivalents."""
    return "".join(HOMOGLYPHS_MAP.get(c, c) for c in text)


def decode_leetspeak(text: str) -> str:
    """Converts standard leet patterns into equivalent latin letters."""
    res = []
    for c in text:
        res.append(LEET_MAP.get(c, c))
    return "".join(res)


def normalize_content(raw_text: str) -> NormalizedBundle:
    """
    Performs full multi-stage normalization against evasion techniques.
    Does NOT mutate original_text.
    """
    if not raw_text:
        return NormalizedBundle("", "", "", "", "", "", "", [])

    # 1. Strip zero-width & non-printable control characters
    cleaned = ZERO_WIDTH_REGEX.sub("", raw_text)
    cleaned = "".join(c for c in cleaned if c.isprintable() or c in "\n\r\t ")

    # 2. Canonical NFKC normalization
    nfkc = unicodedata.normalize("NFKC", cleaned)

    # 3. Replace homoglyphs
    homo_fixed = replace_homoglyphs(nfkc)

    # 4. Strip accents and lowercase
    no_accents = strip_accents(homo_fixed).lower()

    # 5. Decode leetspeak on the lowercased text
    leet_decoded = decode_leetspeak(no_accents)

    # 6. Collapsed text (plain and leet-decoded)
    collapsed_plain = re.sub(r"[^a-z0-9]", "", no_accents)
    collapsed_leet = re.sub(r"[^a-z0-9]", "", leet_decoded)

    # 7. Collapse character repetitions (e.g. coooool -> cool, heeeelp -> help)
    reduced = REPEATED_CHARS_REGEX.sub(r"\1\1", no_accents)

    # 8. Tokenize into normalized words
    tokens = [t for t in re.split(r"[^a-z0-9]+", no_accents) if t]

    return NormalizedBundle(
        original_text=raw_text,
        cleaned_text=cleaned.strip(),
        normalized_text=no_accents.strip(),
        leetspeak_text=leet_decoded.strip(),
        collapsed_text=collapsed_plain,
        collapsed_leet=collapsed_leet,
        reduced_text=reduced.strip(),
        tokens=tokens,
    )
