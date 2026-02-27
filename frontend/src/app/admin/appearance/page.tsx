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
  Plus,
  Trash2,
  GripVertical,
  ExternalLink,
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

  const bannerFileRef = useRef<HTMLInputElement>(null);
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

  const handleSaveAnnouncement = () => {
    bannersMutation.mutate({
      heroBanners,
      announcementBar: {
        enabled: announcementEnabled,
        text: announcementText,
        linkText: announcementLinkText,
        linkUrl: announcementLinkUrl,
        backgroundColor: announcementBg,
        textColor: 'white',
      },
    });
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

  const handleAddBanner = () => {
    if (!editingBanner.headline) {
      toast({ title: 'Headline is required', variant: 'destructive' });
      return;
    }
    const newBanner = { ...editingBanner, id: generateId() };
    const updated = [...heroBanners, newBanner];
    setHeroBanners(updated);
    setShowBannerForm(false);
    setEditingBanner({
      id: '',
      imageUrl: '',
      imagePublicId: '',
      headline: '',
      subtitle: '',
      ctaText: 'Shop Now',
      ctaLink: '/products',
      isActive: true,
    });
    bannersMutation.mutate({
      heroBanners: updated,
      announcementBar: {
        enabled: announcementEnabled,
        text: announcementText,
        linkText: announcementLinkText,
        linkUrl: announcementLinkUrl,
        backgroundColor: announcementBg,
        textColor: 'white',
      },
    });
  };

  const handleDeleteBanner = (id: string) => {
    const updated = heroBanners.filter((b) => b.id !== id);
    setHeroBanners(updated);
    bannersMutation.mutate({
      heroBanners: updated,
      announcementBar: {
        enabled: announcementEnabled,
        text: announcementText,
        linkText: announcementLinkText,
        linkUrl: announcementLinkUrl,
        backgroundColor: announcementBg,
        textColor: 'white',
      },
    });
  };

  const handleToggleBanner = (id: string) => {
    const updated = heroBanners.map((b) =>
      b.id === id ? { ...b, isActive: !b.isActive } : b
    );
    setHeroBanners(updated);
    bannersMutation.mutate({
      heroBanners: updated,
      announcementBar: {
        enabled: announcementEnabled,
        text: announcementText,
        linkText: announcementLinkText,
        linkUrl: announcementLinkUrl,
        backgroundColor: announcementBg,
        textColor: 'white',
      },
    });
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
                Manage hero banners on your homepage. The first active banner will be displayed.
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
                      {banner.imageUrl ? (
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
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {banner.subtitle || 'No subtitle'}
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
                  <p>No banners yet. The default 3D hero will be shown.</p>
                  <p className="text-xs mt-1">Add a banner to customize your hero section.</p>
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

                  {/* Image upload */}
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">
                      Banner Image (optional)
                    </label>
                    {editingBanner.imageUrl ? (
                      <div className="relative inline-block group">
                        <img
                          src={editingBanner.imageUrl}
                          alt="Banner preview"
                          className="h-32 w-48 object-cover rounded-xl"
                        />
                        <button
                          onClick={() =>
                            setEditingBanner((prev) => ({
                              ...prev,
                              imageUrl: '',
                              imagePublicId: '',
                            }))
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
                      Replaces the 3D model when set. Recommended: 1200x800px
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">Headline *</label>
                      <Input
                        value={editingBanner.headline}
                        onChange={(e) =>
                          setEditingBanner((prev) => ({
                            ...prev,
                            headline: e.target.value,
                          }))
                        }
                        placeholder="Summer Sale - Up to 50% Off"
                        className="rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">Subtitle</label>
                      <Input
                        value={editingBanner.subtitle}
                        onChange={(e) =>
                          setEditingBanner((prev) => ({
                            ...prev,
                            subtitle: e.target.value,
                          }))
                        }
                        placeholder="Fresh organic products delivered to your door"
                        className="rounded-xl"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">CTA Button Text</label>
                      <Input
                        value={editingBanner.ctaText}
                        onChange={(e) =>
                          setEditingBanner((prev) => ({
                            ...prev,
                            ctaText: e.target.value,
                          }))
                        }
                        placeholder="Shop Now"
                        className="rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">CTA Link</label>
                      <Input
                        value={editingBanner.ctaLink}
                        onChange={(e) =>
                          setEditingBanner((prev) => ({
                            ...prev,
                            ctaLink: e.target.value,
                          }))
                        }
                        placeholder="/products"
                        className="rounded-xl"
                      />
                    </div>
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
      </div>
    </div>
  );
}
