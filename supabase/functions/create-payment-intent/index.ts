// supabase/functions/create-payment-intent/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')!;
const STRIPE_API        = 'https://api.stripe.com/v1';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

function stripePost(path: string, params: Record<string, string>) {
  return fetch(`${STRIPE_API}${path}`, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type':  'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params).toString(),
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const authHeader = req.headers.get('Authorization')!;
    const supabase   = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

    const { trade_id } = await req.json();
    if (!trade_id) return json({ error: 'trade_id required' }, 400);

    // Verify user is part of this trade
    const { data: trade, error: tradeErr } = await supabase
      .from('trade_proposals')
      .select('id, sender_id, receiver_id, status')
      .eq('id', trade_id)
      .single();

    if (tradeErr || !trade) return json({ error: 'Trade not found' }, 404);
    if (trade.sender_id !== user.id && trade.receiver_id !== user.id) return json({ error: 'Forbidden' }, 403);

    // Create Stripe PaymentIntent — £1.99 in pence
    const res  = await stripePost('/payment_intents', {
      amount:   '199',
      currency: 'gbp',
      'metadata[trade_id]':  trade_id,
      'metadata[user_id]':   user.id,
      'automatic_payment_methods[enabled]': 'true',
    });

    const intent = await res.json();
    if (intent.error) throw new Error(intent.error.message);

    console.log('PaymentIntent created:', intent.id, 'for trade:', trade_id);

    return json({ clientSecret: intent.client_secret });

  } catch (err) {
    console.error('create-payment-intent error:', err);
    return json({ error: String(err) }, 500);
  }
});