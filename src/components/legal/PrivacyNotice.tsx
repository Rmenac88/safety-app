import React from 'react';
import { X, ShieldCheck } from 'lucide-react';
import { useSafety } from '../../context/useSafety';

/**
 * Notice d'information (RGPD art. 13), établie à partir du fonctionnement réel de l'app.
 * Éditeur : AP Studio 13. À mettre à jour si les données ou les prestataires changent.
 */
const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: 'Qui est responsable ?',
    body: ['AP Studio 13 (responsable : M. Abdelmalek). Contact pour toute question ou demande liée à vos données : rabdelmalek794@gmail.com.'],
  },
  {
    title: 'Ce que nous traitons, et pourquoi',
    body: [
      'Signalements : catégorie, titre, description, gravité, durée et une position publique volontairement approximative (environ 150 m). Votre position GPS exacte et le numéro de rue ne sont jamais enregistrés. Finalité : informer la communauté des situations à risque.',
      'Favoris (domicile, travail…) : nom, adresse et coordonnées que vous saisissez, liés à l’identifiant anonyme de votre appareil. Finalité : vous alerter autour de ces lieux.',
      'Votes « vrai / faux » : enregistrés sous une empreinte (hachage) de votre appareil et de votre réseau. Finalité : fiabilité des signalements et lutte contre les abus.',
      'Données techniques : adresse IP (utilisée sous forme hachée pour limiter les abus, conservée 1 heure) et journaux d’erreurs sans contenu personnel.',
      'Aucun compte, aucune publicité, aucun outil de mesure d’audience, aucun cookie de suivi.',
    ],
  },
  {
    title: 'Base légale',
    body: ['Intérêt légitime (art. 6-1-f RGPD) : informer la communauté des situations à risque et prévenir les abus. Les favoris sont traités pour fournir le service que vous demandez.'],
  },
  {
    title: 'Durées de conservation',
    body: [
      'Signalement : pendant sa durée d’affichage (30 min à 30 jours), puis 30 jours avant suppression définitive avec ses alertes et votes.',
      'Favoris : jusqu’à ce que vous les supprimiez.',
      'Contenus refusés par la modération : empreinte non réversible conservée 90 jours.',
    ],
  },
  {
    title: 'Services tiers (sous-traitants)',
    body: [
      'Mapbox (États-Unis) : affichage de la carte et recherche d’adresses ; reçoit votre adresse IP et la zone consultée.',
      'OpenStreetMap / Nominatim, CARTO, OpenFreeMap : fonds de carte et recherche d’adresses.',
      'Vercel (hébergement de l’application) et Neon (base de données PostgreSQL).',
      'Certains de ces prestataires sont situés aux États-Unis : les transferts sont encadrés par les clauses contractuelles types de la Commission européenne et/ou le Data Privacy Framework UE–États-Unis.',
    ],
  },
  {
    title: 'Vos droits',
    body: [
      'Depuis le panneau « Sécurité » : « Exporter mes données » (accès, portabilité) et « Supprimer mes données » (effacement). Vous pouvez aussi rectifier ou supprimer vos favoris et signalements à tout moment.',
      'Pour toute autre demande (rectification, opposition, limitation) : rabdelmalek794@gmail.com. Vous pouvez aussi introduire une réclamation auprès de la CNIL (www.cnil.fr).',
    ],
  },
  {
    title: 'Données stockées sur votre appareil',
    body: [
      'Identifiant anonyme d’appareil, jetons de suppression de vos signalements, votes, favoris en cache, historique de recherche, contact d’urgence du mode « Trajet sécurisé », préférences. Ces données restent sur votre appareil et sont effacées par « Supprimer mes données ».',
    ],
  },
];

export const PrivacyNotice: React.FC = () => {
  const { activeModal, setActiveModal } = useSafety();
  if (activeModal !== 'privacy') return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4 bg-slate-900/60 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="privacy-title"
    >
      <div className="w-full max-w-lg max-h-[88vh] flex flex-col rounded-t-4xl sm:rounded-4xl bg-white text-slate-900 shadow-sheet border border-slate-200">
        <div className="flex items-center justify-between p-5 pb-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-s-primary" />
            <h2 id="privacy-title" className="text-base font-extrabold">Confidentialité & données personnelles</h2>
          </div>
          <button
            onClick={() => setActiveModal(null)}
            className="w-8 h-8 rounded-xl flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-600"
            aria-label="Fermer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4 text-sm leading-relaxed">
          {SECTIONS.map((section) => (
            <section key={section.title}>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">{section.title}</h3>
              {section.body.map((paragraph) => (
                <p key={paragraph} className="mb-1.5 text-slate-700">{paragraph}</p>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
};
