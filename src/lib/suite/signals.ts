"use client";

// How one app asks another to do something when it opens it: open a record
// found in search, or open the form behind "+ New". The latest signal is
// kept until an app takes it, so an app that mounts after the signal was
// sent still acts on it.

import { useEffect, useRef } from "react";

export type SuiteSignal =
  | { name: "open-record"; kind: string; id: string }
  | { name: "new"; action: string; id?: string };

let pending: { signal: SuiteSignal; at: number } | null = null;
const EVENT = "threadly:suite-signal";

export function sendSignal(signal: SuiteSignal): void {
  pending = { signal, at: Date.now() };
  window.dispatchEvent(new CustomEvent(EVENT, { detail: signal }));
}

// Calls handler for each signal it accepts (returns true); an accepted
// signal is consumed so no other app or later mount repeats it.
export function useSuiteSignal(handler: (signal: SuiteSignal) => boolean): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const take = (signal: SuiteSignal) => {
      if (ref.current(signal) && pending?.signal === signal) pending = null;
    };
    if (pending && Date.now() - pending.at < 5_000) take(pending.signal);
    const onEvent = (event: Event) => take((event as CustomEvent<SuiteSignal>).detail);
    window.addEventListener(EVENT, onEvent);
    return () => window.removeEventListener(EVENT, onEvent);
  }, []);
}

// Any app that changes shared records (leads, accounts, deals) says so, and
// the shell refreshes the counts in the side rail and on Home.
const DATA_EVENT = "threadly:data-changed";

export function notifyDataChanged(): void {
  window.dispatchEvent(new Event(DATA_EVENT));
}

export function useDataChanged(handler: () => void): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const on = () => ref.current();
    window.addEventListener(DATA_EVENT, on);
    return () => window.removeEventListener(DATA_EVENT, on);
  }, []);
}
