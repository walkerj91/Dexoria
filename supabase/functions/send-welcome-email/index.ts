// supabase/functions/send-welcome-email/index.ts
// Deploy with: supabase functions deploy send-welcome-email
// Requires env var RESEND_API_KEY set in the function's secrets.

import { serve } from "https://deno.land/std@0.203.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = "Dexoria <welcome@dexoria.gg>"; // update to your verified Resend sender

const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // tighten to your domain in production
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RULES_HTML = `
  <ul style="padding-left:0; list-style:none; margin:0;">
    <li style="border-left:3px solid #C89B2A; padding:6px 0 6px 14px; margin-bottom:12px;">
      <strong style="color:#C89B2A;">Be respectful, always</strong><br/>
      Treat every trainer with courtesy. Harassment and personal attacks are never allowed.
    </li>
    <li style="border-left:3px solid #C89B2A; padding:6px 0 6px 14px; margin-bottom:12px;">
      <strong style="color:#C89B2A;">Honor your trades</strong><br/>
      Follow through once a trade is accepted. Backing out damages trust for everyone.
    </li>
    <li style="border-left:3px solid #C89B2A; padding:6px 0 6px 14px; margin-bottom:12px;">
      <strong style="color:#C89B2A;">Describe cards accurately</strong><br/>
      List true condition. Misrepresenting a card is grounds for suspension.
    </li>
    <li style="border-left:3px solid #C89B2A; padding:6px 0 6px 14px; margin-bottom:12px;">
      <strong style="color:#C89B2A;">Ship safely and promptly</strong><br/>
      Use tracked shipping and ship within your agreed timeframe.
    </li>
    <li style="border-left:3px solid #C89B2A; padding:6px 0 6px 14px; margin-bottom:12px;">
      <strong style="color:#C89B2A;">Keep payments on-platform</strong><br/>
      Use PayPal Goods & Services for paid trades — never Friends & Family.
    </li>
    <li style="border-left:3px solid #C89B2A; padding:6px 0 6px 14px; margin-bottom:12px;">
      <strong style="color:#C89B2A;">No spam or self-promotion</strong><br/>
      Keep chat and posts focused on trading and community discussion.
    </li>
    <li style="border-left:3px solid #C89B2A; padding:6px 0 6px 14px;">
      <strong style="color:#C89B2A;">Report, don't retaliate</strong><br/>
      Flag suspicious behavior to us instead of escalating in chat.
    </li>
  </ul>
`;

function buildEmailHtml(displayName: string) {
  return `
  <div style="background:#0e0e0e; padding:32px; font-family:Arial,sans-serif;">
    <div style="max-width:560px; margin:0 auto; background:#161616; border:1px solid #8B6A18; border-radius:12px; padding:32px;">
      <h1 style="color:#F5D06B; font-size:22px; margin:0 0 16px;">Welcome to Dexoria${displayName ? `, ${displayName}` : ""}!</h1>
      <p style="color:#e0e0e0; font-size:15px; line-height:1.5;">
        Dexoria is a community built around collecting, tracking, and trading Pokémon TCG cards.
        Track your binder, join games and events, follow the community feed, and trade directly
        with other trainers. Here's a quick rundown of how we keep trading and messaging safe:
      </p>
      ${RULES_HTML}
      <p style="color:#999; font-size:13px; margin-top:24px;">
        Questions or an issue with another trainer? Just reply to this email.
      </p>
    </div>
  </div>
  `;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { email, userId } = await req.json();

    if (!email) {
      return new Response(JSON.stringify({ error: "Missing email" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Optionally look up display name from your profiles table here via
    // a Supabase service-role client if you want a more personalized subject/body.
    const displayName = ""; // fill in if you fetch the profile

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: email,
        subject: "Welcome to Dexoria — trading & community guidelines inside",
        html: buildEmailHtml(displayName),
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Resend error: ${errText}`);
    }

    return new Response(JSON.stringify({ success: true, userId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});