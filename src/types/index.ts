export type ProjectStatus = 'draft' | 'rendering' | 'done' | 'archived';

export interface Project {
  id: string;
  name: string;
  genre: string | null;
  status: ProjectStatus;
  progress: number;
  version: string;
  thumbnailUrl: string | null;
  bgStyle: string | null;
  teamId: string;
  ownerId: string;
  metadata: Record<string, unknown>;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Shot {
  id: number;
  num: string;
  title: string;
  type: string;
  duration: number;
  dialog: string;
  bg: string;
}

export interface Character {
  id: number;
  name: string;
  desc: string;
  tags: { label: string; color: string }[];
  appearsIn: number;
  bg: string;
  avatar: string;
}

export interface MusicTrack {
  id: number;
  name: string;
  cat: string;
  mood: string;
  dur: string;
  bpm: number;
}

export interface SfxClip {
  id: number;
  name: string;
  cat: string;
  mood: string;
  dur: string;
}

export interface Notification {
  id: number;
  icon: 'check' | 'user' | 'star';
  color: 'green' | 'purple' | 'yellow';
  title: string;
  body: string;
  time: string;
  read: boolean;
}

export interface Draft {
  id: string;
  name: string;
  kind: 'script' | 'project' | 'character' | 'outline';
  updated: string;
  wordCount: number;
  bg: string;
}

export interface SharedProject {
  id: string;
  name: string;
  owner: string;
  ownerInitial: string;
  ownerBg: string;
  perm: '编辑' | '查看';
  sharedAt: string;
  bg: string;
}

export interface TrashItem {
  id: string;
  name: string;
  kind: 'project' | 'shot' | 'character' | 'scene' | 'music' | 'draft' | 'sfx';
  deletedAt: string;
  daysLeft: number;
  bg: string;
  size: string;
}

export interface ConsistencyEntry {
  name: string;
  avatar: string;
  bg: string;
  score: number;
  issues: number;
  appearsIn: number;
  issueDetails?: string[];
}

export interface Prop {
  id: number;
  name: string;
  cat: string;
  uses: number;
  icon: string;
  bg: string;
}

export interface Scene {
  id: number;
  name: string;
  cat: string;
  uses: number;
  bg: string;
}

export interface Voice {
  id: number;
  name: string;
  desc: string;
  tags: { label: string; color: string }[];
  bg: string;
  icon: string;
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  tail: string;
  created: string;
  lastUsed: string;
  perm: '读+写' | '只读' | '只写';
  status: 'active' | 'revoked';
}

export interface Invoice {
  id: string;
  date: string;
  plan: string;
  amount: string;
  status: '已支付' | '待支付' | '已退款';
}

export type Theme = 'light' | 'dark' | 'auto';
export type Density = 'compact' | 'cozy' | 'comfortable';
