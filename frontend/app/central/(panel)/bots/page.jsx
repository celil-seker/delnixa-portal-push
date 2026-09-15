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
    const map = { ACTIVE: "bg-green-100 text-green-700", PAUSED: "bg-yellow-100 text-yellow-700", DONE: "bg-blue-100 text-blue-700" };
    const label = { ACTIVE: "Geçerli", PAUSED: "Devre Dışı", DONE: "Süre Doldu" }[status] || status;
    return <span className={`px-2 py-0.5 rounded text-xs font-medium ${map[status] || "bg-gray-100 text-gray-600"}`}>{label}</span>;
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-[#0A1A2F]">Ticari Botlar</h1>
        <a href="/central/gunici" className="text-xs text-blue-700 underline">← Gün İçi Tahtasına Dön</a>
      </div>
      <div className="w-full overflow-x-auto border border-gray-200 rounded-lg shadow-sm bg-white">
        <table className="min-w-full border-collapse text-xs">
          <thead className="bg-[#F4F6F9] text-[#0A1A2F] font-semibold">
            <tr>
              <th className="px-3 py-2 border">A/K</th>
              <th className="px-3 py-2 border">Durum</th>
              <th className="px-3 py-2 border">Id</th>
              <th className="px-3 py-2 border">Kontrat</th>
              <th className="px-3 py-2 border">Yön</th>
              <th className="px-3 py-2 border">Fiyat Aralığı</th>
              <th className="px-3 py-2 border">Hedef / Gerçekleşen (MW)</th>
              <th className="px-3 py-2 border">Param</th>
              <th className="px-3 py-2 border">Oluşturulma Tarihi</th>
              <th className="px-3 py-2 border">İşlemler</th>
            </tr>
          </thead>
          <tbody>
            {bots.map((b) => (
              <tr key={b.id} className="hover:bg-blue-50 border-b">
                <td className="px-3 py-2 border text-center">
                  <button onClick={() => toggleActive(b)} disabled={b.status === "DONE"}>
                    <div className={`w-8 h-4 rounded-full relative transition-colors ${b.status === "ACTIVE" ? "bg-green-500" : "bg-gray-300"} ${b.status === "DONE" ? "opacity-40" : ""}`}>
                      <div className={`w-3 h-3 bg-white rounded-full absolute top-0.5 transition-all ${b.status === "ACTIVE" ? "left-4" : "left-0.5"}`} />
                    </div>
                  </button>
                </td>
                <td className="px-3 py-2 border text-center">{statusBadge(b.status)}</td>
                <td className="px-3 py-2 border text-center text-gray-400">{b.id}</td>
                <td className="px-3 py-2 border font-medium">{b.contract_name}</td>
                <td className="px-3 py-2 border text-center">
                  <span className={b.side === "BUY" ? "text-blue-700" : "text-red-700"}>{b.side === "BUY" ? "AL" : "SAT"}</span>
                </td>
                <td className="px-3 py-2 border text-center">{b.min_price} – {b.max_price}</td>
                <td className="px-3 py-2 border text-center">{b.filled_quantity} / {b.target_quantity}</td>
                <td className="px-3 py-2 border text-center relative">
                  <button onClick={() => setParamOpenId(paramOpenId === b.id ? null : b.id)} className="text-blue-600">ⓘ</button>
                  {paramOpenId === b.id && (
                    <div className="absolute z-10 bg-black text-white text-left p-2 rounded shadow-lg mt-1 left-1/2 -translate-x-1/2 w-48">
                      <div>region: {b.region}</div>
                      <div>slice: {b.slice}</div>
                      <div>rabbitLimit: {b.rabbit_limit}</div>
                      <div>secondOfferDiff: {b.second_offer_price_diff}</div>
                      <div>shooterMaxVolume: {b.shooter_max_volume}</div>
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 border text-center text-gray-500">
                  {b.created_at ? new Date(b.created_at).toLocaleString("tr-TR") : "-"}
                </td>
                <td className="px-3 py-2 border text-center">
                  <button onClick={() => deleteBot(b)} className="text-red-600 hover:underline">Sil</button>
                </td>
              </tr>
            ))}
            {!loading && bots.length === 0 && (
              <tr><td colSpan={10} className="px-3 py-6 text-center text-gray-500">Henüz kurulmuş bot yok.</td></tr>
            )}
            {loading && (<tr><td colSpan={10} className="px-3 py-6 text-center text-gray-500">Yükleniyor...</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
