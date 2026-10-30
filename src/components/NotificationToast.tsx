import React, { useEffect, useState } from 'react';
import { NotificationItem } from '../types';
import { UserCheck, UserX, X } from 'lucide-react';

interface NotificationToastProps {
  notifications: NotificationItem[];
}

export const NotificationToast: React.FC<NotificationToastProps> = ({ notifications }) => {
  const [activeToasts, setActiveToasts] = useState<NotificationItem[]>([]);

  useEffect(() => {
    if (notifications.length > 0) {
      const latest = notifications[0];
      // Avoid duplicate toasts if already shown
      setActiveToasts(prev => {
        if (prev.some(t => t.id === latest.id)) return prev;
        return [latest, ...prev].slice(0, 3);
      });

      // Auto dismiss toast after 5s
      const timer = setTimeout(() => {
        setActiveToasts(prev => prev.filter(t => t.id !== latest.id));
      }, 5000);

      return () => clearTimeout(timer);
    }
  }, [notifications]);

  const dismissToast = (id: string) => {
    setActiveToasts(prev => prev.filter(t => t.id !== id));
  };

  if (activeToasts.length === 0) return null;

  return (
    <div className="fixed top-20 right-4 z-50 space-y-2 max-w-sm w-full pointer-events-none">
      {activeToasts.map(toast => (
        <div
          key={toast.id}
          className={`pointer-events-auto p-4 rounded-2xl border shadow-xl backdrop-blur-md flex items-start gap-3 transition-all animate-bounce-subtle ${
            toast.type === 'online'
              ? 'bg-emerald-950/90 border-emerald-800 text-white'
              : 'bg-rose-950/90 border-rose-800 text-white'
          }`}
        >
          <div className={`p-2 rounded-xl shrink-0 ${toast.type === 'online' ? 'bg-emerald-800/60' : 'bg-rose-800/60'}`}>
            {toast.type === 'online' ? <UserCheck className="w-5 h-5 text-emerald-300" /> : <UserX className="w-5 h-5 text-rose-300" />}
          </div>

          <div className="flex-1 space-y-0.5">
            <h4 className="text-xs font-bold">{toast.title}</h4>
            <p className="text-xs text-slate-200">{toast.message}</p>
            <span className="text-[10px] text-slate-400 font-mono block pt-0.5">
              {new Date(toast.timestamp).toLocaleTimeString()}
            </span>
          </div>

          <button
            onClick={() => dismissToast(toast.id)}
            className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
};
