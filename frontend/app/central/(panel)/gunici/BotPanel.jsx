"use client";
import { useState, useEffect } from "react";

const ALGORITHMS = [
  { value: "TARGET_NET_POSITION", label: "Hedef Net Pozisyon", desc: "Hedefe ulaşana kadar en iyi alıcı/satıcı olur." },
  { value: "TARGET_NET_POSITION_SHOOTER", label: "Hedef Net Pozisyon + Shooter", desc: "Yukarıdakine ek olarak uygun karşı fiyat gelince anında vurur." },
  { value: "BECOME_BEST_BUYER", label: "En İyi Alıcı Ol", desc: "Sadece alış yapar, yön değiştirmez." },
  { value: "BECOME_BEST_SELLER", label: "En İyi Satıcı Ol", desc: "Sadece satış yapar, yön değiştirmez." },
  { value: "GHOST_BUYER", label: "Ghost Alıcı", desc: "Tahtada beklemez, uygun fiyat gelince anında vurur." },
  { value: "GHOST_SELLER", label: "Ghost Satıcı", desc: "Tahtada beklemez, uygun fiyat gelince anında vurur." },
];

export default function BotPanel({ open, kontrat, onClose, existingBot, onSaved }) {
  const [algorithm, setAlgorithm] = useState("TARGET_NET_POSITION");
  const [side, setSide] = useState("BUY");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [targetQty, setTargetQty] = useState("");
  const [slice, setSlice] = useState("5");
  const [rabbitLimit, setRabbitLimit] = useState("0");
  const [secondDiff, setSecondDiff] = useState("0.01");
  const [shooterVol, setShooterVol] = useState("0");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const isDone = existingBot?.status === "DONE";
  const isGhost = algorithm === "GHOST_BUYER" || algorithm === "GHOST_SELLER";

  useEffect(() => {
    if (existingBot) {
      setAlgorithm(existingBot.algorithm || "TARGET_NET_POSITION");
      setSide(existingBot.side);
      setMinPrice(existingBot.min_price);
      setMaxPrice(existingBot.max_price);
      setTargetQty(existingBot.target_quantity);
      setSlice(existingBot.slice ?? 5);
      setRabbitLimit(existingBot.rabbit_limit ?? 0);
      setSecondDiff(existingBot.second_offer_price_diff ?? 0.01);
      setShooterVol(existingBot.shooter_max_volume ?? 0);
    } else {
      setAlgorithm("TARGET_NET_POSITION");
      setSide("BUY"); setMinPrice(""); setMaxPrice(""); setTargetQty("");
      setSlice("5"); setRabbitLimit("0"); setSecondDiff("0.01"); setShooterVol("0");
    }
    setError(""); setConfirmRestart(false);
  }, [existingBot, kontrat, open]);

  // Algoritma değişince yönü otomatik kilitle (Best Buyer -> BUY, Best Seller -> SELL, Ghost Buyer -> BUY, Ghost Seller -> SELL)
  useEffect(() => {
    if (algorithm === "BECOME_BEST_BUYER" || algorithm === "GHOST_BUYER") setSide("BUY");
    if (algorithm === "BECOME_BEST_SELLER" || algorithm === "GHOST_SELLER") setSide("SELL");
  }, [algorithm]);

  if (!open) return null;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
  const sideEditable = algorithm === "TARGET_NET_POSITION" || algorithm === "TARGET_NET_POSITION_SHOOTER";

  async function save() {
    if (isDone && !confirmRestart) {
      setError("Bu bot hedefine ulaşıp DURDU. Tekrar başlatmak için önce onay kutusunu işaretle.");
      return;
    }
    setSaving(true); setError("");
    try {
      const token = localStorage.getItem("portal_token");
      const res = await fetch(`${apiUrl}/api/bots?portal_token=${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contract_name: kontrat, side, algorithm,
          min_price: parseFloat(minPrice), max_price: parseFloat(maxPrice),
          target_quantity: parseFloat(targetQty), slice: parseFloat(slice),
          rabbit_limit: parseFloat(rabbitLimit), second_offer_price_diff: parseFloat(secondDiff),
          shooter_max_volume: parseFloat(shooterVol),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Kayıt hatası");
      onSaved && onSaved();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function pauseOrResume(newStatus) {
    if (!existingBot) return;
    const token = localStorage.getItem("portal_token");
    await fetch(`${apiUrl}/api/bots/${existingBot.id}?portal_token=${token}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: newStatus }),
    });
    onSaved && onSaved();
  }

  async function remove() {
    if (!existingBot) return;
    const token = localStorage.getItem("portal_token");
    await fetch(`${apiUrl}/api/bots/${existingBot.id}?portal_token=${token}`, { method: "DELETE" });
    onSaved && onSaved();
    onClose();
  }

  const algoInfo = ALGORITHMS.find((a) => a.value === algorithm);

  return (
    <div className="fixed right-0 top-0 w-[400px] h-full bg-white shadow-xl border-l border-[#1A1D21] z-50 overflow-y-auto">
      <div className="p-4 border-b border-[#1A1D21] text-[#1A1D21] font-semibold flex justify-between items-center bg-[#F7F8F5]">
        <span>BOT AYARLARI — {kontrat}</span>
        <button onClick={onClose} className="text-xl">✖</button>
      </div>
      <div className="p-4 text-sm space-y-4">
        {existingBot && (
          <div className={`text-xs p-2 rounded ${isDone ? "bg-emerald-50 text-emerald-800" : "bg-gray-50 text-gray-500"}`}>
            Durum: <span className="font-semibold">{existingBot.status}</span>
            {" — "}Gerçekleşen: {existingBot.filled_quantity}/{existingBot.target_quantity} MW
            {isDone && <div className="mt-1">✅ Bot hedefine ulaştı ve kalıcı olarak durdu.</div>}
          </div>
        )}

        <div>
          <label className="block font-medium mb-1">Algoritma</label>
          <select value={algorithm} onChange={(e) => setAlgorithm(e.target.value)} disabled={isDone} className="w-full border rounded p-2 disabled:bg-gray-100">
            {ALGORITHMS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
          {algoInfo && <p className="text-[11px] text-gray-500 mt-1">{algoInfo.desc}</p>}
        </div>

        <div>
          <label className="block font-medium mb-1">Yön {!sideEditable && <span className="text-[10px] text-gray-400">(algoritma tarafından belirlenir)</span>}</label>
          <select value={side} onChange={(e) => setSide(e.target.value)} disabled={isDone || !sideEditable} className="w-full border rounded p-2 disabled:bg-gray-100">
            <option value="BUY">AL</option>
            <option value="SELL">SAT</option>
          </select>
        </div>

        <div>
          <label className="block font-medium mb-1">Min Fiyat</label>
          <input type="number" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} disabled={isDone} className="w-full border rounded p-2 disabled:bg-gray-100" />
        </div>
        <div>
          <label className="block font-medium mb-1">Maks Fiyat</label>
          <input type="number" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} disabled={isDone} className="w-full border rounded p-2 disabled:bg-gray-100" />
        </div>
        <div>
          <label className="block font-medium mb-1">Hedef Net Pozisyon (MWh)</label>
          <input type="number" value={targetQty} onChange={(e) => setTargetQty(e.target.value)} disabled={isDone} className="w-full border rounded p-2 disabled:bg-gray-100" />
        </div>

        <button type="button" onClick={() => setShowAdvanced(!showAdvanced)} className="text-xs text-blue-700 underline">
          {showAdvanced ? "Gelişmiş Ayarları Gizle ▲" : "Gelişmiş Ayarlar ▼"}
        </button>

        {showAdvanced && (
          <div className="space-y-3 bg-gray-50 p-3 rounded border">
            {!isGhost && (
              <>
                <div>
                  <label className="block font-medium mb-1 text-xs">Slice (Lot)</label>
                  <input type="number" value={slice} onChange={(e) => setSlice(e.target.value)} disabled={isDone} className="w-full border rounded p-2 disabled:bg-gray-100 text-sm" />
                </div>
                <div>
                  <label className="block font-medium mb-1 text-xs">Rabbit Limit (Lot)</label>
                  <input type="number" value={rabbitLimit} onChange={(e) => setRabbitLimit(e.target.value)} disabled={isDone} className="w-full border rounded p-2 disabled:bg-gray-100 text-sm" />
                </div>
                <div>
                  <label className="block font-medium mb-1 text-xs">İkinci Teklif Fark (TRY)</label>
                  <input type="number" step="0.01" value={secondDiff} onChange={(e) => setSecondDiff(e.target.value)} disabled={isDone} className="w-full border rounded p-2 disabled:bg-gray-100 text-sm" />
                </div>
              </>
            )}
            <div>
              <label className="block font-medium mb-1 text-xs">
                {isGhost ? "Vuruş Miktarı (Lot)" : "Shooter Max Volume (Lot)"}
              </label>
              <input type="number" value={shooterVol} onChange={(e) => setShooterVol(e.target.value)} disabled={isDone} className="w-full border rounded p-2 disabled:bg-gray-100 text-sm" />
            </div>
          </div>
        )}

        {isDone && (
          <label className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 p-2 rounded">
            <input type="checkbox" checked={confirmRestart} onChange={(e) => setConfirmRestart(e.target.checked)} className="mt-0.5" />
            Bu tamamlanmış botu bilerek sıfırlayıp yeniden başlatmak istiyorum.
          </label>
        )}

        {error && <div className="text-rose-600 text-xs">{error}</div>}

        {(!isDone || confirmRestart) && (
          <button onClick={save} disabled={saving} className="w-full bg-[#93D502] text-[#1A1D21] py-2 rounded font-semibold disabled:bg-gray-300 hover:brightness-95 transition-all">
            {saving ? "Kaydediliyor..." : isDone ? "Sıfırla ve Yeniden Başlat" : "Kaydet ve Başlat"}
          </button>
        )}
        {existingBot && existingBot.status === "ACTIVE" && (
          <button onClick={() => pauseOrResume("PAUSED")} className="w-full border border-amber-600 text-amber-700 py-2 rounded">Duraklat</button>
        )}
        {existingBot && existingBot.status === "PAUSED" && (
          <button onClick={() => pauseOrResume("ACTIVE")} className="w-full border border-emerald-600 text-emerald-700 py-2 rounded">Devam Ettir</button>
        )}
        {existingBot && (
          <button onClick={remove} className="w-full border border-rose-600 text-rose-700 py-2 rounded">Botu Sil</button>
        )}
      </div>
    </div>
  );
}
