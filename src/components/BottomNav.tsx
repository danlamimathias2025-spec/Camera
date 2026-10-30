import React from 'react';
import { Camera, Shield } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface BottomNavProps {
  activeTab: 'home' | 'admin';
  setActiveTab: (tab: 'home' | 'admin') => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, setActiveTab }) => {
  const { isAdmin } = useAuth();

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 py-2 px-4 shadow-lg md:hidden">
      <div className="max-w-md mx-auto flex items-center justify-around">
        <button
          onClick={() => setActiveTab('home')}
          className={`flex flex-col items-center gap-1 py-1 px-4 rounded-xl transition-all ${
            activeTab === 'home'
              ? 'text-indigo-600 dark:text-indigo-400 font-semibold'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Camera className="w-5 h-5" />
          <span className="text-xs">My Camera</span>
        </button>

        {isAdmin && (
          <button
            onClick={() => setActiveTab('admin')}
            className={`flex flex-col items-center gap-1 py-1 px-4 rounded-xl transition-all ${
              activeTab === 'admin'
                ? 'text-indigo-600 dark:text-indigo-400 font-semibold'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Shield className="w-5 h-5" />
            <span className="text-xs">Admin Monitor</span>
          </button>
        )}
      </div>
    </div>
  );
};
