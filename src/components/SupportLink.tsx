export default function SupportLink({ reference }: { reference?: string }) {
  const subject = encodeURIComponent("Threadly payment help");
  const body = encodeURIComponent(
    `Hi Threadly team,\n\nI need help with a payment or plan.\n\nReference: ${reference ?? "(please paste your payment or order reference)"}\n\nWhat happened:\n`,
  );
  return (
    <p className="mt-3 text-xs text-zinc-500">
      Need help? Email{" "}
      <a className="text-zinc-300 underline underline-offset-2" href={`mailto:hello@gothreadly.live?subject=${subject}&body=${body}`}>
        hello@gothreadly.live
      </a>
      {reference ? <span className="text-zinc-600">{` (reference ${reference} - already included in the email)`}</span> : null}
    </p>
  );
}
