// Add this to basket.js (or wherever your basket page's "Checkout" button lives).
// I don't have that button's current code, so this is a standalone function —
// call it from the existing onclick instead of whatever it currently does for singles.

import { supabase } from './supabaseClient.js';

async function startSinglesCheckout() {
  const cart = JSON.parse(localStorage.getItem('dexoria_cart')) || [];

  const items = cart
    .filter((item) => item.singleId) // only cart entries that are card singles
    .map((item) => ({ single_id: item.singleId, quantity: item.quantity || 1 }));

  if (items.length === 0) {
    alert('Your basket is empty.');
    return;
  }

  // Matches the /donate route's pattern: pass user_id if logged in, no auth
  // header required — singles checkout allows guest purchases too.
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData?.session?.user?.id || null;

  try {
    const response = await fetch(
      'https://uygnyhljorjpmwlnbkyp.supabase.co/functions/v1/capture-stripe-payment/singles-checkout',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, user_id: userId }),
      }
    );

    const result = await response.json();

    if (!response.ok || !result.url) {
      throw new Error(result.error || 'Could not start checkout');
    }

    // Clear the singles out of the cart before redirecting (Stripe now owns the order)
    const remaining = cart.filter((item) => !item.singleId);
    localStorage.setItem('dexoria_cart', JSON.stringify(remaining));

    window.location.href = result.url;
  } catch (err) {
    console.error(err);
    alert('Something went wrong starting checkout. Please try again.');
  }
}

window.startSinglesCheckout = startSinglesCheckout;
