import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readGuestFlag } from './guest/guestFlag';
import { createGuestClient } from './guest/fakeClient';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Guest demo mode: in a browser with the Guest flag set, use the in-browser fake client (no network).
// Server render and every other case keep the real client; createClient runs only in that branch.
export const supabase: SupabaseClient =
  typeof window !== 'undefined' && readGuestFlag()
    ? (createGuestClient() as unknown as SupabaseClient)
    : createClient(supabaseUrl, supabaseAnonKey);
