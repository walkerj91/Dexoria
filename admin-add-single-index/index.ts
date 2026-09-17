// supabase/functions/admin-add-single/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ADMIN_USER_ID = Deno.env.get('ADMIN_USER_ID')!; // your own auth.users id — set this secret once

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);
    if (user.id !== ADMIN_USER_ID) return json({ error: 'Forbidden' }, 403);

    const {
      tcgdex_card_id, card_name, set_name, set_id,
      card_number, rarity, image_url, price_cents, quantity_available,
    } = await req.json();

    if (!tcgdex_card_id || !card_name || !set_name || !set_id || !price_cents || !quantity_available) {
      return json({ error: 'Missing required fields' }, 400);
    }

    const adminSupabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data, error } = await adminSupabase
      .from('card_singles')
      .insert({
        tcgdex_card_id, card_name, set_name, set_id,
        card_number, rarity, image_url,
        price_cents, quantity_available,
      })
      .select()
      .single();

    if (error) return json({ error: error.message }, 500);

    return json({ success: true, single: data });
  } catch (err) {
    console.error('admin-add-single error:', err);
    return json({ error: String(err) }, 500);
  }
});