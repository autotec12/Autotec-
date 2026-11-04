import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut as fbSignOut,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, googleProvider, db, cleanFirestoreData } from '../lib/firebase';
import { UserProfile, UserRole } from '../types';

export const OFFICIAL_ADMIN_EMAIL = 'autotecrastreio@gmail.com';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  role: UserRole;
  isAdmin: boolean;
  loading: boolean;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  setSimulatedRole?: (role: UserRole) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  role: 'operator',
  isAdmin: false,
  loading: true,
  loginWithEmail: async () => {},
  resetPassword: async () => {},
  loginWithGoogle: async () => {},
  logout: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        const userEmail = (currentUser.email || '').toLowerCase().trim();
        const isAdminEmail = userEmail === OFFICIAL_ADMIN_EMAIL.toLowerCase();

        // Enforce Exclusive Owner Access: Reject any account other than autotecrastreio@gmail.com
        if (!isAdminEmail) {
          console.warn('Tentativa de acesso não autorizada detectada:', userEmail);
          try {
            await fbSignOut(auth);
          } catch {
            // Ignore signout error
          }
          setUser(null);
          setProfile(null);
          setLoading(false);
          return;
        }

        setUser(currentUser);

        try {
          const userDocRef = doc(db, 'users', currentUser.uid);
          const userSnap = await getDoc(userDocRef);

          if (userSnap.exists()) {
            const data = userSnap.data();

            setProfile({
              uid: currentUser.uid,
              email: currentUser.email || '',
              displayName: currentUser.displayName || data.displayName || 'Proprietário AUTOTEC',
              role: 'admin',
              photoURL: currentUser.photoURL || undefined,
              active: true,
            });

            // Ensure admin document exists in admins collection for firestore rules
            setDoc(doc(db, 'admins', currentUser.uid), {
              email: userEmail,
              assignedAt: new Date().toISOString(),
            }, { merge: true }).catch(() => {});
          } else {
            // First time login - bootstrap owner profile in Firestore
            const newProfile: UserProfile = {
              uid: currentUser.uid,
              email: currentUser.email || '',
              displayName: currentUser.displayName || 'Proprietário AUTOTEC',
              role: 'admin',
              photoURL: currentUser.photoURL || undefined,
              active: true,
            };

            await setDoc(userDocRef, cleanFirestoreData({
              ...newProfile,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }));

            await setDoc(doc(db, 'admins', currentUser.uid), {
              email: userEmail,
              assignedAt: new Date().toISOString(),
            }, { merge: true }).catch(() => {});

            setProfile(newProfile);
          }
        } catch (err) {
          console.warn('Notice loading user profile from Firestore:', err);
          setProfile({
            uid: currentUser.uid,
            email: currentUser.email || '',
            displayName: 'Proprietário AUTOTEC',
            role: 'admin',
            active: true,
          });
        }
      } else {
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const loginWithEmail = async (email: string, password: string) => {
    const cleanEmail = email.trim().toLowerCase();
    if (cleanEmail !== OFFICIAL_ADMIN_EMAIL.toLowerCase()) {
      throw new Error(
        `Acesso exclusivo: Este sistema é de uso pessoal e restrito do proprietário (${OFFICIAL_ADMIN_EMAIL}). Acesso não autorizado para outros usuários.`
      );
    }
    try {
      await signInWithEmailAndPassword(auth, cleanEmail, password);
    } catch (error) {
      console.error('Email login error:', error);
      throw error;
    }
  };

  const resetPassword = async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email.trim());
    } catch (error) {
      console.error('Password reset error:', error);
      throw error;
    }
  };

  const loginWithGoogle = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Google login error:', error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      await fbSignOut(auth);
      setProfile(null);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const role = profile?.role || 'operator';
  const isAdmin = role === 'admin';

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        role,
        isAdmin,
        loading,
        loginWithEmail,
        resetPassword,
        loginWithGoogle,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
