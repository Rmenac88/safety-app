/**
 * 📱 SAFETY SMART DEVICE & ENVIRONMENT DETECTION ENGINE
 *
 * Multi-factor detection combining:
 * - Viewport dimensions
 * - Pointer precision (coarse touch vs fine mouse)
 * - Touch points & capability
 * - Display mode (browser vs standalone PWA)
 * - User Agent & Platform (iOS, Android, macOS, Windows, Linux)
 * - Orientation (portrait vs landscape)
 */

export type DeviceType = 'phone' | 'tablet' | 'laptop' | 'desktop';
export type OSType = 'ios' | 'android' | 'macos' | 'windows' | 'linux' | 'unknown';
export type BrowserType = 'safari' | 'chrome' | 'firefox' | 'edge' | 'samsung' | 'other';
export type DisplayMode = 'browser' | 'standalone' | 'fullscreen' | 'minimal-ui';

export interface DeviceInfo {
  deviceType: DeviceType;
  os: OSType;
  browser: BrowserType;
  displayMode: DisplayMode;
  isTouch: boolean;
  isCoarsePointer: boolean;
  isStandalone: boolean;
  isIOS: boolean;
  isIPadOS: boolean;
  isIPhone: boolean;
  isAndroid: boolean;
  isMobileDevice: boolean;
  isTabletDevice: boolean;
  isDesktopDevice: boolean;
  isPortrait: boolean;
  viewportWidth: number;
  viewportHeight: number;
  safeAreaInsets: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
}

function detectOS(ua: string, platform: string, maxTouchPoints: number): OSType {
  if (/iPad|iPhone|iPod/.test(ua) || (platform === 'MacIntel' && maxTouchPoints > 1)) {
    return 'ios';
  }
  if (/android/i.test(ua)) return 'android';
  if (/Mac|Macintosh/i.test(ua) && maxTouchPoints <= 1) return 'macos';
  if (/Win/i.test(ua)) return 'windows';
  if (/Linux/i.test(ua)) return 'linux';
  return 'unknown';
}

function detectBrowser(ua: string): BrowserType {
  if (/SamsungBrowser/i.test(ua)) return 'samsung';
  if (/Edg/i.test(ua)) return 'edge';
  if (/Firefox|FxiOS/i.test(ua)) return 'firefox';
  if (/Chrome|CriOS/i.test(ua)) return 'chrome';
  if (/Safari/i.test(ua) && !/Chrome|CriOS/i.test(ua)) return 'safari';
  return 'other';
}

function detectDisplayMode(): DisplayMode {
  if (typeof window === 'undefined') return 'browser';
  if (window.matchMedia('(display-mode: standalone)').matches) return 'standalone';
  if (window.matchMedia('(display-mode: fullscreen)').matches) return 'fullscreen';
  if (window.matchMedia('(display-mode: minimal-ui)').matches) return 'minimal-ui';
  // iOS Safari home-screen apps expose a non-standard navigator.standalone flag
  if ((window.navigator as Navigator & { standalone?: boolean }).standalone === true) return 'standalone';
  return 'browser';
}

function detectDeviceType(
  width: number,
  height: number,
  isCoarse: boolean,
  hasTouch: boolean,
  isIOS: boolean,
  isAndroid: boolean,
  ua: string
): DeviceType {
  const minDim = Math.min(width, height);
  const maxDim = Math.max(width, height);

  // iPad & Android tablets
  const isIPad = /iPad/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isTabletUA = /tablet|nexus 7|nexus 9|nexus 10|ipad/i.test(ua);

  if (isIPad || isTabletUA || (hasTouch && minDim >= 600 && maxDim < 1366)) {
    return 'tablet';
  }

  // Mobile smartphones
  if (isCoarse && minDim < 600) {
    return 'phone';
  }
  if ((isIOS || isAndroid) && minDim < 600) {
    return 'phone';
  }

  // Desktop vs Laptop
  if (width >= 1440 && !hasTouch) {
    return 'desktop';
  }
  if (width >= 1024) {
    return hasTouch ? 'laptop' : 'desktop';
  }

  return minDim < 600 ? 'phone' : 'desktop';
}

export function getDeviceInfo(): DeviceInfo {
  if (typeof window === 'undefined') {
    return {
      deviceType: 'desktop',
      os: 'unknown',
      browser: 'other',
      displayMode: 'browser',
      isTouch: false,
      isCoarsePointer: false,
      isStandalone: false,
      isIOS: false,
      isIPadOS: false,
      isIPhone: false,
      isAndroid: false,
      isMobileDevice: false,
      isTabletDevice: false,
      isDesktopDevice: true,
      isPortrait: true,
      viewportWidth: 1200,
      viewportHeight: 800,
      safeAreaInsets: { top: 0, bottom: 0, left: 0, right: 0 },
    };
  }

  const ua = navigator.userAgent;
  const platform = navigator.platform || '';
  const maxTouchPoints = navigator.maxTouchPoints || 0;
  const width = window.innerWidth;
  const height = window.innerHeight;

  const isTouch = 'ontouchstart' in window || maxTouchPoints > 0;
  const isCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
  const isPortrait = height >= width;
  const displayMode = detectDisplayMode();
  const isStandalone = displayMode === 'standalone' || displayMode === 'fullscreen';

  const os = detectOS(ua, platform, maxTouchPoints);
  const browser = detectBrowser(ua);

  const isIPadOS = os === 'ios' && (platform === 'MacIntel' && maxTouchPoints > 1 || /iPad/.test(ua));
  const isIPhone = os === 'ios' && !isIPadOS;
  const isAndroid = os === 'android';
  const isIOS = os === 'ios';

  const deviceType = detectDeviceType(width, height, isCoarsePointer, isTouch, isIOS, isAndroid, ua);
  const isMobileDevice = deviceType === 'phone';
  const isTabletDevice = deviceType === 'tablet';
  const isDesktopDevice = deviceType === 'laptop' || deviceType === 'desktop';

  // Read CSS env safe areas if supported
  const computeInset = (prop: string) => {
    try {
      const val = getComputedStyle(document.documentElement).getPropertyValue(prop);
      return parseFloat(val) || 0;
    } catch {
      return 0;
    }
  };

  return {
    deviceType,
    os,
    browser,
    displayMode,
    isTouch,
    isCoarsePointer,
    isStandalone,
    isIOS,
    isIPadOS,
    isIPhone,
    isAndroid,
    isMobileDevice,
    isTabletDevice,
    isDesktopDevice,
    isPortrait,
    viewportWidth: width,
    viewportHeight: height,
    safeAreaInsets: {
      top: computeInset('--sat') || 0,
      bottom: computeInset('--sab') || 0,
      left: computeInset('--sal') || 0,
      right: computeInset('--sar') || 0,
    },
  };
}
