import { useState, useEffect } from 'react';

export interface OrientationState {
  orientation: 'portrait' | 'landscape';
  angle: number;
  lastChanged: string;
}

export function useScreenOrientation(): OrientationState {
  const getOrientationData = (): OrientationState => {
    let orientation: 'portrait' | 'landscape' = 'portrait';
    let angle = 0;

    if (typeof window !== 'undefined') {
      if (window.screen && window.screen.orientation) {
        const type = window.screen.orientation.type || '';
        if (type.includes('landscape')) {
          orientation = 'landscape';
        } else if (type.includes('portrait')) {
          orientation = 'portrait';
        } else {
          orientation = window.innerHeight < window.innerWidth ? 'landscape' : 'portrait';
        }
        angle = window.screen.orientation.angle || 0;
      } else {
        orientation = window.innerHeight < window.innerWidth ? 'landscape' : 'portrait';
        angle = (window as any).orientation || 0;
      }
    }

    return {
      orientation,
      angle,
      lastChanged: new Date().toISOString()
    };
  };

  const [orientationState, setOrientationState] = useState<OrientationState>(getOrientationData);

  useEffect(() => {
    const handleOrientationChange = () => {
      const updated = getOrientationData();
      setOrientationState(updated);
    };

    if (typeof window !== 'undefined') {
      if (window.screen && window.screen.orientation) {
        window.screen.orientation.addEventListener('change', handleOrientationChange);
      }
      window.addEventListener('orientationchange', handleOrientationChange);
      window.addEventListener('resize', handleOrientationChange);
    }

    return () => {
      if (typeof window !== 'undefined') {
        if (window.screen && window.screen.orientation) {
          window.screen.orientation.removeEventListener('change', handleOrientationChange);
        }
        window.removeEventListener('orientationchange', handleOrientationChange);
        window.removeEventListener('resize', handleOrientationChange);
      }
    };
  }, []);

  return orientationState;
}
