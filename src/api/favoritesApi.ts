import { api } from './client';

export interface FavoriteDTO {
  id: string;
  session_id: string;
  name: string;
  place_type: string;
  address?: string;
  latitude: number;
  longitude: number;
  notify_radius_m: number;
  created_at: string;
}

export interface CreateFavoritePayload {
  session_id: string;
  name: string;
  place_type?: string;
  address?: string;
  latitude: number;
  longitude: number;
  notify_radius_m?: number;
}

// The device id (sent by `api` as the X-Device-Id header) identifies the owner:
// it is never put in the URL, which would leak it into access logs.
export function fetchFavorites(): Promise<FavoriteDTO[]> {
  return api.get<FavoriteDTO[]>('/favorites');
}

export function createFavorite(payload: CreateFavoritePayload): Promise<FavoriteDTO> {
  return api.post<FavoriteDTO>('/favorites', payload);
}

export function deleteFavorite(id: string): Promise<void> {
  return api.delete<void>(`/favorites/${encodeURIComponent(id)}`);
}
