import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { ShieldCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "Privacy Policy | Threadly",
  description: "Learn how Threadly collects, uses, and safeguards founder and user data.",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen flex flex-col site">
      <Navbar />

      <main className="flex-grow pt-32 pb-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-12 max-w-4xl">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-violet/10 text-brand-violet text-xs font-bold mb-6">
            <ShieldCheck className="w-4 h-4 text-brand-electric" />
            Legal & Compliance
          </div>

          <h1 className="text-4xl sm:text-5xl font-black text-gray-900 tracking-tight mb-4">
            Privacy Policy
          </h1>
          <p className="text-sm text-gray-500 mb-12">Last Updated: October 2026</p>

          <div className="prose max-w-none text-gray-700 leading-relaxed space-y-8 text-base">
            <section className="p-8 rounded-3xl bg-white border-2 border-gray-200 shadow-sm">
              <h2 className="text-xl font-bold text-gray-900 mb-3">1. Information We Collect</h2>
              <p className="mb-4">
                When you sign up for Threadly and use the GEO workspace, we may collect:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-sm">
                <li>Account details from your Google sign-in, such as your name and email address.</li>
                <li>Startup information including product name, industry category, URL, and growth goals.</li>
                <li>Workspace data you create: your brand profile, competitors, tracked questions and scan results.</li>
              </ul>
            </section>

            <section className="p-8 rounded-3xl bg-white border-2 border-gray-200 shadow-sm">
              <h2 className="text-xl font-bold text-gray-900 mb-3">2. How We Use Your Information</h2>
              <p className="mb-4">
                We use the information we collect to:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-sm">
                <li>Match your startup with relevant consumer discussions and early adopter cohorts.</li>
                <li>Run scans across AI providers and present your mention, citation and share-of-voice metrics.</li>
                <li>Maintain community trust and prevent abusive, fraudulent, or automated spam activities.</li>
              </ul>
            </section>

            <section className="p-8 rounded-3xl bg-white border-2 border-gray-200 shadow-sm">
              <h2 className="text-xl font-bold text-gray-900 mb-3">3. Data Sharing & Third Parties</h2>
              <p className="mb-4">
                We never sell your personal data. We only share information with trusted infrastructure providers (such as hosting, database, and email delivery partners) necessary to deliver our services, under strict confidentiality agreements.
              </p>
            </section>

            <section className="p-8 rounded-3xl bg-white border-2 border-gray-200 shadow-sm">
              <h2 className="text-xl font-bold text-gray-900 mb-3">4. Google API Data</h2>
              <p className="mb-4">
                When you connect a Google account in the outbound workspace, Threadly requests only the permissions below, and uses the data received from Google APIs only as described here:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-sm">
                <li><span className="font-semibold">Gmail (gmail.send):</span> sends outreach emails that you drafted, reviewed and explicitly approved, from your own mailbox. Threadly does not read your mailbox content.</li>
                <li><span className="font-semibold">Account email (userinfo.email):</span> reads your Google account email address once, to verify that the account you connected is the mailbox being registered.</li>
                <li><span className="font-semibold">Calendar (calendar.events, calendar.events.freebusy):</span> checks when you are busy or free and creates meeting events when someone books through your Threadly booking page, and deletes those events if the booking is cancelled. Threadly receives only busy/free time windows; it does not read the titles or contents of existing events on your calendar. The only calendar events it accesses are the booking events it creates itself.</li>
              </ul>
              <p className="mt-4 mb-4 text-sm">
                OAuth tokens are stored encrypted (AES-256-GCM) in our Firebase database and are never logged. When you disconnect a Google account in Threadly, we request token revocation with Google and delete the stored tokens, and sending from that mailbox stops immediately. A record that the connection existed (mailbox address, granted permissions, connection and disconnection time) is kept as account history. Audit records and prospect content are retained while your account is active; retention limits of 90 days for prospect content and 365 days for audit records are configured, and deletions under these limits are performed manually and are not yet automated. Opt-out records are kept indefinitely so opt-outs remain honored, and records under a legal hold are not deleted. You can also revoke access at any time in your Google Account permissions page.
              </p>
              <p className="text-sm">
                Threadly's use and transfer to any other app of information received from Google APIs adheres to the <a className="text-teal-700 underline" href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">Google API Services User Data Policy</a>, including the Limited Use requirements. We do not use Google user data for advertising, do not sell it, and do not use it to train machine learning models.
              </p>
            </section>

            <section className="p-8 rounded-3xl bg-white border-2 border-gray-200 shadow-sm">
              <h2 className="text-xl font-bold text-gray-900 mb-3">5. Your Privacy Rights</h2>
              <p className="mb-4">
                Depending on your location (including under GDPR and CCPA), you have the right to access, update, export, or delete your personal data at any time. To exercise these rights, please open an issue on the Threadly GitHub repository or contact the maintainer listed there.
              </p>
            </section>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
