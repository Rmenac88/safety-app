import type { Incident } from '../types/safety';

const STORAGE_KEY = 'safety_live_incidents';

export function getStoredIncidents(): Incident[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: Incident[] = JSON.parse(raw);

    const now = Date.now();
    // Filter out expired incidents automatically
    const active = parsed.filter((inc) => {
      const expireMs = new Date(inc.expiresAt).getTime();
      return expireMs > now;
    });

    if (active.length !== parsed.length) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(active));
    }
    return active;
  } catch (err) {
    console.error('Failed to load incidents from storage', err);
    return [];
  }
}

export function persistIncidents(incidents: Incident[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(incidents));
  } catch (err) {
    console.error('Failed to persist incidents', err);
  }
}

export function createIncidentRecord(
  data: Omit<Incident, 'id' | 'createdAt' | 'expiresAt' | 'confirmationsCount' | 'disputesCount' | 'reliability' | 'status' | 'author'>,
  authorInfo: { id: string; pseudonym: string; trustTier: any; isAnonymous: boolean }
): Incident {
  const now = new Date();
  let durationHours = 2;
  if (data.estimatedDuration.includes('30 min')) durationHours = 0.5;
  else if (data.estimatedDuration.includes('12 h')) durationHours = 12;
  else if (data.estimatedDuration.includes('24 h')) durationHours = 24;
  else if (data.estimatedDuration.includes('permanent')) durationHours = 720;

  return {
    ...data,
    id: `inc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + durationHours * 3600000).toISOString(),
    confirmationsCount: 1,
    disputesCount: 0,
    reliability: authorInfo.trustTier === 'verified' ? 'confirmed' : 'community',
    status: 'active',
    author: authorInfo,
    hasUserConfirmed: true,
  };
}
