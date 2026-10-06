import { useState, useEffect } from 'react';
import { getDeviceInfo } from '../utils/deviceDetection';
import type { DeviceInfo } from '../utils/deviceDetection';

export function useDevice(): DeviceInfo {
  const [device, setDevice] = useState<DeviceInfo>(getDeviceInfo);

  useEffect(() => {
    const update = () => {
      setDevice(getDeviceInfo());
    };

    window.addEventListener('resize', update, { passive: true });
    window.addEventListener('orientationchange', update, { passive: true });

    // Listen for standalone display mode transitions
    // Safari < 14 only implements the deprecated addListener/removeListener API
    const matchStandalone: MediaQueryList & {
      addListener?: (cb: () => void) => void;
      removeListener?: (cb: () => void) => void;
    } = window.matchMedia('(display-mode: standalone)');
    if (matchStandalone.addEventListener) {
      matchStandalone.addEventListener('change', update);
    } else {
      matchStandalone.addListener?.(update);
    }

    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      if (matchStandalone.removeEventListener) {
        matchStandalone.removeEventListener('change', update);
      } else {
        matchStandalone.removeListener?.(update);
      }
    };
  }, []);

  return device;
}
