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

export function fetchFavorites(sessionId: string): Promise<FavoriteDTO[]> {
  return api.get<FavoriteDTO[]>(`/favorites?session_id=${sessionId}`);
}

export function createFavorite(payload: CreateFavoritePayload): Promise<FavoriteDTO> {
  return api.post<FavoriteDTO>('/favorites', payload);
}

export function deleteFavorite(id: string, sessionId: string): Promise<void> {
  return api.delete<void>(`/favorites/${id}?session_id=${sessionId}`);
}
