"use client";

import { useState } from "react";
import { FAQ_ITEMS } from "./faq-items";

// Accordion: one answer open at a time, animated by grid-row height.
export default function Faq() {
  const [open, setOpen] = useState(0);
  return (
    <div className="border-t border-white/[0.08]">
      {FAQ_ITEMS.map((item, i) => {
        const expanded = open === i;
        return (
          <div key={item.q} className="border-b border-white/[0.08]">
            <h3>
              <button
                type="button"
                id={`faq-q-${i}`}
                aria-expanded={expanded}
                aria-controls={`faq-a-${i}`}
                onClick={() => setOpen(expanded ? -1 : i)}
                className="flex w-full items-center justify-between gap-6 py-5 text-left text-[15px] text-[#F5F0E8] transition-colors hover:text-[#D8B982]"
              >
                {item.q}
                <span aria-hidden className={`shrink-0 text-lg leading-none text-[#D8B982] transition-transform duration-300 ${expanded ? "rotate-45" : ""}`}>+</span>
              </button>
            </h3>
            <div id={`faq-a-${i}`} role="region" aria-labelledby={`faq-q-${i}`} className="faq-panel" data-open={expanded}>
              <div className="overflow-hidden">
                <p className="pb-5 pr-8 text-sm leading-relaxed text-[#A7A0AE]">{item.a}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
