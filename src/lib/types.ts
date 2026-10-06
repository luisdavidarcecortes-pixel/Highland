export type Role = 'admin' | 'editor';

export interface Edition {
  id: string;
  number: number;
  title: string;
  description: string | null;
  edition_date: string; // ISO yyyy-mm-dd
  school_year: string; // e.g. "2026-27"
  cover_url: string | null;
  pdf_url: string;
  published: boolean;
  created_at: string;
}

export interface Article {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  body: string;
  image_url: string | null;
  video_url: string | null;
  audio_url: string | null;
  author_id: string | null;
  published: boolean;
  created_at: string;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  created_at: string;
}

/** Lightweight profile for UI display (no sensitive data). */
export interface ProfileLite {
  id: string;
  full_name: string | null;
  email: string;
  role: Role;
}
