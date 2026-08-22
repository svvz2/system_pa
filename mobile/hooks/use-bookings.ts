import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import type { Booking } from '@/lib/types';

export function useBookings(all = false) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    let query = supabase
      .from('bookings')
      .select(
        'id,start_at,end_at,status,checked_in_at,checked_out_at,slot:parking_slots(slot_number,display_name),vehicle:vehicles(plate_number,make_model,color)',
      )
      .order('start_at', { ascending: false });
    if (!all) query = query.limit(30);
    const { data, error } = await query;
    if (!error) setBookings((data as unknown as Booking[]) ?? []);
    setLoading(false);
  }, [all]);

  useEffect(() => {
    void refresh();
    // RealtimeClient reuses channels with the same topic. Tabs keep sibling
    // screens mounted, so every hook instance needs its own topic. A fresh
    // name per effect run also avoids the React StrictMode cleanup race.
    const channelName = `${all ? 'admin' : 'my'}-bookings:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, refresh)
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [all, refresh]);

  return { bookings, loading, refresh };
}
