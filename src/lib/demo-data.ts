import type { Article, Edition, ProfileLite } from './types';

/** Sample content for DEMO MODE (no Supabase configured). */
export const DEMO_EDITIONS: Edition[] = [
  {
    id: 'issue-2025-03',
    number: 5,
    title: 'March 2025',
    description:
      'The cell phone policy under review, the Africa mission trip, the SA banquet "Diamonds Are Forever", Spirit Week and the hidden Highland Cow contest.',
    edition_date: '2025-03-24',
    school_year: '2024-25',
    cover_url: '/demo/covers/issue-2025-03.jpg',
    pdf_url: '/demo/pdfs/issue-2025-03.pdf',
    published: true,
    created_at: '2025-03-24T09:00:00Z',
  },
];

export const DEMO_ARTICLES: Article[] = [
  {
    id: 'demo-art-1',
    slug: 'robotics-club-kicks-off',
    title: 'Robotics club kicks off with 25 participants',
    excerpt:
      'The robotics workshop opens its doors on Tuesdays and Thursdays. Spots filled up in just two days!',
    body: `The school robotics club has started the year with record attendance: 25 students from 4th to 6th grade will meet every Tuesday and Thursday in the new downstairs workshop.

During the first term they will build a robotic arm out of recycled materials and learn to program it with blocks. "The idea is for them to invent, make mistakes and try again," explains Mr. Javier, the coordinating teacher.

The club will close the term with an exhibition open to families, where each team will present their creation. If you missed out on a spot, don't worry: new sign-ups open in January.`,
    image_url: '/demo/articles/robotics-club.svg',
    video_url: null,
    audio_url: null,
    author_id: null,
    published: true,
    created_at: '2026-09-16T10:00:00Z',
  },
  {
    id: 'demo-art-2',
    slug: 'our-podcast-is-back-on-air',
    title: 'Our podcast is back on air',
    excerpt:
      'Listen to the first episode of the year: we interview the new head of school and look back at September activities.',
    body: `The school newspaper podcast is back with renewed energy. In this first episode of the year we chat with the new head of school, Ms. Carmen, who tells us about her plans for the school, and we go over everything September has in store.

The podcast is recorded in the school's audio room every Friday morning. If you would like to suggest a topic, an interview or a song to close the show, drop a note in the library mailbox.

Hit play and listen!`,
    image_url: '/demo/articles/podcast-studio.svg',
    video_url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
    audio_url: null,
    author_id: null,
    published: true,
    created_at: '2026-09-14T12:30:00Z',
  },
  {
    id: 'demo-art-3',
    slug: 'welcome-week-chronicles',
    title: 'Chronicles of welcome week',
    excerpt:
      'Games, a giant scavenger hunt and a community snack: this is how we lived the first week of the year.',
    body: `Welcome week was packed with activities: a giant scavenger hunt in the playground, a community snack with families, and the presentation of the new peer-mediation teams.

Every class decorated its door with a motto for the year. The staff jury picked 5th B's — "Together we make things happen" — as the winner.

The newspaper team thanks all the families for taking part. You can read the full chronicle with photos in issue No. 3 of the newspaper.`,
    image_url: '/demo/articles/welcome-week.svg',
    video_url: null,
    audio_url: null,
    author_id: null,
    published: true,
    created_at: '2026-09-12T08:00:00Z',
  },
];

export const DEMO_TEAM: ProfileLite[] = [
  { id: 'u-1', full_name: 'Ms. Luisa Martin', email: 'luisa@school.edu', role: 'admin' },
  { id: 'u-2', full_name: 'Ana Writer', email: 'ana@school.edu', role: 'editor' },
  { id: 'u-3', full_name: 'Carlos Writer', email: 'carlos@school.edu', role: 'editor' },
];
