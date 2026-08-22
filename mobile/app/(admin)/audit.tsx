import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { Card, LoadingBlock, Muted, Screen, Title } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

interface AuditRow { id: string; action: string; target_type: string | null; target_id: string | null; metadata: Record<string, unknown>; created_at: string; }

export default function AuditScreen() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    const { data } = await supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(100);
    setRows((data as AuditRow[]) ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  if (loading) return <Screen><LoadingBlock /></Screen>;
  return (
    <Screen>
      <Title>سجل التدقيق</Title>
      {rows.length ? rows.map((row) => <Card key={row.id}><Text style={styles.action}>{row.action}</Text><Text style={styles.date}>{formatDateTime(row.created_at)}</Text><Text style={styles.meta}>{JSON.stringify(row.metadata)}</Text></Card>) : <Muted>لا توجد أحداث مسجلة.</Muted>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  action: { color: colors.text, fontWeight: '900', textAlign: 'right' },
  date: { color: colors.muted, textAlign: 'right' },
  meta: { color: colors.muted, fontSize: 11, textAlign: 'left' },
});

