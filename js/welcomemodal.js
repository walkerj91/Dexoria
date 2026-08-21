// welcomeModal.js
// Shows a one-time welcome modal after a user finishes profile customization,
// marks it as shown in Supabase, and triggers the welcome email edge function.
//
// Usage: after your profile-customization save succeeds, call:
//   import { maybeShowWelcomeModal } from './welcomeModal.js';
//   await maybeShowWelcomeModal(supabase, user);

const RULES = [
  {
    title: 'Be respectful, always',
    body: 'Treat every trainer with courtesy, even if a trade or chat doesn\'t go your way. Harassment, hate speech, and personal attacks are never allowed.'
  },
  {
    title: 'Honor your trades',
    body: 'Once a trade is accepted, follow through. Backing out after confirmation — without a legitimate reason communicated to the other trainer — damages trust in the whole community.'
  },
  {
    title: 'Describe cards accurately',
    body: 'List the true condition of every card (centering, edges, surface, corners). Misrepresenting condition to close a trade is grounds for suspension.'
  },
  {
    title: 'Ship safely and promptly',
    body: 'Use tracked shipping for all physical trades and ship within the timeframe you agreed to. Screenshot your tracking info and share it in the trade chat.'
  },
  {
    title: 'Keep payments on-platform',
    body: 'For paid trades, use PayPal Goods & Services (never Friends & Family) so both sides are protected. Never send payment before shipment details are confirmed.'
  },
  {
    title: 'No spam or self-promotion',
    body: 'Trade chat and community posts are for trading and discussion, not for repeated ads, referral links, or off-topic promotion.'
  },
  {
    title: 'Report, don\'t retaliate',
    body: 'If something feels off — a stalled trade, a suspicious message, a scam attempt — report it. Don\'t escalate in chat.'
  }
];

function buildModalMarkup(displayName) {
  const rulesHtml = RULES.map(r => `
    <li class="dex-welcome-rule">
      <span class="dex-welcome-rule-title">${r.title}</span>
      <span class="dex-welcome-rule-body">${r.body}</span>
    </li>
  `).join('');

  return `
    <div class="dex-modal-overlay" id="dex-welcome-overlay">
      <div class="dex-modal dex-welcome-modal" role="dialog" aria-modal="true" aria-labelledby="dex-welcome-title">
        <button class="dex-modal-close" id="dex-welcome-close" aria-label="Close">&times;</button>
        <h2 id="dex-welcome-title" class="dex-welcome-title">Welcome to Dexoria${displayName ? `, ${displayName}` : ''}!</h2>
        <p class="dex-welcome-intro">
          Dexoria is a community built around collecting, tracking, and trading Pokémon TCG cards.
          Track your binder, join games and events, follow the community feed, and trade directly
          with other trainers. Before you jump in, please take a moment to review how we keep
          trading and messaging safe and enjoyable for everyone.
        </p>
        <ul class="dex-welcome-rules">${rulesHtml}</ul>
        <button class="dex-btn dex-btn-gold dex-welcome-cta" id="dex-welcome-accept">
          Got it, let's go!
        </button>
      </div>
    </div>
  `;
}

/**
 * Checks whether the current user still needs to see the welcome modal,
 * and if so, shows it, sends the welcome email, and marks it complete.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ id: string, email?: string }} user
 */
export async function maybeShowWelcomeModal(supabase, user) {
  if (!user?.id) return;

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('welcome_shown, welcome_email_sent, display_name')
    .eq('id', user.id)
    .single();

  if (error) {
    console.error('Failed to check welcome status:', error);
    return;
  }

  if (profile?.welcome_shown) return;

  showWelcomeModal(profile?.display_name);

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ welcome_shown: true, profile_completed_at: new Date().toISOString() })
    .eq('id', user.id);

  if (updateError) console.error('Failed to mark welcome_shown:', updateError);

  if (!profile?.welcome_email_sent) {
    sendWelcomeEmail(supabase, user).catch(err =>
      console.error('Welcome email failed:', err)
    );
  }
}

function showWelcomeModal(displayName) {
  const container = document.createElement('div');
  container.innerHTML = buildModalMarkup(displayName);
  document.body.appendChild(container.firstElementChild);

  const overlay = document.getElementById('dex-welcome-overlay');
  const close = () => overlay?.remove();

  document.getElementById('dex-welcome-close')?.addEventListener('click', close);
  document.getElementById('dex-welcome-accept')?.addEventListener('click', close);
  overlay?.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
}

async function sendWelcomeEmail(supabase, user) {
  const { error } = await supabase.functions.invoke('send-welcome-email', {
    body: { userId: user.id, email: user.email }
  });

  if (error) {
    console.error('send-welcome-email invoke error:', error);
    return;
  }

  await supabase
    .from('profiles')
    .update({ welcome_email_sent: true })
    .eq('id', user.id);
}