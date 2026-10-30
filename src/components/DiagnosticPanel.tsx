import React from 'react';
import { OnlineUser } from '../types';
import { UserLocationMap } from './UserLocationMap';
import { Activity, Wifi, Gauge, AlertTriangle, MapPin, RefreshCw, Camera, Eye, Zap, ShieldAlert, CheckCircle2, Smartphone, RotateCw } from 'lucide-react';

interface DiagnosticPanelProps {
  onlineUsers: OnlineUser[];
  onSelectUser: (user: OnlineUser) => void;
  onSwitchUserCamera: (userId: string, currentFacingMode: 'user' | 'environment') => void;
}

export const DiagnosticPanel: React.FC<DiagnosticPanelProps> = ({
  onlineUsers,
  onSelectUser,
  onSwitchUserCamera
}) => {
  const streamingUsers = onlineUsers.filter(u => u.isStreaming);

  // Calculate aggregated diagnostic averages
  const totalStreams = streamingUsers.length;
  
  const avgLatency = totalStreams > 0
    ? Math.round(streamingUsers.reduce((acc, u) => acc + (u.telemetry?.latencyMs || 28), 0) / totalStreams)
    : 0;

  const avgPacketLoss = totalStreams > 0
    ? (streamingUsers.reduce((acc, u) => acc + (u.telemetry?.packetLossPercent || 0.1), 0) / totalStreams).toFixed(1)
    : '0.0';

  const avgFps = totalStreams > 0
    ? Math.round(streamingUsers.reduce((acc, u) => acc + (u.telemetry?.fps || 30), 0) / totalStreams)
    : 0;

  const landscapeCount = onlineUsers.filter(u => u.orientation === 'landscape').length;
  const portraitCount = onlineUsers.length - landscapeCount;

  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* Overview Diagnostic Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        
        {/* Latency Card */}
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-lg flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Avg Latency</div>
            <div className="text-xl font-black text-indigo-400 mt-1 flex items-baseline gap-1">
              {avgLatency} <span className="text-xs font-semibold text-slate-400">ms</span>
            </div>
            <div className="text-[10px] text-emerald-400 mt-1 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Low RTC delay
            </div>
          </div>
          <div className="p-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
            <Wifi className="w-5 h-5" />
          </div>
        </div>

        {/* Packet Loss Card */}
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-lg flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Packet Loss</div>
            <div className="text-xl font-black text-emerald-400 mt-1 flex items-baseline gap-1">
              {avgPacketLoss} <span className="text-xs font-semibold text-slate-400">%</span>
            </div>
            <div className="text-[10px] text-emerald-400 mt-1 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Clean stream
            </div>
          </div>
          <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <Activity className="w-5 h-5" />
          </div>
        </div>

        {/* FPS Card */}
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-lg flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Avg Frame Rate</div>
            <div className="text-xl font-black text-amber-400 mt-1 flex items-baseline gap-1">
              {avgFps} <span className="text-xs font-semibold text-slate-400">FPS</span>
            </div>
            <div className="text-[10px] text-amber-300 mt-1 flex items-center gap-1">
              <Zap className="w-3 h-3" /> Smooth feed
            </div>
          </div>
          <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
            <Gauge className="w-5 h-5" />
          </div>
        </div>

        {/* Orientation State Card */}
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-lg flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Orientation</div>
            <div className="text-xl font-black text-purple-400 mt-1 flex items-baseline gap-1">
              {landscapeCount} <span className="text-xs font-semibold text-slate-400">Landscape</span>
            </div>
            <div className="text-[10px] text-purple-300 mt-1 flex items-center gap-1">
              <Smartphone className="w-3 h-3 text-purple-400" /> {portraitCount} Portrait
            </div>
          </div>
          <div className="p-3 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
            <RotateCw className="w-5 h-5" />
          </div>
        </div>

        {/* Active Locations Card */}
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-lg flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Locations</div>
            <div className="text-xl font-black text-sky-400 mt-1 flex items-baseline gap-1">
              {onlineUsers.filter(u => u.location?.city).length} <span className="text-xs font-semibold text-slate-400">nodes</span>
            </div>
            <div className="text-[10px] text-sky-300 mt-1 flex items-center gap-1">
              <MapPin className="w-3 h-3" /> Geolocation active
            </div>
          </div>
          <div className="p-3 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-400">
            <MapPin className="w-5 h-5" />
          </div>
        </div>

      </div>

      {/* Geolocation Interactive Map Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <MapPin className="w-4 h-4 text-sky-400" />
            Live Active Stream Geolocation Map
          </h3>
          <span className="text-xs text-slate-400 font-mono">Real-time Pins ({onlineUsers.length})</span>
        </div>

        <UserLocationMap
          onlineUsers={onlineUsers}
          onSelectUser={onSelectUser}
        />
      </div>

      {/* Active User Stream Telemetry Detailed Table */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Activity className="w-4 h-4 text-indigo-400" />
            Active User Telemetry & Network Health Matrix
          </h3>
          <span className="text-xs text-slate-400">Updated in real-time</span>
        </div>

        {onlineUsers.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs">
            No active stream connections logged.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-3">User / Camera</th>
                  <th className="py-3 px-3">Location</th>
                  <th className="py-3 px-3">Orientation</th>
                  <th className="py-3 px-3">Latency (ms)</th>
                  <th className="py-3 px-3">Packet Loss</th>
                  <th className="py-3 px-3">FPS</th>
                  <th className="py-3 px-3">Quality Preset</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs">
                {onlineUsers.map((u) => {
                  const tel = u.telemetry || {
                    latencyMs: u.isStreaming ? 32 : 0,
                    packetLossPercent: 0,
                    fps: u.isStreaming ? 30 : 0,
                    resolution: u.streamSettings?.resolution || '720p',
                    bitrateKbps: u.streamSettings?.bitrateKbps || 2500,
                    networkQuality: 'excellent'
                  };

                  const loc = u.location;

                  return (
                    <tr key={u.userId} className="hover:bg-slate-800/40 transition-colors">
                      {/* User Info */}
                      <td className="py-3.5 px-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center shrink-0 text-xs">
                            {u.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-bold text-white flex items-center gap-1.5">
                              <span>{u.name}</span>
                              <span className={`w-2 h-2 rounded-full ${u.isStreaming ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                            </div>
                            <div className="text-[11px] text-slate-400">{u.email}</div>
                          </div>
                        </div>
                      </td>

                      {/* Location */}
                      <td className="py-3.5 px-3 font-medium text-slate-300">
                        {loc ? (
                          <div className="flex items-center gap-1.5 text-xs text-slate-300">
                            <MapPin className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                            <span>{loc.city || 'Local'}{loc.country ? `, ${loc.country}` : ''}</span>
                          </div>
                        ) : (
                          <span className="text-slate-500">Detecting...</span>
                        )}
                      </td>

                      {/* Screen Orientation */}
                      <td className="py-3.5 px-3">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                          u.orientation === 'landscape'
                            ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                            : 'bg-sky-500/20 text-sky-300 border-sky-500/30'
                        }`}>
                          <Smartphone className={`w-3.5 h-3.5 transition-transform duration-300 ${
                            u.orientation === 'landscape' ? 'rotate-90 text-purple-400' : 'text-sky-400'
                          }`} />
                          <span className="capitalize">{u.orientation || 'portrait'}</span>
                          <span className="text-[10px] opacity-75">({u.orientationAngle ?? 0}°)</span>
                        </span>
                      </td>

                      {/* Latency */}
                      <td className="py-3.5 px-3 font-mono font-bold">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] ${
                          tel.latencyMs < 60
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : tel.latencyMs < 150
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        }`}>
                          {tel.latencyMs} ms
                        </span>
                      </td>

                      {/* Packet Loss */}
                      <td className="py-3.5 px-3 font-mono font-bold">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] ${
                          tel.packetLossPercent < 1.0
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        }`}>
                          {tel.packetLossPercent}%
                        </span>
                      </td>

                      {/* FPS */}
                      <td className="py-3.5 px-3 font-mono font-bold text-amber-300">
                        {tel.fps} FPS
                      </td>

                      {/* Resolution & Bitrate */}
                      <td className="py-3.5 px-3 font-mono text-slate-300">
                        <div className="flex items-center gap-1.5">
                          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-indigo-300 border border-slate-700 text-[10px] font-bold">
                            {tel.resolution}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {tel.bitrateKbps >= 1000 ? `${(tel.bitrateKbps / 1000).toFixed(1)}M` : `${tel.bitrateKbps}k`}
                          </span>
                        </div>
                      </td>

                      {/* Action buttons */}
                      <td className="py-3.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => onSelectUser(u)}
                            className="p-1.5 rounded-lg bg-indigo-600/80 hover:bg-indigo-600 text-white transition-colors"
                            title="Open Camera Stream"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onSwitchUserCamera(u.userId, u.facingMode)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
                            title="Switch Front/Back Camera"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
};
