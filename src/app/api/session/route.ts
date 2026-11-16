import { NextResponse } from 'next/server';
import { apiSession } from '@/lib/api-session';

export async function GET() {
  const { user, error } = await apiSession();
  if (error) return error;
  return NextResponse.json({ user }, { headers: { 'Cache-Control': 'no-store' } });
}
