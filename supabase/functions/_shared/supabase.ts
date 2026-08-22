import { createClient, type User } from 'npm:@supabase/supabase-js@2';

function required(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing server environment variable: ${name}`);
  return value;
}

export function adminClient() {
  return createClient(required('SUPABASE_URL'), Deno.env.get('SUPABASE_SECRET_KEY') ?? required('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function authenticatedClient(req: Request) {
  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) throw new Error('يجب تسجيل الدخول');
  const client = createClient(required('SUPABASE_URL'), Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? required('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(authorization.slice(7));
  if (error || !data.user) throw new Error('جلسة تسجيل الدخول غير صالحة');
  return { client, user: data.user as User };
}

export async function requireAdmin(req: Request) {
  const context = await authenticatedClient(req);
  const { data, error } = await context.client.from('profiles').select('role,blocked').eq('id', context.user.id).single();
  if (error || data?.role !== 'admin' || data?.blocked) throw new Error('غير مصرح: صلاحية الأدمن مطلوبة');
  return context;
}

