'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { AppearanceSettings, BannerSettings } from '@/types';
import { THEME_PRESETS, DEFAULT_THEME } from '@/lib/theme-presets';
import { api } from '@/lib/api';

interface SiteSettingsContextType {
  appearance: AppearanceSettings | null;
  banners: BannerSettings | null;
  isLoaded: boolean;
}

const SiteSettingsContext = createContext<SiteSettingsContextType>({
  appearance: null,
  banners: null,
  isLoaded: false,
});

export const useSiteSettings = () => useContext(SiteSettingsContext);

const THEME_CACHE_KEY = 'naturelite-active-theme';
const BANNER_CACHE_KEY = 'naturelite-banner-settings';
const BANNER_CACHE_TTL = 15 * 60 * 1000; // 15 minutes

function applyTheme(themeName: string) {
  const preset = THEME_PRESETS[themeName as keyof typeof THEME_PRESETS];
  if (!preset) return;
  const root = document.documentElement;
  Object.entries(preset.colors).forEach(([varName, value]) => {
    root.style.setProperty(varName, value);
  });
}

function readBannerCache(): BannerSettings | null {
  try {
    const raw = localStorage.getItem(BANNER_CACHE_KEY);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw) as { data: BannerSettings; ts: number };
    if (Date.now() - ts > BANNER_CACHE_TTL) return null;
    return data;
  } catch {
    return null;
  }
}

function writeBannerCache(banners: BannerSettings): void {
  try {
    localStorage.setItem(BANNER_CACHE_KEY, JSON.stringify({ data: banners, ts: Date.now() }));
  } catch {}
}

export function SiteSettingsProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearance] = useState<AppearanceSettings | null>(null);
  // Read banner cache synchronously on first render so images can preload without waiting for API
  const [banners, setBanners] = useState<BannerSettings | null>(() => {
    if (typeof window === 'undefined') return null;
    return readBannerCache();
  });
  const [isLoaded, setIsLoaded] = useState(() => {
    if (typeof window === 'undefined') return false;
    return readBannerCache() !== null;
  });

  // Apply cached theme immediately to prevent flash
  useEffect(() => {
    try {
      const cached = localStorage.getItem(THEME_CACHE_KEY);
      if (cached && cached !== DEFAULT_THEME) {
        applyTheme(cached);
      }
    } catch {
      // localStorage not available
    }
  }, []);

  useEffect(() => {
    async function fetchSettings() {
      try {
        const publicSettings = await api.getPublicSettings();

        const app = publicSettings.appearance as AppearanceSettings | undefined;
        const ban = publicSettings.banners as BannerSettings | undefined;

        if (app) {
          setAppearance(app);
          applyTheme(app.activeTheme || DEFAULT_THEME);
          try {
            localStorage.setItem(THEME_CACHE_KEY, app.activeTheme || DEFAULT_THEME);
          } catch {
            // ignore
          }
        }

        if (ban) {
          setBanners(ban);
          writeBannerCache(ban);
        }
      } catch (error) {
        console.error('Failed to load site settings:', error);
      } finally {
        setIsLoaded(true);
      }
    }
    fetchSettings();
  }, []);

  return (
    <SiteSettingsContext.Provider value={{ appearance, banners, isLoaded }}>
      {children}
    </SiteSettingsContext.Provider>
  );
}
