import "./portal.css";
import "./threadly-theme.css";

export const metadata = {
  title: "Threadly Workspace",
  robots: { index: false, follow: false },
};

export default function PortalLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
