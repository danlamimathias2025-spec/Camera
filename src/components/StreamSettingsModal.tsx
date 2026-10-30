import React from 'react';
import { StreamSettings } from '../types';
import { Sliders, X, Video, Gauge, Activity, Check, Sparkles, RefreshCw } from 'lucide-react';

interface StreamSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: StreamSettings;
  onSaveSettings: (newSettings: StreamSettings) => void;
}

export const StreamSettingsModal: React.FC<StreamSettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSaveSettings
}) => {
  if (!isOpen) return null;

  const handlePresetSelect = (preset: 'saver' | 'balanced' | 'pro' | '8k') => {
    if (preset === 'saver') {
      onSaveSettings({ resolution: '360p', fps: 15, bitrateKbps: 500 });
    } else if (preset === 'balanced') {
      onSaveSettings({ resolution: '720p', fps: 30, bitrateKbps: 2500 });
    } else if (preset === 'pro') {
      onSaveSettings({ resolution: '1080p', fps: 60, bitrateKbps: 8000 });
    } else if (preset === '8k') {
      onSaveSettings({ resolution: '8K', fps: 60, bitrateKbps: 25000 });
    }
  };

  const getEstimatedDataUsage = () => {
    // MB per minute formula approx: (bitrateInKbps * 60) / (8 * 1024)
    const mbPerMin = ((settings.bitrateKbps * 60) / 8192).toFixed(1);
    return `${mbPerMin} MB / min`;
  };

  return (
    <div 
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in"
    >
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl p-6 space-y-6 text-white">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Video Quality & Stream Settings</h2>
              <p className="text-xs text-slate-400">Optimize resolution, FPS, and bitrate for your network</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Preset Quick Buttons */}
        <div className="space-y-2">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            Quick Performance Presets
          </span>
          <div className="grid grid-cols-4 gap-2">
            <button
              type="button"
              onClick={() => handlePresetSelect('saver')}
              className={`p-2 rounded-xl border text-xs font-semibold flex flex-col items-center gap-0.5 transition-all ${
                settings.resolution === '360p' && settings.fps === 15
                  ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300'
                  : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <span>Data Saver</span>
              <span className="text-[10px] text-slate-400 font-normal">360p • 15fps</span>
            </button>

            <button
              type="button"
              onClick={() => handlePresetSelect('balanced')}
              className={`p-2 rounded-xl border text-xs font-semibold flex flex-col items-center gap-0.5 transition-all ${
                settings.resolution === '720p' && settings.fps === 30
                  ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300'
                  : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <span>Balanced</span>
              <span className="text-[10px] text-slate-400 font-normal">720p • 30fps</span>
            </button>

            <button
              type="button"
              onClick={() => handlePresetSelect('pro')}
              className={`p-2 rounded-xl border text-xs font-semibold flex flex-col items-center gap-0.5 transition-all ${
                settings.resolution === '1080p' && settings.fps === 60
                  ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300'
                  : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <span>Full HD</span>
              <span className="text-[10px] text-slate-400 font-normal">1080p • 60fps</span>
            </button>

            <button
              type="button"
              onClick={() => handlePresetSelect('8k')}
              className={`p-2 rounded-xl border text-xs font-bold flex flex-col items-center gap-0.5 transition-all ${
                settings.resolution === '8K'
                  ? 'bg-amber-600/30 border-amber-500 text-amber-300 shadow-lg shadow-amber-500/20'
                  : 'bg-amber-950/40 border-amber-800/60 text-amber-300 hover:bg-amber-900/60'
              }`}
            >
              <span className="flex items-center gap-1">8K Ultra</span>
              <span className="text-[10px] opacity-80 font-normal">7680x4320</span>
            </button>
          </div>
        </div>

        {/* Resolution Options */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Video className="w-4 h-4 text-indigo-400" />
              Camera Resolution
            </span>
            <span className="text-xs font-mono font-bold text-amber-400">{settings.resolution}</span>
          </label>
          <div className="grid grid-cols-6 gap-1.5">
            {(['8K', '4K', '1080p', '720p', '480p', '360p'] as const).map((res) => (
              <button
                key={res}
                type="button"
                onClick={() => onSaveSettings({ ...settings, resolution: res })}
                className={`py-2 px-1 rounded-xl border text-xs font-bold text-center transition-all ${
                  settings.resolution === res
                    ? res === '8K' ? 'bg-amber-600 border-amber-400 text-white shadow-md' : 'bg-indigo-600 border-indigo-500 text-white shadow-md'
                    : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {res}
              </button>
            ))}
          </div>
        </div>

        {/* Frame Rate (FPS) Options */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Gauge className="w-4 h-4 text-emerald-400" />
              Stream Frame Rate (FPS)
            </span>
            <span className="text-xs font-mono text-emerald-400">{settings.fps} FPS</span>
          </label>
          <div className="grid grid-cols-3 gap-2">
            {([15, 30, 60] as const).map((fps) => (
              <button
                key={fps}
                type="button"
                onClick={() => onSaveSettings({ ...settings, fps })}
                className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all ${
                  settings.fps === fps
                    ? 'bg-emerald-600 border-emerald-500 text-white shadow-md'
                    : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {fps} FPS
              </button>
            ))}
          </div>
        </div>

        {/* Bitrate Slider / Options */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-amber-400" />
              Maximum Bitrate Target
            </span>
            <span className="text-xs font-mono text-amber-400">
              {settings.bitrateKbps >= 1000 
                ? `${(settings.bitrateKbps / 1000).toFixed(1)} Mbps` 
                : `${settings.bitrateKbps} kbps`}
            </span>
          </label>
          <div className="grid grid-cols-6 gap-1">
            {([1000, 2500, 5000, 8000, 15000, 25000] as const).map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => onSaveSettings({ ...settings, bitrateKbps: b })}
                className={`py-2 px-1 rounded-xl border text-[11px] font-bold text-center transition-all ${
                  settings.bitrateKbps === b
                    ? 'bg-amber-600 border-amber-500 text-white shadow-md'
                    : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {b >= 1000 ? `${b / 1000}M` : `${b}k`}
              </button>
            ))}
          </div>
        </div>

        {/* Live Estimated Impact Footer */}
        <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-slate-400">Estimated Bandwidth Usage:</span>
          </div>
          <span className="font-mono font-bold text-slate-200">{getEstimatedDataUsage()}</span>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95"
          >
            <Check className="w-4 h-4" />
            Apply Settings
          </button>
        </div>

      </div>
    </div>
  );
};
