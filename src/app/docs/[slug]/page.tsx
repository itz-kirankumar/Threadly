import Link from "next/link";
import { notFound } from "next/navigation";
import { DOC_PAGES, getDocPage, DocBlock } from "@/lib/docs/content";

export function generateStaticParams() {
  return DOC_PAGES.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = getDocPage(slug);
  if (!page) return {};
  return { title: page.title, description: page.description };
}

function Block({ block, i }: { block: DocBlock; i: number }) {
  switch (block.type) {
    case "p":
      return <p key={i} className="mt-4 leading-7 text-zinc-300">{block.text}</p>;
    case "h2":
      return <h2 key={i} className="mt-10 border-t border-zinc-800 pt-8 text-xl font-semibold text-zinc-100">{block.text}</h2>;
    case "h3":
      return <h3 key={i} className="mt-8 text-base font-semibold text-zinc-100">{block.text}</h3>;
    case "list":
      return (
        <ul key={i} className="mt-4 list-disc space-y-2 pl-5 leading-7 text-zinc-300 marker:text-zinc-600">
          {block.items.map((item, j) => <li key={j}>{item}</li>)}
        </ul>
      );
    case "code":
      return (
        <div key={i} className="mt-4 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900">
          {block.title && <p className="border-b border-zinc-800 px-4 py-2 text-xs text-zinc-500">{block.title}</p>}
          <pre className="overflow-x-auto px-4 py-3 text-sm text-emerald-200"><code>{block.text}</code></pre>
        </div>
      );
    case "note":
      return (
        <div key={i} className="mt-6 rounded-lg border border-emerald-900/60 bg-emerald-950/30 px-4 py-3 text-sm leading-6 text-emerald-200/90">
          {block.text}
        </div>
      );
  }
}

export default async function DocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = getDocPage(slug);
  if (!page) notFound();

  const index = DOC_PAGES.findIndex((p) => p.slug === page.slug);
  const prev = index > 0 ? DOC_PAGES[index - 1] : null;
  const next = index < DOC_PAGES.length - 1 ? DOC_PAGES[index + 1] : null;

  return (
    <article>
      <p className="text-xs font-medium uppercase tracking-widest text-emerald-400">{page.section}</p>
      <h1 className="mt-2 text-3xl font-bold text-zinc-50">{page.title}</h1>
      <p className="mt-2 text-zinc-400">{page.description}</p>
      <div className="mt-2">
        {page.blocks.map((block, i) => <Block key={i} block={block} i={i} />)}
      </div>
      <div className="mt-14 flex items-center justify-between border-t border-zinc-800 pt-6 text-sm">
        {prev ? (
          <Link href={`/docs/${prev.slug}`} className="text-zinc-400 transition hover:text-zinc-100">
            &larr; {prev.title}
          </Link>
        ) : <span />}
        {next ? (
          <Link href={`/docs/${next.slug}`} className="text-zinc-400 transition hover:text-zinc-100">
            {next.title} &rarr;
          </Link>
        ) : <span />}
      </div>
    </article>
  );
}
