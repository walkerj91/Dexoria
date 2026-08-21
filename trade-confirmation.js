// JS/trade-confirmation.js
import { supabase } from 'supabaseClient.js';

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const STRIPE_PUBLISHABLE_KEY = 'pk_live_51TqgPX3xUZJX6nAg6YwQNk5Hx2QZST2OCyyNFDPrhqoCregpTW71wGQnmREYm1MOgqW9iwN2C1rgz7dUE1OmCJEI00JNxnqpEt'; // Replace with your live key from stripe.com/dashboard
const SHIPPING_PRICE   = 1.99;
const SHIPPING_SERVICE = 'Evri Drop-off';

// ─── STATE ────────────────────────────────────────────────────────────────────
let tradeId         = null;
let currentUser     = null;
let tradeData       = null;
let shipmentRow     = null;
let savedAddress    = null;   // address already on profile
let confirmedAddress = null;  // address confirmed for this trade
let realtimeChannel = null;

// ─── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  tradeId = params.get('trade_id');
  if (!tradeId) return showError('No trade ID found in URL.');

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { window.location.href = '/HTML/login.html'; return; }
  currentUser = user;

  bindAddressFormEvents();
  await loadTrade();
  subscribeToShipmentUpdates();
  showWelcomeModal();
});

// ─── LOAD TRADE ───────────────────────────────────────────────────────────────
async function loadTrade() {
  const { data, error } = await supabase
    .from('trade_proposals')
    .select('id, status, sender_id, receiver_id, sender_card_name, sender_card_image, sender_card_set, sender_card_value, receiver_card_name, receiver_card_image, receiver_card_set, receiver_card_value, sender_accepted, receiver_accepted')
    .eq('id', tradeId).single();

  if (error) { console.error('loadTrade error:', error); return showError('Trade not found. (' + error.message + ')'); }
  if (!data)  return showError('Trade not found.');
  if (!data.sender_accepted || !data.receiver_accepted) return showError('This trade has not been agreed by both parties yet.');

  const [sRes, rRes] = await Promise.all([
    supabase.from('profiles').select('id, username, avatar_url, full_name').eq('id', data.sender_id).maybeSingle(),
    supabase.from('profiles').select('id, username, avatar_url, full_name').eq('id', data.receiver_id).maybeSingle()
  ]);

  data.sender   = sRes.data || { id: data.sender_id,   username: 'Unknown' };
  data.receiver = rRes.data || { id: data.receiver_id, username: 'Unknown' };

  const { data: addr } = await supabase.from('profiles')
    .select('full_name, address_line1, address_line2, city, postcode, phone')
    .eq('id', currentUser.id).maybeSingle();

  if (addr?.address_line1 && addr?.city && addr?.postcode) {
    savedAddress = { full_name: addr.full_name || '', address_line1: addr.address_line1, address_line2: addr.address_line2 || '', city: addr.city, postcode: addr.postcode, phone: addr.phone || '' };
  }

  tradeData = data;
  renderTradeSummary();
  await loadShipmentState();
}

// ─── CARD IMAGE LOADER ────────────────────────────────────────────────────────
// Shows a shimmer placeholder while loading, reveals image on load,
// keeps placeholder visible on error.
function setCardImage(imgId, src) {
  const img    = document.getElementById(imgId);
  const frame  = img?.closest('.tc-card-frame');
  if (!img || !frame) return;

  if (!src) {
    // No image available — show placeholder only
    frame.classList.add('tc-card-empty');
    img.style.display = 'none';
    return;
  }

  // Show shimmer while loading
  frame.classList.add('tc-card-loading');
  frame.classList.remove('tc-card-empty');
  img.style.display = 'none';

  img.onload = () => {
    frame.classList.remove('tc-card-loading');
    img.style.display = 'block';
  };

  img.onerror = () => {
    frame.classList.remove('tc-card-loading');
    frame.classList.add('tc-card-empty');
    img.style.display = 'none';
  };

  img.src = src;
}

// ─── PARTNER AVATAR ───────────────────────────────────────────────────────────
function setPartnerAvatar(partner) {
  const img = document.getElementById('partner-avatar');
  const bar = img?.closest('.tc-partner-bar');
  if (!img || !bar) return;
  bar.querySelector('.tc-partner-avatar-fallback')?.remove();
  const initial = (partner.username || '?')[0].toUpperCase();
  if (partner.avatar_url) {
    img.src = partner.avatar_url; img.style.display = 'block';
    img.onerror = () => { img.style.display = 'none'; bar.insertBefore(createLetterAvatar(initial), img.nextSibling); };
  } else { img.style.display = 'none'; bar.insertBefore(createLetterAvatar(initial), img.nextSibling); }
}
function createLetterAvatar(initial) {
  const el = document.createElement('div');
  el.className = 'tc-partner-avatar tc-partner-avatar-fallback';
  el.textContent = initial; el.style.display = 'flex'; return el;
}
// ─── RENDER TRADE SUMMARY ─────────────────────────────────────────────────────
function renderTradeSummary() {
  const isSender = currentUser.id === tradeData.sender_id;
  const them     = isSender ? tradeData.receiver : tradeData.sender;

  const myName    = isSender ? tradeData.sender_card_name    : tradeData.receiver_card_name;
  const myImage   = isSender ? tradeData.sender_card_image   : tradeData.receiver_card_image;
  const myValue   = isSender ? tradeData.sender_card_value   : tradeData.receiver_card_value;
  const theirName  = isSender ? tradeData.receiver_card_name  : tradeData.sender_card_name;
  const theirImage = isSender ? tradeData.receiver_card_image : tradeData.sender_card_image;
  const theirValue = isSender ? tradeData.receiver_card_value : tradeData.sender_card_value;

  // ── Card images ──────────────────────────────────────────
  setCardImage('your-card-img', myImage);
  document.getElementById('your-card-img').alt           = myName   || 'Your card';
  document.getElementById('your-card-name').textContent  = myName   || '—';
  document.getElementById('your-card-value').textContent = myValue  ? `£${Number(myValue).toFixed(2)}`   : '—';

  setCardImage('their-card-img', theirImage);
  document.getElementById('their-card-img').alt           = theirName  || 'Their card';
  document.getElementById('their-card-name').textContent  = theirName  || '—';
  document.getElementById('their-card-value').textContent = theirValue ? `£${Number(theirValue).toFixed(2)}` : '—';

  setPartnerAvatar(them);
  document.getElementById('partner-username').textContent   = them.username;
  document.getElementById('waiting-for-name').textContent   = them.username;
  document.getElementById('partner-label-name').textContent = them.username;

  if (myValue && theirValue) {
    const diff = Math.abs(Number(myValue) - Number(theirValue));
    if (diff > 0.01) {
      const isHigher = Number(myValue) > Number(theirValue);
      document.getElementById('value-diff-banner').hidden = false;
      document.getElementById('value-diff-amount').textContent = `£${diff.toFixed(2)}`;
      document.getElementById('value-diff-note').textContent   = isHigher
        ? `${them.username} owes you the difference`
        : `You owe ${them.username} the difference`;
    }
  }

  document.getElementById('shipping-service-label').textContent = SHIPPING_SERVICE;
  document.getElementById('shipping-total').textContent         = `£${SHIPPING_PRICE.toFixed(2)}`;
  document.getElementById('payment-service-label').textContent  = SHIPPING_SERVICE;
  document.getElementById('payment-total').textContent          = `£${SHIPPING_PRICE.toFixed(2)}`;

  // Summary continue button
  document.getElementById('summary-continue-btn').addEventListener('click', () => {
    showStep('address');
    setProgressStep(2);
    populateAddressForm();
  });
}

// ─── ADDRESS FORM ─────────────────────────────────────────────────────────────
function bindAddressFormEvents() {
  // Postcode → uppercase automatically
  document.getElementById('addr-postcode').addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase();
  });

  // Toggle form visibility when "use saved address" checkbox changes
  document.getElementById('use-saved-address')?.addEventListener('change', (e) => {
    document.getElementById('address-form-block').style.display = e.target.checked ? 'none' : 'flex';
  });

  // "Edit" link next to saved address preview
  document.getElementById('edit-address-btn')?.addEventListener('click', () => {
    document.getElementById('use-saved-address').checked = false;
    document.getElementById('address-form-block').style.display = 'flex';
    document.getElementById('addr-fullname').focus();
  });

  // Back button
  document.getElementById('address-back-btn').addEventListener('click', () => {
    showStep('summary');
    setProgressStep(1);
  });

  // Continue to payment
  document.getElementById('address-continue-btn').addEventListener('click', handleAddressContinue);

  // Edit address from payment step
  document.getElementById('payment-edit-address-btn').addEventListener('click', () => {
    showStep('address');
    setProgressStep(2);
  });
}

function populateAddressForm() {
  if (!savedAddress) {
    // No saved address — show blank form
    document.getElementById('saved-address-block').hidden = true;
    document.getElementById('address-form-block').style.display = 'flex';
    return;
  }

  // Show saved address preview
  const block = document.getElementById('saved-address-block');
  block.hidden = false;
  document.getElementById('saved-address-text').innerHTML = formatAddressHtml(savedAddress);

  // Pre-fill form fields too (for if they click Edit)
  document.getElementById('addr-fullname').value  = savedAddress.full_name    || '';
  document.getElementById('addr-line1').value     = savedAddress.address_line1 || '';
  document.getElementById('addr-line2').value     = savedAddress.address_line2 || '';
  document.getElementById('addr-city').value      = savedAddress.city          || '';
  document.getElementById('addr-postcode').value  = savedAddress.postcode      || '';
  document.getElementById('addr-phone').value     = savedAddress.phone         || '';

  // Hide form by default (they can click Edit to show it)
  document.getElementById('address-form-block').style.display = 'none';
}

function handleAddressContinue() {
  hideError('address-error');

  const usingSaved = savedAddress &&
    document.getElementById('use-saved-address')?.checked &&
    document.getElementById('address-form-block').style.display === 'none';

  let address;

  if (usingSaved) {
    address = { ...savedAddress };
  } else {
    const fullname  = document.getElementById('addr-fullname').value.trim();
    const line1     = document.getElementById('addr-line1').value.trim();
    const line2     = document.getElementById('addr-line2').value.trim();
    const city      = document.getElementById('addr-city').value.trim();
    const postcode  = document.getElementById('addr-postcode').value.trim().toUpperCase();
    const phone     = document.getElementById('addr-phone').value.trim();

    // Validate required fields
    if (!fullname)  return showFieldError('address-error', 'Full name is required.');
    if (!line1)     return showFieldError('address-error', 'Address line 1 is required.');
    if (!city)      return showFieldError('address-error', 'Town or city is required.');
    if (!postcode)  return showFieldError('address-error', 'Postcode is required.');
    if (!isValidUKPostcode(postcode)) return showFieldError('address-error', 'Please enter a valid UK postcode.');

    address = { full_name: fullname, address_line1: line1, address_line2: line2, city, postcode, phone };

    // Save to profile if checkbox ticked
    if (document.getElementById('save-address-checkbox').checked) {
      saveAddressToProfile(address);  // fire-and-forget
    }
  }

  confirmedAddress = address;

  // Show address recap on payment step
  document.getElementById('payment-address-text').textContent = formatAddressLine(address);

  showStep('payment');
  setProgressStep(3);
  initStripe(); // mount Stripe Elements now that container is visible
}

async function saveAddressToProfile(address) {
  await supabase.from('profiles').update({
    full_name:    address.full_name,
    address_line1: address.address_line1,
    address_line2: address.address_line2,
    city:          address.city,
    postcode:      address.postcode,
    phone:         address.phone,
  }).eq('id', currentUser.id);
}

// ─── LOAD EXISTING SHIPMENT STATE ─────────────────────────────────────────────
async function loadShipmentState() {
  const { data: shipments } = await supabase
    .from('trade_shipments')
    .select('*')
    .eq('trade_id', tradeId);

  if (!shipments || shipments.length === 0) return;

  const mine   = shipments.find(s => s.user_id === currentUser.id);
  const theirs = shipments.find(s => s.user_id !== currentUser.id);

  if (mine?.payment_status === 'paid' && mine?.qr_code_url) {
    if (theirs?.payment_status === 'paid') {
      renderBothLabels(mine, theirs);
      showStep('active');
      setProgressStep(4);
    } else {
      renderMyLabel(mine);
      showStep('label');
      setProgressStep(4);
      setPartnerLabelStatus('awaiting payment');
    }
  } else if (mine?.payment_status === 'paid') {
    showStep('processing');
  }

  if (theirs?.payment_status === 'paid') updatePartnerPaymentBadge(true);

  shipmentRow = mine?.payment_status === 'paid' ? mine : null;
}

// ─── PAYPAL SDK ───────────────────────────────────────────────────────────────
let stripeInstance   = null;
let stripeElements   = null;
let paymentElement   = null;
let stripeInitialized = false;

async function initStripe() {
  if (stripeInitialized) return;
  stripeInitialized = true;

  if (!STRIPE_PUBLISHABLE_KEY || STRIPE_PUBLISHABLE_KEY === 'YOUR_STRIPE_PUBLISHABLE_KEY') {
    console.error('[Stripe] Publishable key not set');
    document.getElementById('stripe-error-msg').textContent = 'Payment not configured. Please contact support.';
    document.getElementById('stripe-error-msg').hidden = false;
    return;
  }

  try {
    // Create PaymentIntent on server
    const session = (await supabase.auth.getSession()).data.session;
    const url     = `${getSupabaseUrl()}/functions/v1/create-payment-intent`;
    console.log('[Stripe] Creating PaymentIntent via', url);

    const res  = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
      body:    JSON.stringify({ trade_id: tradeId }),
    });
    const body = await res.json();
    console.log('[Stripe] PaymentIntent response:', res.status, body.clientSecret ? 'got clientSecret' : body);

    if (!res.ok || body.error) throw new Error(body.error || `HTTP ${res.status}`);

    // Mount Stripe Elements
    stripeInstance = Stripe(STRIPE_PUBLISHABLE_KEY);
    stripeElements = stripeInstance.elements({ clientSecret: body.clientSecret, appearance: {
      theme: 'night',
      variables: {
        colorPrimary:    '#C89B2A',
        colorBackground: '#141414',
        colorText:       '#f0f0f0',
        colorDanger:     '#e74c3c',
        fontFamily:      'Rajdhani, sans-serif',
        borderRadius:    '8px',
      },
    }});

    paymentElement = stripeElements.create('payment');
    paymentElement.mount('#stripe-payment-element');

    // Wire pay button
    document.getElementById('stripe-pay-btn').addEventListener('click', handleStripePayment);
    console.log('[Stripe] Elements mounted');

  } catch (err) {
    stripeInitialized = false;
    console.error('[Stripe] initStripe error:', err);
    const errEl = document.getElementById('stripe-error-msg');
    errEl.textContent = 'Could not load payment form: ' + err.message;
    errEl.hidden = false;
  }
}

async function handleStripePayment() {
  if (!stripeInstance || !stripeElements) return;

  const btn   = document.getElementById('stripe-pay-btn');
  const errEl = document.getElementById('stripe-error-msg');
  btn.disabled     = true;
  btn.textContent  = 'Processing…';
  errEl.hidden     = true;

  try {
    // Confirm the payment — Stripe handles 3DS, Apple Pay, Google Pay etc.
    const { error, paymentIntent } = await stripeInstance.confirmPayment({
      elements: stripeElements,
      redirect: 'if_required', // stay on page if no redirect needed
      confirmParams: {
        return_url: window.location.href, // fallback for redirect flows
      },
    });

    if (error) {
      console.error('[Stripe] confirmPayment error:', error);
      errEl.textContent = error.message || 'Payment failed. Please try again.';
      errEl.hidden      = false;
      btn.disabled      = false;
      btn.textContent   = 'Pay £1.99 Securely';
      return;
    }

    if (paymentIntent?.status === 'succeeded') {
      await captureStripePayment(paymentIntent.id);
    }

  } catch (err) {
    console.error('[Stripe] handleStripePayment error:', err);
    errEl.textContent = 'Payment error: ' + err.message;
    errEl.hidden      = false;
    btn.disabled      = false;
    btn.textContent   = 'Pay £1.99 Securely';
  }
}

async function captureStripePayment(paymentIntentId) {
  showStep('processing');
  try {
    const session = (await supabase.auth.getSession()).data.session;
    const url     = `${getSupabaseUrl()}/functions/v1/capture-stripe-payment`;
    console.log('[Stripe] Capture → POST', url, 'pi:', paymentIntentId);

    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 55000);
    let res;
    try {
      res = await fetch(url, {
        signal:  controller.signal,
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body:    JSON.stringify({ payment_intent_id: paymentIntentId, trade_id: tradeId, address: confirmedAddress }),
      });
    } finally { clearTimeout(timeout); }

    const result = await res.json();
    console.log('[Stripe] Capture response:', res.status, result);

    if (result.success) {
      shipmentRow = result.shipment;
      await loadShipmentState();
      setProgressStep(4);
    } else {
      console.error('[Stripe] Capture failed:', result.error);
      showError('Payment taken but label generation failed: ' + (result.error || 'unknown'));
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      showError('Payment was taken but the label is taking longer than expected. Please refresh — your label will appear shortly.');
    } else {
      console.error('[Stripe] captureStripePayment error:', err);
      showError('Error: ' + (err.message || String(err)));
    }
  }
}



// ─── RENDER LABEL STEP ────────────────────────────────────────────────────────
function renderMyLabel(shipment) {
  shipmentRow = shipment;

  const carrier  = shipment.carrier       || 'Evri';
  const tracking = shipment.tracking_code || '—';

  // Label card (top of step 5)
  document.getElementById('label-carrier').textContent  = carrier;
  document.getElementById('label-tracking').textContent = tracking;
  document.getElementById('download-label-btn').href    = shipment.label_url || '#';

  // Tracking strip (below label card)
  const carrierFull  = document.getElementById('label-carrier-full');
  const trackingFull = document.getElementById('label-tracking-full');
  if (carrierFull)  carrierFull.textContent  = carrier;
  if (trackingFull) trackingFull.textContent = tracking;

  // Drop-off deadline — 48 hours from now
  const deadline = new Date(Date.now() + 48 * 60 * 60 * 1000);
  const deadlineEl = document.getElementById('label-dropoff-deadline');
  if (deadlineEl) deadlineEl.textContent = deadline.toLocaleDateString(
    'en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }
  );

  // Email confirmation
  supabase.auth.getUser().then(({ data: { user } }) => {
    const emailEl = document.getElementById('label-email-sent-to');
    if (emailEl) emailEl.textContent = user?.email || '—';
  });

  // Tracking link
  document.getElementById('view-tracking-btn')?.addEventListener('click', () => {
    window.open(`https://www.evri.com/track-a-parcel#${tracking}`, '_blank');
  });

  // Chat link
  const chatLink = document.getElementById('go-to-chat-from-label');
  if (chatLink) chatLink.href = `trades.html?trade_id=${tradeId}`;
}

function renderBothLabels(mine, theirs) {
  const isSender = currentUser.id === tradeData.sender_id;
  const them     = isSender ? tradeData.receiver : tradeData.sender;

  document.getElementById('your-mini-name').textContent     = 'You';
  document.getElementById('your-mini-tracking').textContent = mine.tracking_code  || '—';
  document.getElementById('their-mini-name').textContent    = them.username;
  document.getElementById('their-mini-tracking').textContent = theirs.tracking_code || '—';
  document.getElementById('go-to-chat-btn').href            = `/HTML/trades.html?user=${them.username}`;
}

// ─── REALTIME ─────────────────────────────────────────────────────────────────
function subscribeToShipmentUpdates() {
  realtimeChannel = supabase
    .channel(`shipment:${tradeId}`)
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'trade_shipments',
      filter: `trade_id=eq.${tradeId}`
    }, (payload) => handleShipmentUpdate(payload.new))
    .subscribe();
}

function handleShipmentUpdate(updated) {
  if (updated.user_id === currentUser.id) return;
  if (updated.payment_status === 'paid') {
    updatePartnerPaymentBadge(true);
    setPartnerLabelStatus('label sent ✓');
    if (shipmentRow?.payment_status === 'paid') {
      setTimeout(() => loadShipmentState(), 1000);
    }
  }
}

// ─── PROGRESS BAR ─────────────────────────────────────────────────────────────
function setProgressStep(step) {
  // Steps: 1=summary, 2=address, 3=payment, 4=label
  // Circles: prog-1 through prog-4
  // Lines:   prog-line-1 through prog-line-3
  for (let i = 1; i <= 4; i++) {
    const circle = document.getElementById(`prog-${i}`);
    const line   = document.getElementById(`prog-line-${i}`);
    if (circle) {
      circle.classList.toggle('tc-step-active',   i <= step);
      circle.classList.toggle('tc-step-complete', i < step);
    }
    if (line) {
      line.classList.toggle('tc-line-done', i < step);
    }
  }
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function formatAddressLine(a) {
  return [a.full_name, a.address_line1, a.address_line2, a.city, a.postcode]
    .filter(Boolean).join(', ');
}

function formatAddressHtml(a) {
  const lines = [a.full_name, a.address_line1, a.address_line2, a.city, a.postcode].filter(Boolean);
  return lines.join('<br>');
}

function isValidUKPostcode(postcode) {
  return /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i.test(postcode.trim());
}

function showFieldError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
}

function hideError(id) {
  const el = document.getElementById(id);
  if (el) el.hidden = true;
}

function setPartnerLabelStatus(text) {
  const dot  = document.querySelector('#partner-label-status .tc-dot');
  const span = document.getElementById('partner-label-text');
  if (span) span.textContent = text;
  if (dot) {
    dot.classList.toggle('tc-dot-pending', text !== 'label sent ✓');
    dot.classList.toggle('tc-dot-active',  text === 'label sent ✓');
  }
}

function updatePartnerPaymentBadge(paid) {
  const el = document.getElementById('partner-payment-status');
  if (!el) return;
  el.innerHTML = paid
    ? `<span class="tc-dot tc-dot-active"></span> Shipping paid`
    : `<span class="tc-dot tc-dot-pending"></span> Awaiting payment`;
}

function showStep(step) {
  document.querySelectorAll('.tc-panel').forEach(el => {
    el.classList.toggle('tc-hidden', el.dataset.step !== step);
  });
}

function getSupabaseUrl() {
  return supabase.supabaseUrl || '';
}

function showError(message) {
  document.querySelector('.tc-main').innerHTML = `
    <div class="tc-error">
      <p class="tc-error-icon">⚠</p>
      <p class="tc-error-msg">${message}</p>
      <a href="trades.html" class="dex-btn dex-btn-ghost">Back to Trades</a>
    </div>`;
}

window.addEventListener('beforeunload', () => realtimeChannel?.unsubscribe());

// ─── WELCOME MODAL ────────────────────────────────────────────────────────────
// Structure and text live in trade-confirmation.html.
// CSS classes live in trade-confirmation.css.
// This function just makes it visible and wires the close button.
function showWelcomeModal() {
  const modal  = document.getElementById('tcWelcomeModal');
  const btn    = document.getElementById('tcwStartBtn');
  if (!modal) return;

  modal.classList.remove('tc-hidden');

  const close = () => modal.classList.add('tc-hidden');
  btn?.addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
}
