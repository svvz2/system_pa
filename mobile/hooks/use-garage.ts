import { useCallback, useEffect, useState } from 'react';

import { garageId, supabase } from '@/lib/supabase';
import type { DeviceSummary, ParkingSlot } from '@/lib/types';

export function useGarage() {
  const [slots, setSlots] = useState<ParkingSlot[]>([]);
  const [device, setDevice] = useState<DeviceSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [slotResult, deviceResult] = await Promise.all([
      supabase
        .from('parking_slot_status')
        .select('*')
        .eq('garage_id', garageId)
        .order('slot_number'),
      supabase.from('device_status').select('*').eq('garage_id', garageId).maybeSingle(),
    ]);
    if (!slotResult.error) setSlots((slotResult.data as ParkingSlot[]) ?? []);
    if (!deviceResult.error) setDevice((deviceResult.data as DeviceSummary | null) ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    // More than one tab can mount this hook simultaneously. Supabase reuses
    // equal channel topics, therefore each subscriber gets a unique topic.
    const channelName = `garage:${garageId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'parking_slots' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'devices' }, refresh)
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  return { slots, device, loading, refresh };
}
