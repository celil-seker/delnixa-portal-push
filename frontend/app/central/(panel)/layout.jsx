"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Zap,
  BarChart3,
  Settings,
  Cpu,
  FileText,
  ChevronLeft,
  ChevronRight,
  LogOut,
} from "lucide-react";

export default function CentralLayout({ children }) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex min-h-screen bg-gray-100">

      {/* SOL MENÜ */}
      <aside
        className={`${
          collapsed ? "w-20" : "w-64"
        } bg-white text-gray-800 border-r border-gray-200 flex flex-col transition-all duration-300`}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          {!collapsed && <span className="text-xl font-bold tracking-wide">⚡ Delnixa</span>}

          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1 hover:bg-gray-100 rounded"
          >
            {collapsed ? <ChevronRight /> : <ChevronLeft />}
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          <button onClick={() => router.push("/central/dashboard")} className="flex items-center gap-3 w-full px-4 py-2 hover:bg-gray-100">
            <LayoutDashboard size={18} /> {!collapsed && <span>Anasayfa</span>}
          </button>

          <button onClick={() => router.push("/central/gunoncesi")} className="flex items-center gap-3 w-full px-4 py-2 hover:bg-gray-100">
            <BarChart3 size={18} /> {!collapsed && <span>Gün Öncesi Piyasası</span>}
          </button>

          <button onClick={() => router.push("/central/gunici")} className="flex items-center gap-3 w-full px-4 py-2 hover:bg-gray-100">
            <Zap size={18} /> {!collapsed && <span>Gün İçi Piyasası</span>}
          </button>

          <button onClick={() => router.push("/central/botlar")} className="flex items-center gap-3 w-full px-4 py-2 hover:bg-gray-100">
            <Cpu size={18} /> {!collapsed && <span>Botlar</span>}
          </button>

          <button onClick={() => router.push("/central/raporlar")} className="flex items-center gap-3 w-full px-4 py-2 hover:bg-gray-100">
            <FileText size={18} /> {!collapsed && <span>Raporlar</span>}
          </button>

          <button onClick={() => router.push("/central/ayarlar")} className="flex items-center gap-3 w-full px-4 py-2 hover:bg-gray-100">
            <Settings size={18} /> {!collapsed && <span>Ayarlar</span>}
          </button>
        </nav>

        <div className="p-4 border-t border-gray-200 flex items-center justify-center">
          <button
            onClick={() => {
              localStorage.removeItem("access_token");
              router.push("/central");
            }}
            className="flex items-center gap-2 text-sm text-gray-700 hover:text-red-600"
          >
            <LogOut size={16} /> {!collapsed && <span>Çıkış Yap</span>}
          </button>
        </div>
      </aside>

      {/* SAYFA */}
      <main className="flex-1 p-6">
        {children}
      </main>

    </div>
  );
}

