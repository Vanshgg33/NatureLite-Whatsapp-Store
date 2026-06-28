'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Palette,
  Check,
  Upload,
  X,
  Megaphone,
  Image as ImageIcon,
  Video,
  Plus,
  Trash2,
  GripVertical,
  Loader2,
} from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { THEME_PRESETS } from '@/lib/theme-presets';
import {
  ThemePresetName,
  AppearanceSettings,
  BannerSettings,
  HeroBanner,
  PromoBanner,
} from '@/types';
import { useToast } from '@/components/ui/use-toast';

const SWATCH_KEYS = [
  '--brand-green',
  '--brand-mustard',
  '--brand-cream',
  '--brand-charcoal',
  '--brand-terracotta',
] as const;

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export default function AppearancePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: allSettings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.getSettings(),
  });

  const appearance = (allSettings?.appearance as AppearanceSettings | undefined) ?? {
    activeTheme: 'forest-green' as ThemePresetName,
    logoUrl: '',
    logoPublicId: '',
  };

  const bannerSettings = (allSettings?.banners as BannerSettings | undefined) ?? {
    heroBanners: [],
    announcementBar: {
      enabled: false,
      text: '',
      linkText: '',
      linkUrl: '',
      backgroundColor: 'primary',
      textColor: 'white',
    },
  };

  // Local state
  const [selectedTheme, setSelectedTheme] = useState<ThemePresetName>('forest-green');
  const [logoUrl, setLogoUrl] = useState('');
  const [logoPublicId, setLogoPublicId] = useState('');
  const [uploading, setUploading] = useState(false);

  // Announcement bar state
  const [announcementEnabled, setAnnouncementEnabled] = useState(false);
  const [announcementText, setAnnouncementText] = useState('');
  const [announcementLinkText, setAnnouncementLinkText] = useState('');
  const [announcementLinkUrl, setAnnouncementLinkUrl] = useState('');
  const [announcementBg, setAnnouncementBg] = useState('primary');

  // Hero banners state
  const [heroBanners, setHeroBanners] = useState<HeroBanner[]>([]);
  const [showBannerForm, setShowBannerForm] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [editingBanner, setEditingBanner] = useState<HeroBanner>({
    id: '',
    imageUrl: '',
    imagePublicId: '',
    headline: '',
    subtitle: '',
    ctaText: 'Shop Now',
    ctaLink: '/products',
    isActive: true,
  });

  const [bannerMediaType, setBannerMediaType] = useState<'image' | 'video'>('image');
  const [bannerVideoUploading, setBannerVideoUploading] = useState(false);

  // Promo banners state
  const [promoBanners, setPromoBanners] = useState<PromoBanner[]>([]);
  const [showPromoForm, setShowPromoForm] = useState(false);
  const [promoUploading, setPromoUploading] = useState(false);
  const [promoVideoUploading, setPromoVideoUploading] = useState(false);
  const [promoMediaType, setPromoMediaType] = useState<'image' | 'video'>('image');
  const [editingPromo, setEditingPromo] = useState<PromoBanner>({
    id: '', imageUrl: '', imagePublicId: '', videoUrl: '', videoPublicId: '', linkUrl: '', label: '', isActive: true,
  });

  const bannerFileRef = useRef<HTMLInputElement>(null);
  const bannerVideoRef = useRef<HTMLInputElement>(null);
  const promoFileRef = useRef<HTMLInputElement>(null);
  const promoVideoRef = useRef<HTMLInputElement>(null);
  const logoFileRef = useRef<HTMLInputElement>(null);

  // Sync local state from fetched settings
  useEffect(() => {
    if (allSettings?.appearance) {
      const app = allSettings.appearance as AppearanceSettings;
      setSelectedTheme(app.activeTheme || 'forest-green');
      setLogoUrl(app.logoUrl || '');
      setLogoPublicId(app.logoPublicId || '');
    }
    if (allSettings?.banners) {
      const ban = allSettings.banners as BannerSettings;
      setHeroBanners(ban.heroBanners || []);
      setPromoBanners(ban.promoBanners || []);
      setAnnouncementEnabled(ban.announcementBar?.enabled || false);
      setAnnouncementText(ban.announcementBar?.text || '');
      setAnnouncementLinkText(ban.announcementBar?.linkText || '');
      setAnnouncementLinkUrl(ban.announcementBar?.linkUrl || '');
      setAnnouncementBg(ban.announcementBar?.backgroundColor || 'primary');
    }
  }, [allSettings]);

  // Mutations
  const appearanceMutation = useMutation({
    mutationFn: (data: Partial<AppearanceSettings>) =>
      api.updateSettings('appearance', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast({ title: 'Appearance settings saved' });
    },
    onError: () => toast({ title: 'Failed to save appearance settings', variant: 'destructive' }),
  });

  const bannersMutation = useMutation({
    mutationFn: (data: Partial<BannerSettings>) =>
      api.updateSettings('banners', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast({ title: 'Banner settings saved' });
    },
    onError: () => toast({ title: 'Failed to save banner settings', variant: 'destructive' }),
  });

  // Handlers
  const handleSaveTheme = () => {
    appearanceMutation.mutate({
      activeTheme: selectedTheme,
      logoUrl,
      logoPublicId,
    });
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const result = await api.uploadImage(file, 'branding');
      setLogoUrl(result.secureUrl);
      setLogoPublicId(result.publicId);
      appearanceMutation.mutate({
        activeTheme: selectedTheme,
        logoUrl: result.secureUrl,
        logoPublicId: result.publicId,
      });
    } catch {
      toast({ title: 'Failed to upload logo', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveLogo = () => {
    setLogoUrl('');
    setLogoPublicId('');
    appearanceMutation.mutate({
      activeTheme: selectedTheme,
      logoUrl: '',
      logoPublicId: '',
    });
  };

  const currentAnnouncementBar = {
    enabled: announcementEnabled,
    text: announcementText,
    linkText: announcementLinkText,
    linkUrl: announcementLinkUrl,
    backgroundColor: announcementBg,
    textColor: 'white',
  };

  const handleSaveAnnouncement = () => {
    bannersMutation.mutate({ heroBanners, promoBanners, announcementBar: currentAnnouncementBar });
  };

  const handleBannerImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBannerUploading(true);
    try {
      const result = await api.uploadImage(file, 'banners');
      setEditingBanner((prev) => ({
        ...prev,
        imageUrl: result.secureUrl,
        imagePublicId: result.publicId,
      }));
    } catch {
      toast({ title: 'Failed to upload banner image', variant: 'destructive' });
    } finally {
      setBannerUploading(false);
    }
  };

  const handleBannerVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBannerVideoUploading(true);
    try {
      const result = await api.uploadVideo(file, 'banners');
      setEditingBanner((prev) => ({
        ...prev,
        videoUrl: result.secureUrl,
        videoPublicId: result.publicId,
        imageUrl: '',
        imagePublicId: '',
      }));
    } catch {
      toast({ title: 'Failed to upload video', variant: 'destructive' });
    } finally {
      setBannerVideoUploading(false);
    }
  };

  const handleAddBanner = () => {
    if (!editingBanner.headline?.trim()) {
      toast({ title: 'Name is required', variant: 'destructive' });
      return;
    }
    const newBanner = { ...editingBanner, id: generateId() };
    const updated = [...heroBanners, newBanner];
    setHeroBanners(updated);
    setShowBannerForm(false);
    setBannerMediaType('image');
    setEditingBanner({
      id: '',
      imageUrl: '',
      imagePublicId: '',
      videoUrl: '',
      videoPublicId: '',
      headline: '',
      subtitle: '',
      ctaText: 'Shop Now',
      ctaLink: '/products',
      isActive: true,
    });
    bannersMutation.mutate({ heroBanners: updated, promoBanners, announcementBar: currentAnnouncementBar });
  };

  const handleDeleteBanner = (id: string) => {
    const updated = heroBanners.filter((b) => b.id !== id);
    setHeroBanners(updated);
    bannersMutation.mutate({ heroBanners: updated, promoBanners, announcementBar: currentAnnouncementBar });
  };

  const handleToggleBanner = (id: string) => {
    const updated = heroBanners.map((b) =>
      b.id === id ? { ...b, isActive: !b.isActive } : b
    );
    setHeroBanners(updated);
    bannersMutation.mutate({ heroBanners: updated, promoBanners, announcementBar: currentAnnouncementBar });
  };

  const handlePromoImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPromoUploading(true);
    try {
      const result = await api.uploadImage(file, 'banners');
      setEditingPromo((prev) => ({ ...prev, imageUrl: result.secureUrl, imagePublicId: result.publicId }));
    } catch {
      toast({ title: 'Failed to upload image', variant: 'destructive' });
    } finally {
      setPromoUploading(false);
    }
  };

  const handlePromoVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPromoVideoUploading(true);
    try {
      const result = await api.uploadVideo(file, 'banners');
      setEditingPromo((prev) => ({ ...prev, videoUrl: result.secureUrl, videoPublicId: result.publicId, imageUrl: '', imagePublicId: '' }));
    } catch {
      toast({ title: 'Failed to upload video', variant: 'destructive' });
    } finally {
      setPromoVideoUploading(false);
    }
  };

  const handleAddPromo = () => {
    if (!editingPromo.label?.trim()) {
      toast({ title: 'Label is required', variant: 'destructive' });
      return;
    }
    const newPromo = { ...editingPromo, id: generateId() };
    const updated = [...promoBanners, newPromo];
    setPromoBanners(updated);
    setShowPromoForm(false);
    setPromoMediaType('image');
    setEditingPromo({ id: '', imageUrl: '', imagePublicId: '', videoUrl: '', videoPublicId: '', linkUrl: '', label: '', isActive: true });
    bannersMutation.mutate({ heroBanners, promoBanners: updated, announcementBar: currentAnnouncementBar });
  };

  const handleDeletePromo = (id: string) => {
    const updated = promoBanners.filter((b) => b.id !== id);
    setPromoBanners(updated);
    bannersMutation.mutate({ heroBanners, promoBanners: updated, announcementBar: currentAnnouncementBar });
  };

  const handleTogglePromo = (id: string) => {
    const updated = promoBanners.map((b) => b.id === id ? { ...b, isActive: !b.isActive } : b);
    setPromoBanners(updated);
    bannersMutation.mutate({ heroBanners, promoBanners: updated, announcementBar: currentAnnouncementBar });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-green" />
      </div>
    );
  }

  return (
    <div>
      <Header title="Appearance" description="Customize your storefront theme and banners" />

      <div className="p-6 space-y-6">
        {/* Theme Selector */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card className="rounded-2xl shadow-sm">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Palette className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-lg font-semibold">Theme</CardTitle>
              </div>
              <CardDescription>Choose a color theme for your storefront</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                {(Object.entries(THEME_PRESETS) as [ThemePresetName, typeof THEME_PRESETS[ThemePresetName]][]).map(
                  ([key, preset]) => {
                    const isSelected = selectedTheme === key;
                    return (
                      <button
                        key={key}
                        onClick={() => setSelectedTheme(key)}
                        className={`relative p-4 rounded-xl border-2 transition-all duration-200 text-left ${
                          isSelected
                            ? 'border-primary ring-2 ring-primary/20 bg-primary/5'
                            : 'border-gray-200 hover:border-gray-300 bg-white'
                        }`}
                      >
                        {isSelected && (
                          <div className="absolute top-2 right-2 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                            <Check className="h-3 w-3 text-white" />
                          </div>
                        )}
                        <div className="flex gap-1.5 mb-3">
                          {SWATCH_KEYS.map((varName) => (
                            <div
                              key={varName}
                              className="w-6 h-6 rounded-full border border-gray-200"
                              style={{
                                backgroundColor: `hsl(${preset.colors[varName]})`,
                              }}
                            />
                          ))}
                        </div>
                        <p className="text-sm font-semibold">{preset.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {preset.description}
                        </p>
                      </button>
                    );
                  }
                )}
              </div>
              <Button
                onClick={handleSaveTheme}
                disabled={appearanceMutation.isPending}
                className="rounded-full"
              >
                {appearanceMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Save Theme
              </Button>
            </CardContent>
          </Card>
        </motion.div>

        {/* Logo Upload */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
        >
          <Card className="rounded-2xl shadow-sm">
            <CardHeader>
              <div className="flex items-center gap-2">
                <ImageIcon className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-lg font-semibold">Logo</CardTitle>
              </div>
              <CardDescription>Upload your store logo (displayed in header)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-6">
                {logoUrl ? (
                  <div className="relative group">
                    <img
                      src={logoUrl}
                      alt="Store logo"
                      className="h-20 w-20 object-contain rounded-xl border bg-gray-50 p-2"
                    />
                    <button
                      onClick={handleRemoveLogo}
                      className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <div className="h-20 w-20 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center bg-gray-50">
                    <ImageIcon className="h-8 w-8 text-gray-300" />
                  </div>
                )}
                <div>
                  <input
                    ref={logoFileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleLogoUpload}
                  />
                  <Button
                    variant="outline"
                    onClick={() => logoFileRef.current?.click()}
                    disabled={uploading}
                    className="rounded-full"
                  >
                    {uploading ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Upload className="h-4 w-4 mr-2" />
                    )}
                    {logoUrl ? 'Change Logo' : 'Upload Logo'}
                  </Button>
                  <p className="text-xs text-muted-foreground mt-2">
                    Recommended: 200x200px, PNG or SVG
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Announcement Bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.16 }}
        >
          <Card className="rounded-2xl shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Megaphone className="h-5 w-5 text-muted-foreground" />
                  <CardTitle className="text-lg font-semibold">Announcement Bar</CardTitle>
                </div>
                <button
                  onClick={() => setAnnouncementEnabled(!announcementEnabled)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    announcementEnabled ? 'bg-primary' : 'bg-gray-200'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                      announcementEnabled ? 'translate-x-5' : ''
                    }`}
                  />
                </button>
              </div>
              <CardDescription>
                Show a message bar at the top of your storefront
              </CardDescription>
            </CardHeader>
            {announcementEnabled && (
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Message</label>
                  <Input
                    value={announcementText}
                    onChange={(e) => setAnnouncementText(e.target.value)}
                    placeholder="Free shipping on orders over ₹500!"
                    className="rounded-xl"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Link Text (optional)</label>
                    <Input
                      value={announcementLinkText}
                      onChange={(e) => setAnnouncementLinkText(e.target.value)}
                      placeholder="Shop Now"
                      className="rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Link URL</label>
                    <Input
                      value={announcementLinkUrl}
                      onChange={(e) => setAnnouncementLinkUrl(e.target.value)}
                      placeholder="/products"
                      className="rounded-xl"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Background</label>
                  <div className="flex gap-2">
                    {['primary', '200 60% 32%', '268 45% 35%', '18 65% 42%', '0 65% 50%'].map(
                      (color) => (
                        <button
                          key={color}
                          onClick={() => setAnnouncementBg(color)}
                          className={`w-8 h-8 rounded-lg border-2 transition-all ${
                            announcementBg === color
                              ? 'border-primary scale-110'
                              : 'border-gray-200'
                          }`}
                          style={{
                            backgroundColor:
                              color === 'primary'
                                ? 'hsl(var(--primary))'
                                : `hsl(${color})`,
                          }}
                        />
                      )
                    )}
                  </div>
                </div>

                {/* Preview */}
                {announcementText && (
                  <div className="mt-3">
                    <label className="text-sm font-medium mb-1.5 block">Preview</label>
                    <div
                      className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white rounded-xl"
                      style={{
                        backgroundColor:
                          announcementBg === 'primary'
                            ? 'hsl(var(--primary))'
                            : `hsl(${announcementBg})`,
                      }}
                    >
                      <span>{announcementText}</span>
                      {announcementLinkText && (
                        <span className="underline font-semibold">{announcementLinkText}</span>
                      )}
                    </div>
                  </div>
                )}

                <Button
                  onClick={handleSaveAnnouncement}
                  disabled={bannersMutation.isPending}
                  className="rounded-full"
                >
                  {bannersMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  Save Announcement
                </Button>
              </CardContent>
            )}
          </Card>
        </motion.div>

        {/* Hero Banners */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.24 }}
        >
          <Card className="rounded-2xl shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ImageIcon className="h-5 w-5 text-muted-foreground" />
                  <CardTitle className="text-lg font-semibold">Hero Banners</CardTitle>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full gap-1.5"
                  onClick={() => setShowBannerForm(true)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Banner
                </Button>
              </div>
              <CardDescription>
                Homepage hero banner: image (displayed full, no blur) and optional name. First active banner is shown.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Existing banners */}
              {heroBanners.length > 0 ? (
                <div className="space-y-3">
                  {heroBanners.map((banner) => (
                    <div
                      key={banner.id}
                      className={`flex items-center gap-4 p-3 rounded-xl border transition-colors ${
                        banner.isActive
                          ? 'bg-primary/5 border-primary/20'
                          : 'bg-gray-50 border-gray-200'
                      }`}
                    >
                      <GripVertical className="h-4 w-4 text-gray-300 flex-shrink-0" />
                      {banner.videoUrl ? (
                        <div className="h-14 w-20 bg-gray-900 rounded-lg flex items-center justify-center flex-shrink-0 relative overflow-hidden">
                          <video
                            src={banner.videoUrl}
                            className="h-full w-full object-cover"
                            muted
                          />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                            <Video className="h-5 w-5 text-white" />
                          </div>
                        </div>
                      ) : banner.imageUrl ? (
                        <img
                          src={banner.imageUrl}
                          alt={banner.headline}
                          className="h-14 w-20 object-cover rounded-lg flex-shrink-0"
                        />
                      ) : (
                        <div className="h-14 w-20 bg-gray-200 rounded-lg flex items-center justify-center flex-shrink-0">
                          <ImageIcon className="h-5 w-5 text-gray-400" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {banner.headline || 'Untitled'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => handleToggleBanner(banner.id)}
                          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                            banner.isActive
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          {banner.isActive ? 'Active' : 'Inactive'}
                        </button>
                        <button
                          onClick={() => handleDeleteBanner(banner.id)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : !showBannerForm ? (
                <div className="py-8 text-center text-muted-foreground text-sm">
                  <ImageIcon className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p>No banners yet. Add a banner (image + name) to display on the homepage hero.</p>
                </div>
              ) : null}

              {/* Add banner form */}
              {showBannerForm && (
                <div className="border rounded-xl p-4 space-y-4 bg-gray-50/50">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold">New Banner</h4>
                    <button
                      onClick={() => setShowBannerForm(false)}
                      className="p-1 rounded-lg hover:bg-gray-200 transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Media type toggle */}
                  <div>
                    <label className="text-sm font-medium mb-2 block">Banner Media</label>
                    <div className="flex gap-2 mb-3">
                      <button
                        onClick={() => {
                          setBannerMediaType('image');
                          setEditingBanner((prev) => ({ ...prev, videoUrl: '', videoPublicId: '' }));
                        }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                          bannerMediaType === 'image'
                            ? 'bg-primary text-white border-primary'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <ImageIcon className="h-3.5 w-3.5" />
                        Image
                      </button>
                      <button
                        onClick={() => {
                          setBannerMediaType('video');
                          setEditingBanner((prev) => ({ ...prev, imageUrl: '', imagePublicId: '' }));
                        }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                          bannerMediaType === 'video'
                            ? 'bg-primary text-white border-primary'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <Video className="h-3.5 w-3.5" />
                        Video
                      </button>
                    </div>

                    {bannerMediaType === 'image' ? (
                      <>
                        {editingBanner.imageUrl ? (
                          <div className="relative inline-block group">
                            <img
                              src={editingBanner.imageUrl}
                              alt="Banner preview"
                              className="h-32 w-48 object-cover rounded-xl"
                            />
                            <button
                              onClick={() =>
                                setEditingBanner((prev) => ({ ...prev, imageUrl: '', imagePublicId: '' }))
                              }
                              className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <input
                              ref={bannerFileRef}
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={handleBannerImageUpload}
                            />
                            <button
                              onClick={() => bannerFileRef.current?.click()}
                              disabled={bannerUploading}
                              className="h-32 w-48 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center gap-2 hover:border-gray-400 hover:bg-gray-50 transition-colors"
                            >
                              {bannerUploading ? (
                                <Loader2 className="h-6 w-6 text-gray-400 animate-spin" />
                              ) : (
                                <>
                                  <Upload className="h-6 w-6 text-gray-400" />
                                  <span className="text-xs text-gray-400">Upload image</span>
                                </>
                              )}
                            </button>
                          </>
                        )}
                        <p className="text-xs text-muted-foreground mt-1.5">
                          Displayed full (no blur). Recommended: 1200×600px or wider
                        </p>
                      </>
                    ) : (
                      <>
                        {editingBanner.videoUrl ? (
                          <div className="relative inline-block group">
                            <video
                              src={editingBanner.videoUrl}
                              className="h-32 w-48 object-cover rounded-xl bg-black"
                              muted
                              autoPlay
                              loop
                              playsInline
                            />
                            <button
                              onClick={() =>
                                setEditingBanner((prev) => ({ ...prev, videoUrl: '', videoPublicId: '' }))
                              }
                              className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <input
                              ref={bannerVideoRef}
                              type="file"
                              accept="video/mp4,video/webm,video/mov,video/quicktime,video/avi"
                              className="hidden"
                              onChange={handleBannerVideoUpload}
                            />
                            <button
                              onClick={() => bannerVideoRef.current?.click()}
                              disabled={bannerVideoUploading}
                              className="h-32 w-48 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center gap-2 hover:border-gray-400 hover:bg-gray-50 transition-colors"
                            >
                              {bannerVideoUploading ? (
                                <Loader2 className="h-6 w-6 text-gray-400 animate-spin" />
                              ) : (
                                <>
                                  <Video className="h-6 w-6 text-gray-400" />
                                  <span className="text-xs text-gray-400">Upload video</span>
                                </>
                              )}
                            </button>
                          </>
                        )}
                        <p className="text-xs text-muted-foreground mt-1.5">
                          MP4, WebM, MOV. Plays autoplay, muted, looped on homepage.
                        </p>
                      </>
                    )}
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Name</label>
                    <Input
                      value={editingBanner.headline}
                      onChange={(e) =>
                        setEditingBanner((prev) => ({
                          ...prev,
                          headline: e.target.value,
                        }))
                      }
                      placeholder="e.g. Summer Sale"
                      className="rounded-xl"
                    />
                  </div>

                  <div className="flex gap-3">
                    <Button
                      onClick={handleAddBanner}
                      disabled={bannersMutation.isPending}
                      className="rounded-full"
                    >
                      {bannersMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Plus className="h-4 w-4 mr-2" />
                      )}
                      Add Banner
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => setShowBannerForm(false)}
                      className="rounded-full"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Promotional Banner */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.32 }}
        >
          <Card className="rounded-2xl shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ImageIcon className="h-5 w-5 text-muted-foreground" />
                  <CardTitle className="text-lg font-semibold">Promotional Banner</CardTitle>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full gap-1.5"
                  onClick={() => setShowPromoForm(true)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Banner
                </Button>
              </div>
              <CardDescription>
                Displayed above the product grid on the homepage. First active banner is shown. Supports image or video with optional link.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {promoBanners.length > 0 ? (
                <div className="space-y-3">
                  {promoBanners.map((banner) => (
                    <div
                      key={banner.id}
                      className={`flex items-center gap-4 p-3 rounded-xl border transition-colors ${
                        banner.isActive ? 'bg-primary/5 border-primary/20' : 'bg-gray-50 border-gray-200'
                      }`}
                    >
                      <GripVertical className="h-4 w-4 text-gray-300 flex-shrink-0" />
                      {banner.videoUrl ? (
                        <div className="h-14 w-20 bg-gray-900 rounded-lg flex items-center justify-center flex-shrink-0 relative overflow-hidden">
                          <video src={banner.videoUrl} className="h-full w-full object-cover" muted />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                            <Video className="h-5 w-5 text-white" />
                          </div>
                        </div>
                      ) : banner.imageUrl ? (
                        <img src={banner.imageUrl} alt={banner.label} className="h-14 w-20 object-cover rounded-lg flex-shrink-0" />
                      ) : (
                        <div className="h-14 w-20 bg-gray-200 rounded-lg flex items-center justify-center flex-shrink-0">
                          <ImageIcon className="h-5 w-5 text-gray-400" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{banner.label || 'Untitled'}</p>
                        {banner.linkUrl && (
                          <p className="text-xs text-muted-foreground truncate">{banner.linkUrl}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => handleTogglePromo(banner.id)}
                          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                            banner.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          {banner.isActive ? 'Active' : 'Inactive'}
                        </button>
                        <button
                          onClick={() => handleDeletePromo(banner.id)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : !showPromoForm ? (
                <div className="py-8 text-center text-muted-foreground text-sm">
                  <ImageIcon className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p>No promotional banner. Add one to display above the product grid.</p>
                </div>
              ) : null}

              {showPromoForm && (
                <div className="border rounded-xl p-4 space-y-4 bg-gray-50/50">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold">New Promotional Banner</h4>
                    <button onClick={() => setShowPromoForm(false)} className="p-1 rounded-lg hover:bg-gray-200 transition-colors">
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Media type */}
                  <div>
                    <label className="text-sm font-medium mb-2 block">Media</label>
                    <div className="flex gap-2 mb-3">
                      <button
                        onClick={() => { setPromoMediaType('image'); setEditingPromo((p) => ({ ...p, videoUrl: '', videoPublicId: '' })); }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${promoMediaType === 'image' ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-200'}`}
                      >
                        <ImageIcon className="h-3.5 w-3.5" /> Image
                      </button>
                      <button
                        onClick={() => { setPromoMediaType('video'); setEditingPromo((p) => ({ ...p, imageUrl: '', imagePublicId: '' })); }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${promoMediaType === 'video' ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-200'}`}
                      >
                        <Video className="h-3.5 w-3.5" /> Video
                      </button>
                    </div>

                    {promoMediaType === 'image' ? (
                      <>
                        {editingPromo.imageUrl ? (
                          <div className="relative inline-block group">
                            <img src={editingPromo.imageUrl} alt="Preview" className="h-32 w-full max-w-sm object-cover rounded-xl" />
                            <button
                              onClick={() => setEditingPromo((p) => ({ ...p, imageUrl: '', imagePublicId: '' }))}
                              className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <input ref={promoFileRef} type="file" accept="image/*" className="hidden" onChange={handlePromoImageUpload} />
                            <button
                              onClick={() => promoFileRef.current?.click()}
                              disabled={promoUploading}
                              className="h-32 w-48 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center gap-2 hover:border-gray-400 hover:bg-gray-50 transition-colors"
                            >
                              {promoUploading ? <Loader2 className="h-6 w-6 text-gray-400 animate-spin" /> : <><Upload className="h-6 w-6 text-gray-400" /><span className="text-xs text-gray-400">Upload image</span></>}
                            </button>
                          </>
                        )}
                        <p className="text-xs text-muted-foreground mt-1.5">Recommended: 1400×400px wide banner</p>
                      </>
                    ) : (
                      <>
                        {editingPromo.videoUrl ? (
                          <div className="relative inline-block group">
                            <video src={editingPromo.videoUrl} className="h-32 w-48 object-cover rounded-xl bg-black" muted autoPlay loop playsInline />
                            <button
                              onClick={() => setEditingPromo((p) => ({ ...p, videoUrl: '', videoPublicId: '' }))}
                              className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <input ref={promoVideoRef} type="file" accept="video/mp4,video/webm,video/mov,video/quicktime" className="hidden" onChange={handlePromoVideoUpload} />
                            <button
                              onClick={() => promoVideoRef.current?.click()}
                              disabled={promoVideoUploading}
                              className="h-32 w-48 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center gap-2 hover:border-gray-400 hover:bg-gray-50 transition-colors"
                            >
                              {promoVideoUploading ? <Loader2 className="h-6 w-6 text-gray-400 animate-spin" /> : <><Video className="h-6 w-6 text-gray-400" /><span className="text-xs text-gray-400">Upload video</span></>}
                            </button>
                          </>
                        )}
                        <p className="text-xs text-muted-foreground mt-1.5">MP4, WebM, MOV. Autoplay, muted, looped.</p>
                      </>
                    )}
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Label (admin only)</label>
                    <Input
                      value={editingPromo.label}
                      onChange={(e) => setEditingPromo((p) => ({ ...p, label: e.target.value }))}
                      placeholder="e.g. Monsoon Sale Banner"
                      className="rounded-xl"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Link URL (optional)</label>
                    <Input
                      value={editingPromo.linkUrl ?? ''}
                      onChange={(e) => setEditingPromo((p) => ({ ...p, linkUrl: e.target.value }))}
                      placeholder="/products or /collections/sale"
                      className="rounded-xl"
                    />
                  </div>

                  <div className="flex gap-3">
                    <Button onClick={handleAddPromo} disabled={bannersMutation.isPending} className="rounded-full">
                      {bannersMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                      Add Banner
                    </Button>
                    <Button variant="ghost" onClick={() => setShowPromoForm(false)} className="rounded-full">Cancel</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
