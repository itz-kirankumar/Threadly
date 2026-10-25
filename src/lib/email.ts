// Transactional lifecycle email via Resend. Branded sender requires the
// gothreadly.live domain to be verified in Resend (DKIM/SPF/MX records on
// Vercel DNS). Until then sends fail gracefully and are logged, never thrown
// into user-facing flows.
const RESEND_ENDPOINT = "https://api.resend.com/emails";

export type LifecycleKind = "welcome-trial" | "trial-scan-complete" | "plan-upgraded";

const PORTAL_URL = "https://www.gothreadly.live/portal";
const PRICING_URL = "https://www.gothreadly.live/pricing";

function sender(): string {
  return process.env.EMAIL_FROM || "Threadly <hello@gothreadly.live>";
}

function shell(title: string, body: string, cta?: { label: string; url: string }): string {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#0b0f14;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="margin-bottom:24px;">
      <span style="font-size:18px;font-weight:700;color:#f3f6f9;letter-spacing:0.2px;">Threadly</span>
      <span style="font-size:12px;color:#8b98a5;margin-left:8px;">GEO Intelligence</span>
    </div>
    <div style="background:#11161d;border:1px solid #1f2733;border-radius:12px;padding:28px;">
      <h1 style="margin:0 0 14px;font-size:20px;color:#f3f6f9;font-weight:650;">${title}</h1>
      <div style="font-size:14px;line-height:1.65;color:#c3cdd9;">${body}</div>
      ${cta ? `<a href="${cta.url}" style="display:inline-block;margin-top:22px;background:#3b82f6;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 22px;border-radius:8px;">${cta.label}</a>` : ""}
    </div>
    <p style="font-size:12px;color:#5c6a78;margin-top:22px;line-height:1.5;">
      You are receiving this because you created a Threadly workspace at
      <a href="https://www.gothreadly.live" style="color:#7f8b98;">gothreadly.live</a>.
    </p>
  </div>
</body></html>`;
}

function firstName(name?: string): string {
  const n = (name ?? "").trim().split(/\s+/)[0];
  return n || "there";
}

function template(kind: LifecycleKind, ctx: { name?: string; plan?: string }): { subject: string; html: string } {
  const hi = `Hi ${firstName(ctx.name)},`;
  switch (kind) {
    case "welcome-trial":
      return {
        subject: "Welcome to Threadly - your free trial is live",
        html: shell(
          "Your workspace is ready",
          `<p style="margin:0 0 12px;">${hi}</p>
           <p style="margin:0 0 12px;">Welcome to Threadly. Your free trial is active: set up your brand profile, add the questions buyers ask AI assistants, and run your first GEO scan to see where your brand shows up.</p>
           <p style="margin:0;">Your trial includes 1 full scan and 10 tracked questions.</p>`,
          { label: "Open your workspace", url: PORTAL_URL },
        ),
      };
    case "trial-scan-complete":
      return {
        subject: "Your trial scan is done - see what AI says about your brand",
        html: shell(
          "Your first scan is complete",
          `<p style="margin:0 0 12px;">${hi}</p>
           <p style="margin:0 0 12px;">Your first GEO scan finished and the results are in your workspace - visibility by platform, citations, and the questions where competitors show up instead of you.</p>
           <p style="margin:0;">That was your 1 included trial scan. Upgrade to Pro or Growth for unlimited scans, more tracked questions, and full history (paid plans are free during early access).</p>`,
          { label: "View your results", url: PORTAL_URL },
        ),
      };
    case "plan-upgraded":
      return {
        subject: `Your Threadly plan is now ${ctx.plan ?? "upgraded"}`,
        html: shell(
          "Plan confirmed",
          `<p style="margin:0 0 12px;">${hi}</p>
           <p style="margin:0;">Your workspace is now on the <strong style="color:#f3f6f9;">${ctx.plan ?? "upgraded"}</strong> plan. Unlimited scans and your new limits are active immediately - no action needed.</p>`,
          { label: "Open your workspace", url: PORTAL_URL },
        ),
      };
  }
}

export async function sendLifecycleEmail(
  kind: LifecycleKind,
  to: string,
  ctx: { name?: string; plan?: string } = {},
): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, error: "RESEND_API_KEY not configured" };
  const { subject, html } = template(kind, ctx);
  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: sender(), to: [to], subject, html }),
    });
    if (!response.ok) {
      const text = (await response.text()).slice(0, 300);
      console.warn(`[email] lifecycle ${kind} to ${to} failed: ${response.status} ${text}`);
      return { sent: false, error: `${response.status}: ${text}` };
    }
    return { sent: true };
  } catch (error) {
    console.warn(`[email] lifecycle ${kind} to ${to} error:`, error);
    return { sent: false, error: error instanceof Error ? error.message : "send failed" };
  }
}
