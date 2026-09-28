import React, { useState } from 'react';
import { X, Share2, Copy, Check, MapPin, Clock, ShieldCheck, Sparkles, Shield } from 'lucide-react';
import { useSafety } from '../../context/SafetyContext';
import type { IncidentDTO } from '../../api/incidentApi';
import { categoryColors, categoryIcons, categoryLabels } from '../../design/tokens';
import { formatExactAgo } from '../../utils/timeAgo';

interface ShareIncidentModalProps {
  incident: IncidentDTO | null;
  onClose: () => void;
}

export const ShareIncidentModal: React.FC<ShareIncidentModalProps> = ({ incident, onClose }) => {
  const { hapticFeedback, filters } = useSafety();
  const [copied, setCopied] = useState(false);

  if (!incident) return null;

  const isDark = filters.mapTileStyle === 'dark';
  const color = categoryColors[incident.category] || '#EF4444';
  const IconComponent = categoryIcons[incident.category] || ShieldCheck;
  const label = categoryLabels[incident.category] || 'Signalement';
  const timeAgo = formatExactAgo(incident.created_at);

  const shareUrl = `${window.location.origin}/?incident=${incident.id}`;
  const shareTitle = `[Safety] Alerte ${label} : ${incident.title}`;
  const shareText = `⚠️ Signalement Safety : ${incident.title} (${incident.address || 'Zone géolocalisée'}) — ${timeAgo}. Consultez la carte en direct :`;

  const handleCopyLink = async () => {
    hapticFeedback('success');
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleNativeShare = async () => {
    hapticFeedback('medium');
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: shareUrl,
        });
      } catch {}
    } else {
      handleCopyLink();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in pointer-events-auto">
      <div
        className={`w-full max-w-sm rounded-[32px] p-5 shadow-2xl border transition-all animate-scale-in flex flex-col ${
          isDark
            ? 'bg-slate-900/95 text-white border-white/10 shadow-black/80'
            : 'bg-white/95 text-slate-900 border-slate-200/90 shadow-slate-400/40'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-s-primary/10 border border-s-primary/20 flex items-center justify-center text-s-primary">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-s-primary">Partager cette Alerte</h3>
              <p className="text-[10px] text-slate-400 font-medium">Diffusion citoyenne instantanée</p>
            </div>
          </div>
          <button
            onClick={() => {
              hapticFeedback('light');
              onClose();
            }}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-90 ${
              isDark ? 'bg-white/10 text-slate-300 hover:text-white hover:bg-white/15' : 'bg-slate-100 text-slate-500 hover:text-slate-900 hover:bg-slate-200'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Apple-Grade Stylized Incident Visual Card (Passport Style) ── */}
        <div className="relative rounded-[26px] p-4.5 bg-gradient-to-br from-slate-950 via-[#0B1120] to-[#0A192F] text-white shadow-2xl border border-white/15 overflow-hidden mb-4 group">
          {/* High-Tech Radar Reticle Background */}
          <div className="absolute inset-0 pointer-events-none opacity-[0.07] bg-[radial-gradient(#38BDF8_1px,transparent_1px)] [background-size:16px_16px]" />
          
          {/* Radiant Category Glow */}
          <div
            className="absolute -top-12 -right-12 w-40 h-40 rounded-full blur-3xl opacity-35 pointer-events-none transition-opacity duration-500"
            style={{ background: color }}
          />

          {/* Card Top Brand & Status Seal */}
          <div className="flex items-center justify-between mb-3.5 relative z-10">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-white p-0.5 shadow-sm flex items-center justify-center shrink-0">
                <img src="/logo.png" alt="Safety" className="w-full h-full object-contain rounded-md" />
              </div>
              <div className="flex flex-col leading-none">
                <span className="text-[11px] font-black tracking-tight text-white">Safety</span>
                <span className="text-[8px] font-bold text-sky-400 tracking-wider uppercase">Réseau Citoyen</span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900/90 border border-white/15 backdrop-blur-xl shadow-inner">
              <span className="w-2 h-2 rounded-full animate-ping" style={{ background: color }} />
              <span className="text-[9px] font-black tracking-widest uppercase text-white">EN DIRECT</span>
            </div>
          </div>

          {/* Incident Type & Title */}
          <div className="flex items-start gap-3.5 mb-3.5 relative z-10">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-lg border border-white/20 transition-transform group-hover:scale-105"
              style={{
                background: `linear-gradient(135deg, ${color}, #0F172A)`,
                boxShadow: `0 0 20px ${color}50`,
              }}
            >
              <IconComponent className="w-6 h-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider mb-0.5">
                <span className="px-1.5 py-0.5 rounded-md bg-white/10 border border-white/10" style={{ color }}>
                  {label}
                </span>
                <span className="text-slate-400 text-[9px] capitalize">· {incident.severity}</span>
              </div>
              <h4 className="text-sm font-black text-white leading-snug tracking-tight line-clamp-2">
                {incident.title}
              </h4>
            </div>
          </div>

          {/* Location & GPS Info */}
          <div className="p-2.5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md mb-3 relative z-10 flex flex-col gap-1">
            <div className="flex items-center gap-2 text-[11px] text-slate-200">
              <MapPin className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span className="truncate font-semibold">{incident.address || 'Secteur géolocalisé certifié'}</span>
            </div>
            <div className="flex items-center justify-between text-[9px] font-mono text-slate-400 pl-5.5">
              <span>{Number(incident.latitude).toFixed(4)}° N, {Number(incident.longitude).toFixed(4)}° E</span>
              <span className="text-emerald-400 font-bold flex items-center gap-1">
                <Shield className="w-2.5 h-2.5" />
                {incident.confirmations_count} confirmation{incident.confirmations_count > 1 ? 's' : ''}
              </span>
            </div>
          </div>

          {/* Footer Time & Official Seal */}
          <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[10px] text-slate-400 relative z-10">
            <div className="flex items-center gap-1 font-medium">
              <Clock className="w-3 h-3 text-slate-400" />
              <span>{timeAgo}</span>
            </div>
            <div className="font-mono text-[9px] font-bold text-slate-400 tracking-wider">
              #SF-{incident.id.slice(0, 8).toUpperCase()}
            </div>
          </div>
        </div>

        {/* ── Direct Official Social Channels (Refreshed Vector Logos) ── */}
        <div className="grid grid-cols-4 gap-2.5 mb-3.5">
          {/* 1. WhatsApp Official */}
          <button
            onClick={() => {
              hapticFeedback('medium');
              const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`;
              window.open(url, '_blank');
            }}
            className="flex flex-col items-center gap-1.5 p-2.5 rounded-2xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400 transition-all active:scale-90 group"
            title="Partager sur WhatsApp"
          >
            <div className="w-9 h-9 rounded-2xl bg-[#25D366] text-white flex items-center justify-center shadow-md shadow-emerald-500/30 group-hover:scale-110 transition-transform">
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                <path d="M12.004 2C6.48 2 2 6.48 2 12.004c0 1.947.56 3.766 1.53 5.309L2.348 22l4.829-1.157a9.96 9.96 0 0 0 4.827 1.233h.004c5.524 0 10.004-4.48 10.004-10.004C22.012 6.48 17.532 2 12.004 2zm5.836 14.18c-.244.686-1.42 1.312-1.954 1.396-.514.08-1.18.113-3.818-.98-3.37-1.395-5.541-4.838-5.71-5.064-.168-.225-1.365-1.817-1.365-3.465 0-1.649.866-2.46 1.174-2.793.308-.334.673-.418.898-.418.224 0 .448.002.645.012.207.01.485-.078.758.58.283.686.963 2.35.1047 2.52.084.17.14.37.028.594-.112.225-.168.365-.336.562-.168.197-.354.44-.505.59-.168.169-.344.354-.148.69.196.337.873 1.442 1.87 2.33 1.285 1.144 2.368 1.498 2.705 1.666.337.169.534.14.73-.084.197-.225.842-.98 1.066-1.317.225-.337.449-.281.758-.168.309.112 1.964.926 2.3 1.094.337.169.562.253.645.394.084.14.084.814-.16 1.5z"/>
              </svg>
            </div>
            <span className="text-[10px] font-extrabold">WhatsApp</span>
          </button>

          {/* 2. Messages Apple Official */}
          <button
            onClick={() => {
              hapticFeedback('medium');
              const url = `sms:?&body=${encodeURIComponent(`${shareText} ${shareUrl}`)}`;
              window.open(url, '_self');
            }}
            className="flex flex-col items-center gap-1.5 p-2.5 rounded-2xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400 transition-all active:scale-90 group"
            title="Envoyer par Messages Apple / SMS"
          >
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-[#34C759] to-[#28A745] text-white flex items-center justify-center shadow-md shadow-emerald-500/30 group-hover:scale-110 transition-transform">
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                <path d="M12 3c-5.52 0-10 3.8-10 8.5 0 2.5 1.28 4.75 3.32 6.32L4 21l3.58-1.53c1.37.53 2.87.83 4.42.83 5.52 0 10-3.8 10-8.5S17.52 3 12 3z"/>
              </svg>
            </div>
            <span className="text-[10px] font-extrabold">Messages</span>
          </button>

          {/* 3. Telegram Official */}
          <button
            onClick={() => {
              hapticFeedback('medium');
              const url = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`;
              window.open(url, '_blank');
            }}
            className="flex flex-col items-center gap-1.5 p-2.5 rounded-2xl bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/25 text-sky-600 dark:text-sky-400 transition-all active:scale-90 group"
            title="Partager sur Telegram"
          >
            <div className="w-9 h-9 rounded-2xl bg-[#2AABEE] text-white flex items-center justify-center shadow-md shadow-sky-500/30 group-hover:scale-110 transition-transform">
              <svg className="w-5 h-5 fill-current translate-x-[-1px] translate-y-[1px]" viewBox="0 0 24 24">
                <path d="m20.665 3.717-17.73 6.837c-1.21.486-1.203 1.161-.222 1.462l4.552 1.42 10.532-6.645c.498-.303.953-.14.579.192l-8.533 7.701h-.002l-.313 4.67c.457 0 .66-.21.916-.457l2.199-2.138 4.574 3.379c.843.465 1.448.225 1.658-.783l2.997-14.125c.308-1.233-.473-1.793-1.277-1.425z"/>
              </svg>
            </div>
            <span className="text-[10px] font-extrabold">Telegram</span>
          </button>

          {/* 4. X (Twitter) Official */}
          <button
            onClick={() => {
              hapticFeedback('medium');
              const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;
              window.open(url, '_blank');
            }}
            className="flex flex-col items-center gap-1.5 p-2.5 rounded-2xl bg-slate-500/10 hover:bg-slate-500/20 border border-slate-500/25 text-slate-800 dark:text-slate-200 transition-all active:scale-90 group"
            title="Partager sur X"
          >
            <div className="w-9 h-9 rounded-2xl bg-black text-white flex items-center justify-center shadow-md shadow-black/40 border border-white/20 group-hover:scale-110 transition-transform">
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
            </div>
            <span className="text-[10px] font-extrabold">X (Twitter)</span>
          </button>
        </div>

        {/* ── Action Buttons ────────────────────────────────────────────── */}
        <div className="flex flex-col gap-2">
          {typeof navigator !== 'undefined' && 'share' in navigator && (
            <button
              onClick={handleNativeShare}
              className="w-full btn-primary py-3 rounded-2xl text-xs font-black flex items-center justify-center gap-2 shadow-lg shadow-blue-500/30 active:scale-98 transition-transform"
            >
              <Share2 className="w-4 h-4" />
              <span>Diffuser l'alerte…</span>
            </button>
          )}

          <button
            onClick={handleCopyLink}
            className={`w-full py-2.5 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 border transition-all duration-300 active:scale-98 ${
              copied
                ? 'bg-emerald-500/20 border-emerald-500 text-emerald-600 dark:text-emerald-400 scale-[1.02] shadow-sm'
                : isDark
                ? 'bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 border-white/10'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-200'
            }`}
          >
            {copied ? (
              <span className="flex items-center gap-2 animate-scale-in">
                <Check className="w-4 h-4 text-emerald-500 stroke-[3]" />
                <span className="font-extrabold">✓ Lien copié dans le presse-papier !</span>
              </span>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>Copier le lien direct de l'alerte</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
