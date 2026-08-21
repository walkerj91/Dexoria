// supabase/functions/capture-stripe-payment/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const STRIPE_SECRET_KEY    = Deno.env.get('STRIPE_SECRET_KEY')!;
const SENDCLOUD_PUBLIC_KEY = Deno.env.get('SENDCLOUD_PUBLIC_KEY')!;
const SENDCLOUD_SECRET_KEY = Deno.env.get('SENDCLOUD_SECRET_KEY')!;
const SENDCLOUD_AUTH       = 'Basic ' + btoa(`${SENDCLOUD_PUBLIC_KEY}:${SENDCLOUD_SECRET_KEY}`);
const SENDCLOUD_V3         = 'https://panel.sendcloud.sc/api/v3';
const RESEND_API_KEY       = Deno.env.get('RESEND_API_KEY')!;
const FROM_EMAIL           = 'trades@dexoria.com';
const SITE_URL             = Deno.env.get('SITE_URL') || 'https://dexoria.co.uk';
const TEST_MODE            = Deno.env.get('SENDCLOUD_TEST_MODE') === 'true';
const CARD_WEIGHT_KG       = 0.03;

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url = new URL(req.url);

  // ── DONATE (no auth required) ─────────────────────────────────────────────
  if (req.method === 'POST' && url.pathname.endsWith('/donate')) {
    try {
      const { amount, user_id } = await req.json();

      const formBody = new URLSearchParams({
        'mode': 'payment',
        'submit_type': 'donate',
        'line_items[0][quantity]': '1',
        'line_items[0][price_data][currency]': 'gbp',
        'line_items[0][price_data][unit_amount]': String(amount || 500),
        'line_items[0][price_data][product_data][name]': 'Dexoria – Site Support',
        'line_items[0][price_data][product_data][description]': 'One-time donation to keep Dexoria running',
        'success_url': `${SITE_URL}/thankyou`,
        'cancel_url': `${SITE_URL}/#donate`,
        ...(user_id ? { 'metadata[user_id]': user_id } : {}),
      });

      const sessionRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formBody.toString(),
      });

      const session = await sessionRes.json();
      if (session.error) throw new Error('Stripe error: ' + session.error.message);

      const adminSupabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );
      await adminSupabase.from('donations').insert({
        user_id:           user_id || null,
        stripe_session_id: session.id,
        amount_pence:      amount || 500,
        status:            'pending',
      });

      return json({ url: session.url });
    } catch (err) {
      console.error('Donation error:', err);
      return json({ error: String(err) }, 500);
    }
  }

  // ── LABEL DOWNLOAD PROXY (no auth required) ───────────────────────────────
  if (req.method === 'GET' && url.pathname.includes('/label/')) {
    const parcelId = url.pathname.split('/label/')[1];
    if (!parcelId) return json({ error: 'No parcel ID' }, 400);

    const labelRes = await fetch(
      `https://panel.sendcloud.sc/api/v2/labels/normal_printer/${parcelId}?start_from=0`,
      { headers: { 'Authorization': SENDCLOUD_AUTH } }
    );

    if (!labelRes.ok) {
      const err = await labelRes.text();
      console.error('Sendcloud label error:', err);
      return json({ error: 'Failed to fetch label' }, labelRes.status);
    }

    return new Response(labelRes.body, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="dexoria-label-${parcelId}.pdf"`,
      },
    });
  }

  // ── AUTH (trade flow only) ────────────────────────────────────────────────
  try {
    const authHeader = req.headers.get('Authorization')!;
    const supabase   = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const adminSupabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

    const { payment_intent_id, trade_id, address } = await req.json();
    if (!payment_intent_id || !trade_id) return json({ error: 'payment_intent_id and trade_id required' }, 400);

    // ── VERIFY STRIPE PAYMENT ─────────────────────────────────────────────────
    const piRes  = await fetch(`https://api.stripe.com/v1/payment_intents/${payment_intent_id}`, {
      headers: { 'Authorization': `Bearer ${STRIPE_SECRET_KEY}` },
    });
    const intent = await piRes.json();

    if (intent.error) throw new Error('Stripe error: ' + intent.error.message);
    if (intent.status !== 'succeeded') return json({ error: `Payment not completed (status: ${intent.status})` }, 400);
    if (intent.metadata?.trade_id !== trade_id) return json({ error: 'Payment/trade mismatch' }, 400);
    if (intent.metadata?.user_id  !== user.id)  return json({ error: 'Payment user mismatch' }, 403);

    console.log('Stripe payment verified:', payment_intent_id, 'amount:', intent.amount, 'status:', intent.status);

    // ── FETCH TRADE ───────────────────────────────────────────────────────────
    const { data: trade, error: tradeErr } = await supabase
      .from('trade_proposals')
      .select('id, sender_id, receiver_id, sender_card_name, receiver_card_name')
      .eq('id', trade_id).single();

    if (tradeErr || !trade) return json({ error: 'Trade not found: ' + (tradeErr?.message || 'null') }, 404);

    const isSender = user.id === trade.sender_id;
    const myId     = user.id;
    const themId   = isSender ? trade.receiver_id : trade.sender_id;

    // ── FETCH PROFILES ────────────────────────────────────────────────────────
    const [meRes, themRes] = await Promise.all([
      adminSupabase.from('profiles')
        .select('id, username, full_name, address_line1, address_line2, city, postcode, phone')
        .eq('id', myId).maybeSingle(),
      adminSupabase.from('profiles')
        .select('id, username, full_name, address_line1, address_line2, city, postcode, phone')
        .eq('id', themId).maybeSingle(),
    ]);

    const meProfile   = meRes.data  || { id: myId };
    const themProfile = themRes.data || { id: themId };
    const meEmail     = user.email  || '';

    if (!themProfile.address_line1 || !themProfile.city || !themProfile.postcode) {
      return json({ error: 'Your trading partner has not entered their delivery address yet.' }, 400);
    }

    const senderAddr    = { ...(address || meProfile), email: meEmail };
    const recipientAddr = { ...themProfile };

    console.log(`Sender: ${senderAddr.city} ${senderAddr.postcode} | Recipient: ${recipientAddr.city} ${recipientAddr.postcode} | TEST_MODE: ${TEST_MODE}`);

    // ── CREATE SENDCLOUD LABEL ────────────────────────────────────────────────
    const label = await createSendcloudLabel(senderAddr, recipientAddr);
    console.log('Label created. Tracking:', label.tracking_number);

    // ── UPSERT trade_shipments ────────────────────────────────────────────────
    const { data: shipmentRow, error: shipErr } = await adminSupabase
      .from('trade_shipments')
      .upsert({
        trade_id,
        user_id:            user.id,
        payment_status:     'paid',
        paypal_capture_id:  payment_intent_id,
        tracking_code:      label.tracking_number || 'PENDING',
        carrier:            label.carrier_code || (TEST_MODE ? 'test' : 'sendcloud'),
        label_url:          label.label_file || '',
        qr_code_url:        label.label_file || '',
        direction:          isSender ? 'sender_to_receiver' : 'receiver_to_sender',
        label_emailed_at:   new Date().toISOString(),
      }, { onConflict: 'trade_id,user_id' })
      .select().single();

    if (shipErr) return json({ error: 'Shipment record error: ' + shipErr.message }, 500);

    // ── LOG EARNINGS ──────────────────────────────────────────────────────────
    await adminSupabase.from('dexoria_earnings').insert({
      source_type: 'shipping_margin', source_id: shipmentRow.id,
      trade_id, user_id: user.id, amount: shipmentRow.dexoria_margin || 0,
    }).then(({ error }) => { if (error) console.warn('Earnings log skipped:', error.message); });

    // ── UPDATE TRADE STATUS ───────────────────────────────────────────────────
    const { data: other } = await adminSupabase
      .from('trade_shipments').select('payment_status')
      .eq('trade_id', trade_id).neq('user_id', user.id).maybeSingle();

    await supabase.from('trade_proposals')
      .update({ status: other?.payment_status === 'paid' ? 'active' : 'shipping_pending' })
      .eq('id', trade_id);

    // ── SEND EMAIL ────────────────────────────────────────────────────────────
    if (meEmail && !TEST_MODE) {
      await sendLabelEmail({
        to: meEmail, username: meProfile.username || meProfile.full_name || 'Trainer',
        labelUrl: shipmentRow.label_url, tracking: shipmentRow.tracking_code,
        partnerName: themProfile.username || 'your trading partner', tradeId: trade_id,
      });
    }

    return json({ success: true, shipment: shipmentRow });

  } catch (err) {
    console.error('capture-stripe-payment error:', err);
    return json({ error: String(err) }, 500);
  }
});

// ─── SENDCLOUD LABEL (v3) ─────────────────────────────────────────────────────
async function createSendcloudLabel(sender: any, recipient: any) {
  const shippingOptionCode = TEST_MODE ? 'sendcloud:letter' : await getCheapestOptionCode();
  console.log('Sendcloud shipping option:', shippingOptionCode);

  const res  = await fetch(`${SENDCLOUD_V3}/shipments/create-with-shipping-rules`, {
    method:  'POST',
    headers: { 'Authorization': SENDCLOUD_AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from_address: {
        name: sender.full_name || sender.username || 'Sender',
        address_line_1: sender.address_line1 || '', address_line_2: sender.address_line2 || '',
        city: sender.city || '', postal_code: sender.postcode || '',
        country_code: 'GB', phone_number: sender.phone || '07000000000', email: sender.email || '',
      },
      to_address: {
        name: recipient.full_name || recipient.username || 'Recipient',
        address_line_1: recipient.address_line1 || '', address_line_2: recipient.address_line2 || '',
        city: recipient.city || '', postal_code: recipient.postcode || '',
        country_code: 'GB', phone_number: recipient.phone || '07000000000', email: recipient.email || '',
      },
      ship_with: { type: 'shipping_option_code', properties: { shipping_option_code: shippingOptionCode } },
      parcels: [{ weight: { value: CARD_WEIGHT_KG, unit: 'kg' } }],
    }),
  });

  const data = await res.json();
  if (!res.ok || data.error) throw new Error(`Sendcloud error: ${data.error?.message || JSON.stringify(data)}`);

  const parcel = data.data?.parcels?.[0];
  if (!parcel?.id) throw new Error('Sendcloud returned no parcel: ' + JSON.stringify(data));

  const { tracking_number, label_file } = await pollForLabel(parcel.id, data.data?.id);
  return { tracking_number, label_file, carrier_code: shippingOptionCode.split(':')[0] };
}

async function pollForLabel(parcelId: number, shipmentId: string) {
  for (let i = 1; i <= 12; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const res  = await fetch(`${SENDCLOUD_V3}/shipments/${shipmentId}`, { headers: { 'Authorization': SENDCLOUD_AUTH } });
    const data = await res.json();
    const p    = data.data?.parcels?.find((x: any) => x.id === parcelId);
    const status = p?.status?.code || '';
    console.log(`Poll ${i}: status=${status} tracking=${p?.tracking_number || ''}`);
    if (status === 'ERROR' || status === 'CANCELLED') throw new Error(`Sendcloud parcel failed: ${status}`);
    if (p?.tracking_number) {
      return {
        tracking_number: p.tracking_number,
        label_file: `${Deno.env.get('SUPABASE_URL')}/functions/v1/capture-stripe-payment/label/${parcelId}`,
      };
    }
  }
  return {
    tracking_number: `PENDING-${parcelId}`,
    label_file: `${Deno.env.get('SUPABASE_URL')}/functions/v1/capture-stripe-payment/label/${parcelId}`,
  };
}

async function getCheapestOptionCode(): Promise<string> {
  const res  = await fetch(`${SENDCLOUD_V3}/shipping-options?from_country=GB&to_country=GB&weight=${CARD_WEIGHT_KG}&weight_unit=kg`, {
    headers: { 'Authorization': SENDCLOUD_AUTH },
  });
  const data = await res.json();
  const opts: any[] = data.data ?? [];
  const evri = opts.find(o => o.carrier?.code?.toLowerCase().includes('hermes') || o.carrier?.code?.toLowerCase().includes('evri'));
  return (evri || opts[0])?.code || 'sendcloud:letter';
}

async function sendLabelEmail({ to, username, labelUrl, tracking, partnerName, tradeId }: any) {
  if (!to) return;
  const deadline = new Date(Date.now() + 48 * 60 * 60 * 1000).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM_EMAIL, to, subject: 'Your Dexoria Shipping Label is Ready',
      html: `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>body{background:#0a0a0a;color:#f0f0f0;font-family:'Segoe UI',sans-serif;margin:0;padding:0}.wrap{max-width:520px;margin:0 auto;padding:2rem 1rem}.logo{font-family:Georgia,serif;font-size:1.5rem;color:#F5D06B;letter-spacing:.1em;margin-bottom:1.5rem}h1{font-size:1.2rem;color:#F5D06B;margin:0 0 .5rem}p{color:#aaa;font-size:.9rem;line-height:1.6;margin:.5rem 0}.info-box{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;padding:1rem 1.25rem;margin:.75rem 0}.lbl{font-size:.7rem;text-transform:uppercase;letter-spacing:.1em;color:#555;margin-bottom:.2rem}.val{font-size:.95rem;font-weight:600;color:#f0f0f0}.mono{font-family:monospace;color:#F5D06B}.btn{display:inline-block;background:linear-gradient(135deg,#C89B2A,#8B6A18);color:#000;padding:.65rem 1.5rem;border-radius:8px;text-decoration:none;font-weight:700;font-size:.9rem;margin:.5rem .5rem 0 0}.footer{color:#444;font-size:.75rem;margin-top:2rem;border-top:1px solid #1a1a1a;padding-top:1rem}</style></head><body><div class="wrap"><div class="logo">DEXORIA</div><h1>Your label is ready, ${username}!</h1><p>Your trade with <strong style="color:#f0f0f0">${partnerName}</strong> is confirmed.</p><div class="info-box"><div class="lbl">Tracking number</div><div class="val mono">${tracking}</div></div><div class="info-box"><div class="lbl">Drop off by</div><div class="val">${deadline}</div></div><a href="${labelUrl}" class="btn">Download Label</a><a href="${SITE_URL}/HTML/trade-confirmation.html?trade_id=${tradeId}" class="btn">View in Dexoria</a><div class="footer">&copy; ${new Date().getFullYear()} Dexoria &middot; <a href="${SITE_URL}" style="color:#555">dexoria.co.uk</a></div></div></body></html>`,
    }),
  }).then(r => { if (!r.ok) r.text().then(t => console.error('Resend error:', t)); });
}