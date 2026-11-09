"use client";

import { useEffect, useState } from "react";
import { detectCountry, type CountrySource } from "@/lib/billing/country";

const KEY = "threadly_billing_country";
const EVENT = "threadly:billing-country";

// The billing country shared by the plan and credit panels: recognised
// automatically, remembered once the buyer changes it, and kept in step
// between panels.
export function useBillingCountry(hint: string | null | undefined): {
  country: string;
  source: CountrySource | null;
  setCountry: (code: string) => void;
} {
  const [country, setCountryState] = useState("");
  const [source, setSource] = useState<CountrySource | null>(null);

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem(KEY);
    } catch {
      // storage unavailable: detect every time
    }
    let zone: string | null = null;
    try {
      zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      zone = null;
    }
    const found = detectCountry({ saved, hint, zone, languages: navigator.languages });
    if (found) {
      setCountryState((current) => current || found.code);
      setSource((current) => current ?? found.source);
    }
  }, [hint]);

  useEffect(() => {
    const on = (event: Event) => {
      const code = (event as CustomEvent<string>).detail;
      setCountryState(code);
      setSource("saved");
    };
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);

  function setCountry(code: string) {
    try {
      if (code) window.localStorage.setItem(KEY, code);
      else window.localStorage.removeItem(KEY);
    } catch {
      // storage unavailable
    }
    window.dispatchEvent(new CustomEvent(EVENT, { detail: code }));
  }

  return { country, source, setCountry };
}
