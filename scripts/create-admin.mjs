import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
if (!url || !secret || !email || !password) {
  throw new Error('Set SUPABASE_URL, SUPABASE_SECRET_KEY, ADMIN_EMAIL and ADMIN_PASSWORD');
}
if (password.length < 12) throw new Error('ADMIN_PASSWORD must contain at least 12 characters');

const supabase = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const { data, error } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  app_metadata: { role: 'admin' },
  user_metadata: { full_name: 'مدير النظام', phone: '0000000000' },
});
if (error) throw error;
const { error: profileError } = await supabase.from('profiles').update({ role: 'admin', full_name: 'مدير النظام' }).eq('id', data.user.id);
if (profileError) throw profileError;
process.stdout.write(`Admin created: ${data.user.email} (${data.user.id})\n`);

