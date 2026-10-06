import re
from typing import List, Tuple, Set
from .categories import ModerationCategory

# Factual safety context indicators that protect real incident reports from false positives
FACTUAL_REPORTING_MARKERS: Set[str] = {
    "signale", "signaler", "signalement", "temoin", "temoignage", "vu", "apercu",
    "entendu", "victime", "agression", "agresse", "agressee", "harcelement", "suivi",
    "suivie", "alerte", "attention", "secteur", "danger", "police", "pompiers",
    "secours", "hopital", "plainte", "altercation", "bagarre",
    "rixe", "vol", "voleur", "cambriolage", "accident", "blesse", "blessee",
    "rue", "avenue", "boulevard", "station", "gare", "metro", "bus", "quartier",
    "individu", "suspect", "menace", "menacant", "arme", "armee", "brandit",
    "brandissant", "samu", "urgence", "malaise", "inconscient", "inconsciente",
}

# Incident categories in which a weapon / violence mention is expected (it IS the report)
SAFETY_CONTEXT_CATEGORIES: Set[str] = {
    "danger", "avoid", "altercation", "violence", "harassment", "burglary", "police",
}

# Incident categories in which "il va mourir" describes a victim, not a threat
EMERGENCY_CONTEXT_CATEGORIES: Set[str] = {
    "danger", "violence", "accident", "medical", "fire", "disaster", "altercation",
}

# Legitimately reported offense phrases that should NOT be blocked when reported factuellement.
# They only neutralize MEDIUM-level matches (weapons, common insults), never slurs / spam / porn.
LEGITIMATE_OFFENSE_PHRASES: List[re.Pattern] = [
    re.compile(r"\b(agression|harcelement)\s+sexuel(le)?\b", re.IGNORECASE),
    re.compile(r"\b(geste|attouchement|comportement)s?\s+(deplace|inapproprie|suspect|sexuel)s?\b", re.IGNORECASE),
    re.compile(r"\b(victime|temoin)\s+d['\s]\s*(un|une)?\s*(agression|harcelement|viol|vol)\b", re.IGNORECASE),
    re.compile(r"\b(exhibitionnisme|exhibitionniste)\b", re.IGNORECASE),
    re.compile(r"\b(propos|actes?|injures?|insultes?)\s+(racistes?|homophobes?|antisemites?|sexistes?)\b", re.IGNORECASE),
    re.compile(r"\bune\s+personne\s+a\s+tenu\s+des\s+propos\s+racistes\b", re.IGNORECASE),
    re.compile(r"\bpropos\s+haineux\s+(entendu|signale|remarque)\b", re.IGNORECASE),
    re.compile(r"\b(agresseur|auteur)\s+(en\s+fuite|arme|menacant|identifie)\b", re.IGNORECASE),
]

# Second-person markers: "tu / vous / te / t'" -> a sentence addressed to someone (threat)
SECOND_PERSON_TOKENS: Set[str] = {"tu", "te", "t", "toi", "vous"}

# 1. CRITICAL RULES (Immediate Block, Risk = 1.0)
CRITICAL_PATTERNS: List[Tuple[re.Pattern, ModerationCategory]] = [
    # Child Sexual Abuse / Exploitation (Protection absolue des mineurs)
    (re.compile(r"\b(pedophil\w*|pedocriminel\w*|pedoporn\w*|enfants?\s+nue?s?|petites?\s+filles?\s+nues?|petits?\s+garcons?\s+nus?|child\s*porn\w*|cp\s+links?|jailbait)\b", re.IGNORECASE), ModerationCategory.SEXUAL_MINORS),
    # Direct death threats / mass violence / terrorism
    (re.compile(r"\b(je\s+vais|on\s+va)\s+(te|vous)\s+(tuer|fumer|egorger|massacrer|crever|buter|planter)\b", re.IGNORECASE), ModerationCategory.THREAT),
    (re.compile(r"\b(tu\s+vas?|vous\s+allez)\s+(mourir|crever|y\s+passer)\b", re.IGNORECASE), ModerationCategory.THREAT),
    (re.compile(r"\b(attentat\s+imminent|pose\s+une\s+bombe|faire\s+exploser|tuer\s+tout\s+le\s+monde|massacre\s+de\s+masse)\b", re.IGNORECASE), ModerationCategory.THREAT),
    (re.compile(r"\b(mort\s+aux\s+(juifs|arabes|noirs|blancs|musulmans|chretiens|flics))\b", re.IGNORECASE), ModerationCategory.HATE),
    (re.compile(r"\b(tous\s+les\s+(juifs|arabes|noirs|blancs|musulmans|chretiens)\s+doivent\s+mourir)\b", re.IGNORECASE), ModerationCategory.HATE),
    (re.compile(r"\b(heil\s+hitler|sieg\s+heil|chambre\s+a\s+gaz\s+pour\s+vous)\b", re.IGNORECASE), ModerationCategory.ANTISEMITISM),
]

# 2. HIGH RISK RULES (Score 0.80, Block) - never neutralized by factual context
HIGH_PATTERNS: List[Tuple[re.Pattern, ModerationCategory]] = [
    # Explicit sexual / pornography (unnecessary explicit sexual details)
    (re.compile(r"\b(grosse\s+bite|chatte\s+bien\s+mouillee|suce\s+moi|baise\s+moi|pornographi\w*|porno|hardcore\s+sex|gangbang|fellations?|sodomies?|nudes?\s+gratuit\w*|onlyfans\.com)\b", re.IGNORECASE), ModerationCategory.SEXUAL_EXPLICIT),
    # Severe targeted hate / slurs (FR & EN)
    (re.compile(r"\b(bougnoul(?:e|es|s)?|bicot(?:s)?|bamboula(?:s)?|youpin(?:e|es|s)?|crouille(?:s)?|macaque(?:s)?|negre(?:s)?|negresse(?:s)?|nigger(?:s)?|nigga(?:s)?|chintok(?:s)?|niakoue(?:s)?|kike(?:s)?|chink(?:s)?|gook(?:s)?)\b", re.IGNORECASE), ModerationCategory.RACISM),
    (re.compile(r"\b(sale\s+arabe|sale\s+feuj|sale\s+babtou|sale\s+juif|sale\s+gitan)s?\b", re.IGNORECASE), ModerationCategory.RACISM),
    # Prostitution slander & degrading language
    # NB: "escorte" alone is NOT matched (escorte policière, sous escorte...), only "escort girl/boy".
    (re.compile(r"\b(prostitue(?:e|es|s)?|prostitution|prostituer|pute(?:s)?|salope(?:s)?|michetonneuse(?:s)?|tapin(?:er|eur|euse)?(?:s)?|escort[\s-]?(?:girl|boy)s?)\b", re.IGNORECASE), ModerationCategory.SEXISM),
    (re.compile(r"\b(sale\s+chienne|connasse|grognasse)s?\b", re.IGNORECASE), ModerationCategory.SEXISM),
    (re.compile(r"\b(sale\s+pedale|gouine|pede|fiotte|tarlouze|tapette|faggot|dyke)s?\b", re.IGNORECASE), ModerationCategory.HOMOPHOBIA),
    (re.compile(r"\b(sale\s+trans|sale\s+tranny|tranny|aberration\s+trans)\b", re.IGNORECASE), ModerationCategory.TRANSPHOBIA),
    # Graphic gratuitous violence
    (re.compile(r"\b(arracher\s+les\s+visceres|morceaux\s+de\s+cerveau\s+eparpilles|decapitation\s+en\s+direct|gout\s+du\s+sang|orgasme\s+de\s+sang)\b", re.IGNORECASE), ModerationCategory.GRAPHIC_VIOLENCE),
    # Illegal trafficking & narcotics
    (re.compile(r"\b(vente\s+de\s+(beuh|coke|heroine|crack|ecstasy)|livraison\s+de\s+drogue|vends?\s+(kalash\w*|kalach\w*|armes?|beuh|coke))\b", re.IGNORECASE), ModerationCategory.ILLEGAL_ACTIVITY),
    # Spam / Advertising / Scams
    (re.compile(r"(\bpromo\s+code\b|\bfree\s+money\b|\brejoins\s+mon\s+canal\b|\bt\.me/\w+|\bbit\.ly/\w+|\bwhatsapp\s*:?\s*\+?\d{6,}|\bgagnez\s+\d+\s*(€|e|euros?)\s+facilement\b)", re.IGNORECASE), ModerationCategory.SPAM),
]

# 3. COLLAPSED SEQUENCE TRIGGERS (Catches m.o.r.t, s.a.l.o.p.e, leetspeak...)
# Matched on the text with every separator removed, so each entry must be
# specific enough not to appear by accident across two normal words.
COLLAPSED_CRITICAL_SUBSTRINGS: List[Tuple[str, ModerationCategory]] = [
    ("pedophile", ModerationCategory.SEXUAL_MINORS),
    ("pedocrim", ModerationCategory.SEXUAL_MINORS),
    ("childporn", ModerationCategory.SEXUAL_MINORS),
    ("tuvasmourir", ModerationCategory.THREAT),
    ("tuvamourir", ModerationCategory.THREAT),
    ("vousallezmourir", ModerationCategory.THREAT),
    ("jetetue", ModerationCategory.THREAT),
    ("jevaistetuer", ModerationCategory.THREAT),
    ("mortauxjuifs", ModerationCategory.ANTISEMITISM),
    ("mortauxarabes", ModerationCategory.RACISM),
    ("mortauxnoirs", ModerationCategory.RACISM),
    ("mortauxblancs", ModerationCategory.RACISM),
    ("heilhitler", ModerationCategory.ANTISEMITISM),
    ("salenegre", ModerationCategory.RACISM),
    ("nigger", ModerationCategory.RACISM),
    ("salepedale", ModerationCategory.HOMOPHOBIA),
    ("salegouine", ModerationCategory.HOMOPHOBIA),
    ("salepute", ModerationCategory.SEXISM),
    ("grossesalope", ModerationCategory.SEXISM),
    ("salope", ModerationCategory.SEXISM),
    ("bougnoul", ModerationCategory.RACISM),
    ("prostitu", ModerationCategory.SEXISM),
    ("baise", ModerationCategory.SEXUAL_EXPLICIT),
    ("fellation", ModerationCategory.SEXUAL_EXPLICIT),
    ("sodomie", ModerationCategory.SEXUAL_EXPLICIT),
]

# Ordinary words that contain a collapsed trigger ("salopette" contains "salope",
# "baisse" is safe but "baiser" is not...). They are removed before the collapsed check.
COLLAPSED_BENIGN_WORDS: List[str] = [
    "salopettes", "salopette",
]

# "va mourir" is a threat ("v@ m0ur1r") EXCEPT when it describes a victim in an
# emergency report ("le blessé va mourir si les secours n'arrivent pas").
CONTEXTUAL_THREAT_SUBSTRINGS: List[Tuple[str, ModerationCategory]] = [
    ("vamourir", ModerationCategory.THREAT),
    ("vacrever", ModerationCategory.THREAT),
]

# 4. MEDIUM RISK PATTERNS (Blocked unless accompanied by safety context)
MEDIUM_PATTERNS: List[Tuple[re.Pattern, ModerationCategory]] = [
    (re.compile(r"\b(armes?\s+a\s+feu|fusils?|pistolets?|revolvers?|machettes?|couteaux?\s+de\s+chasse)\b", re.IGNORECASE), ModerationCategory.VIOLENCE),
    (re.compile(r"\b(kalach\w*|kalash\w*|fusils?\s+d['\s]\s*assaut)\b", re.IGNORECASE), ModerationCategory.VIOLENCE),
    (re.compile(r"\b(con|connard|connards|batard|batards|encule|encules|fdp|ntm|tg|ferme\s+ta\s+gueule|nique\s+ta\s+mere)\b", re.IGNORECASE), ModerationCategory.HARASSMENT),
]

# 5. LOW RISK (published, flagged REVIEW in the audit trail): mild vulgarity
#    "merde de chien sur le trottoir" is a legitimate hazard report.
LOW_PATTERNS: List[Tuple[re.Pattern, ModerationCategory]] = [
    (re.compile(r"\b(merde|merdes|putain)\b", re.IGNORECASE), ModerationCategory.ABUSE),
]
