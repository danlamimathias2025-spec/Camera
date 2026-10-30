import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '../types';
import { 
  auth, 
  db, 
  googleProvider, 
  handleFirestoreError, 
  OperationType 
} from '../lib/firebase';
import {
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  loginWithGoogle: () => Promise<{ success: boolean; error?: string }>;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (name: string, email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const ADMIN_EMAIL = 'danlamimathias2025@gmail.com';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Sync user profile with Firestore
  const syncUserProfile = async (fbUser: FirebaseUser, displayNameFallback?: string): Promise<User> => {
    const isEmailAdmin = fbUser.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
    const defaultRole: 'admin' | 'user' = isEmailAdmin ? 'admin' : 'user';
    const userDocRef = doc(db, 'users', fbUser.uid);

    let role: 'admin' | 'user' = defaultRole;
    let name = fbUser.displayName || displayNameFallback || fbUser.email?.split('@')[0] || 'User';

    try {
      const snap = await getDoc(userDocRef);
      if (snap.exists()) {
        const data = snap.data();
        if (data.role === 'admin' || isEmailAdmin) {
          role = 'admin';
        } else {
          role = data.role || 'user';
        }
        if (data.name) {
          name = data.name;
        }
      } else {
        // Create initial user doc in Firestore
        const newUserProfile = {
          id: fbUser.uid,
          email: fbUser.email || '',
          name,
          role,
          createdAt: new Date().toISOString()
        };
        await setDoc(userDocRef, newUserProfile, { merge: true });
      }
    } catch (err) {
      console.warn('Firestore profile sync note (continuing with auth):', err);
      try {
        handleFirestoreError(err, OperationType.GET, `users/${fbUser.uid}`);
      } catch (e) {
        // Logged error
      }
    }

    const appUser: User = {
      id: fbUser.uid,
      email: fbUser.email || '',
      name,
      role
    };

    return appUser;
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        try {
          const appUser = await syncUserProfile(fbUser);
          setUser(appUser);
        } catch (e) {
          console.error('Error establishing user state:', e);
          const isEmailAdmin = fbUser.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
          setUser({
            id: fbUser.uid,
            email: fbUser.email || '',
            name: fbUser.displayName || fbUser.email?.split('@')[0] || 'User',
            role: isEmailAdmin ? 'admin' : 'user'
          });
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const loginWithGoogle = async (): Promise<{ success: boolean; error?: string }> => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const appUser = await syncUserProfile(result.user);
      setUser(appUser);
      return { success: true };
    } catch (err: any) {
      console.error('Google Sign-In failed:', err);
      return { success: false, error: err.message || 'Google Sign-In failed' };
    }
  };

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const result = await signInWithEmailAndPassword(auth, email.trim(), password);
      const appUser = await syncUserProfile(result.user);
      setUser(appUser);
      return { success: true };
    } catch (err: any) {
      console.error('Firebase login error:', err);
      let message = err.message || 'Login failed';
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        message = 'Invalid email or password. You can also sign in with Google.';
      } else if (err.code === 'auth/operation-not-allowed') {
        message = 'Email/password sign-in is disabled. Please use "Sign in with Google".';
      }
      return { success: false, error: message };
    }
  };

  const register = async (name: string, email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const result = await createUserWithEmailAndPassword(auth, email.trim(), password);
      if (result.user) {
        await updateProfile(result.user, { displayName: name.trim() });
      }
      const appUser = await syncUserProfile(result.user, name.trim());
      setUser(appUser);
      return { success: true };
    } catch (err: any) {
      console.error('Firebase registration error:', err);
      let message = err.message || 'Registration failed';
      if (err.code === 'auth/email-already-in-use') {
        message = 'This email is already in use. Please sign in instead.';
      } else if (err.code === 'auth/weak-password') {
        message = 'Password should be at least 6 characters.';
      } else if (err.code === 'auth/operation-not-allowed') {
        message = 'Email registration is disabled in Firebase console. Please use "Sign in with Google".';
      }
      return { success: false, error: message };
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      setUser(null);
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const isAdmin = user?.role === 'admin' || user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();

  return (
    <AuthContext.Provider value={{ user, loading, loginWithGoogle, login, register, logout, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
