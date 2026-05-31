import { createContext, useContext } from 'react';

export type JimengAuthInfo = {
  loggedIn: boolean;
  credit: number | string;
  vipLevel: string;
  userName: string;
};

export type JimengAuthContextValue = {
  ensureJimengReady: () => Promise<void>;
  loginOpen: boolean;
  closeLogin: () => void;
  openLogin: () => Promise<void>;
  authInfo: JimengAuthInfo;
  refreshAuthInfo: () => Promise<void>;
  logout: () => Promise<void>;
  relogin: () => Promise<void>;
  installOpencli: () => Promise<{ ok: boolean; message: string }>;
  setupWSL: () => Promise<{ ok: boolean; message: string }>;
};

export const DEFAULT_AUTH_INFO: JimengAuthInfo = {
  loggedIn: false,
  credit: '?',
  vipLevel: '',
  userName: '',
};

export const JimengAuthContext = createContext<JimengAuthContextValue | null>(null);

export function useJimengAuth(): JimengAuthContextValue {
  const context = useContext(JimengAuthContext);
  if (!context) {
    throw new Error('useJimengAuth must be used inside JimengAuthProvider');
  }
  return context;
}
