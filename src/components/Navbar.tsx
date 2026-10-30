import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Shield, LogOut, Sun, Moon, User as UserIcon } from 'lucide-react';

interface NavbarProps {
  darkMode: boolean;
  setDarkMode: (val: boolean | ((prev: boolean) => boolean)) => void;
  activeTab: 'home' | 'admin';
  setActiveTab: (tab: 'home' | 'admin') => void;
}

export const Navbar: React.FC<NavbarProps> = ({ darkMode, setDarkMode, activeTab, setActiveTab }) => {
  const { user, logout, isAdmin } = useAuth();

  return (
    <header className="sticky top-0 z-40 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Brand Wordmark */}
        <div className="flex items-center gap-3 shrink-0">
          <img
            src="/assets/aistudio/images__4__e539a736.jpeg"
            alt="Camera App"
            className="w-9 h-9 rounded-xl object-cover shadow-sm border border-slate-200 dark:border-slate-800"
          />
          <div>
            <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
              Camera
            </span>
          </div>
        </div>

        {/* Zone 2: Navigation Links (Desktop) */}
        {user && (
          <nav className="hidden md:flex items-center gap-2">
            <button
              onClick={() => setActiveTab('home')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                activeTab === 'home'
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              My Camera Feed
            </button>
            {isAdmin && (
              <button
                onClick={() => setActiveTab('admin')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                  activeTab === 'admin'
                    ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 font-semibold border border-indigo-200 dark:border-indigo-800'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Shield className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                Admin Dashboard
              </button>
            )}
          </nav>
        )}

        {/* Zone 3: Actions & Profile */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => setDarkMode(prev => !prev)}
            className="p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            title="Toggle theme"
            aria-label="Toggle theme"
          >
            {darkMode ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5 text-slate-600" />}
          </button>

          {user ? (
            <div className="flex items-center gap-3 pl-3 border-l border-slate-200 dark:border-slate-800">
              <div className="hidden sm:flex flex-col text-right">
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate max-w-[140px]">
                  {user.name}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[140px]">
                  {isAdmin ? 'Administrator' : user.email}
                </span>
              </div>
              <div className={`w-9 h-9 rounded-full flex items-center justify-center font-semibold text-sm ${
                isAdmin 
                  ? 'bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 ring-2 ring-indigo-500/30' 
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
              }`}>
                {isAdmin ? <Shield className="w-4 h-4" /> : user.name.charAt(0).toUpperCase()}
              </div>
              <button
                onClick={logout}
                className="p-2 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors"
                title="Sign Out"
                aria-label="Sign Out"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Not signed in</span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
