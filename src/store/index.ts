import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Shot,
  Character,
  MusicTrack,
  SfxClip,
  Notification,
  ConsistencyEntry,
  Prop,
  Scene,
  Voice,
  ApiKey,
  Invoice,
  Theme,
  Density
} from '@/types';
import {
  initialShots,
  initialCharacters,
  initialMusic,
  initialSfx,
  initialNotifications,
  initialConsistency,
  initialProps,
  initialScenes,
  initialVoices,
  initialApiKeys,
  initialInvoices
} from '@/data/mock';

export interface AppState {
  // Domain
  projectName: string;
  shots: Shot[];
  currentShotId: number;
  characters: Character[];
  music: MusicTrack[];
  sfx: SfxClip[];
  notifications: Notification[];
  consistency: ConsistencyEntry[];
  props: Prop[];
  scenes: Scene[];
  voices: Voice[];
  apiKeys: ApiKey[];
  invoices: Invoice[];

  // UI / settings
  theme: Theme;
  density: Density;
  fontSize: number;
  sidebarOpen: boolean;
  preferences: { lang: string; timezone: string; dateFormat: string; autoSave: boolean; sendStats: boolean; betaFeatures: boolean };
  notificationPrefs: { renderDone: boolean; teamMsg: boolean; weeklyDigest: boolean; marketing: boolean };
  profile: { name: string; email: string; phone: string; bio: string; avatar: string };
  billing: { plan: string; renewDate: string; autoRenew: boolean; usage: Record<string, { used: number; total: number; unit: string }> };

  // Editor state
  isPlaying: boolean;
  currentTime: number;
  totalTime: number;
  editPreset: string;
  editParams: { transition: number; bgmIntensity: number; subtitleStyle: number; paceCut: number };
  propFilter: string;
  playingMusicId: number | null;
  playingSfxId: number | null;

  // Actions
  setProjectName: (name: string) => void;
  setCurrentShot: (id: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setCurrentTime: (time: number) => void;
  setTheme: (theme: Theme) => void;
  setDensity: (density: Density) => void;
  setFontSize: (size: number) => void;
  toggleSidebar: () => void;

  markNotificationRead: (id: number) => void;
  markAllNotificationsRead: () => void;
  pushNotification: (n: Omit<Notification, 'id'>) => void;

  removeApiKey: (id: string) => void;
  revokeApiKey: (id: string) => void;
  addApiKey: (k: ApiKey) => void;

  setEditPreset: (k: string) => void;
  setEditParam: (k: keyof AppState['editParams'], v: number) => void;
  setPropFilter: (cat: string) => void;
  setPlayingMusic: (id: number | null) => void;
  setPlayingSfx: (id: number | null) => void;

  updatePreference: <K extends keyof AppState['preferences']>(k: K, v: AppState['preferences'][K]) => void;
  updateNotificationPref: (k: keyof AppState['notificationPrefs']) => void;
  updateProfile: (patch: Partial<AppState['profile']>) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      // Initial domain data
      projectName: '都市修仙之我有一个万界商城',
      shots: initialShots,
      currentShotId: 1,
      characters: initialCharacters,
      music: initialMusic,
      sfx: initialSfx,
      notifications: initialNotifications,
      consistency: initialConsistency,
      props: initialProps,
      scenes: initialScenes,
      voices: initialVoices,
      apiKeys: initialApiKeys,
      invoices: initialInvoices,

      // UI / settings defaults
      theme: 'light',
      density: 'cozy',
      fontSize: 14,
      sidebarOpen: true,
      preferences: { lang: 'zh-CN', timezone: 'GMT+8 北京', dateFormat: 'YYYY-MM-DD', autoSave: true, sendStats: true, betaFeatures: false },
      notificationPrefs: { renderDone: true, teamMsg: true, weeklyDigest: false, marketing: false },
      profile: { name: '星辰工作室', email: 'team@xingchen.studio', phone: '138****8888', bio: '专注国漫与短剧 AI 制作', avatar: '星' },
      billing: {
        plan: 'team', renewDate: '2026-06-15', autoRenew: true,
        usage: {
          render: { used: 32, total: 120, unit: '次' },
          storage: { used: 78.6, total: 200, unit: 'GB' },
          seat: { used: 6, total: 10, unit: '人' },
          ai: { used: 284000, total: 1000000, unit: 'tokens' }
        }
      },

      // Editor
      isPlaying: false,
      currentTime: 0,
      totalTime: 32,
      editPreset: 'rhythm',
      editParams: { transition: 60, bgmIntensity: 75, subtitleStyle: 50, paceCut: 40 },
      propFilter: '全部',
      playingMusicId: null,
      playingSfxId: null,

      // Actions
      setProjectName: (name) => set({ projectName: name }),
      setCurrentShot: (id) => set({ currentShotId: id }),
      setIsPlaying: (playing) => set({ isPlaying: playing }),
      setCurrentTime: (time) => set({ currentTime: time }),
      setTheme: (theme) => {
        set({ theme });
        const root = document.documentElement;
        const effective = theme === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme;
        root.classList.toggle('dark', effective === 'dark');
      },
      setDensity: (density) => set({ density }),
      setFontSize: (size) => set({ fontSize: size }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

      markNotificationRead: (id) => set((s) => ({ notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) })),
      markAllNotificationsRead: () => set((s) => ({ notifications: s.notifications.map((n) => ({ ...n, read: true })) })),
      pushNotification: (n) => set((s) => ({ notifications: [{ ...n, id: Date.now() }, ...s.notifications] })),

      removeApiKey: (id) => set((s) => ({ apiKeys: s.apiKeys.filter((k) => k.id !== id) })),
      revokeApiKey: (id) => set((s) => ({ apiKeys: s.apiKeys.map((k) => (k.id === id ? { ...k, status: 'revoked' as const } : k)) })),
      addApiKey: (k) => set((s) => ({ apiKeys: [k, ...s.apiKeys] })),

      setEditPreset: (k) => set({ editPreset: k }),
      setEditParam: (k, v) => set((s) => ({ editParams: { ...s.editParams, [k]: v } })),
      setPropFilter: (cat) => set({ propFilter: cat }),
      setPlayingMusic: (id) => set({ playingMusicId: id }),
      setPlayingSfx: (id) => set({ playingSfxId: id }),

      updatePreference: (k, v) => set((s) => ({ preferences: { ...s.preferences, [k]: v } })),
      updateNotificationPref: (k) => set((s) => ({ notificationPrefs: { ...s.notificationPrefs, [k]: !s.notificationPrefs[k] } })),
      updateProfile: (patch) => set((s) => ({ profile: { ...s.profile, ...patch } }))
    }),
    {
      name: 'manju-store',
      partialize: (s) => ({
        theme: s.theme,
        density: s.density,
        fontSize: s.fontSize,
        sidebarOpen: s.sidebarOpen,
        preferences: s.preferences,
        notificationPrefs: s.notificationPrefs,
        profile: s.profile,
        editPreset: s.editPreset,
        editParams: s.editParams
      })
    }
  )
);
