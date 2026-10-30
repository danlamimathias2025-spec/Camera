import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Lock, Mail, User as UserIcon, ArrowRight } from 'lucide-react';

export const AuthModal: React.FC = () => {
  const { loginWithGoogle, login, register } = useAuth();
  const [isRegistering, setIsRegistering] = useState<boolean>(false);

  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [name, setName] = useState<string>('');

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [googleSubmitting, setGoogleSubmitting] = useState<boolean>(false);

  const handleGoogleSignIn = async () => {
    setError(null);
    setGoogleSubmitting(true);
    const res = await loginWithGoogle();
    if (!res.success) {
      setError(res.error || 'Google sign-in failed');
    }
    setGoogleSubmitting(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    if (isRegistering) {
      if (!name.trim()) {
        setError('Please enter your full name');
        setSubmitting(false);
        return;
      }
      const res = await register(name, email, password);
      if (!res.success) {
        setError(res.error || 'Registration failed');
      }
    } else {
      const res = await login(email, password);
      if (!res.success) {
        setError(res.error || 'Login failed');
      }
    }
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-8 shadow-2xl space-y-6 animate-scale-up">
        {/* Header Icon & Title */}
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <img
              src="/assets/aistudio/images__4__e539a736.jpeg"
              alt="Camera App Icon"
              className="w-16 h-16 rounded-2xl shadow-xl shadow-black/40 object-cover border border-slate-200 dark:border-slate-700/60"
            />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
              {isRegistering ? 'Create Your Account' : 'Sign in your Camera'}
            </h2>
            <p className="text-xs font-semibold tracking-wider text-slate-500 dark:text-slate-400 uppercase mt-1">
              {isRegistering 
                ? 'Join the live camera portal to stream your camera and connect' 
                : 'CAMERA'}
            </p>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-medium">
            {error}
          </div>
        )}

        {/* 1-Click Google Sign In (Firebase) */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={googleSubmitting || submitting}
          className="w-full py-3 px-4 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-800 dark:text-white font-medium rounded-xl shadow-sm transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          <span>{googleSubmitting ? 'Connecting...' : 'Sign in with Google'}</span>
        </button>

        <div className="relative flex items-center justify-center">
          <div className="border-t border-slate-200 dark:border-slate-800 w-full"></div>
          <span className="bg-white dark:bg-slate-900 px-3 text-[11px] uppercase tracking-wider text-slate-400 font-semibold absolute">
            or with email
          </span>
        </div>

        {/* Auth Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {isRegistering && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Full Name
              </label>
              <div className="relative">
                <UserIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  required
                  placeholder="e.g. Mathias Danlami"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Email Address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="email"
                required
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting || googleSubmitting}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-2"
          >
            {submitting ? 'Authenticating...' : (isRegistering ? 'Create Account' : 'Sign In')}
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Toggle Register/Login */}
        <div className="text-center pt-2 border-t border-slate-100 dark:border-slate-800">
          <button
            onClick={() => {
              setIsRegistering(!isRegistering);
              setError(null);
            }}
            className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            {isRegistering ? 'Already have an account? Sign in' : "Don't have an account? Register here"}
          </button>
        </div>
      </div>
    </div>
  );
};
