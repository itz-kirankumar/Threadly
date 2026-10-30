// One-off: approve the customers who already paid, so the invite-only gate
// does not lock them out. Lists workspaces with an active provider-paid
// billing record; pass --apply to add them to waitlist/approved.
//
// Billing records live under users/, which clients can write, so review the
// list against your Razorpay and Dodo dashboards before applying.
//
//   node --env-file=.env.production scripts/approve-paying-customers.mjs
//   node --env-file=.env.production scripts/approve-paying-customers.mjs --apply

import { createHash } from "node:crypto";
import { cert, initializeApp } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";

const apply = process.argv.includes("--apply");
const app = initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  }),
  databaseURL: process.env.FIREBASE_DATABASE_URL || process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
});
const db = getDatabase(app);

const uids = Object.keys((await db.ref("users").get()).val() ?? {});
let found = 0;
for (const uid of uids) {
  const billing = (await db.ref(`users/${uid}/geo/billing`).get()).val();
  const paid = billing && ["razorpay", "dodo"].includes(billing.provider) && ["active", "grace"].includes(billing.status);
  if (!paid || !billing.customerEmail) continue;
  found++;
  const email = String(billing.customerEmail).trim().toLowerCase();
  console.log(`${email}  ${billing.plan} via ${billing.provider}  order ${billing.orderId ?? billing.subscriptionId ?? "-"}`);
  if (apply) {
    const key = createHash("sha256").update(email).digest("hex").slice(0, 40);
    await db.ref(`waitlist/approved/${key}`).set({ email, at: new Date().toISOString(), source: "paying-customer" });
  }
}
console.log(`${found} paying customer${found === 1 ? "" : "s"}${apply ? " approved" : " found (dry run; add --apply to approve)"}`);
process.exit(0);
