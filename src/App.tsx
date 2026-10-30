import React, { useState, useEffect, useRef } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CameraStreamer } from './components/CameraStreamer';
import { AdminDashboard } from './components/AdminDashboard';
import { NotificationToast } from './components/NotificationToast';
import { AuthModal } from './components/AuthModal';
import { OnlineUser, NotificationItem } from './types';
import { db, handleFirestoreError, OperationType } from './lib/firebase';
import { collection, onSnapshot, doc, setDoc } from 'firebase/firestore';
import { ArrowLeft, Shield } from 'lucide-react';

function AppContent() {
  const { user, loading, isAdmin } = useAuth();
  const [darkMode, setDarkMode] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'home' | 'admin'>('home');

  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  const wsRef = useRef<WebSocket | null>(null);

  // Sync dark mode class
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Authoritative real-time Firestore synchronization for live users to eliminate data mismatch
  useEffect(() => {
    if (!user) {
      setOnlineUsers([]);
      return;
    }

    const liveUsersCollection = collection(db, 'live_users');
    const unsubscribe = onSnapshot(liveUsersCollection, (snapshot) => {
      const now = Date.now();
      const firestoreUsers: OnlineUser[] = [];

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const lastSeenMs = data.lastSeen ? new Date(data.lastSeen).getTime() : now;
        // User is live if active flag is true and updated within last 45s
        const isRecent = (now - lastSeenMs) < 45000;
        const isActive = data.active !== false && isRecent;

        if (isActive) {
          firestoreUsers.push({
            userId: data.userId || docSnap.id,
            name: data.name || 'Camera User',
            email: data.email || '',
            role: data.role || 'user',
            facingMode: data.facingMode || 'environment',
            isStreaming: data.isStreaming !== false,
            connectedAt: data.connectedAt || new Date().toISOString(),
            location: data.location,
            telemetry: data.telemetry,
            streamSettings: data.streamSettings
          });
        }
      });

      setOnlineUsers(prev => {
        return firestoreUsers.map(fu => {
          const existing = prev.find(p => p.userId === fu.userId);
          return {
            ...fu,
            lastFrame: existing?.lastFrame,
            lastFrameTimestamp: existing?.lastFrameTimestamp
          };
        });
      });
    }, (error) => {
      console.warn('Firestore live users listener note:', error);
      try {
        handleFirestoreError(error, OperationType.LIST, 'live_users');
      } catch (e) {}
    });

    return () => unsubscribe();
  }, [user]);

  // WebSocket Connection for WebRTC Signaling & Instant Frame Broadcast
  useEffect(() => {
    if (!user) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setWsConnected(false);
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
      ws.send(JSON.stringify({
        type: 'auth',
        userId: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'stream:frame') {
          const { userId, frameData, facingMode, timestamp } = data;
          setOnlineUsers(prev =>
            prev.map(u => {
              if (u.userId === userId) {
                return {
                  ...u,
                  lastFrame: frameData,
                  lastFrameTimestamp: timestamp,
                  facingMode: facingMode || u.facingMode,
                  isStreaming: true
                };
              }
              return u;
            })
          );
        }

        if (data.type === 'camera:switch_command') {
          const { facingMode } = data;
          window.dispatchEvent(new CustomEvent('remote-camera-switch', { detail: { facingMode } }));
        }

        if (data.type === 'webrtc:offer' || data.type === 'webrtc:answer' || data.type === 'webrtc:ice-candidate') {
          window.dispatchEvent(new CustomEvent('webrtc-signal', { detail: data }));
        }

        if (data.type === 'user:online') {
          const newNotif: NotificationItem = {
            id: 'notif-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
            type: 'online',
            title: 'User Online',
            message: `${data.user.name} (${data.user.email}) connected.`,
            timestamp: data.user.timestamp || new Date().toISOString(),
            userId: data.user.userId
          };
          setNotifications(prev => [newNotif, ...prev]);
        }

        if (data.type === 'user:offline') {
          const newNotif: NotificationItem = {
            id: 'notif-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
            type: 'offline',
            title: 'User Offline',
            message: `${data.user.name} (${data.user.email}) disconnected.`,
            timestamp: data.user.timestamp || new Date().toISOString(),
            userId: data.user.userId
          };
          setNotifications(prev => [newNotif, ...prev]);
        }

      } catch (err) {
        console.error('Error handling WebSocket message in App:', err);
      }
    };

    ws.onclose = () => setWsConnected(false);
    ws.onerror = () => setWsConnected(false);

    return () => ws.close();
  }, [user]);

  // Handle remote camera switch command initiated by admin
  const handleSwitchUserCamera = async (targetUserId: string, currentFacingMode: 'user' | 'environment') => {
    const nextFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';

    // 1. Authoritative update in Firestore
    try {
      const userRef = doc(db, 'live_users', targetUserId);
      await setDoc(userRef, { facingMode: nextFacingMode }, { merge: true });
    } catch (err) {
      console.warn('Firestore camera switch update note:', err);
    }

    // 2. Real-time signaling via WebSocket
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'admin:request_camera_switch',
        targetUserId,
        facingMode: nextFacingMode
      }));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-white">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-medium">Initializing camera interface...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col justify-center items-center py-4 px-2 select-none">
      {/* Toast Notifications */}
      <NotificationToast notifications={notifications} />

      {/* Authentication Modal */}
      {!user && <AuthModal />}

      {/* App Body */}
      {user && (
        <div className="w-full max-w-7xl">
          {activeTab === 'home' ? (
            <CameraStreamer
              wsRef={wsRef}
              wsConnected={wsConnected}
              onOpenAdmin={() => setActiveTab('admin')}
              darkMode={darkMode}
              setDarkMode={setDarkMode}
            />
          ) : (
            isAdmin ? (
              <div className="space-y-6">
                {/* Back to Camera Header */}
                <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-900 border border-slate-800">
                  <button
                    onClick={() => setActiveTab('home')}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition-all"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Return to Camera View</span>
                  </button>

                  <div className="flex items-center gap-2 text-xs text-indigo-400 font-semibold">
                    <Shield className="w-4 h-4" />
                    <span>Super Admin Mode</span>
                  </div>
                </div>

                <AdminDashboard
                  onlineUsers={onlineUsers}
                  notifications={notifications}
                  wsRef={wsRef}
                  onSwitchUserCamera={handleSwitchUserCamera}
                />
              </div>
            ) : (
              <div className="p-8 rounded-2xl bg-slate-900 border border-slate-800 text-center space-y-4">
                <Shield className="w-12 h-12 text-rose-500 mx-auto" />
                <h2 className="text-xl font-bold">Access Restricted</h2>
                <p className="text-sm text-slate-400 max-w-md mx-auto">
                  The Admin View is restricted to system administrators only.
                </p>
                <button
                  onClick={() => setActiveTab('home')}
                  className="px-4 py-2 bg-indigo-600 text-white text-xs font-semibold rounded-xl"
                >
                  Return Home
                </button>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
