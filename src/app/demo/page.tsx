import { permanentRedirect } from "next/navigation";

// The sample-data demo was replaced by the live demo on the home page.
export default function DemoPage() {
  permanentRedirect("/#live-demo");
}
