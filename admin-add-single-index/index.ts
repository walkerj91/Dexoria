// supabase/functions/admin-add-single/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ADMIN_USER_ID = Deno.env.get('ADMIN_USER_ID')!; // your own auth.users id

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

    const adminSupabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const body = await req.json();
    const action = body.action || 'add'; // default to 'add' so the existing add-single.js keeps working unchanged

    // ── ADD ───────────────────────────────────────────────────────────────
    if (action === 'add') {
      const {
        tcgdex_card_id, card_name, set_name, set_id,
        card_number, rarity, image_url, variant, price_cents, quantity_available,
      } = body;

      if (!tcgdex_card_id || !card_name || !set_name || !set_id || !price_cents || !quantity_available) {
        return json({ error: 'Missing required fields' }, 400);
      }

      const { data, error } = await adminSupabase
        .from('card_singles')
        .insert({
          tcgdex_card_id, card_name, set_name, set_id,
          card_number, rarity, image_url,
          variant: variant || 'normal',
          price_cents, quantity_available,
        })
        .select()
        .single();

      if (error) return json({ error: error.message }, 500);
      return json({ success: true, single: data });
    }

    // ── LIST (all rows, active and inactive — RLS would otherwise hide inactive ones) ──
    if (action === 'list') {
      const { data, error } = await adminSupabase
        .from('card_singles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) return json({ error: error.message }, 500);
      return json({ singles: data });
    }

    // ── UPDATE price / stock ──────────────────────────────────────────────
    if (action === 'update') {
      const { id, price_cents, quantity_available } = body;
      if (!id) return json({ error: 'id required' }, 400);

      const updates: Record<string, number> = {};
      if (price_cents !== undefined) updates.price_cents = price_cents;
      if (quantity_available !== undefined) updates.quantity_available = quantity_available;

      const { data, error } = await adminSupabase
        .from('card_singles')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) return json({ error: error.message }, 500);
      return json({ success: true, single: data });
    }

    // ── TOGGLE active (remove from / restore to store) ────────────────────
    if (action === 'toggle') {
      const { id, is_active } = body;
      if (!id || typeof is_active !== 'boolean') return json({ error: 'id and is_active required' }, 400);

      const { data, error } = await adminSupabase
        .from('card_singles')
        .update({ is_active })
        .eq('id', id)
        .select()
        .single();

      if (error) return json({ error: error.message }, 500);
      return json({ success: true, single: data });
    }

    // ── LIST ORDERS (paid/fulfilled/refunded — excludes abandoned 'pending' carts) ──
    if (action === 'list_orders') {
      const { data: purchases, error: purchasesError } = await adminSupabase
        .from('single_purchases')
        .select('*')
        .in('status', ['paid', 'fulfilled', 'refunded'])
        .order('created_at', { ascending: false });

      if (purchasesError) return json({ error: purchasesError.message }, 500);
      if (!purchases || purchases.length === 0) return json({ orders: [] });

      const purchaseIds = purchases.map((p) => p.id);
      const { data: items, error: itemsError } = await adminSupabase
        .from('single_purchase_items')
        .select('purchase_id, single_id, quantity, unit_price_cents')
        .in('purchase_id', purchaseIds);

      if (itemsError) return json({ error: itemsError.message }, 500);

      const singleIds = [...new Set((items || []).map((i) => i.single_id))];
      const { data: singles, error: singlesError } = await adminSupabase
        .from('card_singles')
        .select('id, card_name, variant, image_url')
        .in('id', singleIds);

      if (singlesError) return json({ error: singlesError.message }, 500);

      const orders = purchases.map((purchase) => ({
        ...purchase,
        items: (items || [])
          .filter((i) => i.purchase_id === purchase.id)
          .map((i) => ({
            ...i,
            card: (singles || []).find((s) => s.id === i.single_id) || null,
          })),
      }));

      return json({ orders });
    }

    // ── MARK FULFILLED ──────────────────────────────────────────────────────
    if (action === 'mark_fulfilled') {
      const { id } = body;
      if (!id) return json({ error: 'id required' }, 400);

      const { data, error } = await adminSupabase
        .from('single_purchases')
        .update({ status: 'fulfilled' })
        .eq('id', id)
        .select()
        .single();

      if (error) return json({ error: error.message }, 500);
      return json({ success: true, purchase: data });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    console.error('admin-add-single error:', err);
    return json({ error: String(err) }, 500);
  }
});
