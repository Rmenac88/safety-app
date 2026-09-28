import { api } from './client';

export interface NotificationDTO {
  id: string;
  incident_id?: string;
  city?: string;
  neighborhood?: string;
  latitude: number;
  longitude: number;
  title: string;
  message: string;
  severity: string;
  category: string;
  is_read: boolean;
  created_at: string;
  distance_km?: number | null;
}

export function fetchNotifications(params?: {
  lat?: number;
  lon?: number;
  city?: string;
  radius_km?: number;
}): Promise<NotificationDTO[]> {
  const qs = new URLSearchParams();
  if (params?.lat !== undefined) qs.set('lat', String(params.lat));
  if (params?.lon !== undefined) qs.set('lon', String(params.lon));
  if (params?.city) qs.set('city', params.city);
  if (params?.radius_km !== undefined) qs.set('radius_km', String(params.radius_km));
  const q = qs.toString();
  return api.get<NotificationDTO[]>(`/notifications${q ? '?' + q : ''}`);
}

export const markNotificationRead = (id: string) =>
  api.patch<{ status: string }>(`/notifications/${id}/read`);

export const deleteNotificationApi = (id: string) =>
  api.delete<{ status: string; id: string }>(`/notifications/${id}`);

export const clearAllNotificationsApi = () =>
  api.delete<{ status: string }>(`/notifications`);
