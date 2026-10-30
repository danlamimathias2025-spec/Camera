import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download, Smartphone, X } from 'lucide-react';

export const PWAInstallButton: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already running standalone, hide the button
  if (isInstalled) {
    return null;
  }

  // Chromium / Android / Desktop flow
  if (isInstallable) {
    return (
      <button
        onClick={install}
        className={`flex items-center gap-2 rounded-xl bg-white text-black font-semibold text-xs shadow-md hover:bg-slate-200 active:scale-95 transition-all ${
          compact ? 'px-3 py-1.5' : 'px-4 py-2'
        }`}
        title="Install as Progressive Web App"
      >
        <Download className="w-3.5 h-3.5 text-black" />
        <span>Install App</span>
      </button>
    );
  }

  // iOS Safari flow
  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className={`flex items-center gap-1.5 rounded-xl bg-white/15 text-white hover:bg-white/25 text-xs font-semibold backdrop-blur-md transition-all active:scale-95 ${
            compact ? 'px-3 py-1.5' : 'px-4 py-2'
          }`}
          title="Install on iPhone / iPad"
        >
          <Smartphone className="w-3.5 h-3.5 text-white" />
          <span>Install PWA</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
            <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl text-white space-y-4 animate-scale-up">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <img src="/pwa-192x192.png" alt="App Icon" className="w-9 h-9 rounded-xl shadow-md" />
                  <div>
                    <h3 className="text-sm font-bold">Install LiveCam App</h3>
                    <p className="text-[11px] text-slate-400">Add to your iPhone Home Screen</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-800/80 border border-slate-700/60 text-xs space-y-2 text-slate-300">
                <p>
                  1. Tap the <strong>Share</strong> button in the Safari bottom toolbar.
                </p>
                <p>
                  2. Scroll down and select <strong>Add to Home Screen</strong>.
                </p>
                <p>
                  3. Tap <strong>Add</strong> in the top right corner.
                </p>
              </div>

              <button
                onClick={() => setShowIOSGuide(false)}
                className="w-full rounded-xl bg-white text-black py-2.5 text-xs font-bold hover:bg-slate-200 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  // Fallback button for desktop browsers or manual prompt
  return (
    <button
      onClick={() => setShowIOSGuide(true)}
      className={`flex items-center gap-1.5 rounded-xl bg-white/10 text-white/90 hover:bg-white/20 text-xs font-medium backdrop-blur-md transition-all ${
        compact ? 'px-3 py-1.5' : 'px-4 py-2'
      }`}
      title="Install PWA info"
    >
      <Download className="w-3.5 h-3.5" />
      <span>Install App</span>
    </button>
  );
};
