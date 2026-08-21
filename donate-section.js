/**
 * donate-section.js
 * Dexoria — Donation Section
 */

const SUPABASE_URL      = 'https://uygnyhljorjpmwlnbkyp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV5Z255aGxqb3JqcG13bG5ia3lwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1NjQyMzQsImV4cCI6MjA5MzE0MDIzNH0.dkCA3Rk5n1t5CN9b6-Hu80h6Z5IVsvIrN-Wk-PmqA0w';

document.addEventListener('DOMContentLoaded', () => {
  const amountBtns   = document.querySelectorAll('.dex-donate-amount-btn');
  const donateBtn    = document.getElementById('dex-donate-submit');
  const customWrap   = document.getElementById('dex-donate-custom-wrap');
  const customInput  = document.getElementById('dex-donate-custom-input');

  if (!amountBtns.length || !donateBtn) return;

  let selectedAmount = 500; // pence
  let isCustom       = false;

  amountBtns.forEach(btn => {
    btn.addEventListener('click', () => selectAmount(btn));
  });

  // Pre-select £5 (index 1)
  selectAmount(amountBtns[1] ?? amountBtns[0]);

  donateBtn.addEventListener('click', async () => {
    // Resolve amount — custom input takes over when "Any" is selected
    if (isCustom) {
      const val = parseFloat(customInput.value);
      if (!val || val < 1) {
        customInput.focus();
        customInput.style.borderColor = 'red';
        return;
      }
      selectedAmount = Math.round(val * 100); // convert £ to pence
    }

    donateBtn.disabled = true;
    donateBtn.textContent = 'Redirecting…';

    try {
      let token   = SUPABASE_ANON_KEY;
      let user_id = null;

      if (window.supabase) {
        const { data: { session } } = await window.supabase.auth.getSession();
        if (session) {
          token   = session.access_token;
          user_id = session.user.id;
        }
      }

      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/capture-stripe-payment/donate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ amount: selectedAmount, user_id }),
        }
      );

      const responseText = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${responseText}`);

      const { url } = JSON.parse(responseText);
      if (!url) throw new Error('No URL returned from Edge Function');
      window.location.href = url;

    } catch (err) {
      console.log('Donation error:', err.message);
      donateBtn.disabled = false;
      donateBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 21C12 21 3 14.5 3 8.5C3 5.42 5.42 3 8.5 3C10.24 3 11.91 3.81 13 5.08
                   C14.09 3.81 15.76 3 17.5 3C20.58 3 23 5.42 23 8.5C23 14.5 12 21 12 21Z"
                fill="currentColor"/>
        </svg>
        Donate with Card`;
      alert('Something went wrong — please try again.');
    }
  });

  function selectAmount(btn) {
    amountBtns.forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');

    const val = parseInt(btn.dataset.amount, 10);
    isCustom = val === 0;

    if (isCustom) {
      customWrap.style.display = 'block';
      customInput.style.borderColor = '';
      customInput.focus();
      selectedAmount = null;
    } else {
      customWrap.style.display = 'none';
      selectedAmount = val * 100; // £ to pence
    }
  }
});