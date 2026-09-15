"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import BotCell from "./BotCell";
import BotPanel from "./BotPanel";

export default function GuniciTahta() {
  const [rows, setRows] = useState({});
  const [status, setStatus] = useState("BAĞLANIYOR...");
  const [bots, setBots] = useState([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedContract, setSelectedContract] = useState(null);
  const wsRef = useRef(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
  const CONNECT_URL = apiUrl + "/api/epias/ws/connect";

  function formatRemaining(deliveryStart) {
    if (!deliveryStart) return "-";
    const diff = new Date(deliveryStart) - new Date();
    if (diff <= 0) return "0 dk";
    return Math.floor(diff / 60000) + " dk";
  }

  const refreshBots = useCallback(async () => {
    const token = localStorage.getItem("portal_token");
    if (!token) return;
    try {
      const res = await fetch(`${apiUrl}/api/bots?portal_token=${token}`);
      const data = await res.json();
      setBots(data.bots || []);
    } catch (e) { console.error(e); }
  }, [apiUrl]);

  useEffect(() => {
    refreshBots();
    const interval = setInterval(refreshBots, 10000);
    return () => clearInterval(interval);
  }, [refreshBots]);

  useEffect(() => {
    let cancelled = false;
    async function connect() {
      try {
        const token = localStorage.getItem("portal_token");
        if (!token) { setStatus("HATA: TOKEN YOK"); return; }
        const res = await fetch(`${CONNECT_URL}?portal_token=${token}`);
        const data = await res.json();
        if (!data.ws_url) { setStatus("HATA: WS URL GELMEDİ"); return; }
        const ws = new WebSocket(data.ws_url);
        wsRef.current = ws;
        ws.onopen = () => setStatus("BAĞLI");
        ws.onclose = () => { if (!cancelled) { setStatus("BAĞLANTI KAPANDI — 3sn sonra tekrar deneniyor"); setTimeout(connect, 3000); } };
        ws.onerror = () => setStatus("WS HATASI");
        ws.onmessage = (msg) => {
          try {
            const payload = JSON.parse(msg.data);
            if (payload.eventType !== "HourlyContractBoard") return;
            const c = payload.body || {};
            const info = c.boardInformation || {};
            const ptf = info.mcp ?? 0;
            const bestBuy = c.bestBuyPrice ?? 0;
            const bestSell = c.bestSellPrice ?? 0;
            let yon = "-";
            if (bestBuy && bestSell) {
              const mid = (bestBuy + bestSell) / 2;
              yon = mid > ptf ? "YAL" : mid < ptf ? "YAT" : "-";
            }
            setRows((prev) => ({
              ...prev,
              [c.name]: {
                contract: c.name, teo: 0, ki: 0, ptf, yon,
                bidQty: c.bestBuyQuantity ?? 0, bidPrice: bestBuy,
                askPrice: bestSell, askQty: c.bestSellQuantity ?? 0,
                netPos: info.netPosition ?? 0, remaining: formatRemaining(c.deliveryDateStart),
              },
            }));
          } catch (e) { console.error("WS parse error:", e); }
        };
      } catch (e) { setStatus("HATA (EXCEPTION)"); }
    }
    connect();
    return () => { cancelled = true; if (wsRef.current) wsRef.current.close(); };
  }, []);

  const rowList = Object.values(rows).sort((a, b) => a.contract.localeCompare(b.contract));
  function botForContract(contractName) { return bots.find((b) => b.contract_name === contractName); }
  function openBotPanel(contractName) { setSelectedContract(contractName); setPanelOpen(true); }
  function priceColor(price, ptf) {
    if (!price || !ptf) return "";
    if (price < ptf) return "text-green-600";
    if (price > ptf) return "text-red-600";
    return "text-yellow-600";
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-[#0A1A2F]">Gün İçi Piyasası Tahtası</h1>
        <div className="flex items-center gap-4">
          <a href="/central/bots" className="text-xs text-blue-700 underline">Ticari Botlar →</a>
          <div className="text-xs">
            WS: <span className={status === "BAĞLI" ? "text-green-600" : status.startsWith("HATA") ? "text-red-600" : "text-yellow-600"}>{status}</span>
          </div>
        </div>
      </div>
      <div className="w-full overflow-x-auto border border-gray-200 rounded-lg shadow-sm bg-white">
        <table className="min-w-full border-collapse text-xs">
          <thead className="bg-[#F4F6F9] text-[#0A1A2F] font-semibold">
            <tr>
              <th className="px-3 py-2 border" rowSpan={2}>Kontrat</th>
              <th className="px-3 py-2 border" rowSpan={2}>TEO/K.İ.</th>
              <th className="px-3 py-2 border" rowSpan={2}>PTF</th>
              <th className="px-3 py-2 border" rowSpan={2}>Yön</th>
              <th className="px-3 py-2 border" colSpan={2}>Alış</th>
              <th className="px-3 py-2 border" rowSpan={2}>Derinlik</th>
              <th className="px-3 py-2 border" colSpan={2}>Satış</th>
              <th className="px-3 py-2 border" rowSpan={2}>Net P.</th>
              <th className="px-3 py-2 border" rowSpan={2}>Kalan</th>
              <th className="px-3 py-2 border" rowSpan={2}>BOT</th>
            </tr>
            <tr>
              <th className="px-3 py-1 border font-normal">T.M.</th>
              <th className="px-3 py-1 border font-normal">T.F.</th>
              <th className="px-3 py-1 border font-normal">T.F.</th>
              <th className="px-3 py-1 border font-normal">T.M.</th>
            </tr>
          </thead>
          <tbody>
            {rowList.map((r) => {
              const bot = botForContract(r.contract);
              return (
                <tr key={r.contract} className="hover:bg-blue-50 transition-colors border-b">
                  <td className="px-3 py-2 border font-medium">{r.contract}</td>
                  <td className="px-3 py-2 border text-center text-gray-400">{r.teo}/{r.ki}</td>
                  <td className="px-3 py-2 border text-right font-semibold">{r.ptf}</td>
                  <td className={`px-3 py-2 border text-center font-semibold ${r.yon === "YAL" ? "text-red-600" : r.yon === "YAT" ? "text-green-600" : ""}`}>{r.yon}</td>
                  <td className="px-3 py-2 border text-right">{r.bidQty}</td>
                  <td className={`px-3 py-2 border text-right font-semibold ${priceColor(r.bidPrice, r.ptf)}`}>{r.bidPrice}</td>
                  <td className="px-3 py-2 border text-center">
                    <div className="flex h-3 w-16 mx-auto rounded overflow-hidden bg-gray-100">
                      <div className="bg-green-400" style={{ width: "50%" }} />
                      <div className="bg-red-400" style={{ width: "50%" }} />
                    </div>
                  </td>
                  <td className={`px-3 py-2 border text-right font-semibold ${priceColor(r.askPrice, r.ptf)}`}>{r.askPrice}</td>
                  <td className="px-3 py-2 border text-right">{r.askQty}</td>
                  <td className="px-3 py-2 border text-right">{r.netPos}</td>
                  <td className="px-3 py-2 border text-center">{r.remaining}</td>
                  <td className="px-3 py-2 border text-center">
                    <BotCell status={bot?.status} onClick={() => openBotPanel(r.contract)} />
                  </td>
                </tr>
              );
            })}
            {rowList.length === 0 && (
              <tr><td colSpan={12} className="px-3 py-6 text-center text-gray-500">Henüz veri yok — WS bağlanıyor...</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <BotPanel open={panelOpen} kontrat={selectedContract} existingBot={botForContract(selectedContract)} onClose={() => setPanelOpen(false)} onSaved={refreshBots} />
    </div>
  );
}
