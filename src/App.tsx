import { SafetyProvider } from './context/SafetyContext';
import { SafetyMapboxEngine } from './components/map/SafetyMapboxEngine';
import { SafetyHeatmapEngine } from './components/map/SafetyHeatmapEngine';
import { VectorDrawingControls } from './components/map/VectorDrawingControls';
import { MapControls } from './components/map/MapControls';
import { DynamicIsland } from './components/navigation/DynamicIsland';
import { TimeScrubber } from './components/navigation/TimeScrubber';
import { BottomNav } from './components/navigation/BottomNav';
import { IncidentDetailSheet } from './components/sheets/IncidentDetailSheet';
import { LocationDetailSheet } from './components/sheets/LocationDetailSheet';
import { ReportModal } from './components/reporting/ReportModal';
import { LiveFeedDrawer } from './components/live/LiveFeedDrawer';
import { FavoritesModal } from './components/favorites/FavoritesModal';
import { ModerationDrawer } from './components/moderation/ModerationDrawer';
import { OnboardingModal } from './components/onboarding/OnboardingModal';
import { WalkWithMeSheet } from './components/walk/WalkWithMeSheet';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { SheetErrorBoundary } from './components/common/SheetErrorBoundary';

import { PWAInstallBanner } from './components/pwa/PWAInstallBanner';
import { OfflineBanner } from './components/common/OfflineBanner';
import { useSafety } from './context/SafetyContext';
import { useEffect } from 'react';

function AppContent() {
  const {
    activeModal,
    setActiveModal,
    selectedIncident,
    setSelectedIncident,
    selectedLocation,
    setSelectedLocation,
    isHeatmapMode,
  } = useSafety();

  // Desktop keyboard shortcuts (Escape to close, etc.)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (activeModal) setActiveModal(null);
        else if (selectedIncident) setSelectedIncident(null);
        else if (selectedLocation) setSelectedLocation(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeModal, selectedIncident, selectedLocation, setActiveModal, setSelectedIncident, setSelectedLocation]);

  return (
    <div className="fixed inset-0 w-full h-[100dvh] overflow-hidden bg-white text-slate-900 select-none font-sans">
      {/* 1. Mapbox High-End 3D Vector & Risk Visualization Engine (UNTOUCHED) */}
      <SafetyMapboxEngine />

      {/* 1b. Dedicated Independent Safety Heatmap Globe (Apple-grade Spectrum) */}
      {isHeatmapMode && (
        <SheetErrorBoundary fallbackName="SafetyHeatmapEngine">
          <SafetyHeatmapEngine />
        </SheetErrorBoundary>
      )}

      {/* 2. Interactive Vector Drawing Controls (Active during Point/Line/Zone drawing) */}
      <VectorDrawingControls />

      {/* 3. Apple Dynamic Island (Status + Proximity Alerts + Expanded Search) */}
      <DynamicIsland />

      {/* 3. Offline & Connection State Toast */}
      <OfflineBanner />

      {/* 4. Smart PWA Install Banner */}
      <PWAInstallBanner />

      {/* 5. Map controls (GPS, layers, zoom, 3D tilt) */}
      <MapControls />

      {/* 6. Time scrubber (discretely on the left flank) */}
      <TimeScrubber />

      {/* 7. Bottom navigation + FAB */}
      <BottomNav />

      {/* 8. Sheets & Modals (Each isolated with SheetErrorBoundary to prevent any map crash) */}
      <SheetErrorBoundary fallbackName="IncidentDetailSheet">
        <IncidentDetailSheet />
      </SheetErrorBoundary>
      <SheetErrorBoundary fallbackName="LocationDetailSheet">
        <LocationDetailSheet />
      </SheetErrorBoundary>
      <SheetErrorBoundary fallbackName="ReportModal">
        <ReportModal />
      </SheetErrorBoundary>
      <SheetErrorBoundary fallbackName="LiveFeedDrawer">
        <LiveFeedDrawer />
      </SheetErrorBoundary>
      <SheetErrorBoundary fallbackName="FavoritesModal">
        <FavoritesModal />
      </SheetErrorBoundary>
      <SheetErrorBoundary fallbackName="ModerationDrawer">
        <ModerationDrawer />
      </SheetErrorBoundary>
      <SheetErrorBoundary fallbackName="OnboardingModal">
        <OnboardingModal />
      </SheetErrorBoundary>
      <SheetErrorBoundary fallbackName="WalkWithMeSheet">
        <WalkWithMeSheet />
      </SheetErrorBoundary>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <SafetyProvider>
        <AppContent />
      </SafetyProvider>
    </ErrorBoundary>
  );
}
