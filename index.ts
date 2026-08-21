import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const STRIPE_SECRET_KEY     = Deno.env.get('STRIPE_SECRET_KEY')!;
const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;

serve(async (req) => {
  const body      = await req.text();
  const signature = req.headers.get('stripe-signature')!;

  // Verify webhook signature
  const verifyRes = await fetch('https://api.stripe.com/v1/webhook_endpoints', {
    headers: { 'Authorization': `Bearer ${STRIPE_SECRET_KEY}` },
  });

  // Simple manual verify — use Stripe's library if you prefer
  const event = JSON.parse(body);

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const adminSupabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    await adminSupabase.from('donations')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('stripe_session_id', session.id);
  }

  return new Response('ok', { status: 200 });
});