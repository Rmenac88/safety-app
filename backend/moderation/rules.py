import re
from typing import List, Dict, Tuple, Set
from .categories import ModerationCategory, ModerationSeverity

# Factual safety context indicators that protect real incident reports from false positives
FACTUAL_REPORTING_MARKERS: Set[str] = {
    "signale", "signaler", "signalement", "temoin", "temoignage", "vu", "apercu",
    "entendu", "victime", "agression", "agresse", "agressee", "harcelement", "suivi",
    "suivie", "alerte", "attention", "secteur", "danger", "police", "pompiers",
    "secours", "hopital", "plainte", "depot de plainte", "altercation", "bagarre",
    "rixe", "vol", "voleur", "cambriolage", "accident", "blesse", "blessee",
    "rue", "avenue", "boulevard", "station", "gare", "metro", "bus", "quartier"
}

# Legitimately reported offense phrases that should NOT be blocked when reported factuellement
LEGITIMATE_OFFENSE_PHRASES: List[re.Pattern] = [
    re.compile(r"\b(agression|harcelement)\s+sexuel(le)?\b", re.IGNORECASE),
    re.compile(r"\b(geste|attouchement|comportement)\s+(deplace|inapproprie|suspect|sexuel)\b", re.IGNORECASE),
    re.compile(r"\b(victime|temoin)\s+d['\s]un(e)?\s+(agression|harcelement|viol|vol)\b", re.IGNORECASE),
    re.compile(r"\b(exhibitionnisme|exhibitionniste)\b", re.IGNORECASE),
    re.compile(r"\b(propos|actes?|injures?|insultes?)\s+(racistes?|homophobes?|antisemites?|sexistes?)\b", re.IGNORECASE),
    re.compile(r"\bune\s+personne\s+a\s+tenu\s+des\s+propos\s+racistes\b", re.IGNORECASE),
    re.compile(r"\bpropos\s+haineux\s+(entendu|signale|remarque)\b", re.IGNORECASE),
    re.compile(r"\b(agresseur|auteur)\s+(en\s+fuite|arme|menacant|identifie)\b", re.IGNORECASE),
]

# 1. CRITICAL RULES (Immediate Block, Risk = 1.0)
CRITICAL_PATTERNS: List[Tuple[re.Pattern, ModerationCategory]] = [
    # Child Sexual Abuse / Exploitation (Protection absolue des mineurs)
    (re.compile(r"\b(pedophil|pedocriminel|pedoporn|enfant\s+nu|petite\s+fille\s+nue|petit\s+garcon\s+nu|child\s*porn|cp\s+link|jailbait)\b", re.IGNORECASE), ModerationCategory.SEXUAL_MINORS),
    # Direct death threats / mass violence / terrorism
    (re.compile(r"\b(je\s+vais\s+(te|vous)\s+(tuer|fumer|egorger|massacrer|crever))\b", re.IGNORECASE), ModerationCategory.THREAT),
    (re.compile(r"\b(attentat\s+imminent|pose\s+une\s+bombe|faire\s+exploser|tuer\s+tout\s+le\s+monde|massacre\s+de\s+masse)\b", re.IGNORECASE), ModerationCategory.THREAT),
    (re.compile(r"\b(mort\s+aux\s+(juifs|arabes|noirs|blancs|musulmans|chretiens|flics))\b", re.IGNORECASE), ModerationCategory.HATE),
    (re.compile(r"\b(tous\s+les\s+(juifs|arabes|noirs|blancs|musulmans|chretiens)\s+doivent\s+mourir)\b", re.IGNORECASE), ModerationCategory.HATE),
    (re.compile(r"\b(heil\s+hitler|sieg\s+heil|chambre\s+a\s+gaz\s+pour\s+vous)\b", re.IGNORECASE), ModerationCategory.ANTISEMITISM),
]

# 2. HIGH RISK RULES (Score 0.65 - 0.85, Block)
HIGH_PATTERNS: List[Tuple[re.Pattern, ModerationCategory]] = [
    # Explicit sexual / pornography (unnecessary explicit sexual details)
    (re.compile(r"\b(grosse\s+bite|chatte\s+bien\s+mouillee|suce\s+moi|baise\s+moi|pornographi|hardcore\s+sex|gangbang|fellation|sodomie|nude\s+gratuit|onlyfans\.com)\b", re.IGNORECASE), ModerationCategory.SEXUAL_EXPLICIT),
    # Severe targeted hate / slurs (FR & EN)
    (re.compile(r"\b(sale\s+negre|sale\s+arabe|sale\s+feuj|sale\s+youpin|sale\s+bougnoul|sale\s+babtou|nigger|nigga|kike|chink|gook)\b", re.IGNORECASE), ModerationCategory.RACISM),
    (re.compile(r"\b(sale\s+pute|grosse\s+salope|sale\s+chienne|connasse|grognasse)\b", re.IGNORECASE), ModerationCategory.SEXISM),
    (re.compile(r"\b(sale\s+pedale|sale\s+gouine|tarlouze|tapette|faggot|dyke)\b", re.IGNORECASE), ModerationCategory.HOMOPHOBIA),
    (re.compile(r"\b(sale\s+trans|sale\s+tranny|aberration\s+trans)\b", re.IGNORECASE), ModerationCategory.TRANSPHOBIA),
    # Graphic gratuitous violence
    (re.compile(r"\b(arracher\s+les\s+visceres|morceaux\s+de\s+cerveau\s+eparpilles|decapitation\s+en\s+direct|gout\s+du\s+sang|orgasme\s+de\s+sang)\b", re.IGNORECASE), ModerationCategory.GRAPHIC_VIOLENCE),
    # Illegal trafficking & narcotics
    (re.compile(r"\b(vente\s+de\s+(beuh|coke|heroine|crack|ecstasy)|livraison\s+de\s+drogue|vends\s+kalash|vends\s+arme)\b", re.IGNORECASE), ModerationCategory.ILLEGAL_ACTIVITY),
    # Spam / Advertising / Scams
    (re.compile(r"\b(promo\s+code|free\s+money|rejoins\s+mon\s+canal\s+telegram|t\.me\/[a-zA-Z0-9_]+|bit\.ly\/[a-zA-Z0-9_]+|whatsapp\s*:\s*\+?\d{6,}|gagnez\s+\d+\s*€\s+facilement)\b", re.IGNORECASE), ModerationCategory.SPAM),
]

# 3. COLLAPSED SEQUENCE TRIGGERS (Catches m.o.r.t, s.e.x.e, v-a-m-o-u-r-i-r, leetspeak)
COLLAPSED_CRITICAL_SUBSTRINGS: List[Tuple[str, ModerationCategory]] = [
    ("pedophile", ModerationCategory.SEXUAL_MINORS),
    ("pedocrim", ModerationCategory.SEXUAL_MINORS),
    ("childporn", ModerationCategory.SEXUAL_MINORS),
    ("vamourir", ModerationCategory.THREAT),
    ("jetetue", ModerationCategory.THREAT),
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
    ("baise", ModerationCategory.SEXUAL_EXPLICIT),
    ("fellation", ModerationCategory.SEXUAL_EXPLICIT),
    ("sodomie", ModerationCategory.SEXUAL_EXPLICIT),
]

# 4. MEDIUM REVIEW RISK PATTERNS (Triggers REVIEW if not accompanied by safety context)
MEDIUM_PATTERNS: List[Tuple[re.Pattern, ModerationCategory]] = [
    (re.compile(r"\b(arme\s+a\s+feu|fusil|pistolet|revolver|machette|couteau\s+de\s+chasse)\b", re.IGNORECASE), ModerationCategory.VIOLENCE),
    (re.compile(r"\b(kalach|kalachnikov|fusil\s+d['\s]assaut)\b", re.IGNORECASE), ModerationCategory.VIOLENCE),
    (re.compile(r"\b(con|connard|merde|batard|encule|fdp|tg|ferme\s+ta\s+gueule)\b", re.IGNORECASE), ModerationCategory.HARASSMENT),
]
