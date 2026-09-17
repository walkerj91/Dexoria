// supabase/functions/stripe-webhook/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'npm:stripe@17.4.0';

const STRIPE_SECRET_KEY          = Deno.env.get('STRIPE_SECRET_KEY')!;
const STRIPE_WEBHOOK_SECRET      = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;
const SUPABASE_URL               = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
});

serve(async (req) => {
  const body = await req.text();
  const signature = req.headers.get('stripe-signature');

  if (!signature) {
    return new Response('Missing stripe-signature header', { status: 400 });
  }

  // Real verification against STRIPE_WEBHOOK_SECRET (the previous version fetched
  // webhook_endpoints and ignored it, then parsed the body unverified — anyone
  // who found the URL could have posted a fake "completed" event).
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  const adminSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;

    // --- Donations flow (unchanged) ---
    await adminSupabase.from('donations')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('stripe_session_id', session.id);

    // --- Singles purchase flow ---
    const { data: purchase } = await adminSupabase
      .from('single_purchases')
      .select('id, status')
      .eq('stripe_session_id', session.id)
      .maybeSingle();

    if (purchase && purchase.status === 'pending') {
      await adminSupabase
        .from('single_purchases')
        .update({ status: 'paid' })
        .eq('id', purchase.id);

      const { data: items } = await adminSupabase
        .from('single_purchase_items')
        .select('single_id, quantity')
        .eq('purchase_id', purchase.id);

      for (const item of items || []) {
        const { data: single } = await adminSupabase
          .from('card_singles')
          .select('quantity_available, quantity_sold')
          .eq('id', item.single_id)
          .single();

        if (single) {
          const newAvailable = Math.max(0, single.quantity_available - item.quantity);
          await adminSupabase
            .from('card_singles')
            .update({
              quantity_available: newAvailable,
              quantity_sold: (single.quantity_sold || 0) + item.quantity,
              is_active: newAvailable > 0, // auto-hide once sold out
            })
            .eq('id', item.single_id);
        }
      }
    }
  }

  return new Response('ok', { status: 200 });
});
