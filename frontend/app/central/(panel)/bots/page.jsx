"use client";
import { useEffect, useState, useCallback } from "react";

export default function TicariBotlar() {
  const [bots, setBots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [paramOpenId, setParamOpenId] = useState(null);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";

  const fetchBots = useCallback(async () => {
    const token = localStorage.getItem("portal_token");
    if (!token) return;
    try {
      const res = await fetch(`${apiUrl}/api/bots?portal_token=${token}`);
      const data = await res.json();
      setBots(data.bots || []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [apiUrl]);

  useEffect(() => {
    fetchBots();
    const interval = setInterval(fetchBots, 8000);
    return () => clearInterval(interval);
  }, [fetchBots]);

  async function toggleActive(bot) {
    const token = localStorage.getItem("portal_token");
    const newStatus = bot.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
    await fetch(`${apiUrl}/api/bots/${bot.id}?portal_token=${token}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: newStatus }),
    });
    fetchBots();
  }

  async function deleteBot(bot) {
    if (!confirm(`'${bot.contract_name}' botunu silmek istediğinize emin misiniz?`)) return;
    const token = localStorage.getItem("portal_token");
    await fetch(`${apiUrl}/api/bots/${bot.id}?portal_token=${token}`, { method: "DELETE" });
    fetchBots();
  }

  function statusBadge(status) {
    const map = {
      ACTIVE: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
      PAUSED: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
      DONE: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
    };
    const label = { ACTIVE: "Geçerli", PAUSED: "Devre Dışı", DONE: "Süre Doldu" }[status] || status;
    return <span className={`px-2.5 py-1 rounded-full text-[11px] font-medium ${map[status] || "bg-gray-100 text-gray-600"}`}>{label}</span>;
  }

  const activeCount = bots.filter((b) => b.status === "ACTIVE").length;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-[#1A1D21]">Ticari Botlar</h1>
        <a href="/central/gunici" className="text-xs bg-[#93D502] text-[#1A1D21] font-semibold px-3 py-1.5 rounded-full hover:brightness-95 transition-all">
          ← Gün İçi Tahtasına Dön
        </a>
      </div>

      <div className="flex gap-3">
        <div className="bg-white border rounded-lg px-4 py-2 shadow-sm text-xs text-gray-500">
          Toplam Bot: <span className="font-semibold text-[#1A1D21]">{bots.length}</span>
        </div>
        <div className="bg-white border rounded-lg px-4 py-2 shadow-sm text-xs text-gray-500">
          Aktif: <span className="font-semibold text-[#93D502]">{activeCount}</span>
        </div>
      </div>

      <div className="w-full overflow-x-auto border border-gray-200 rounded-xl shadow-sm bg-white">
        <table className="min-w-full border-collapse text-xs">
          <thead className="bg-[#F4F6F9] text-[#1A1D21] font-semibold uppercase tracking-wide text-[10px]">
            <tr>
              <th className="px-3 py-2.5 border-b">A/K</th>
              <th className="px-3 py-2.5 border-b">Durum</th>
              <th className="px-3 py-2.5 border-b">Id</th>
              <th className="px-3 py-2.5 border-b">Kontrat</th>
              <th className="px-3 py-2.5 border-b">Algoritma</th>
              <th className="px-3 py-2.5 border-b">Yön</th>
              <th className="px-3 py-2.5 border-b">Fiyat Aralığı</th>
              <th className="px-3 py-2.5 border-b">Hedef / Gerçekleşen</th>
              <th className="px-3 py-2.5 border-b">Param</th>
              <th className="px-3 py-2.5 border-b">Oluşturulma</th>
              <th className="px-3 py-2.5 border-b">İşlemler</th>
            </tr>
          </thead>
          <tbody>
            {bots.map((b, idx) => (
              <tr key={b.id} className={`hover:bg-blue-50/60 transition-colors ${idx % 2 === 1 ? "bg-gray-50/40" : ""}`}>
                <td className="px-3 py-2 border-b text-center">
                  <button onClick={() => toggleActive(b)} disabled={b.status === "DONE"}>
                    <div className={`w-9 h-5 rounded-full relative transition-colors ${b.status === "ACTIVE" ? "bg-[#93D502]" : "bg-gray-300"} ${b.status === "DONE" ? "opacity-40" : ""}`}>
                      <div className={`w-3.5 h-3.5 bg-white rounded-full absolute top-0.75 transition-all shadow ${b.status === "ACTIVE" ? "left-4" : "left-0.5"}`} style={{ top: "3px" }} />
                    </div>
                  </button>
                </td>
                <td className="px-3 py-2 border-b text-center">{statusBadge(b.status)}</td>
                <td className="px-3 py-2 border-b text-center text-gray-400">{b.id}</td>
                <td className="px-3 py-2 border-b font-medium text-[#1A1D21]">{b.contract_name}</td>
                <td className="px-3 py-2 border-b text-center text-gray-600">{(b.algorithm || "TARGET_NET_POSITION").replaceAll("_", " ")}</td>
                <td className="px-3 py-2 border-b text-center">
                  <span className={`font-semibold ${b.side === "BUY" ? "text-blue-700" : "text-rose-700"}`}>{b.side === "BUY" ? "AL" : "SAT"}</span>
                </td>
                <td className="px-3 py-2 border-b text-center text-gray-600">{b.min_price} – {b.max_price}</td>
                <td className="px-3 py-2 border-b text-center">
                  <span className="font-medium text-[#1A1D21]">{b.filled_quantity}</span>
                  <span className="text-gray-400"> / {b.target_quantity} MW</span>
                </td>
                <td className="px-3 py-2 border-b text-center relative">
                  <button onClick={() => setParamOpenId(paramOpenId === b.id ? null : b.id)} className="text-blue-600 hover:text-blue-800">ⓘ</button>
                  {paramOpenId === b.id && (
                    <div className="absolute z-10 bg-[#00203F] text-white text-left p-3 rounded-lg shadow-xl mt-1 left-1/2 -translate-x-1/2 w-52 text-[11px] space-y-1">
                      <div className="flex justify-between"><span className="text-white/50">region</span><span>{b.region}</span></div>
                      <div className="flex justify-between"><span className="text-white/50">slice</span><span>{b.slice}</span></div>
                      <div className="flex justify-between"><span className="text-white/50">rabbitLimit</span><span>{b.rabbit_limit}</span></div>
                      <div className="flex justify-between"><span className="text-white/50">secondOfferDiff</span><span>{b.second_offer_price_diff}</span></div>
                      <div className="flex justify-between"><span className="text-white/50">shooterMaxVolume</span><span>{b.shooter_max_volume}</span></div>
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 border-b text-center text-gray-400">
                  {b.created_at ? new Date(b.created_at).toLocaleString("tr-TR") : "-"}
                </td>
                <td className="px-3 py-2 border-b text-center">
                  <button onClick={() => deleteBot(b)} className="text-rose-600 hover:text-rose-800 hover:underline">Sil</button>
                </td>
              </tr>
            ))}
            {!loading && bots.length === 0 && (
              <tr><td colSpan={10} className="px-3 py-10 text-center text-gray-400">Henüz kurulmuş bot yok.</td></tr>
            )}
            {loading && (<tr><td colSpan={10} className="px-3 py-10 text-center text-gray-400">Yükleniyor...</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
