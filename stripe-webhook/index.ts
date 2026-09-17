// supabase/functions/stripe-webhook/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;

serve(async (req) => {
  const body      = await req.text();
  const signature = req.headers.get('stripe-signature');

  if (!signature) {
    return new Response('Missing stripe-signature header', { status: 400 });
  }

  // Real verification against STRIPE_WEBHOOK_SECRET, done by hand with Web Crypto
  // so we don't add the Stripe SDK as a new dependency (nothing else in the app
  // uses it — everywhere else calls api.stripe.com directly with fetch).
  // The previous version fetched /webhook_endpoints and ignored the result, then
  // parsed the body unverified — anyone who found the URL could've posted a fake
  // "completed" event.
  const isValid = await verifyStripeSignature(body, signature, STRIPE_WEBHOOK_SECRET);
  if (!isValid) {
    console.error('Webhook signature verification failed');
    return new Response('Invalid signature', { status: 400 });
  }

  const event = JSON.parse(body);
  const adminSupabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

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
              quantity_sold:      (single.quantity_sold || 0) + item.quantity,
              is_active:          newAvailable > 0, // auto-hide once sold out
            })
            .eq('id', item.single_id);
        }
      }
    }
  }

  return new Response('ok', { status: 200 });
});

// ─── STRIPE SIGNATURE VERIFICATION (manual, Web Crypto) ───────────────────────
async function verifyStripeSignature(payload: string, sigHeader: string, secret: string): Promise<boolean> {
  const parts = Object.fromEntries(sigHeader.split(',').map((p) => p.split('=')));
  const timestamp = parts['t'];
  const v1 = parts['v1'];
  if (!timestamp || !v1) return false;

  // Reject events older than 5 minutes to prevent replay attacks
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (age > 300) return false;

  const signedPayload = `${timestamp}.${payload}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
  const expectedSig = Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return timingSafeEqual(expectedSig, v1);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
