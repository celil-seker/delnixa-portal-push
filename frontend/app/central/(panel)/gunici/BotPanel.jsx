"use client";
import { useState, useEffect } from "react";

export default function BotPanel({ open, kontrat, onClose, existingBot, onSaved }) {
  const [side, setSide] = useState("BUY");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [targetQty, setTargetQty] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmRestart, setConfirmRestart] = useState(false);

  const isDone = existingBot?.status === "DONE";

  useEffect(() => {
    if (existingBot) {
      setSide(existingBot.side);
      setMinPrice(existingBot.min_price);
      setMaxPrice(existingBot.max_price);
      setTargetQty(existingBot.target_quantity);
    } else {
      setSide("BUY"); setMinPrice(""); setMaxPrice(""); setTargetQty("");
    }
    setError("");
    setConfirmRestart(false);
  }, [existingBot, kontrat, open]);

  if (!open) return null;

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";

  async function save() {
    if (isDone && !confirmRestart) {
      setError("Bu bot hedefine ulaşıp DURDU. Tekrar başlatmak için önce onay kutusunu işaretle.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const token = localStorage.getItem("portal_token");
      const res = await fetch(`${apiUrl}/api/bots?portal_token=${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contract_name: kontrat,
          side,
          min_price: parseFloat(minPrice),
          max_price: parseFloat(maxPrice),
          target_quantity: parseFloat(targetQty),
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
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    onSaved && onSaved();
  }

  async function remove() {
    if (!existingBot) return;
    const token = localStorage.getItem("portal_token");
    await fetch(`${apiUrl}/api/bots/${existingBot.id}?portal_token=${token}`, {
      method: "DELETE",
    });
    onSaved && onSaved();
    onClose();
  }

  return (
    <div className="fixed right-0 top-0 w-[380px] h-full bg-white shadow-xl border-l border-blue-900 z-50 overflow-y-auto">
      <div className="p-4 border-b border-blue-900 text-blue-900 font-semibold flex justify-between items-center">
        <span>BOT AYARLARI — {kontrat}</span>
        <button onClick={onClose} className="text-xl">✖</button>
      </div>

      <div className="p-4 text-sm space-y-4">
        {existingBot && (
          <div className={`text-xs p-2 rounded ${isDone ? "bg-green-50 text-green-800" : "bg-gray-50 text-gray-500"}`}>
            Durum: <span className="font-semibold">{existingBot.status}</span>
            {" — "}Gerçekleşen: {existingBot.filled_quantity}/{existingBot.target_quantity} MW
            {isDone && <div className="mt-1">✅ Bot hedefine ulaştı ve kalıcı olarak durdu.</div>}
          </div>
        )}

        <div>
          <label className="block font-medium mb-1">Yön</label>
          <select value={side} onChange={(e) => setSide(e.target.value)} disabled={isDone} className="w-full border rounded p-2 disabled:bg-gray-100">
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

        {isDone && (
          <label className="flex items-start gap-2 text-xs text-yellow-800 bg-yellow-50 p-2 rounded">
            <input type="checkbox" checked={confirmRestart} onChange={(e) => setConfirmRestart(e.target.checked)} className="mt-0.5" />
            Bu tamamlanmış botu bilerek sıfırlayıp yeniden başlatmak istiyorum (hedef ve gerçekleşen sıfırlanacak).
          </label>
        )}

        {error && <div className="text-red-600 text-xs">{error}</div>}

        {(!isDone || confirmRestart) && (
          <button onClick={save} disabled={saving} className="w-full bg-blue-900 text-white py-2 rounded font-semibold disabled:bg-gray-400">
            {saving ? "Kaydediliyor..." : isDone ? "Sıfırla ve Yeniden Başlat" : "Kaydet ve Başlat"}
          </button>
        )}

        {existingBot && existingBot.status === "ACTIVE" && (
          <button onClick={() => pauseOrResume("PAUSED")} className="w-full border border-yellow-600 text-yellow-700 py-2 rounded">
            Duraklat
          </button>
        )}
        {existingBot && existingBot.status === "PAUSED" && (
          <button onClick={() => pauseOrResume("ACTIVE")} className="w-full border border-green-600 text-green-700 py-2 rounded">
            Devam Ettir
          </button>
        )}
        {existingBot && (
          <button onClick={remove} className="w-full border border-red-600 text-red-700 py-2 rounded">
            Botu Sil
          </button>
        )}
      </div>
    </div>
  );
}
