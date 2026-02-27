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

function applyTheme(themeName: string) {
  const preset = THEME_PRESETS[themeName as keyof typeof THEME_PRESETS];
  if (!preset) return;
  const root = document.documentElement;
  Object.entries(preset.colors).forEach(([varName, value]) => {
    root.style.setProperty(varName, value);
  });
}

export function SiteSettingsProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearance] = useState<AppearanceSettings | null>(null);
  const [banners, setBanners] = useState<BannerSettings | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

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

        if (ban) setBanners(ban);
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
