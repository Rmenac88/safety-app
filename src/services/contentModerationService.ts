/**
 * Safety Citizen Content Moderation Engine
 * 
 * Multi-layer client-side moderation guard enforcing zero tolerance for:
 * - Racist slurs, xenophobia, ethnic discrimination
 * - Degrading / stigmatizing language (e.g. insults against sex workers / prostitution)
 * - Homophobia, transphobia
 * - Explicit death threats, incitement to hatred and violence
 * 
 * Works with normalized text, leetspeak decoding, and collapsed evasion detection.
 */

export type ModerationViolationCategory =
  | 'racism'
  | 'prostitution_slander'
  | 'homophobia'
  | 'threat'
  | 'hate_speech';

export interface ModerationVerdict {
  isBlocked: boolean;
  category?: ModerationViolationCategory;
  reasonTitle: string;
  reasonMessage: string;
  detectedWord?: string;
}

// ── 1. Prohibited Patterns (Multi-variation French & International) ───────────

// Racism, xenophobia, ethnic slurs
const RACISM_PATTERNS: RegExp[] = [
  /\bbougnoul(?:e|es|s)?\b/i,
  /\bbicot(?:e|es|s)?\b/i,
  /\bbamboula(?:s)?\b/i,
  /\byoupin(?:e|es|s)?\b/i,
  /\bfeuj(?:s)?\b/i, // In slurs context
  /\bcrouille(?:s)?\b/i,
  /\bmacaque(?:s)?\b/i,
  /\bn[eèé]gre(?:s)?\b/i,
  /\bn[eèé]gresse(?:s)?\b/i,
  /\bnigger(?:s)?\b/i,
  /\bnigga(?:s)?\b/i,
  /\bchintok(?:s)?\b/i,
  /\bniakou[eé](?:s)?\b/i,
  /\braton(?:s)?\b/i,
  /\bkike(?:s)?\b/i,
  /\bchink(?:s)?\b/i,
  /\bgook(?:s)?\b/i,
  /\bsale\s+(?:arabe|noir|blanc|juif|feuj|babtou|gwer|gawri|asiatique|chinois|rom|gitan)s?\b/i,
  /\bmort\s+aux\s+(?:arabes|noirs|blancs|juifs|musulmans|chretiens|asiatiques|francais|roms|gitans|flics)\b/i,
  /\bheil\s+hitler\b/i,
  /\bsieg\s+heil\b/i,
  /\bchambre\s+[aà]\s+gaz\b/i,
];

// Degrading language, prostitution stigmatization, sexism
const PROSTITUTION_SLANDER_PATTERNS: RegExp[] = [
  /\bpros[t]?itu[eé](?:e|es|s)?\b/i,
  /\bpros[t]?itution\b/i,
  /\bpros[t]?ituer\b/i,
  /\btapin(?:er|eur|euse)?s?\b/i,
  /\bmichetonneuse(?:s)?\b/i,
  /\bescort(?:e|es|s)?\b/i,
  /\bpute(?:s)?\b/i,
  /\bsalope(?:s)?\b/i,
  /\bchienne(?:s)?\b/i,
  /\bgrosse\s+salope(?:s)?\b/i,
  /\bsale\s+pute(?:s)?\b/i,
  /\bbordel\s+de\s+filles?\b/i,
];

// Homophobia & transphobia
const HOMOPHOBIA_PATTERNS: RegExp[] = [
  /\bp[eé]d[eé](?:s)?\b/i,
  /\bp[eé]dale(?:s)?\b/i,
  /\btarlouze(?:s)?\b/i,
  /\btapette(?:s)?\b/i,
  /\bfiotte(?:s)?\b/i,
  /\bgouine(?:s)?\b/i,
  /\bfaggot(?:s)?\b/i,
  /\bdyke(?:s)?\b/i,
  /\bsale\s+gouine(?:s)?\b/i,
  /\bsale\s+p[eé]d[eé](?:s)?\b/i,
  /\btranny(?:s)?\b/i,
];

// Direct death threats & mass violence
const THREAT_PATTERNS: RegExp[] = [
  /\b(?:je\s+vais|on\s+va)\s+(?:te|vous)\s+(?:tuer|fumer|egorger|[eé]gorger|massacrer|crever)\b/i,
  /\bva\s+mourir\b/i,
  /\bcr[eèé]ve\b/i,
  /\battentat\s+imminent\b/i,
  /\bpose(?:r)?\s+une\s+bombe\b/i,
  /\bfusillade\s+imminente\b/i,
  /\bfaire\s+exploser\s+tout\b/i,
];

// Substring evasions (catches collapsed representations like "b.o.u.g.n.o.u.l", "p-u-t-e", "p.r.o.s.t.i.t.u")
const COLLAPSED_TRIGGERS: { token: string; category: ModerationViolationCategory }[] = [
  { token: 'bougnoul', category: 'racism' },
  { token: 'salenegre', category: 'racism' },
  { token: 'negre', category: 'racism' },
  { token: 'nigger', category: 'racism' },
  { token: 'bicot', category: 'racism' },
  { token: 'bamboula', category: 'racism' },
  { token: 'youpin', category: 'racism' },
  { token: 'chintok', category: 'racism' },
  { token: 'niakoue', category: 'racism' },
  { token: 'prostitu', category: 'prostitution_slander' },
  { token: 'prositu', category: 'prostitution_slander' },
  { token: 'salepute', category: 'prostitution_slander' },
  { token: 'salope', category: 'prostitution_slander' },
  { token: 'micheton', category: 'prostitution_slander' },
  { token: 'tarlouze', category: 'homophobia' },
  { token: 'salepedale', category: 'homophobia' },
  { token: 'jetetue', category: 'threat' },
  { token: 'poseunebombe', category: 'threat' },
  { token: 'attentatimminent', category: 'threat' },
];

// ── 2. Text Normalizer ────────────────────────────────────────────────────────

function normalizeText(raw: string): { clean: string; collapsed: string; leetCollapsed: string } {
  // 1. Lowercase + de-accentuate
  const clean = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  // 2. Remove punctuation, symbols, whitespace to catch "b.o.u.g.n.o.u.l" or "p-u-t-e"
  const collapsed = clean.replace(/[^a-z0-9]/g, '');

  // 3. Leetspeak mapping
  const leetCollapsed = collapsed
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/7/g, 't')
    .replace(/8/g, 'b');

  return { clean, collapsed, leetCollapsed };
}

// ── 3. Main Moderation Evaluator ──────────────────────────────────────────────

export function evaluateContentModeration(text: string | null | undefined): ModerationVerdict {
  if (!text || text.trim().length === 0) {
    return {
      isBlocked: false,
      reasonTitle: '',
      reasonMessage: '',
    };
  }

  const { clean, collapsed, leetCollapsed } = normalizeText(text);

  // 1. Check Racism & Xenophobia
  for (const pattern of RACISM_PATTERNS) {
    const match = clean.match(pattern);
    if (match) {
      return {
        isBlocked: true,
        category: 'racism',
        detectedWord: match[0],
        reasonTitle: 'Signalement bloqué par la modération',
        reasonMessage:
          'Votre description a été bloquée pour propos à caractère raciste, xénophobe ou discriminatoire. Safety applique une tolérance zéro envers les discours de haine.',
      };
    }
  }

  // 2. Check Degrading Language / Prostitution Slander
  for (const pattern of PROSTITUTION_SLANDER_PATTERNS) {
    const match = clean.match(pattern);
    if (match) {
      return {
        isBlocked: true,
        category: 'prostitution_slander',
        detectedWord: match[0],
        reasonTitle: 'Signalement bloqué par la modération',
        reasonMessage:
          'Votre description a été bloquée pour propos dégradants, injurieux ou ciblant la prostitution. Safety est une application citoyenne d\'entraide et de sécurité bienveillante.',
      };
    }
  }

  // 3. Check Homophobia / Transphobia
  for (const pattern of HOMOPHOBIA_PATTERNS) {
    const match = clean.match(pattern);
    if (match) {
      return {
        isBlocked: true,
        category: 'homophobia',
        detectedWord: match[0],
        reasonTitle: 'Signalement bloqué par la modération',
        reasonMessage:
          'Votre description a été bloquée pour propos homophobes ou discriminatoires.',
      };
    }
  }

  // 4. Check Threats & Mass Violence
  for (const pattern of THREAT_PATTERNS) {
    const match = clean.match(pattern);
    if (match) {
      return {
        isBlocked: true,
        category: 'threat',
        detectedWord: match[0],
        reasonTitle: 'Signalement bloqué par la modération',
        reasonMessage:
          'Votre description a été bloquée pour menace directe ou incitation à la violence.',
      };
    }
  }

  // 5. Check Collapsed / Leetspeak Evasions
  for (const item of COLLAPSED_TRIGGERS) {
    if (collapsed.includes(item.token) || leetCollapsed.includes(item.token)) {
      const messages: Record<ModerationViolationCategory, string> = {
        racism: 'Propos à caractère raciste ou discriminatoire détectés.',
        prostitution_slander: 'Termes dégradants ou injurieux interdits sur la plateforme.',
        homophobia: 'Propos homophobes ou discriminatoires détectés.',
        threat: 'Menace directe ou incitation à la violence détectée.',
        hate_speech: 'Propos haineux non conformes à la charte citoyenne.',
      };

      return {
        isBlocked: true,
        category: item.category,
        detectedWord: item.token,
        reasonTitle: 'Signalement bloqué par la modération',
        reasonMessage: `Votre description a été bloquée par le système de modération automatique. ${messages[item.category]} Veuillez modifier votre texte pour pouvoir publier.`,
      };
    }
  }

  return {
    isBlocked: false,
    reasonTitle: '',
    reasonMessage: '',
  };
}
