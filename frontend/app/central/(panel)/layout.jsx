"use client";
import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

const menuItems = [
  { label: "Ana Sayfa", href: "/central/dashboard", icon: "🏠" },
  {
    label: "Gün İçi Piyasası", icon: "🛒",
    children: [{ label: "GİP Planlama", href: "/central/gunici" }],
  },
  {
    label: "SmartBot", icon: "⚡",
    children: [{ label: "Ticari Botlar", href: "/central/bots" }],
  },
];

export default function CentralLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [openMenu, setOpenMenu] = useState(null);
  const [now, setNow] = useState(new Date());
  const [username, setUsername] = useState("");

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("portal_token");
    if (!token) { router.push("/central"); return; }
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      setUsername(payload.sub || "");
    } catch (e) {}
  }, [router]);

  function logout() {
    localStorage.removeItem("portal_token");
    localStorage.removeItem("access_token");
    router.push("/central");
  }

  return (
    <div className="flex h-screen bg-[#F4F6F9] text-[#0A1A2F]" style={{ fontFamily: "Inter, Segoe UI, Arial, sans-serif" }}>
      {/* SIDEBAR */}
      <aside className="w-60 bg-[#1A1D21] text-white flex flex-col shrink-0">
        <div className="flex items-center gap-2 px-5 py-5 border-b border-white/5">
          <img src="/logo.svg" alt="Delnixa" className="w-8 h-8" />
          <span className="font-semibold tracking-wide">Delnixa Portal</span>
        </div>

        <nav className="flex-1 py-3 overflow-y-auto">
          {menuItems.map((item) => {
            const hasChildren = !!item.children;
            const isOpen = openMenu === item.label;
            const isActiveParent = hasChildren && item.children.some((c) => pathname?.startsWith(c.href));
            return (
              <div key={item.label}>
                <button
                  onClick={() => {
                    if (hasChildren) setOpenMenu(isOpen ? null : item.label);
                    else router.push(item.href);
                  }}
                  className={`w-full flex items-center justify-between px-5 py-2.5 text-sm transition-colors
                    ${isActiveParent || pathname === item.href ? "bg-[#93D502]/15 text-[#93D502]" : "text-white/70 hover:bg-white/5 hover:text-[#93D502]"}`}
                >
                  <span className="flex items-center gap-2">
                    <span>{item.icon}</span>
                    <span>{item.label}</span>
                  </span>
                  {hasChildren && <span className="text-xs">{isOpen ? "▲" : "▼"}</span>}
                </button>
                {hasChildren && isOpen && (
                  <div className="bg-black/20">
                    {item.children.map((c) => (
                      <button
                        key={c.href}
                        onClick={() => router.push(c.href)}
                        className={`w-full text-left px-10 py-2 text-sm transition-colors
                          ${pathname?.startsWith(c.href) ? "text-[#93D502] font-semibold" : "text-white/60 hover:text-white"}`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="border-t border-white/5 px-5 py-3 text-xs text-white/50">
          © {now.getFullYear()} Delnixa Energy Intelligence
        </div>
      </aside>

      {/* MAIN */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* TOPBAR */}
        <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0">
          <div className="text-xs text-gray-500">
            {now.toLocaleDateString("tr-TR")} {now.toLocaleTimeString("tr-TR")} (UTC+03:00)
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-[#1A1D21]">{username}</span>
            <button onClick={logout} className="text-xs text-red-600 hover:underline">Çıkış Yap</button>
          </div>
        </header>

        {/* PAGE CONTENT */}
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
