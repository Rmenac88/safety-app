import { api, getDeviceId } from './client';
import { deleteIncident } from './incidentApi';

/** Everything the server links to this device (favorites, votes). */
export interface DeviceDataExport {
  exported_at: string;
  device_id: string;
  favorites: unknown[];
  votes: unknown[];
  reports: string;
}

const LOCAL_KEYS_PREFIX = 'safety_';

/** Snapshot of the app data kept on this device (owner tokens excluded: they are secrets). */
function localDataSnapshot(): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(LOCAL_KEYS_PREFIX) || key === 'safety_incident_owner_tokens') continue;
      const raw = localStorage.getItem(key);
      try {
        snapshot[key] = raw ? JSON.parse(raw) : raw;
      } catch {
        snapshot[key] = raw;
      }
    }
  } catch { /* storage unavailable: nothing local to export */ }
  return snapshot;
}

/** RGPD art. 15 / 20: server data + local data, downloaded as a JSON file. */
export async function downloadMyData(): Promise<void> {
  const server = await api.get<DeviceDataExport>('/me/data');
  const payload = { server, device: localDataSnapshot() };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `safety-mes-donnees-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * RGPD art. 17: erases favorites and votes on the server, deletes the reports published
 * from this device (with their owner tokens), then wipes the app data stored locally.
 */
export async function eraseMyData(myIncidentIds: string[]): Promise<{ reportsDeleted: number }> {
  getDeviceId(); // ensure the X-Device-Id header carries the current id
  await api.delete('/me/data');

  let reportsDeleted = 0;
  for (const id of myIncidentIds) {
    try {
      await deleteIncident(id);
      reportsDeleted += 1;
    } catch { /* already expired / purged, or token lost */ }
  }

  try {
    Object.keys(localStorage)
      .filter((key) => key.startsWith(LOCAL_KEYS_PREFIX))
      .forEach((key) => localStorage.removeItem(key));
    sessionStorage.clear();
  } catch { /* storage unavailable */ }
  return { reportsDeleted };
}
