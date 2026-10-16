import "./portal.css";

export const metadata = {
  title: "Founder Portal | Wisentry",
  robots: { index: false, follow: false },
};

export default function PortalLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
