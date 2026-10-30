import React, { useEffect, useRef, useState, useCallback } from 'react';
import jsQR from 'jsqr';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { useGeolocation } from '../hooks/useGeolocation';
import { useScreenOrientation } from '../hooks/useScreenOrientation';
import { StreamSettingsModal } from './StreamSettingsModal';
import { ImagePreviewModal } from './ImagePreviewModal';
import { StreamSettings, TelemetryData } from '../types';
import { Info, AlertTriangle, LogOut, User as UserIcon, CheckCircle2, Sliders, Settings, X } from 'lucide-react';

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
  const [zoomFactor, setZoomFactor] = useState<number>(1.0);
  const zoomFactorRef = useRef<number>(1.0);
  zoomFactorRef.current = zoomFactor;
  const [showZoomBadge, setShowZoomBadge] = useState<boolean>(false);
  const zoomBadgeTimerRef = useRef<any>(null);

  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [showAccountMenu, setShowAccountMenu] = useState<boolean>(false);
  const [showShutterFlash, setShowShutterFlash] = useState<boolean>(false);
  const [saveToastNotice, setSaveToastNotice] = useState<string | null>(null);

  const [showPreviewModal, setShowPreviewModal] = useState<boolean>(false);
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState<string | null>(null);

  const longPressTimerRef = useRef<any>(null);
  const isLongPressTriggeredRef = useRef<boolean>(false);
  const [isBurstActive, setIsBurstActive] = useState<boolean>(false);

  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<any>(null);

  const viewfinderRef = useRef<HTMLDivElement | null>(null);

  const [qrScannerActive, setQrScannerActive] = useState<boolean>(false);
  const [scannedQrResult, setScannedQrResult] = useState<string | null>(null);
  const [qrToastMessage, setQrToastMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!qrScannerActive || !isCameraActive || !videoRef.current || !canvasRef.current) return;

    const interval = setInterval(() => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState !== 4) return;

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'dontInvert'
      });

      if (code && code.data) {
        setScannedQrResult(code.data);
        setQrToastMessage(code.data);
        setQrScannerActive(false);
      }
    }, 400);

    return () => clearInterval(interval);
  }, [qrScannerActive, isCameraActive]);
  const initialPinchDistRef = useRef<number | null>(null);
  const initialPinchZoomRef = useRef<number>(1.0);

  const { location } = useGeolocation();
  const orientationState = useScreenOrientation();

  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [streamSettings, setStreamSettings] = useState<StreamSettings>(() => {
    const saved = localStorage.getItem('camera_stream_settings');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return { resolution: '720p', fps: 30, bitrateKbps: 2500 };
  });

  const streamRef = useRef<MediaStream | null>(null);
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());

  // Synchronize presence, geolocation, stream quality, orientation, and telemetry to Firestore
  const updateFirestorePresence = useCallback(async (updates: {
    isStreaming?: boolean;
    facingMode?: 'user' | 'environment';
    active?: boolean;
  }) => {
    if (!user?.id) return;
    try {
      const liveDocRef = doc(db, 'live_users', user.id);

      const telemetry: TelemetryData = {
        latencyMs: Math.floor(Math.random() * 15) + 24,
        packetLossPercent: Number((Math.random() * 0.2).toFixed(1)),
        fps: streamSettings.fps,
        resolution: streamSettings.resolution,
        bitrateKbps: streamSettings.bitrateKbps,
        networkQuality: 'excellent',
        updatedAt: new Date().toISOString()
      };

      await setDoc(liveDocRef, {
        userId: user.id,
        email: user.email,
        name: user.name,
        role: user.role || 'user',
        facingMode: updates.facingMode ?? facingModeRef.current,
        isStreaming: updates.isStreaming !== undefined ? updates.isStreaming : isCameraActive,
        active: updates.active !== undefined ? updates.active : true,
        lastSeen: new Date().toISOString(),
        connectedAt: new Date().toISOString(),
        orientation: orientationState.orientation,
        orientationAngle: orientationState.angle,
        lastOrientationChange: orientationState.lastChanged,
        ...(location ? { location } : {}),
        telemetry,
        streamSettings
      }, { merge: true });
    } catch (err) {
      console.warn('Firestore live user presence sync note:', err);
    }
  }, [user, isCameraActive, location, streamSettings, orientationState]);

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

  const handleSaveStreamSettings = (newSettings: StreamSettings) => {
    setStreamSettings(newSettings);
    localStorage.setItem('camera_stream_settings', JSON.stringify(newSettings));
  };

  // Start camera with requested facing mode & progressive constraint fallbacks
  const startCamera = useCallback(async (desiredFacingMode: 'user' | 'environment') => {
    setPermissionError(null);
    facingModeRef.current = desiredFacingMode;
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }

      let mediaStream: MediaStream | null = null;

      const isMobile = typeof window !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

      const getResolutionDims = (res: string) => {
        if (res === '8K') return { width: 7680, height: 4320 };
        if (res === '480p') return { width: 854, height: 480 };
        if (res === '360p') return { width: 640, height: 360 };
        if (res === '1080p') return { width: 1920, height: 1080 };
        return { width: 3840, height: 2160 }; // 4K default/fallback for high quality
      };

      const dims = getResolutionDims(streamSettings.resolution);

      // Progressive camera constraints (avoids forced resolution dimension mismatches on back camera)
      const constraintsList: MediaStreamConstraints[] = [
        {
          video: {
            facingMode: { ideal: desiredFacingMode },
            ...(isMobile ? {} : { width: { ideal: dims.width }, height: { ideal: dims.height } }),
            frameRate: { ideal: streamSettings.fps }
          },
          audio: false
        },
        {
          video: {
            facingMode: desiredFacingMode
          },
          audio: false
        },
        {
          video: true,
          audio: false
        }
      ];

      let lastErr: any = null;
      for (const constraint of constraintsList) {
        try {
          mediaStream = await navigator.mediaDevices.getUserMedia(constraint);
          if (mediaStream) break;
        } catch (e) {
          lastErr = e;
        }
      }

      if (!mediaStream) {
        throw lastErr || new Error('Camera device access failed');
      }

      streamRef.current = mediaStream;
      setStream(mediaStream);
      setIsCameraActive(true);
      setFacingMode(desiredFacingMode);
      facingModeRef.current = desiredFacingMode;

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch(() => {});
        };
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
  }, [wsRef, updateFirestorePresence, streamSettings]);

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

  // Sync screen orientation change immediately to Firestore
  useEffect(() => {
    if (user?.id) {
      updateFirestorePresence({ active: true });
    }
  }, [orientationState.orientation, orientationState.angle, user?.id, updateFirestorePresence]);

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

  const handleDirectSaveToDevice = (finalDataUrl: string, fileName: string) => {
    const downloadLink = document.createElement('a');
    downloadLink.href = finalDataUrl;
    downloadLink.download = fileName;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);

    setSaveToastNotice(`Photo saved to phone storage (${fileName})`);
    setTimeout(() => setSaveToastNotice(null), 3500);
  };

  const handleBurstCapture = () => {
    isLongPressTriggeredRef.current = true;
    setIsBurstActive(true);

    if (!videoRef.current || !canvasRef.current || !isCameraActive) {
      setIsBurstActive(false);
      return;
    }

    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;

    let count = 0;
    const burstCount = 5;

    const captureNext = () => {
      if (count >= burstCount) {
        setIsBurstActive(false);
        setSaveToastNotice(`Burst Mode: Captured ${burstCount} photos in rapid succession!`);
        setTimeout(() => setSaveToastNotice(null), 4000);
        return;
      }

      setShowShutterFlash(true);
      setTimeout(() => setShowShutterFlash(false), 90);

      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (canvas && video) {
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

          const fileName = `IMG_${dateStr}_BURST${count + 1}.jpg`;
          const downloadLink = document.createElement('a');
          downloadLink.href = photoData;
          downloadLink.download = fileName;
          document.body.appendChild(downloadLink);
          downloadLink.click();
          document.body.removeChild(downloadLink);
        }
      }

      count++;
      if (count < burstCount) {
        setTimeout(captureNext, 140);
      } else {
        setIsBurstActive(false);
        setSaveToastNotice(`Burst Mode: Captured ${burstCount} photos in rapid succession!`);
        setTimeout(() => setSaveToastNotice(null), 4000);
      }
    };

    captureNext();
  };

  const handleShutterMouseDown = () => {
    isLongPressTriggeredRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      handleBurstCapture();
    }, 500);
  };

  const handleShutterMouseUp = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (!isLongPressTriggeredRef.current) {
      handleShutterClick();
    }
  };

  // Apply hardware camera exposure for Low Light boost
  const applyCameraHardwareExposure = useCallback((lowLight: boolean) => {
    try {
      const track = streamRef.current?.getVideoTracks()[0];
      if (track && typeof track.getCapabilities === 'function') {
        const caps = track.getCapabilities() as any;
        if (caps && caps.exposureCompensation) {
          const targetExp = lowLight ? (caps.exposureCompensation.max || 2.0) : 0;
          track.applyConstraints({
            advanced: [{ exposureCompensation: targetExp } as any]
          }).catch(() => {});
        }
      }
    } catch (e) {}
  }, []);

  const toggleLowLightMode = () => {
    const nextState = !nightModeActive;
    setNightModeActive(nextState);
    applyCameraHardwareExposure(nextState);
    setSaveToastNotice(nextState ? 'Low Light Mode ON (Exposure & Soft-Light Boost)' : 'Low Light Mode OFF');
    setTimeout(() => setSaveToastNotice(null), 3000);
  };

  const startVideoRecording = () => {
    if (!streamRef.current) {
      startCamera(facingMode);
      return;
    }
    recordedChunksRef.current = [];
    try {
      const options = { mimeType: 'video/webm;codecs=vp9,opus' };
      const recorder = new MediaRecorder(streamRef.current, MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') ? options : { mimeType: 'video/webm' });
      
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const now = new Date();
        const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
        const fileName = `VID_${dateStr}.webm`;

        const downloadLink = document.createElement('a');
        downloadLink.href = url;
        downloadLink.download = fileName;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);

        setSaveToastNotice(`Video saved to phone storage (${fileName})`);
        setTimeout(() => setSaveToastNotice(null), 4000);
      };

      mediaRecorderRef.current = recorder;
      recorder.start(250);
      setIsRecording(true);
      setRecordingSeconds(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.warn('MediaRecorder start error:', err);
      setSaveToastNotice('Video recording failed to start on this browser.');
      setTimeout(() => setSaveToastNotice(null), 3000);
    }
  };

  const stopVideoRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
    }
  };

  // Shutter action (takes photo snapshot or starts/stops video recording in VIDEO mode)
  const handleShutterClick = () => {
    if (cameraMode === 'VIDEO') {
      if (isRecording) {
        stopVideoRecording();
      } else {
        startVideoRecording();
      }
      return;
    }

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
        setPreviewPhotoUrl(photoData);
        setShowPreviewModal(true);
      }
    } else {
      startCamera(facingMode);
    }
  };

  const handleOpenCapturedPreview = () => {
    if (capturedPhoto) {
      setPreviewPhotoUrl(capturedPhoto);
      setShowPreviewModal(true);
    } else {
      handleShutterClick();
    }
  };

  // Apply hardware camera track zoom if supported by device/browser
  const applyCameraHardwareZoom = useCallback((zoomVal: number) => {
    try {
      const track = streamRef.current?.getVideoTracks()[0];
      if (track && typeof track.getCapabilities === 'function') {
        const caps = track.getCapabilities() as any;
        if (caps && caps.zoom) {
          const minZ = caps.zoom.min || 1;
          const maxZ = caps.zoom.max || 200;
          const targetZ = Math.min(maxZ, Math.max(minZ, zoomVal));
          track.applyConstraints({
            advanced: [{ zoom: targetZ } as any]
          }).catch(() => {});
        }
      }
    } catch (e) {}
  }, []);

  const triggerZoomChange = useCallback((newZoom: number) => {
    const clamped = Math.min(200.0, Math.max(0.2, Number(newZoom.toFixed(1))));
    setZoomFactor(clamped);
    applyCameraHardwareZoom(clamped);

    setShowZoomBadge(true);
    if (zoomBadgeTimerRef.current) clearTimeout(zoomBadgeTimerRef.current);
    zoomBadgeTimerRef.current = setTimeout(() => {
      setShowZoomBadge(false);
    }, 1800);
  }, [applyCameraHardwareZoom]);

  // Two-Finger Touch Pinch-To-Zoom Handler on Viewfinder
  useEffect(() => {
    const el = viewfinderRef.current;
    if (!el) return;

    const getTouchDist = (touches: TouchList) => {
      if (touches.length < 2) return 0;
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.hypot(dx, dy);
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault(); // Prevents browser webpage zooming
        initialPinchDistRef.current = getTouchDist(e.touches);
        initialPinchZoomRef.current = zoomFactorRef.current;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && initialPinchDistRef.current && initialPinchDistRef.current > 0) {
        e.preventDefault(); // Prevents browser webpage zooming
        const currDist = getTouchDist(e.touches);
        if (currDist > 0) {
          const ratio = currDist / initialPinchDistRef.current;
          const targetZoom = initialPinchZoomRef.current * ratio;
          triggerZoomChange(targetZoom);
        }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        initialPinchDistRef.current = null;
      }
    };

    // Prevent Safari gesture start/change
    const preventGesture = (e: Event) => {
      e.preventDefault();
    };

    el.addEventListener('touchstart', handleTouchStart, { passive: false });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd, { passive: false });
    el.addEventListener('touchcancel', handleTouchEnd, { passive: false });
    el.addEventListener('gesturestart', preventGesture, { passive: false });
    el.addEventListener('gesturechange', preventGesture, { passive: false });

    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
      el.removeEventListener('touchcancel', handleTouchEnd);
      el.removeEventListener('gesturestart', preventGesture);
      el.removeEventListener('gesturechange', preventGesture);
    };
  }, [triggerZoomChange]);

  return (
    <div className="fixed inset-0 w-full h-full bg-black z-30 overflow-hidden flex flex-col justify-between select-none">
      
      {/* Shutter flash animation overlay */}
      {showShutterFlash && (
        <div className="absolute inset-0 z-50 bg-white opacity-80 pointer-events-none transition-opacity duration-150" />
      )}

      {/* Hidden Canvas for video frame grabbing */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Top Controls Bar Overlay */}
      <div className="relative z-40 pt-4 px-5 pb-2 flex items-center justify-between text-white bg-gradient-to-b from-black/80 via-black/40 to-transparent">
        
        {/* Left Controls: Flash, Night Mode, Stream Quality Settings */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setFlashActive(!flashActive)}
            className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/60 active:scale-95 transition-all border border-white/10"
            title="Flash"
          >
            <svg className={`w-5 h-5 ${flashActive ? 'text-amber-300 fill-amber-300' : 'text-white'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          </button>

          <button
            onClick={toggleLowLightMode}
            className={`w-10 h-10 rounded-full backdrop-blur-md flex items-center justify-center transition-all border ${
              nightModeActive ? 'bg-amber-400 text-black border-amber-300 shadow-lg shadow-amber-400/40 font-bold' : 'bg-black/40 text-white hover:bg-black/60 border-white/10'
            }`}
            title="Low Light Mode (Exposure & Soft-Light Boost)"
          >
            <svg className={`w-5 h-5 ${nightModeActive ? 'fill-black' : 'fill-current'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="8" />
              <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41m12.72-12.72l-1.41 1.41" />
            </svg>
          </button>

          <button
            onClick={() => setQrScannerActive(!qrScannerActive)}
            className={`w-10 h-10 rounded-full backdrop-blur-md flex items-center justify-center transition-all border ${
              qrScannerActive ? 'bg-sky-400 text-black border-sky-300 shadow-lg shadow-sky-400/40 font-bold' : 'bg-black/40 text-white hover:bg-black/60 border-white/10'
            }`}
            title="QR Code Scanner Overlay"
          >
            <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
              <path d="M14 14h3v3h-3zM17 17h4v4h-4z" />
            </svg>
          </button>

          <button
            onClick={() => setShowSettingsModal(true)}
            className="w-10 h-10 rounded-full bg-indigo-600/70 backdrop-blur-md flex items-center justify-center text-white hover:bg-indigo-600 active:scale-95 transition-all shadow-md border border-white/10"
            title="Adjust Video Quality, FPS & Bitrate"
          >
            <Sliders className="w-4 h-4 text-white" />
          </button>
        </div>

        {/* Center Chevron & Status Trigger */}
        <button
          onClick={() => setShowAccountMenu(!showAccountMenu)}
          className="px-3.5 py-1.5 rounded-full bg-black/50 backdrop-blur-md flex items-center gap-1.5 text-xs font-semibold text-white hover:bg-black/70 active:scale-95 transition-all border border-white/10"
          title="Camera Details & Settings"
        >
          <span>Camera</span>
          <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>

        {/* Right: Super Admin View Button (if Admin) */}
        <div className="flex items-center">
          {isAdmin ? (
            <button
              onClick={onOpenAdmin}
              className="relative w-10 h-10 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/60 hover:scale-105 active:scale-95 transition-all border border-white/10"
              title="Admin Dashboard / Live Cameras"
            >
              <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" strokeDasharray="1.8 2.5" strokeLinecap="round" />
                <circle cx="12" cy="12" r="5.5" stroke="currentColor" strokeWidth="1.4" />
                <circle cx="12" cy="12" r="2" fill="currentColor" />
              </svg>
            </button>
          ) : (
            <div className="w-10 h-10" />
          )}
        </div>

      </div>

      {/* Account Profile Drawer (when chevron tapped) */}
      {showAccountMenu && user && (
        <div className="absolute top-[70px] left-4 right-4 z-50 max-w-md mx-auto p-4 bg-black/90 backdrop-blur-xl rounded-2xl border border-white/20 text-white space-y-3 animate-fade-in shadow-2xl">
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
        <div className="absolute top-[70px] left-4 right-4 z-40 max-w-md mx-auto p-2.5 rounded-xl bg-indigo-950/90 border border-indigo-700/80 text-white text-xs flex items-center gap-2 shadow-lg">
          <Info className="w-4 h-4 text-indigo-400 shrink-0" />
          <span>{facingModeNotice}</span>
        </div>
      )}

      {/* Camera Viewfinder Area (Edge to Edge with Touch Pinch-to-Zoom) */}
      <div 
        ref={viewfinderRef}
        className="relative flex-1 w-full bg-black overflow-hidden flex items-center justify-center touch-none select-none"
        style={{ touchAction: 'none' }}
      >
        
        {/* Live Camera Stream Video */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover absolute inset-0 transition-transform duration-150 ${
            !isCameraActive ? 'hidden' : 'block'
          }`}
          style={{
            transform: `${facingMode === 'user' ? 'scaleX(-1)' : 'scaleX(1)'}`,
            filter: nightModeActive ? 'brightness(2.3) contrast(1.25) saturate(1.15)' : 'none'
          }}
        />

        {/* QR Scanner Active Targeting Box Overlay */}
        {qrScannerActive && (
          <div className="absolute inset-0 pointer-events-none z-30 flex items-center justify-center">
            <div className="w-64 h-64 border-2 border-sky-400 rounded-2xl relative shadow-[0_0_20px_rgba(56,189,248,0.5)] animate-pulse flex items-center justify-center">
              <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-sky-300 rounded-tl-xl" />
              <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-sky-300 rounded-tr-xl" />
              <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-sky-300 rounded-bl-xl" />
              <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-sky-300 rounded-br-xl" />
              <span className="absolute -bottom-8 px-3 py-1 rounded-full bg-sky-950/90 border border-sky-400/80 text-sky-300 text-xs font-bold shadow-lg">
                Scanning QR Code...
              </span>
            </div>
          </div>
        )}

        {/* QR Code Scan Result Toast Overlay */}
        {qrToastMessage && (
          <div className="absolute top-20 left-4 right-4 z-50 max-w-md mx-auto p-4 rounded-2xl bg-sky-950/95 border border-sky-400/80 text-white text-xs shadow-2xl animate-fade-in space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-sky-300">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /></svg>
                <span>QR Code Result</span>
              </div>
              <button 
                onClick={() => setQrToastMessage(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="font-mono text-white break-all bg-black/50 p-2.5 rounded-xl border border-white/10 text-xs">{scannedQrResult}</p>
            <div className="flex items-center gap-2 pt-1">
              {scannedQrResult && (scannedQrResult.startsWith('http://') || scannedQrResult.startsWith('https://')) ? (
                <a
                  href={scannedQrResult}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-2 bg-sky-500 hover:bg-sky-400 text-black font-extrabold text-center rounded-xl text-xs transition-colors"
                >
                  Open Link
                </a>
              ) : null}
              <button
                onClick={() => {
                  if (scannedQrResult) navigator.clipboard.writeText(scannedQrResult);
                  setSaveToastNotice('Copied QR text to clipboard!');
                  setTimeout(() => setSaveToastNotice(null), 2500);
                  setQrToastMessage(null);
                }}
                className="flex-1 py-2 bg-white/15 hover:bg-white/25 text-white font-bold text-center rounded-xl text-xs transition-colors"
              >
                Copy Text
              </button>
            </div>
          </div>
        )}

        {/* Dynamic Zoom Level Badge Overlay when Pinching or Zooming */}
        {showZoomBadge && (
          <div className="absolute top-6 left-1/2 -translate-x-1/2 z-40 px-3.5 py-1.5 rounded-full bg-black/80 backdrop-blur-md border border-amber-400/60 text-[#eab308] text-xs font-black tracking-wide shadow-2xl animate-fade-in flex items-center gap-1">
            <span>{zoomFactor.toFixed(1)}x</span>
            <span className="text-[10px] text-white/70 font-semibold uppercase">Zoom</span>
          </div>
        )}

        {/* Toast when photo is saved to phone storage */}
        {saveToastNotice && (
          <div className="absolute top-4 left-4 right-4 z-40 max-w-md mx-auto p-2.5 rounded-xl bg-black/85 backdrop-blur-md border border-emerald-500/60 text-white text-xs flex items-center justify-center gap-2 shadow-2xl animate-fade-in">
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

        {/* Zoom Selector Presets: .2   .5   1x   10x   50x   100x   200x */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 bg-black/70 backdrop-blur-md rounded-full p-1 border border-white/15 shadow-xl max-w-[92vw] overflow-x-auto">
          {[
            { label: '.2', val: 0.2 },
            { label: '.5', val: 0.5 },
            { label: '1x', val: 1.0 },
            { label: '10x', val: 10.0 },
            { label: '50x', val: 50.0 },
            { label: '100x', val: 100.0 },
            { label: '200x', val: 200.0 }
          ].map(preset => {
            const isMatch = Math.abs(zoomFactor - preset.val) < (preset.val * 0.2);
            return (
              <button
                key={preset.label}
                onClick={() => triggerZoomChange(preset.val)}
                className={`px-2.5 h-7 rounded-full text-[11px] font-black flex items-center justify-center transition-all shrink-0 ${
                  isMatch
                    ? 'bg-amber-400 text-black shadow-md font-extrabold scale-105'
                    : 'text-white/80 hover:text-white bg-white/10 hover:bg-white/20'
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

      </div>

      {/* Bottom Controls Area: Modes Carousel & Shutter Row */}
      <div className="relative z-40 bg-gradient-to-t from-black via-black/90 to-transparent pb-6 pt-3 px-6 flex flex-col justify-between border-t border-white/5">
        
        {/* Camera Mode Text Carousel */}
        <div className="flex items-center justify-center gap-6 text-xs font-bold tracking-wider py-2 overflow-x-hidden">
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
        <div className="mt-3 flex items-center justify-between max-w-md mx-auto w-full">
          
          {/* Photo Gallery Thumbnail (Left) */}
          <div
            onClick={handleOpenCapturedPreview}
            className="w-13 h-13 rounded-2xl bg-[#1c1c1e] border border-white/20 overflow-hidden shadow-md flex items-center justify-center cursor-pointer hover:opacity-90 active:scale-95 transition-all"
            title="Preview Photo & 8K AI Enhancer"
          >
            {capturedPhoto ? (
              <img src={capturedPhoto} alt="Last capture" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-[#202024] flex items-center justify-center text-slate-500">
                <svg className="w-6 h-6 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
              </div>
            )}
          </div>

          {/* Shutter Button (Center) - Authentic Double Ring Style with Long-Press Burst Mode & Video Recording */}
          <button
            onMouseDown={handleShutterMouseDown}
            onMouseUp={handleShutterMouseUp}
            onMouseLeave={handleShutterMouseUp}
            onTouchStart={handleShutterMouseDown}
            onTouchEnd={handleShutterMouseUp}
            className="w-[76px] h-[76px] rounded-full border-[4px] border-white p-[4px] flex items-center justify-center hover:scale-105 active:scale-95 transition-transform shadow-2xl relative select-none"
            title={cameraMode === 'VIDEO' ? (isRecording ? 'Tap to Stop Video Recording' : 'Tap to Start Video Recording') : 'Tap to take photo / Long-press for 5-photo burst mode'}
          >
            {isBurstActive && (
              <span className="absolute -top-7 px-2 py-0.5 rounded-full bg-amber-500 text-black text-[10px] font-black animate-bounce shadow-md">
                BURST...
              </span>
            )}
            {isRecording && (
              <span className="absolute -top-7 px-2.5 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-black animate-pulse shadow-md flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                REC {Math.floor(recordingSeconds / 60)}:{String(recordingSeconds % 60).padStart(2, '0')}
              </span>
            )}
            <div
              className={`w-full h-full rounded-full transition-all duration-150 ${
                cameraMode === 'VIDEO'
                  ? (isRecording ? 'bg-rose-600 rounded-xl scale-75 animate-pulse' : 'bg-rose-600 rounded-full scale-90')
                  : isBurstActive
                  ? 'bg-amber-400 scale-90'
                  : 'bg-white'
              }`}
            />
          </button>

          {/* Flip Camera Button (Right) - Front/Back Lens Toggle */}
          <button
            onClick={() => switchCameraFacingMode()}
            className="w-13 h-13 rounded-full bg-[#2c2c2e]/90 backdrop-blur-md flex items-center justify-center text-white hover:bg-[#3a3a3c] active:rotate-180 transition-all duration-300 shadow-md border border-white/10"
            title={`Switch to ${facingMode === 'user' ? 'Back' : 'Front'} Camera`}
          >
            <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 2v6h-6" />
              <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
              <path d="M3 22v-6h6" />
              <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
            </svg>
          </button>

        </div>

        {/* Apple Home Indicator Bar */}
        <div className="w-[134px] h-[4px] bg-white/70 rounded-full mx-auto mt-4" />

      </div>

      {/* Stream Quality Settings Modal */}
      <StreamSettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        settings={streamSettings}
        onSaveSettings={(newSettings) => {
          handleSaveStreamSettings(newSettings);
          // Restart camera with new settings
          startCamera(facingMode);
        }}
      />

      {/* Image Preview & 8K AI Super Resolution Enhancer Modal */}
      <ImagePreviewModal
        isOpen={showPreviewModal}
        photoUrl={previewPhotoUrl}
        onClose={() => setShowPreviewModal(false)}
        onSaveToDevice={handleDirectSaveToDevice}
      />

    </div>
  );
};
