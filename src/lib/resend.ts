type BetaEmailKind = "waitlist" | "approved";

function appUrl(path: string) {
  const base = process.env.APP_BASE_URL || "https://gothreadly.live";
  return new URL(path, base).toString();
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

function emailContent(kind: BetaEmailKind, name: string) {
  const safeName = escapeHtml(name.trim() || "there");
  if (kind === "approved") {
    const link = appUrl("/portal");
    return {
      subject: "You’re approved for Threadly 2.0",
      text: `Hi ${name || "there"}, your Threadly 2.0 beta access is approved. Open your workspace: ${link}`,
      html: `
        <div style="background:#f6f3ee;padding:36px 16px;font-family:Arial,sans-serif;color:#171020">
          <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e8e2dc;border-radius:18px;overflow:hidden">
            <div style="padding:24px 30px;border-bottom:1px solid #eee8e2;font-size:22px;font-weight:800;letter-spacing:-1px">threadly<span style="color:#ff4500">.</span></div>
            <div style="padding:34px 30px">
              <div style="font-size:11px;font-weight:700;letter-spacing:2px;color:#ef4a18">BETA ACCESS APPROVED</div>
              <h1 style="font-size:30px;line-height:1.15;letter-spacing:-1px;margin:14px 0">You’re in, ${safeName}.</h1>
              <p style="font-size:16px;line-height:1.6;color:#625b6d">Your request for Threadly 2.0 has been approved. Sign in with the same Google account you used to apply to open your workspace.</p>
              <p style="margin:28px 0"><a href="${link}" style="display:inline-block;background:#ff4500;color:#fff;text-decoration:none;font-weight:700;padding:14px 20px;border-radius:10px">Open your workspace</a></p>
              <p style="font-size:13px;line-height:1.6;color:#81798a">If the button doesn’t work, copy this link:<br><a href="${link}" style="color:#6030a0">${link}</a></p>
            </div>
            <div style="padding:18px 30px;background:#faf9f7;color:#81798a;font-size:11px">Threadly · Growth, in one thread.</div>
          </div>
        </div>`,
    };
  }

  return {
    subject: "We received your Threadly 2.0 beta request",
    text: `Hi ${name || "there"}, thanks for requesting access to Threadly 2.0. Your beta application is in the review queue. We’ll email you when the team makes a decision.`,
    html: `
      <div style="background:#f6f3ee;padding:36px 16px;font-family:Arial,sans-serif;color:#171020">
        <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e8e2dc;border-radius:18px;overflow:hidden">
          <div style="padding:24px 30px;border-bottom:1px solid #eee8e2;font-size:22px;font-weight:800;letter-spacing:-1px">threadly<span style="color:#ff4500">.</span></div>
          <div style="padding:34px 30px">
            <div style="font-size:11px;font-weight:700;letter-spacing:2px;color:#ef4a18">THREADLY 2.0 · BETA</div>
            <h1 style="font-size:30px;line-height:1.15;letter-spacing:-1px;margin:14px 0">Thanks for applying, ${safeName}.</h1>
            <p style="font-size:16px;line-height:1.6;color:#625b6d">Your beta request is in our review queue. We’ll email you when the team makes a decision. You can return to the workspace with this Google account to check your access.</p>
            <p style="margin:28px 0"><a href="${appUrl("/")}" style="display:inline-block;background:#171020;color:#fff;text-decoration:none;font-weight:700;padding:14px 20px;border-radius:10px">Visit Threadly</a></p>
          </div>
          <div style="padding:18px 30px;background:#faf9f7;color:#81798a;font-size:11px">Threadly · Growth, in one thread.</div>
        </div>
      </div>`,
  };
}

export async function sendBetaEmail(input: { to: string; name: string; kind: BetaEmailKind }) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!apiKey || !from) throw new Error("Resend email is not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL.");

  const content = emailContent(input.kind, input.name);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: content.subject,
      html: content.html,
      text: content.text,
      reply_to: process.env.RESEND_REPLY_TO?.trim() || undefined,
    }),
    signal: AbortSignal.timeout(12_000),
    cache: "no-store",
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({})) as { message?: string };
    throw new Error(data.message || `Resend returned HTTP ${response.status}.`);
  }
  const data = await response.json().catch(() => ({})) as { id?: string };
  if (!data.id) throw new Error("Resend did not confirm the email request.");
  return data.id;
}
