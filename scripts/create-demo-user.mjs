import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const publishable = process.env.SUPABASE_PUBLISHABLE_KEY;
const email = process.env.DEMO_EMAIL ?? 'user@parking.local';
const password = process.env.DEMO_PASSWORD ?? 'DemoUser#2026';

if (!url || !secret || !publishable) {
  throw new Error('Set SUPABASE_URL, SUPABASE_SECRET_KEY and SUPABASE_PUBLISHABLE_KEY');
}

const admin = createClient(url, secret, { auth: { persistSession: false } });
const client = createClient(url, publishable, { auth: { persistSession: false } });
const { data: listed, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (listError) throw listError;

let user = listed.users.find((item) => item.email?.toLowerCase() === email.toLowerCase());
if (user) {
  const { data, error } = await admin.auth.admin.updateUserById(user.id, {
    password,
    email_confirm: true,
    user_metadata: { full_name: 'مستخدم تجريبي', phone: '07800000000' },
  });
  if (error) throw error;
  user = data.user;
} else {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: 'مستخدم تجريبي', phone: '07800000000' },
  });
  if (error) throw error;
  user = data.user;
}

const { error: signInError } = await client.auth.signInWithPassword({ email, password });
if (signInError) throw signInError;
const { data: registered, error: profileError } = await client.functions.invoke('register-profile', {
  body: {
    fullName: 'مستخدم تجريبي',
    phone: '07800000000',
    nationalId: '990000001234',
    plateNumber: 'TEST-001',
    makeModel: 'Toyota Corolla 2017',
    color: 'أحمر',
  },
});
if (profileError) throw profileError;
if (registered?.error) throw new Error(registered.error);

console.log(`Demo user ready: ${email} (${user.id})`);

