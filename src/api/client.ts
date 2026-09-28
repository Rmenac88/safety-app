export const API_BASE = (import.meta.env.VITE_API_URL as string) ||
  (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://127.0.0.1:8000/api/v1'
    : '/api/v1');

export class ApiError extends Error {
  status: number;
  data: any;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
    try {
      this.data = JSON.parse(message);
    } catch {
      this.data = null;
    }
  }

  get isModerationBlocked(): boolean {
    return (
      this.status === 422 &&
      (this.data?.detail?.code === 'CONTENT_BLOCKED' ||
        this.data?.code === 'CONTENT_BLOCKED')
    );
  }

  get moderationTitle(): string {
    return this.data?.detail?.title || this.data?.title || 'Contenu bloqué';
  }

  get moderationMessage(): string {
    return (
      this.data?.detail?.message ||
      this.data?.message ||
      'Cette description contient un contenu qui ne respecte pas les règles de Safety. Modifiez votre description afin de pouvoir publier le signalement.'
    );
  }
}

/**
 * Returns a persistent anonymous Device UUID stored in localStorage.
 * No account or signup required — works exactly like a GPS device / Waze.
 */
export function getDeviceId(): string {
  if (typeof window === 'undefined') return 'server-device-id';
  let id = localStorage.getItem('safety_device_id');
  if (!id) {
    id = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : 'device_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now();
    localStorage.setItem('safety_device_id', id);
  }
  return id;
}

/**
 * Cryptographic owner token storage for anti-IDOR client-side authorization.
 */
export function getIncidentOwnerToken(incidentId: string): string | null {
  try {
    const raw = localStorage.getItem('safety_incident_owner_tokens');
    if (!raw) return null;
    const map = JSON.parse(raw);
    return map[incidentId] || null;
  } catch {
    return null;
  }
}

export function saveIncidentOwnerToken(incidentId: string, token: string): void {
  try {
    const raw = localStorage.getItem('safety_incident_owner_tokens');
    const map = raw ? JSON.parse(raw) : {};
    map[incidentId] = token;
    localStorage.setItem('safety_incident_owner_tokens', JSON.stringify(map));
  } catch {}
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const deviceId = getDeviceId();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Device-Id': deviceId,
    ...(init?.headers as Record<string, string> || {}),
  };

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error');
    throw new ApiError(res.status, text);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string, init?: RequestInit) => request<T>(path, init),
  post: <T>(path: string, body: unknown, init?: RequestInit) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body), ...init }),
  patch: <T>(path: string, body?: unknown, init?: RequestInit) =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined, ...init }),
  delete: <T>(path: string, init?: RequestInit) => request<T>(path, { method: 'DELETE', ...init }),
};
