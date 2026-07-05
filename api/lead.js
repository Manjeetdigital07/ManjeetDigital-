// api/lead.js
//
// A real Vercel Serverless Function — this runs on Vercel's servers,
// never in the visitor's browser, so the RESEND_API_KEY below stays
// completely hidden from anyone viewing your site's source code.
//
// SETUP (takes about 10 minutes, one-time):
// 1. Create a free account at https://resend.com (no credit card required
//    for the free tier — 100 emails/day, 3,000/month).
// 2. Verify a sending domain in Resend (or use their shared test domain
//    while you're testing — see Resend's own onboarding for the exact
//    from-address you're allowed to use before verifying a domain).
// 3. Copy your Resend API key.
// 4. In your Vercel project dashboard: Settings -> Environment Variables
//    -> add RESEND_API_KEY = <your key>. Redeploy.
// 5. This file must live at /api/lead.js in a Vercel project that has
//    your index.html at the project root (or in /public). A plain
//    drag-and-drop static deploy without a connected Git repo will NOT
//    run this — Vercel needs to detect the /api folder as part of a
//    proper project build to create the serverless function.
//
// WHAT THIS DOES:
// - Validates the incoming lead data
// - Sends YOU an instant notification email with every field
// - Sends the LEAD an automatic confirmation email
// - Returns JSON so the website's fetch() call knows whether it worked
//
// WHAT THIS DOES NOT DO:
// - It does not touch a CRM. If you want leads to also land in a CRM
//   (HubSpot, Airtable, Pipedrive, etc.), that's a second integration —
//   most of those also offer a simple REST API you POST to from right
//   here in this same function, once you have that account and its key.
//   Ask and this function can be extended once you've picked one.

const NOTIFY_EMAIL = 'manjeetdigital.buisness@gmail.com';
const FROM_EMAIL = 'AI Growth Infrastructure <onboarding@resend.dev>'; // swap once your domain is verified in Resend

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

module.exports = async function handler(req, res) {
  // CORS: allow the site itself to call this endpoint
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // The function is deployed but nobody added the API key yet.
    // Fail loudly in the response (not silently) so the frontend
    // knows to fall back to WhatsApp/mailto instead of claiming success.
    res.status(500).json({ ok: false, error: 'RESEND_API_KEY is not configured on the server.' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim();
  const whatsapp = String(body.whatsapp || '').trim();
  const business = String(body.business || 'Not specified').trim();
  const message = String(body.message || '').trim();
  const source = String(body.source || 'Website contact form').trim();

  if (!name || !message || (!email && !whatsapp)) {
    res.status(400).json({ ok: false, error: 'Missing required fields: name, message, and at least one of email/whatsapp.' });
    return;
  }
  if (email && !isValidEmail(email)) {
    res.status(400).json({ ok: false, error: 'Invalid email address.' });
    return;
  }

  const notifyHtml = `
    <h2>New enquiry — ${escapeHtml(source)}</h2>
    <p><strong>Name:</strong> ${escapeHtml(name)}</p>
    <p><strong>Email:</strong> ${escapeHtml(email) || '(not provided)'}</p>
    <p><strong>WhatsApp:</strong> ${escapeHtml(whatsapp) || '(not provided)'}</p>
    <p><strong>Business type:</strong> ${escapeHtml(business)}</p>
    <p><strong>Message:</strong><br>${escapeHtml(message).replace(/\n/g, '<br>')}</p>
  `;

  const confirmationHtml = `
    <p>Hi ${escapeHtml(name)},</p>
    <p>Thanks for reaching out to Manjeet Digital — this confirms we've received your message:</p>
    <blockquote style="border-left:3px solid #c9a24e;padding-left:12px;color:#555;">${escapeHtml(message).replace(/\n/g, '<br>')}</blockquote>
    <p>We reply personally to every enquiry, usually within one business day. If it's urgent, WhatsApp us directly at
    <a href="https://wa.me/918052968267">+91 80529 68267</a>.</p>
    <p>— Manjeet Digital</p>
  `;

  try {
    const sendEmail = async (to, subject, html) => {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
      });
      if (!r.ok) {
        const errText = await r.text();
        throw new Error(`Resend API error (${r.status}): ${errText}`);
      }
      return r.json();
    };

    // 1. Notify Manjeet instantly
    await sendEmail(NOTIFY_EMAIL, `New enquiry: ${name} — ${business}`, notifyHtml);

    // 2. Confirm to the lead, if they gave an email
    if (email) {
      await sendEmail(email, 'We received your message — Manjeet Digital', confirmationHtml);
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Lead email send failed:', err);
    res.status(502).json({ ok: false, error: 'Email service failed. The lead was NOT saved anywhere else — please also follow up via WhatsApp.' });
  }
      }

