import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { supabase } from '@/lib/supabase';
import type { Profile, Vehicle } from '@/lib/types';

interface SessionContextValue {
  session: Session | null;
  profile: Profile | null;
  vehicle: Vehicle | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = async () => {
    const { data: auth } = await supabase.auth.getSession();
    const userId = auth.session?.user.id;
    if (!userId) {
      setProfile(null);
      setVehicle(null);
      return;
    }
    const [{ data: profileData }, { data: vehicleData }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      supabase.from('vehicles').select('*').eq('user_id', userId).eq('is_primary', true).maybeSingle(),
    ]);
    setProfile((profileData as Profile | null) ?? null);
    setVehicle((vehicleData as Vehicle | null) ?? null);
  };

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await refreshProfile();
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      setSession(nextSession);
      await refreshProfile();
      setLoading(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const value = useMemo(
    () => ({
      session,
      profile,
      vehicle,
      loading,
      refreshProfile,
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [session, profile, vehicle, loading],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used inside SessionProvider');
  return context;
}

