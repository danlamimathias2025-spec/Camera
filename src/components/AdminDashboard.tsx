import React, { useState, useEffect, useRef } from 'react';
import { OnlineUser, NotificationItem } from '../types';
import { DiagnosticPanel } from './DiagnosticPanel';
import { Shield, Users, Video, Wifi, RefreshCw, Search, Bell, Monitor, UserCheck, UserX, Clock, Eye, Zap, Camera, Download, CheckCircle2, X, Activity, MapPin, Smartphone } from 'lucide-react';

interface AdminDashboardProps {
  onlineUsers: OnlineUser[];
  notifications: NotificationItem[];
  wsRef: React.MutableRefObject<WebSocket | null>;
  onSwitchUserCamera: (userId: string, currentFacingMode: 'user' | 'environment') => void;
}

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

// WebRTC Player Card Component
const WebRtcUserCard: React.FC<{
  user: OnlineUser;
  wsRef: React.MutableRefObject<WebSocket | null>;
  onSwitchCamera: (userId: string, currentFacingMode: 'user' | 'environment') => void;
  onFocusStream: (user: OnlineUser, stream: MediaStream | null) => void;
}> = ({ user, wsRef, onSwitchCamera, onFocusStream }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const [webrtcConnected, setWebrtcConnected] = useState<boolean>(false);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);

  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  useEffect(() => {
    if (videoRef.current && mediaStream) {
      videoRef.current.srcObject = mediaStream;
      videoRef.current.play().catch(e => console.log('Autoplay catch:', e));
    }
  }, [mediaStream, webrtcConnected]);

  useEffect(() => {
    if (!user.isStreaming) {
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
      setWebrtcConnected(false);
      return;
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;
    pendingCandidatesRef.current = [];

    pc.addTransceiver('video', { direction: 'recvonly' });

    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        setMediaStream(event.streams[0]);
        if (videoRef.current) {
          videoRef.current.srcObject = event.streams[0];
          videoRef.current.play().catch(() => {});
        }
        setWebrtcConnected(true);
      }
    };

    pc.onicecandidate = (e) => {
      if (e.candidate && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'webrtc:ice-candidate',
          targetUserId: user.userId,
          candidate: e.candidate
        }));
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setWebrtcConnected(true);
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected' || pc.connectionState === 'closed') {
        setWebrtcConnected(false);
      }
    };

    // Initiate WebRTC offer to target user
    const initWebRtcOffer = async () => {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: 'webrtc:offer',
            targetUserId: user.userId,
            offer
          }));
        }
      } catch (err) {
        console.error('Failed to create WebRTC offer:', err);
      }
    };

    initWebRtcOffer();

    const handleWebRtcSignal = async (event: CustomEvent) => {
      const data = event.detail;
      if (data.senderId !== user.userId) return;

      if (data.type === 'webrtc:answer' && pcRef.current) {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));

        // Flush queued ICE candidates
        if (pendingCandidatesRef.current.length > 0) {
          for (const cand of pendingCandidatesRef.current) {
            await pcRef.current.addIceCandidate(new RTCIceCandidate(cand)).catch(e => console.warn('Flush ICE err:', e));
          }
          pendingCandidatesRef.current = [];
        }
      }

      if (data.type === 'webrtc:ice-candidate' && pcRef.current && data.candidate) {
        if (pcRef.current.remoteDescription) {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(e => console.warn('Add ICE err:', e));
        } else {
          pendingCandidatesRef.current.push(data.candidate);
        }
      }
    };

    window.addEventListener('webrtc-signal' as any, handleWebRtcSignal);

    return () => {
      window.removeEventListener('webrtc-signal' as any, handleWebRtcSignal);
      pc.close();
    };
  }, [user.userId, user.isStreaming, wsRef]);

  const handleCaptureSingle = () => {
    let capturedDataUrl: string | null = null;
    if (videoRef.current && videoRef.current.videoWidth > 0) {
      const c = document.createElement('canvas');
      c.width = videoRef.current.videoWidth;
      c.height = videoRef.current.videoHeight;
      const ctx = c.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, c.width, c.height);
        capturedDataUrl = c.toDataURL('image/jpeg', 0.95);
      }
    } else if (user.lastFrame) {
      capturedDataUrl = user.lastFrame;
    }

    if (capturedDataUrl) {
      const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 15);
      const link = document.createElement('a');
      link.href = capturedDataUrl;
      link.download = `STREAM_${user.name.replace(/\s+/g, '_')}_${timestamp}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 shadow-md overflow-hidden transition-all hover:shadow-lg flex flex-col">
      {/* Video Container (Clickable to open full camera view) */}
      <div 
        onClick={() => onFocusStream(user, mediaStream)}
        className="relative aspect-video bg-slate-950 flex items-center justify-center overflow-hidden cursor-pointer group/video"
        title="Click to view full camera view"
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          data-user-id={user.userId}
          data-user-name={user.name}
          className={`w-full h-full object-cover transition-transform group-hover/video:scale-[1.02] ${webrtcConnected ? 'block' : 'hidden'}`}
        />

        {!webrtcConnected && (
          user.lastFrame ? (
            <img
              src={user.lastFrame}
              alt={`${user.name}'s stream`}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="flex flex-col items-center justify-center p-4 text-center text-slate-500">
              <Video className="w-8 h-8 mb-2 opacity-50" />
              <span className="text-xs font-medium">Connecting WebRTC media stream...</span>
            </div>
          )
        )}

        {/* Status Overlays */}
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold shadow-md ${
            user.isStreaming 
              ? 'bg-emerald-500 text-white' 
              : 'bg-slate-700 text-slate-300'
          }`}>
            <span className={`w-2 h-2 rounded-full ${user.isStreaming ? 'bg-white animate-pulse' : 'bg-slate-400'}`} />
            {user.isStreaming ? 'LIVE STREAM' : 'CAMERA PAUSED'}
          </span>

          <span className="px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md text-white text-[11px] font-medium flex items-center gap-1">
            <Zap className="w-3 h-3 text-amber-300" />
            {webrtcConnected ? 'WebRTC' : 'Frame Sync'}
          </span>
        </div>

        <div className="absolute bottom-3 left-3 flex items-center gap-1.5 pointer-events-none">
          <div className="px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md text-white text-[11px]">
            {user.facingMode === 'user' ? 'Front Lens' : 'Back Lens'}
          </div>
          <div className={`px-2.5 py-1 rounded-full text-[11px] font-bold backdrop-blur-md flex items-center gap-1 ${
            user.orientation === 'landscape'
              ? 'bg-purple-900/80 text-purple-200 border border-purple-500/40'
              : 'bg-black/60 text-sky-200'
          }`}>
            <Smartphone className={`w-3 h-3 transition-transform duration-300 ${user.orientation === 'landscape' ? 'rotate-90 text-purple-300' : 'text-sky-300'}`} />
            <span className="capitalize">{user.orientation || 'portrait'}</span>
          </div>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onFocusStream(user, mediaStream);
          }}
          className="absolute bottom-3 right-3 px-3 py-1.5 rounded-lg bg-black/70 hover:bg-black/90 text-white text-xs font-semibold backdrop-blur-md flex items-center gap-1.5 transition-all shadow-lg group-hover/video:bg-indigo-600"
          title="Open full camera view"
        >
          <Eye className="w-3.5 h-3.5" />
          Full View
        </button>
      </div>

      {/* User Info & Actions */}
      <div className="p-4 flex-1 flex flex-col justify-between space-y-4">
        {/* Clickable Profile Card */}
        <div
          onClick={() => onFocusStream(user, mediaStream)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              onFocusStream(user, mediaStream);
            }
          }}
          className="flex items-center gap-3 p-2 -m-2 rounded-xl cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/60 border border-transparent hover:border-indigo-500/30 transition-all group/profile"
          title="Click profile to view full camera view"
        >
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white font-bold flex items-center justify-center shrink-0 shadow-md group-hover/profile:scale-105 group-hover/profile:ring-2 group-hover/profile:ring-indigo-500/50 transition-all">
            {user.name.charAt(0).toUpperCase()}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-1">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5 group-hover/profile:text-indigo-600 dark:group-hover/profile:text-indigo-400 transition-colors">
                <span className="truncate">{user.name}</span>
                {user.role === 'admin' && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-semibold shrink-0">
                    Admin
                  </span>
                )}
              </h3>
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" title="Online" />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {user.email}
            </p>
          </div>

          <div className="flex items-center gap-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 opacity-70 group-hover/profile:opacity-100 transition-opacity shrink-0">
            <Eye className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Open View</span>
          </div>
        </div>

        <div className="pt-3 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between gap-2">
          <span className="text-[11px] text-slate-400 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Joined {new Date(user.connectedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>

          <div className="flex items-center gap-1.5">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleCaptureSingle();
              }}
              className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-700/60 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors"
              title="Capture Snapshot of this stream"
            >
              <Camera className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                onSwitchCamera(user.userId, user.facingMode);
              }}
              className="px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/80 border border-indigo-200 dark:border-indigo-800/80 text-indigo-700 dark:text-indigo-300 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              title="Remote command user to switch camera lens"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Switch to {user.facingMode === 'user' ? 'Back' : 'Front'} Camera
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  onlineUsers,
  notifications,
  wsRef,
  onSwitchUserCamera
}) => {
  const [selectedUser, setSelectedUser] = useState<{ user: OnlineUser; stream: MediaStream | null } | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'streaming' | 'idle'>('all');
  const [viewTab, setViewTab] = useState<'cameras' | 'diagnostics'>('cameras');
  const modalVideoRef = useRef<HTMLVideoElement | null>(null);

  const filteredUsers = onlineUsers.filter(u => {
    const matchesSearch = u.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          u.email.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    if (activeFilter === 'streaming') return u.isStreaming;
    if (activeFilter === 'idle') return !u.isStreaming;
    return true;
  });

  const streamingUsersCount = onlineUsers.filter(u => u.isStreaming).length;

  const activeSelectedUser = selectedUser 
    ? (onlineUsers.find(u => u.userId === selectedUser.user.userId) || selectedUser.user) 
    : null;

  useEffect(() => {
    if (selectedUser?.stream && modalVideoRef.current) {
      modalVideoRef.current.srcObject = selectedUser.stream;
      modalVideoRef.current.play().catch(e => console.log('Modal video autoplay:', e));
    }
  }, [selectedUser]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedUser) {
        setSelectedUser(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedUser]);

  const [captureFeedback, setCaptureFeedback] = useState<string | null>(null);

  const handleModalCaptureSingle = () => {
    if (!activeSelectedUser) return;
    let dataUrl: string | null = null;
    if (modalVideoRef.current && modalVideoRef.current.videoWidth > 0) {
      const c = document.createElement('canvas');
      c.width = modalVideoRef.current.videoWidth;
      c.height = modalVideoRef.current.videoHeight;
      const ctx = c.getContext('2d');
      if (ctx) {
        ctx.drawImage(modalVideoRef.current, 0, 0, c.width, c.height);
        dataUrl = c.toDataURL('image/jpeg', 0.95);
      }
    } else if (activeSelectedUser.lastFrame) {
      dataUrl = activeSelectedUser.lastFrame;
    }

    if (dataUrl) {
      const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 15);
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `CAMERA_VIEW_${activeSelectedUser.name.replace(/\s+/g, '_')}_${timestamp}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setCaptureFeedback(`Saved photo from ${activeSelectedUser.name}'s camera!`);
      setTimeout(() => setCaptureFeedback(null), 3000);
    }
  };

  const handleCaptureAllStreams = () => {
    const activeStreams = onlineUsers.filter(u => u.isStreaming);
    if (activeStreams.length === 0) {
      setCaptureFeedback('No active camera streams are currently broadcasting.');
      setTimeout(() => setCaptureFeedback(null), 3500);
      return;
    }

    const now = new Date();
    const timestamp = now.toISOString().replace(/[-:T.]/g, '').slice(0, 15);
    const videoElements = Array.from(document.querySelectorAll<HTMLVideoElement>('video[data-user-id]'));

    const captures: { name: string; userId: string; dataUrl: string; canvas: HTMLCanvasElement }[] = [];

    videoElements.forEach(video => {
      const uId = video.getAttribute('data-user-id');
      const uName = video.getAttribute('data-user-name') || 'user';
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        const c = document.createElement('canvas');
        c.width = video.videoWidth;
        c.height = video.videoHeight;
        const ctx = c.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, c.width, c.height);
          // Label with user name and time
          ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
          ctx.fillRect(0, c.height - 48, c.width, 48);
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 20px sans-serif';
          ctx.fillText(`${uName} • ${now.toLocaleTimeString()}`, 16, c.height - 18);

          captures.push({
            name: uName,
            userId: uId || '',
            dataUrl: c.toDataURL('image/jpeg', 0.95),
            canvas: c
          });
        }
      }
    });

    // Check for streaming users that might only have lastFrame in state
    activeStreams.forEach(u => {
      if (!captures.some(c => c.userId === u.userId) && u.lastFrame) {
        const img = new Image();
        img.src = u.lastFrame;
        const c = document.createElement('canvas');
        c.width = 640;
        c.height = 480;
        const ctx = c.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, c.width, c.height);
          ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
          ctx.fillRect(0, c.height - 48, c.width, 48);
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 20px sans-serif';
          ctx.fillText(`${u.name} • ${now.toLocaleTimeString()}`, 16, c.height - 18);

          captures.push({
            name: u.name,
            userId: u.userId,
            dataUrl: c.toDataURL('image/jpeg', 0.95),
            canvas: c
          });
        }
      }
    });

    if (captures.length === 0) {
      setCaptureFeedback('Unable to capture frames: streams are still connecting.');
      setTimeout(() => setCaptureFeedback(null), 3500);
      return;
    }

    // 1. Download each user stream screenshot directly to phone/device storage
    captures.forEach((item, index) => {
      setTimeout(() => {
        const link = document.createElement('a');
        link.href = item.dataUrl;
        link.download = `STREAM_${item.name.replace(/\s+/g, '_')}_${timestamp}.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }, index * 200);
    });

    // 2. If more than 1 stream, also generate and save a unified multi-stream composite photo
    if (captures.length > 1) {
      setTimeout(() => {
        const cols = captures.length <= 2 ? 2 : Math.ceil(Math.sqrt(captures.length));
        const rows = Math.ceil(captures.length / cols);
        const cellW = 640;
        const cellH = 360;

        const gridCanvas = document.createElement('canvas');
        gridCanvas.width = cols * cellW;
        gridCanvas.height = rows * cellH + 60;
        const gCtx = gridCanvas.getContext('2d');
        if (gCtx) {
          gCtx.fillStyle = '#0a0a0f';
          gCtx.fillRect(0, 0, gridCanvas.width, gridCanvas.height);

          gCtx.fillStyle = '#ffffff';
          gCtx.font = 'bold 22px sans-serif';
          gCtx.fillText(`All Live Camera Streams Snapshot (${captures.length} users) — ${now.toLocaleString()}`, 20, 38);

          captures.forEach((c, idx) => {
            const r = Math.floor(idx / cols);
            const col = idx % cols;
            const x = col * cellW;
            const y = 60 + r * cellH;
            gCtx.drawImage(c.canvas, x, y, cellW, cellH);
          });

          const gridLink = document.createElement('a');
          gridLink.href = gridCanvas.toDataURL('image/jpeg', 0.95);
          gridLink.download = `ALL_STREAMS_GRID_${timestamp}.jpg`;
          document.body.appendChild(gridLink);
          gridLink.click();
          document.body.removeChild(gridLink);
        }
      }, captures.length * 200 + 100);
    }

    setCaptureFeedback(`Captured & saved ${captures.length} live camera stream(s) directly to storage!`);
    setTimeout(() => setCaptureFeedback(null), 4000);
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* Toast Feedback */}
      {captureFeedback && (
        <div className="p-4 rounded-2xl bg-emerald-950/90 border border-emerald-500/60 text-white text-sm flex items-center gap-3 shadow-2xl animate-fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="font-semibold">{captureFeedback}</span>
        </div>
      )}

      {/* Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-slate-800 text-white shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-indigo-400 shrink-0">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">Admin WebRTC Monitor Center</h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Super Admin Mode
              </span>
            </div>
            <p className="text-sm text-slate-300 mt-1">
              Low-latency WebRTC media stream monitor & remote camera controller for connected users.
            </p>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-3 shrink-0">
          <button
            onClick={handleCaptureAllStreams}
            className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center gap-2 transition-all shadow-lg shadow-indigo-600/30 active:scale-95 shrink-0"
            title="Capture a screenshot from all connected live camera streams simultaneously"
          >
            <Camera className="w-4 h-4" />
            <span>Capture All Streams ({streamingUsersCount})</span>
          </button>

          <div className="px-4 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700/60 text-xs text-slate-300 flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" />
            <span>WebRTC Peer Engine Active</span>
          </div>
        </div>
      </div>

      {/* Main Admin Tab Switcher */}
      <div className="flex items-center gap-2 p-1.5 bg-slate-900 border border-slate-800 rounded-2xl w-fit">
        <button
          onClick={() => setViewTab('cameras')}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
            viewTab === 'cameras'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Video className="w-4 h-4" />
          <span>Live Camera Feeds ({onlineUsers.length})</span>
        </button>

        <button
          onClick={() => setViewTab('diagnostics')}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
            viewTab === 'diagnostics'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>Stream Diagnostics & Location Map</span>
        </button>
      </div>

      {viewTab === 'diagnostics' ? (
        <DiagnosticPanel
          onlineUsers={onlineUsers}
          onSelectUser={(u) => setSelectedUser({ user: u, stream: null })}
          onSwitchUserCamera={onSwitchUserCamera}
        />
      ) : (
        <>
          {/* Metrics Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/60 shadow-sm flex items-center justify-between">
              <div>
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Online Users</span>
                <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{onlineUsers.length}</div>
              </div>
              <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                <Users className="w-6 h-6" />
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/60 shadow-sm flex items-center justify-between">
              <div>
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Active Camera Feeds</span>
                <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{streamingUsersCount}</div>
              </div>
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
                <Video className="w-6 h-6" />
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/60 shadow-sm flex items-center justify-between">
              <div>
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">System Notifications</span>
                <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{notifications.length}</div>
              </div>
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
                <Bell className="w-6 h-6" />
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/60 shadow-sm flex items-center justify-between">
              <div>
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Protocol</span>
                <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">WebRTC</div>
              </div>
              <div className="p-3 rounded-xl bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400">
                <Zap className="w-6 h-6" />
              </div>
            </div>
          </div>

      {/* Main Grid + Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-4 rounded-2xl bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/60 shadow-sm">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search online user by name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white"
              />
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-xl">
              <button
                onClick={() => setActiveFilter('all')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  activeFilter === 'all'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                All ({onlineUsers.length})
              </button>
              <button
                onClick={() => setActiveFilter('streaming')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  activeFilter === 'streaming'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Streaming ({streamingUsersCount})
              </button>
            </div>
          </div>

          {/* WebRTC Video Cards */}
          {filteredUsers.length === 0 ? (
            <div className="p-12 rounded-2xl bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 text-center space-y-3">
              <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center mx-auto text-slate-400">
                <UserX className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">No Active Online Users</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                Users will appear here with low-latency WebRTC streams as soon as they enable their camera.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {filteredUsers.map(u => (
                <WebRtcUserCard
                  key={u.userId}
                  user={u}
                  wsRef={wsRef}
                  onSwitchCamera={onSwitchUserCamera}
                  onFocusStream={(user, stream) => setSelectedUser({ user, stream })}
                />
              ))}
            </div>
          )}
        </div>

        {/* Live Notifications Panel */}
        <div className="space-y-4">
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/60 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Bell className="w-4 h-4 text-amber-500" />
                Live Presence Notifications
              </h2>
              <span className="text-xs font-mono text-slate-400">Real-time</span>
            </div>

            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
              {notifications.length === 0 ? (
                <div className="p-6 text-center text-slate-400 text-xs">
                  No activity events logged yet.
                </div>
              ) : (
                notifications.map(n => (
                  <div
                    key={n.id}
                    className={`p-3 rounded-xl border text-xs space-y-1 transition-all ${
                      n.type === 'online'
                        ? 'bg-emerald-50/50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/50 text-emerald-900 dark:text-emerald-200'
                        : 'bg-rose-50/50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800/50 text-rose-900 dark:text-rose-200'
                    }`}
                  >
                    <div className="flex items-center justify-between font-semibold">
                      <span className="flex items-center gap-1.5">
                        {n.type === 'online' ? (
                          <UserCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <UserX className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                        )}
                        {n.title}
                      </span>
                      <span className="text-[10px] opacity-75 font-mono">
                        {new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>
                    <p className="opacity-90">{n.message}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
        </>
      )}

      {/* Full User Camera View Modal */}
      {selectedUser && activeSelectedUser && (
        <div 
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedUser(null);
          }}
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-fade-in"
        >
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-4xl w-full overflow-hidden shadow-2xl flex flex-col space-y-4 p-5 sm:p-7">
            {/* Header: User Profile Details & Close Button */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white font-bold text-lg flex items-center justify-center shadow-md shadow-indigo-600/30">
                  {activeSelectedUser.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base sm:text-lg font-bold text-white">
                      {activeSelectedUser.name}
                    </h2>
                    {activeSelectedUser.role === 'admin' && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/30">
                        Admin
                      </span>
                    )}
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      activeSelectedUser.isStreaming
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-slate-700/60 text-slate-300'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${activeSelectedUser.isStreaming ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'}`} />
                      {activeSelectedUser.isStreaming ? 'STREAMING' : 'CAMERA PAUSED'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">{activeSelectedUser.email}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedUser(null)}
                  className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
                  title="Close Full View (Esc)"
                >
                  <X className="w-4 h-4" />
                  <span className="hidden sm:inline">Close</span>
                </button>
              </div>
            </div>

            {/* Video Viewport */}
            <div className="relative aspect-video bg-black rounded-2xl overflow-hidden border border-slate-800 flex items-center justify-center shadow-inner">
              <video
                ref={modalVideoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-contain ${selectedUser.stream ? 'block' : 'hidden'}`}
              />

              {!selectedUser.stream && activeSelectedUser.lastFrame && (
                <img
                  src={activeSelectedUser.lastFrame}
                  alt={`${activeSelectedUser.name}'s stream`}
                  className="w-full h-full object-contain"
                />
              )}

              {!selectedUser.stream && !activeSelectedUser.lastFrame && (
                <div className="text-center text-slate-500 space-y-2">
                  <Video className="w-10 h-10 mx-auto opacity-40 animate-pulse" />
                  <p className="text-xs">Waiting for live video frames...</p>
                </div>
              )}

              {/* Overlays */}
              <div className="absolute top-3 left-3 flex flex-wrap items-center gap-2">
                <div className="px-3 py-1 rounded-full bg-black/60 text-white text-xs font-medium backdrop-blur-md flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Lens: {activeSelectedUser.facingMode === 'user' ? 'Front (Selfie)' : 'Back (Wide)'}</span>
                </div>
                <div className={`px-3 py-1 rounded-full text-xs font-bold backdrop-blur-md flex items-center gap-1.5 ${
                  activeSelectedUser.orientation === 'landscape'
                    ? 'bg-purple-900/80 text-purple-200 border border-purple-500/40'
                    : 'bg-black/60 text-sky-200'
                }`}>
                  <Smartphone className={`w-3.5 h-3.5 transition-transform duration-300 ${
                    activeSelectedUser.orientation === 'landscape' ? 'rotate-90 text-purple-300' : 'text-sky-300'
                  }`} />
                  <span className="capitalize">{activeSelectedUser.orientation || 'portrait'}</span>
                  <span className="text-[10px] opacity-75">({activeSelectedUser.orientationAngle ?? 0}°)</span>
                </div>
                <div className="px-3 py-1 rounded-full bg-black/60 text-amber-300 text-xs font-medium backdrop-blur-md flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5" />
                  <span>{selectedUser.stream ? 'WebRTC Live Peer' : 'Live Sync'}</span>
                </div>
              </div>
            </div>

            {/* Action Toolbar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  onClick={() => {
                    onSwitchUserCamera(activeSelectedUser.userId, activeSelectedUser.facingMode);
                  }}
                  className="flex-1 sm:flex-initial px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95"
                >
                  <RefreshCw className="w-4 h-4" />
                  Switch to {activeSelectedUser.facingMode === 'user' ? 'Back' : 'Front'} Camera
                </button>

                <button
                  onClick={handleModalCaptureSingle}
                  className="flex-1 sm:flex-initial px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-2 transition-all border border-slate-700 active:scale-95"
                  title="Save high-resolution photo directly to phone/device storage"
                >
                  <Camera className="w-4 h-4 text-emerald-400" />
                  Take Snapshot
                </button>
              </div>

              <div className="text-xs text-slate-400 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                <span>Connected {new Date(activeSelectedUser.connectedAt).toLocaleTimeString()}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
