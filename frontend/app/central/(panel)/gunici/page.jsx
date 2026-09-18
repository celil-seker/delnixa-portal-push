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
  const prevPtfRef = useRef({}); // trend hesaplamak için önceki PTF değerleri

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

            // Trend (BULLBEAR): önceki PTF ile şimdiki PTF karşılaştırması
            const prevPtf = prevPtfRef.current[c.name];
            let trend = "flat";
            if (prevPtf !== undefined && ptf !== prevPtf) {
              trend = ptf > prevPtf ? "up" : "down";
            }
            prevPtfRef.current[c.name] = ptf;

            const spread = (bestSell && bestBuy) ? (bestSell - bestBuy).toFixed(2) : "-";
            const sellerPtfFark = (bestSell && ptf) ? (((bestSell - ptf) / ptf) * 100).toFixed(2) : "-";

            setRows((prev) => ({
              ...prev,
              [c.name]: {
                contract: c.name, teo: 0, ki: 0, ptf, yon, trend,
                bidQty: c.bestBuyQuantity ?? 0, bidPrice: bestBuy,
                askPrice: bestSell, askQty: c.bestSellQuantity ?? 0,
                netPos: info.netPosition ?? 0, remaining: formatRemaining(c.deliveryDateStart),
                spread, sellerPtfFark,
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

  // Bir botun aktif fiyatı, tahtadaki en iyi fiyata eşit/yakınsa "en iyi teklif bizim" say (sarı highlight)
  function isOwnBestOffer(bot, row) {
    if (!bot || bot.status !== "ACTIVE") return false;
    if (bot.side === "BUY") return Math.abs((row.bidPrice || 0) - bot.max_price) < 0.5 && row.bidPrice >= bot.min_price;
    return Math.abs((row.askPrice || 0) - bot.min_price) < 0.5 && row.askPrice <= bot.max_price;
  }

  function trendIcon(trend) {
    if (trend === "up") return <span title="Yükseliş">🐂</span>;
    if (trend === "down") return <span title="Düşüş">🐻</span>;
    return <span className="text-gray-300">—</span>;
  }

  const activeCount = bots.filter((b) => b.status === "ACTIVE").length;
  const doneCount = bots.filter((b) => b.status === "DONE").length;

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-[#1A1D21]">Gün İçi Piyasası — Tahta</h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs bg-white border rounded-full px-3 py-1.5 shadow-sm">
            <span className={`w-2 h-2 rounded-full ${status === "BAĞLI" ? "bg-[#93D502]" : status.startsWith("HATA") ? "bg-[#E95D4F]" : "bg-amber-400"}`} />
            <span className="text-gray-600">{status}</span>
          </div>
          <a href="/central/bots" className="text-xs bg-[#93D502] text-[#1A1D21] font-semibold px-3 py-1.5 rounded-full hover:brightness-95 transition-all">
            Ticari Botlar →
          </a>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 max-w-xl">
        <div className="bg-white border rounded-lg p-3 shadow-sm">
          <div className="text-[10px] text-gray-400 uppercase tracking-wide">Kontrat</div>
          <div className="text-xl font-semibold text-[#1A1D21]">{rowList.length}</div>
        </div>
        <div className="bg-white border rounded-lg p-3 shadow-sm">
          <div className="text-[10px] text-gray-400 uppercase tracking-wide">Aktif Bot</div>
          <div className="text-xl font-semibold text-[#93D502]">{activeCount}</div>
        </div>
        <div className="bg-white border rounded-lg p-3 shadow-sm">
          <div className="text-[10px] text-gray-400 uppercase tracking-wide">Tamamlanan</div>
          <div className="text-xl font-semibold text-blue-600">{doneCount}</div>
        </div>
      </div>

      <div className="w-full overflow-x-auto border border-gray-200 rounded-xl shadow-sm bg-white">
        <table className="min-w-full border-collapse text-xs">
          <thead className="bg-[#F7F8F5] text-[#1A1D21] font-semibold uppercase tracking-wide text-[10px]">
            <tr>
              <th className="px-3 py-2.5 border-b" rowSpan={2}>Kontrat</th>
              <th className="px-3 py-2.5 border-b" rowSpan={2}>PTF</th>
              <th className="px-3 py-2.5 border-b" rowSpan={2}>Yön</th>
              <th className="px-3 py-2 border-b" colSpan={2}>Alış</th>
              <th className="px-3 py-2.5 border-b" rowSpan={2}>Derinlik</th>
              <th className="px-3 py-2 border-b" colSpan={2}>Satış</th>
              <th className="px-3 py-2.5 border-b" rowSpan={2}>Spread</th>
              <th className="px-3 py-2.5 border-b" rowSpan={2}>Satıcı PTF Fark</th>
              <th className="px-3 py-2.5 border-b" rowSpan={2}>Trend</th>
              <th className="px-3 py-2.5 border-b" rowSpan={2}>Net P.</th>
              <th className="px-3 py-2.5 border-b" rowSpan={2}>Kalan</th>
              <th className="px-3 py-2.5 border-b" rowSpan={2}>Bot</th>
            </tr>
            <tr>
              <th className="px-3 py-1 border-b font-normal normal-case text-gray-400">Miktar</th>
              <th className="px-3 py-1 border-b font-normal normal-case text-gray-400">Fiyat</th>
              <th className="px-3 py-1 border-b font-normal normal-case text-gray-400">Fiyat</th>
              <th className="px-3 py-1 border-b font-normal normal-case text-gray-400">Miktar</th>
            </tr>
          </thead>
          <tbody>
            {rowList.map((r, idx) => {
              const bot = botForContract(r.contract);
              const ownBest = isOwnBestOffer(bot, r);
              return (
                <tr
                  key={r.contract}
                  className={`transition-colors ${ownBest ? "bg-yellow-100 hover:bg-yellow-100" : idx % 2 === 1 ? "bg-gray-50/40 hover:bg-blue-50/60" : "hover:bg-blue-50/60"}`}
                >
                  <td className="px-3 py-2 border-b font-medium text-[#1A1D21]">{r.contract}</td>
                  <td className="px-3 py-2 border-b text-right font-semibold">{r.ptf}</td>
                  <td className={`px-3 py-2 border-b text-center font-semibold ${r.yon === "YAL" ? "text-[#E95D4F]" : r.yon === "YAT" ? "text-[#93D502]" : "text-gray-400"}`}>{r.yon}</td>
                  <td className="px-3 py-2 border-b text-right text-gray-600">{r.bidQty}</td>
                  <td className="px-3 py-2 border-b text-right">
                    <span className="bg-[#E95D4F] text-white font-semibold px-2 py-0.5 rounded">{r.bidPrice}</span>
                  </td>
                  <td className="px-3 py-2 border-b text-center">
                    <div className="flex h-2.5 w-16 mx-auto rounded-full overflow-hidden bg-gray-100">
                      <div className="bg-[#E95D4F]" style={{ width: "50%" }} />
                      <div className="bg-emerald-500" style={{ width: "50%" }} />
                    </div>
                  </td>
                  <td className="px-3 py-2 border-b text-right">
                    <span className="bg-emerald-600 text-white font-semibold px-2 py-0.5 rounded">{r.askPrice}</span>
                  </td>
                  <td className="px-3 py-2 border-b text-right text-gray-600">{r.askQty}</td>
                  <td className="px-3 py-2 border-b text-right font-medium">{r.spread}</td>
                  <td className={`px-3 py-2 border-b text-right font-medium ${parseFloat(r.sellerPtfFark) > 0 ? "text-[#93D502]" : "text-[#E95D4F]"}`}>
                    {r.sellerPtfFark !== "-" ? `${r.sellerPtfFark}%` : "-"}
                  </td>
                  <td className="px-3 py-2 border-b text-center text-lg">{trendIcon(r.trend)}</td>
                  <td className="px-3 py-2 border-b text-right">{r.netPos}</td>
                  <td className="px-3 py-2 border-b text-center text-gray-500">{r.remaining}</td>
                  <td className="px-3 py-2 border-b text-center">
                    <BotCell status={bot?.status} onClick={() => openBotPanel(r.contract)} />
                  </td>
                </tr>
              );
            })}
            {rowList.length === 0 && (
              <tr><td colSpan={14} className="px-3 py-10 text-center text-gray-400">Henüz veri yok — WS bağlanıyor...</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-4 text-[11px] text-gray-500 bg-white border rounded-lg px-4 py-2 w-fit">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-100 border border-yellow-300 inline-block" /> Sizin en iyi teklifiniz</span>
        <span className="flex items-center gap-1">🐂 Yükselen PTF</span>
        <span className="flex items-center gap-1">🐻 Düşen PTF</span>
      </div>

      <BotPanel open={panelOpen} kontrat={selectedContract} existingBot={botForContract(selectedContract)} onClose={() => setPanelOpen(false)} onSaved={refreshBots} />
    </div>
  );
}
