import Link from "next/link";
import Image from "next/image";

export default function Footer() {
  return (
    <footer className="w-full bg-[#f3edf9] border-t-2 border-brand-violet/20 pt-16 pb-12 overflow-hidden relative">
      <div className="container mx-auto px-4 sm:px-6 lg:px-12 text-center">
        
        {/* Navigation Columns */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-16 text-left max-w-4xl mx-auto text-sm">
          <div>
            <h4 className="font-extrabold text-brand-violet mb-3 uppercase tracking-wider text-xs">Platform</h4>
            <ul className="space-y-2 text-gray-600">
              <li>
                <Link href="/portal" className="hover:text-brand-violet transition-colors">
                  Founder Portal
                </Link>
              </li>
              <li>
                <Link href="/signal-radar" className="hover:text-brand-violet transition-colors">
                  Signal Radar
                </Link>
              </li>
              <li>
                <Link href="/beta-collective" className="hover:text-brand-violet transition-colors">
                  Beta Collective
                </Link>
              </li>
              <li>
                <Link href="/ai-engine" className="hover:text-brand-violet transition-colors">
                  AI Growth Engine
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-extrabold text-brand-violet mb-3 uppercase tracking-wider text-xs">Resources</h4>
            <ul className="space-y-2 text-gray-600">
              <li>
                <Link href="/playbook" className="hover:text-brand-violet transition-colors">
                  3-Step Playbook
                </Link>
              </li>
              <li>
                <Link href="/case-studies" className="hover:text-brand-violet transition-colors">
                  Case Studies
                </Link>
              </li>
              <li>
                <a 
                  href="https://discord.gg/xTeuQ9yE4" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="hover:text-brand-violet transition-colors flex items-center gap-1"
                >
                  Discord Collective
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-extrabold text-brand-violet mb-3 uppercase tracking-wider text-xs">Company</h4>
            <ul className="space-y-2 text-gray-600">
              <li>
                <Link href="/about" className="hover:text-brand-violet transition-colors">
                  About Wisentry
                </Link>
              </li>
              <li>
                <Link href="/mission" className="hover:text-brand-violet transition-colors">
                  Mission
                </Link>
              </li>
              <li>
                <Link href="/careers" className="hover:text-brand-violet transition-colors">
                  Careers
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-extrabold text-brand-violet mb-3 uppercase tracking-wider text-xs">Legal</h4>
            <ul className="space-y-2 text-gray-600">
              <li>
                <Link href="/privacy" className="hover:text-brand-violet transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-brand-violet transition-colors">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link href="/security" className="hover:text-brand-violet transition-colors">
                  Security
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Giant Optimizely-style 3D Extruded Brand Wordmark */}
        <div className="my-10 select-none overflow-hidden">
          <Link href="/" className="inline-block hover:scale-[1.01] transition-transform">
            <div className="text-6xl sm:text-8xl md:text-9xl lg:text-[140px] font-black tracking-tight text-brand-bush extruded-violet uppercase leading-none">
              WISENTRY
            </div>
          </Link>
        </div>

        {/* Bottom Copyright Bar */}
        <div className="pt-8 border-t border-purple-200/60 flex flex-col sm:flex-row items-center justify-between text-xs text-gray-500 gap-4">
          <div className="flex items-center gap-2">
            <Image src="/icon.jpg" alt="Wisentry Logo" width={20} height={20} className="h-5 w-5 rounded object-cover" />
            <span className="font-extrabold text-gray-900">Wisentry</span>
            <span>© {new Date().getFullYear()} Wisentry Inc. All rights reserved.</span>
          </div>
          <div className="flex items-center gap-4">
            <a 
              href="https://discord.gg/xTeuQ9yE4" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-brand-violet font-bold hover:underline"
            >
              Join Community Discord
            </a>
          </div>
        </div>

      </div>
    </footer>
  );
}
