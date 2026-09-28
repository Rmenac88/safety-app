export function formatExactAgo(iso: string): string {
  if (!iso) return "À l'instant";
  let safeIso = iso;
  if (!safeIso.endsWith('Z') && !safeIso.includes('+') && !safeIso.includes('-')) {
    safeIso = safeIso + 'Z';
  }
  const parsed = new Date(safeIso).getTime();
  if (isNaN(parsed)) return "À l'instant";
  const diff = Date.now() - parsed;
  if (diff < 0) return "À l'instant";

  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${Math.max(1, sec)}s`;

  const min = Math.floor(diff / 60000);
  if (min < 60) return `Il y a ${min} min`;

  const hours = Math.floor(min / 60);
  const remainingMin = min % 60;
  if (hours < 24) {
    return remainingMin > 0
      ? `Il y a ${hours} h ${remainingMin} min`
      : `Il y a ${hours} h`;
  }

  const days = Math.floor(hours / 24);
  return `Il y a ${days} j`;
}
