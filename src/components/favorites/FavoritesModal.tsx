import React, { useState, useEffect } from 'react';
import { type LucideIcon, X, Star, Home, Briefcase, GraduationCap, Plus, Trash2, Bell, MapPin, Search, Loader2, Navigation, Check } from 'lucide-react';
import { useSafety } from '../../context/useSafety';
import type { FavoriteDTO } from '../../api/favoritesApi';
import { searchPlaces, type GeocodedPlace } from '../../api/geocodingApi';

const TYPE_ICONS: Record<string, LucideIcon> = { home: Home, work: Briefcase, school: GraduationCap };
const TYPE_COLORS: Record<string, string> = {
  home: 'text-s-primary',
  work: 'text-sky-500',
  school: 'text-purple-600',
  other: 'text-amber-500',
};

export const FavoritesModal: React.FC = () => {
  const {
    activeModal, setActiveModal, favorites, addFavorite, removeFavorite,
    setMapCenter, setSelectedLocation, hapticFeedback, userLocation,
  } = useSafety();

  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState('');
  const [placeType, setPlaceType] = useState('home');
  const [address, setAddress] = useState('');
  const [addressQuery, setAddressQuery] = useState('');
  // Last completed search, and the query whose suggestions were closed by a pick
  const [search, setSearch] = useState<{ query: string; places: GeocodedPlace[] }>({ query: '', places: [] });
  const [closedQuery, setClosedQuery] = useState<string | null>(null);
  const [selectedCoords, setSelectedCoords] = useState<[number, number] | null>(null);

  const trimmedQuery = addressQuery.trim();
  const wantsSuggestions = trimmedQuery.length >= 2 && trimmedQuery !== closedQuery;
  const isSearching = wantsSuggestions && search.query !== trimmedQuery;
  const suggestions = wantsSuggestions && search.query === trimmedQuery ? search.places : [];

  // Address Autocomplete Search (debounced; results are keyed by the query they answer)
  useEffect(() => {
    if (!wantsSuggestions) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      let places: GeocodedPlace[] = [];
      try {
        places = (await searchPlaces(trimmedQuery)).slice(0, 5);
      } catch { /* network error: no suggestions */ }
      if (!cancelled) setSearch({ query: trimmedQuery, places });
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmedQuery, wantsSuggestions]);

  if (activeModal !== 'favorites') return null;

  const handleSelect = (fav: FavoriteDTO) => {
    hapticFeedback('medium');
    setMapCenter([fav.latitude, fav.longitude], 16);
    setSelectedLocation({
      latitude: fav.latitude,
      longitude: fav.longitude,
      name: fav.name,
      streetName: fav.address || undefined,
    });
    setActiveModal(null);
  };

  const handlePickPlace = (p: GeocodedPlace) => {
    hapticFeedback('light');
    setAddress(p.displayName);
    setAddressQuery(p.displayName);
    setSelectedCoords([p.latitude, p.longitude]);
    if (!name.trim()) setName(p.name);
    setClosedQuery(p.displayName.trim());
  };

  const handleUseGps = () => {
    if (!userLocation) return;
    hapticFeedback('medium');
    setSelectedCoords([userLocation[0], userLocation[1]]);
    setAddress('Ma position GPS actuelle');
    setAddressQuery('Ma position GPS actuelle');
    if (!name.trim()) setName('Ma position');
    setClosedQuery('Ma position GPS actuelle');
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const lat = selectedCoords ? selectedCoords[0] : 48.8566;
    const lon = selectedCoords ? selectedCoords[1] : 2.3522;

    hapticFeedback('success');
    await addFavorite({
      name: name.trim(),
      placeType,
      address: address.trim() || undefined,
      latitude: lat,
      longitude: lon,
    });

    setName('');
    setAddress('');
    setAddressQuery('');
    setSelectedCoords(null);
    setClosedQuery(null);
    setIsAdding(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-slate-900/60 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-lg bg-white rounded-t-4xl sm:rounded-4xl shadow-sheet max-h-[88vh] flex flex-col border border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between p-5 pb-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center">
              <Star className="w-5 h-5 text-amber-500 fill-amber-500/20" />
            </div>
            <div>
              <div className="text-base font-extrabold text-slate-900">Lieux Favoris</div>
              <div className="text-xs text-slate-500 font-medium">Surveillance & alertes de proximité</div>
            </div>
          </div>
          <button
            onClick={() => {
              hapticFeedback('light');
              setActiveModal(null);
            }}
            className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-2.5">
          {favorites.length === 0 && !isAdding && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-14 h-14 rounded-3xl bg-amber-50 border border-amber-200 flex items-center justify-center mb-3">
                <Star className="w-7 h-7 text-amber-500/50" />
              </div>
              <div className="text-sm font-extrabold text-slate-800">Aucun lieu favori</div>
              <div className="text-xs text-slate-500 mt-1 max-w-xs leading-relaxed font-medium">
                Ajoutez votre domicile, travail ou école pour surveiller les alertes à proximité.
              </div>
            </div>
          )}

          {favorites.map((fav) => {
            const Icon = TYPE_ICONS[fav.place_type] || Star;
            const color = TYPE_COLORS[fav.place_type] || TYPE_COLORS.other;
            return (
              <div
                key={fav.id}
                className="flex items-center gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-200 group hover:border-slate-300 transition-colors shadow-sm"
              >
                <button onClick={() => handleSelect(fav)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                  <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center shrink-0 shadow-xs">
                    <Icon className={`w-5 h-5 ${color}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-extrabold text-slate-900 truncate">{fav.name}</div>
                    {fav.address && <div className="text-xs text-slate-500 truncate mt-0.5">{fav.address}</div>}
                    <div className="flex items-center gap-1 text-2xs text-slate-400 font-semibold mt-0.5">
                      <Bell className="w-3 h-3 text-s-primary" />
                      Rayon {fav.notify_radius_m} m
                    </div>
                  </div>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    hapticFeedback('medium');
                    removeFavorite(fav.id);
                  }}
                  className="p-2.5 rounded-xl text-slate-400 hover:text-s-danger hover:bg-red-50 active:scale-95 transition-all shrink-0"
                  title="Supprimer ce favori"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}

          {isAdding ? (
            <form
              onSubmit={handleAdd}
              className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col gap-3 animate-scale-in"
            >
              <div className="text-sm font-extrabold text-slate-900">Ajouter un lieu</div>
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { id: 'home', Icon: Home },
                  { id: 'work', Icon: Briefcase },
                  { id: 'school', Icon: GraduationCap },
                  { id: 'other', Icon: Star },
                ].map(({ id, Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setPlaceType(id)}
                    className={`py-2 rounded-xl text-xs font-bold flex flex-col items-center gap-1 transition-all border ${
                      placeType === id
                        ? 'bg-s-primary text-white border-s-primary shadow-sm'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="capitalize text-2xs">{id}</span>
                  </button>
                ))}
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-2xs font-bold uppercase tracking-wider text-slate-500">Nom du lieu</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Domicile, Bureau, Salle de sport…"
                  className="input-field"
                  required
                />
              </div>

              {/* Smart Autocomplete Address Search */}
              <div className="flex flex-col gap-1 relative">
                <div className="flex items-center justify-between">
                  <label className="text-2xs font-bold uppercase tracking-wider text-slate-500">Adresse / Recherche</label>
                  {userLocation && (
                    <button
                      type="button"
                      onClick={handleUseGps}
                      className="text-2xs font-bold text-s-primary flex items-center gap-1 hover:underline"
                    >
                      <Navigation className="w-2.5 h-2.5" />
                      <span>Ma position GPS</span>
                    </button>
                  )}
                </div>

                <div className="relative">
                  <input
                    type="text"
                    value={addressQuery}
                    onChange={(e) => {
                      setAddressQuery(e.target.value);
                      setAddress(e.target.value);
                    }}
                    placeholder="Rechercher une rue, un quartier, un lieu…"
                    className="input-field pr-8"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                    {isSearching ? (
                      <Loader2 className="w-4 h-4 animate-spin text-s-primary" />
                    ) : selectedCoords ? (
                      <Check className="w-4 h-4 text-emerald-500 stroke-[3]" />
                    ) : (
                      <Search className="w-4 h-4" />
                    )}
                  </div>
                </div>

                {/* Floating Autocomplete Suggestions Dropdown */}
                {suggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white rounded-2xl shadow-sheet border border-slate-200 overflow-hidden divide-y divide-slate-100 animate-scale-in">
                    {suggestions.map((p) => (
                      <button
                        key={p.placeId}
                        type="button"
                        onClick={() => handlePickPlace(p)}
                        className="w-full text-left p-2.5 hover:bg-slate-50 flex items-start gap-2.5 transition-colors"
                      >
                        <MapPin className="w-4 h-4 text-s-primary shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-extrabold text-slate-900 truncate">{p.name}</div>
                          <div className="text-2xs text-slate-500 truncate">{p.displayName}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {selectedCoords && (
                <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-2xs font-semibold flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Position GPS certifiée ({selectedCoords[0].toFixed(4)}, {selectedCoords[1].toFixed(4)})</span>
                </div>
              )}

              <div className="flex gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => {
                    setIsAdding(false);
                    setAddressQuery('');
                    setClosedQuery(null);
                    setSelectedCoords(null);
                  }}
                  className="flex-1 btn-ghost py-2.5 text-xs font-bold rounded-xl"
                >
                  Annuler
                </button>
                <button type="submit" className="flex-1 btn-primary py-2.5 text-xs font-bold rounded-xl">
                  Enregistrer
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setIsAdding(true)}
              className="w-full btn-ghost flex items-center justify-center gap-2 py-3 rounded-2xl border-dashed text-xs font-bold mt-1 text-s-primary border-blue-200 bg-blue-50/50 hover:bg-blue-50"
            >
              <Plus className="w-4 h-4 text-s-primary" />
              Ajouter un lieu favori
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
