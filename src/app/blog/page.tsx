import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { publishedPosts } from "@/lib/blog/content";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Guides and analysis on generative engine optimization: how ChatGPT, Claude and Gemini talk about your brand, and how to measure and improve it.",
  alternates: { canonical: "/blog" },
};

export default function BlogIndex() {
  const posts = publishedPosts();
  return (
    <div className="flex min-h-screen flex-col bg-zinc-950">
      <Navbar />
      <main className="mx-auto w-full max-w-3xl flex-grow px-6 py-16">
        <p className="text-xs font-semibold uppercase tracking-widest text-violet-400">Blog</p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight text-white">Notes on AI visibility</h1>
        <p className="mt-4 text-zinc-400">
          How AI answers decide which brands buyers discover - and how to measure your place in them.
        </p>
        {posts.length === 0 ? (
          <p className="mt-12 rounded-xl border border-white/10 px-6 py-10 text-center text-sm text-zinc-500">
            First posts are on the way.
          </p>
        ) : (
          <ul className="mt-12 space-y-8">
            {posts.map((post) => (
              <li key={post.slug} className="rounded-xl border border-white/10 p-6 transition hover:border-violet-400/40">
                <Link href={`/blog/${post.slug}`} className="block">
                  <p className="text-xs text-zinc-500">
                    {new Date(`${post.date}T00:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                    {" · "}{post.readingTime}
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-zinc-100">{post.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">{post.description}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
      <Footer />
    </div>
  );
}
