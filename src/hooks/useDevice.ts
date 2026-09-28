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
    const matchStandalone = window.matchMedia('(display-mode: standalone)');
    if (matchStandalone.addEventListener) {
      matchStandalone.addEventListener('change', update);
    } else if ((matchStandalone as any).addListener) {
      (matchStandalone as any).addListener(update);
    }

    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      if (matchStandalone.removeEventListener) {
        matchStandalone.removeEventListener('change', update);
      } else if ((matchStandalone as any).removeListener) {
        (matchStandalone as any).removeListener(update);
      }
    };
  }, []);

  return device;
}
