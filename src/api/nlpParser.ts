/**
 * 🧠 SAFETY NLP QUERY PARSER
 *
 * Transforme des phrases naturelles françaises en intentions de recherche structurées.
 *
 * Exemples :
 *   "y a-t-il un accident rue de Rivoli Paris ?"          → { intent: 'incident', category: 'accident', location: 'rue de Rivoli Paris' }
 *   "montre-moi les agressions dans le 18ème"             → { intent: 'incident', category: 'violence', location: '18ème Paris' }
 *   "incidents critiques à Lyon"                          → { intent: 'incident', severity: 'critical', location: 'Lyon' }
 *   "aller à la tour Eiffel"                              → { intent: 'navigate', location: 'tour Eiffel' }
 *   "c'est quoi comme danger avenue Montaigne"            → { intent: 'incident', location: 'avenue Montaigne' }
 */

export type SearchIntent =
  | 'incident'   // cherche des incidents
  | 'navigate'   // navigue vers un lieu
  | 'place';     // cherche un lieu (fallback)

export interface ParsedQuery {
  intent: SearchIntent;
  rawQuery: string;          // query nettoyée pour la géolocalisation
  locationHint: string;      // partie géo extraite
  categoryHint?: string;     // catégorie d'incident filtrée
  severityHint?: string;     // niveau de gravité
  naturalText: string;       // texte original
}

// ── Mots déclencheurs ────────────────────────────────────────────────────────

const INCIDENT_TRIGGERS = [
  'incident', 'incidents', 'accident', 'accidents', 'danger', 'dangereux', 'dangereuse',
  'agression', 'agressions', 'violence', 'violences', 'harcèlement', 'harcelment',
  'éclairage', 'signalement', 'alerte', 'alertes', 'risque', 'risques',
  'problème', 'problèmes', 'cambriolage', 'cambriolages', 'vol', 'vols',
  'sécurité', 'insécurité', 'signaler', 'éviter', 'zone dangereuse', 'zones',
  'rapport', 'rapports', 'que se passe', 'qu\'il se passe', 'quoi comme',
  'y a-t-il', 'y a t il', 'est-ce qu\'il y a', 'il y a', 'trouver',
  'montrer', 'montre', 'voir', 'donne-moi', 'donne moi', 'liste',
  'cherche', 'chercher',
];

const NAV_TRIGGERS = [
  'aller', 'aller à', 'aller au', 'aller en', 'naviguer', 'itinéraire',
  'direction', 'directions', 'amener', 'emmène', 'emmener', 'emmène-moi',
  'aller vers', 'se rendre', 'partir pour', 'trouver le chemin',
];

// ── Mapping catégories ────────────────────────────────────────────────────────

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  accident:    ['accident', 'accidents', 'collision', 'choc', 'accrochage', 'renversé', 'blessé'],
  violence:    ['violence', 'violent', 'agression', 'agressé', 'bagarre', 'rixe', 'coups', 'attaque', 'altercation'],
  harassment:  ['harcèlement', 'harcelment', 'harceler', 'harcelé', 'insulte', 'insultes', 'menace', 'menaces'],
  lighting:    ['éclairage', 'éclairé', 'lumière', 'sombre', 'obscur', 'noir', 'mal éclairé'],
  burglary:    ['cambriolage', 'cambriolé', 'vol', 'volé', 'effraction', 'pillé', 'sac arraché'],
  danger:      ['danger', 'dangereux', 'dangereuse', 'risque', 'risqué', 'zone à risque'],
  avoid:       ['éviter', 'évite', 'zone à éviter', 'ne pas aller', 'conseillé d\'éviter'],
};

const SEVERITY_KEYWORDS: Record<string, string[]> = {
  critical: ['critique', 'critiques', 'très grave', 'grave', 'urgent', 'urgence', 'extrême'],
  high:     ['élevé', 'important', 'sérieux', 'sérieuse', 'high', 'fort'],
  medium:   ['moyen', 'modéré', 'medium'],
  low:      ['faible', 'léger', 'low', 'mineur'],
};

// ── Phrases parasites à supprimer pour l'extraction géo ──────────────────────

const NOISE_PHRASES = [
  'y a-t-il', 'y a t il', 'est-ce qu\'il y a', 'est ce qu\'il y a',
  'est-ce qu il y a', 'qu\'est-ce qui se passe', 'que se passe-t-il',
  'que se passe t il', 'qu il se passe', 'dis-moi', 'dis moi',
  'montre-moi', 'montre moi', 'donne-moi', 'donne moi',
  'montrer', 'montre', 'cherche', 'chercher', 'trouver', 'voir',
  'liste des', 'liste de', 'liste', 'quels sont les', 'quelles sont les',
  'il y a', 'est-ce qu\'il', 'c\'est quoi', 'c est quoi', 'comme',
  'des incidents', 'les incidents', 'un incident', 'les accidents',
  'des accidents', 'un accident', 'les agressions', 'des agressions',
  'en matière de sécurité', 'niveau sécurité', 'niveau de sécurité',
  'dans le coin', 'dans ce coin', 'par ici', 'près d\'ici', 'aller à',
  'aller au', 'aller en', 'aller vers', 'naviguer vers', 'itinéraire vers',
  ...Object.values(CATEGORY_KEYWORDS).flat(),
  ...Object.values(SEVERITY_KEYWORDS).flat(),
  ...INCIDENT_TRIGGERS,
  ...NAV_TRIGGERS,
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // supprime accents
    .replace(/['']/g, "'")
    .replace(/[?!.,;:]/g, '')
    .trim();
}

function detectIntent(normalized: string): SearchIntent {
  if (NAV_TRIGGERS.some(t => normalized.includes(normalize(t)))) return 'navigate';
  if (INCIDENT_TRIGGERS.some(t => normalized.includes(normalize(t)))) return 'incident';
  return 'place';
}

function detectCategory(normalized: string): string | undefined {
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(k => normalized.includes(normalize(k)))) return cat;
  }
  return undefined;
}

function detectSeverity(normalized: string): string | undefined {
  for (const [sev, keywords] of Object.entries(SEVERITY_KEYWORDS)) {
    if (keywords.some(k => normalized.includes(normalize(k)))) return sev;
  }
  return undefined;
}

function extractLocationHint(normalized: string): string {
  let cleaned = normalized;
  // Trie les phrases par longueur décroissante pour éviter les remplacements partiels
  const sortedNoise = NOISE_PHRASES
    .map(normalize)
    .sort((a, b) => b.length - a.length);

  for (const noise of sortedNoise) {
    cleaned = cleaned.split(noise).join(' ');
  }

  // Prépositions résiduelles
  cleaned = cleaned.replace(/\b(dans|sur|au|à|en|le|la|les|de|du|des|un|une|pour|par)\b/g, ' ');
  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();

  return cleaned;
}

// ── Export principal ──────────────────────────────────────────────────────────

export function parseNaturalQuery(text: string): ParsedQuery {
  const normalized = normalize(text);
  const intent = detectIntent(normalized);
  const categoryHint = detectCategory(normalized);
  const severityHint = detectSeverity(normalized);
  const locationHint = extractLocationHint(normalized);

  // Si l'extraction géo est vide, on utilise la query d'origine nettoyée des mots de navigation
  const rawQuery = locationHint.length >= 2 ? locationHint : text.trim();

  return {
    intent,
    rawQuery,
    locationHint,
    categoryHint,
    severityHint,
    naturalText: text,
  };
}

/**
 * Retourne un label contextuel pour afficher sous la barre de recherche.
 */
export function getIntentLabel(parsed: ParsedQuery): string | null {
  if (parsed.intent === 'incident') {
    const parts: string[] = ['🔍 Incidents'];
    if (parsed.categoryHint) parts.push(`· ${parsed.categoryHint}`);
    if (parsed.severityHint) parts.push(`· ${parsed.severityHint}`);
    if (parsed.locationHint) parts.push(`à ${parsed.locationHint}`);
    return parts.join(' ');
  }
  if (parsed.intent === 'navigate') {
    return parsed.locationHint ? `🧭 Naviguer vers ${parsed.locationHint}` : null;
  }
  return null;
}
