"use client";

import { usePathname } from "next/navigation";
import HelpBot from "./HelpBot";

const HIDDEN_PREFIXES = ["/portal", "/checkout", "/preview", "/invite"];

export default function PublicAssistant() {
  const pathname = usePathname() ?? "";
  if (HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) return null;
  return <HelpBot />;
}
