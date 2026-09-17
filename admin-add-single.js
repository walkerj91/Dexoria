// admin-add-single.js
import { supabase } from './supabaseClient.js';

const authGate = document.getElementById('admin-auth-gate');
const form = document.getElementById('admin-add-single-form');

const idInput = document.getElementById('tcgdex-id-input');
const lookupBtn = document.getElementById('lookup-btn');
const lookupError = document.getElementById('lookup-error');

const preview = document.getElementById('card-preview');
const previewImg = document.getElementById('preview-img');
const previewName = document.getElementById('preview-name');
const previewSet = document.getElementById('preview-set');
const previewRarity = document.getElementById('preview-rarity');

const priceInput = document.getElementById('price-input');
const quantityInput = document.getElementById('quantity-input');
const submitBtn = document.getElementById('submit-btn');
const submitSuccess = document.getElementById('submit-success');
const submitError = document.getElementById('submit-error');

let currentCard = null; // holds the resolved TCGDex card data

init();

async function init() {
  const { data: sessionData } = await supabase.auth.getSession();

  if (!sessionData?.session) {
    authGate.hidden = false;
    return;
  }

  // The admin-add-single function itself is the real gatekeeper (checks
  // user.id against ADMIN_USER_ID) — this just avoids showing the form
  // to a logged-in-but-not-admin visitor.
  form.hidden = false;

  lookupBtn.addEventListener('click', handleLookup);
  form.addEventListener('submit', handleSubmit);
}

async function handleLookup() {
  const id = idInput.value.trim();
  lookupError.hidden = true;
  preview.hidden = true;
  submitBtn.disabled = true;
  currentCard = null;

  if (!id) return;

  lookupBtn.disabled = true;
  lookupBtn.textContent = 'Looking up…';

  try {
    const res = await fetch(`https://api.tcgdex.net/v2/en/cards/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error('Card not found');
    const card = await res.json();

    currentCard = card;

    previewImg.src = card.image ? `${card.image}/high.png` : '';
    previewImg.alt = card.name || '';
    previewName.textContent = card.name || 'Unknown card';
    previewSet.textContent = card.set?.name || '';
    previewRarity.textContent = card.rarity || '';

    preview.hidden = false;
    submitBtn.disabled = false;
  } catch (err) {
    console.error(err);
    lookupError.textContent = "Couldn't find that card on TCGDex — double check the ID.";
    lookupError.hidden = false;
  } finally {
    lookupBtn.disabled = false;
    lookupBtn.textContent = 'Look up';
  }
}

async function handleSubmit(e) {
  e.preventDefault();
  submitSuccess.hidden = true;
  submitError.hidden = true;

  if (!currentCard) return;

  const priceCents = Math.round(parseFloat(priceInput.value) * 100);
  const quantity = Math.max(1, parseInt(quantityInput.value, 10) || 1);

  if (!priceCents || priceCents <= 0) {
    submitError.textContent = 'Enter a valid price.';
    submitError.hidden = false;
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Adding…';

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;

    const res = await fetch(
      'https://uygnyhljorjpmwlnbkyp.supabase.co/functions/v1/admin-add-single',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          tcgdex_card_id: currentCard.id,
          card_name: currentCard.name,
          set_name: currentCard.set?.name || '',
          set_id: currentCard.set?.id || '',
          card_number: currentCard.localId || '',
          rarity: currentCard.rarity || '',
          image_url: currentCard.image ? `${currentCard.image}/high.png` : '',
          price_cents: priceCents,
          quantity_available: quantity,
        }),
      }
    );

    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Could not add single');

    submitSuccess.textContent = `${currentCard.name} added to the store.`;
    submitSuccess.hidden = false;

    // Reset for the next card
    idInput.value = '';
    priceInput.value = '';
    quantityInput.value = 1;
    preview.hidden = true;
    currentCard = null;
  } catch (err) {
    console.error(err);
    submitError.textContent = err.message || 'Something went wrong.';
    submitError.hidden = false;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Add to Store';
  }
}