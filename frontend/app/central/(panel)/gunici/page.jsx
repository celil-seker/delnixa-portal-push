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
    const now = new Date();
    const end = new Date(deliveryStart);
    const diff = end - now;
    if (diff <= 0) return "0 dk";
    const mins = Math.floor(diff / 60000);
    return mins + " dk";
  }

  const refreshBots = useCallback(async () => {
    const token = localStorage.getItem("portal_token");
    if (!token) return;
    try {
      const res = await fetch(`${apiUrl}/api/bots?portal_token=${token}`);
      const data = await res.json();
      setBots(data.bots || []);
    } catch (e) {
      console.error("Bot listesi alınamadı:", e);
    }
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
        if (!token) {
          setStatus("HATA: TOKEN YOK");
          return;
        }

        const res = await fetch(`${CONNECT_URL}?portal_token=${token}`);
        const data = await res.json();
        if (!data.ws_url) {
          setStatus("HATA: WS URL GELMEDİ");
          return;
        }

        const ws = new WebSocket(data.ws_url);
        wsRef.current = ws;

        ws.onopen = () => setStatus("BAĞLI");
        ws.onclose = () => {
          if (!cancelled) {
            setStatus("BAĞLANTI KAPANDI — 3sn sonra tekrar deneniyor");
            setTimeout(connect, 3000);
          }
        };
        ws.onerror = () => setStatus("WS HATASI");

        ws.onmessage = (msg) => {
          try {
            const payload = JSON.parse(msg.data);
            if (payload.eventType !== "HourlyContractBoard") return;

            const c = payload.body || {};
            const info = c.boardInformation || {};

            setRows((prev) => ({
              ...prev,
              [c.name]: {
                contract: c.name,
                bidQty: c.bestBuyQuantity ?? 0,
                bidPrice: c.bestBuyPrice ?? 0,
                diff: c.priceGap ?? 0,
                askPrice: c.bestSellPrice ?? 0,
                askQty: c.bestSellQuantity ?? 0,
                ptf: info.mcp ?? 0,
                aof: info.averagePrice ?? 0,
                remaining: formatRemaining(c.deliveryDateStart),
                matchBuy: 0,
                matchSell: 0,
                matchNet: 0,
                myBuyPrice: 0,
                mySellPrice: 0,
                te0: 0,
                tgs: 0,
              },
            }));
          } catch (e) {
            console.error("WS parse error:", e);
          }
        };
      } catch (e) {
        setStatus("HATA (EXCEPTION)");
      }
    }
    connect();

    return () => {
      cancelled = true;
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  const rowList = Object.values(rows).sort((a, b) =>
    a.contract.localeCompare(b.contract)
  );

  function botForContract(contractName) {
    return bots.find((b) => b.contract_name === contractName);
  }

  function openBotPanel(contractName) {
    setSelectedContract(contractName);
    setPanelOpen(true);
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-[#0A1A2F]">Gün İçi Piyasası Tahtası</h1>
        <div className="text-xs">
          WS:{" "}
          <span
            className={
              status === "BAĞLI"
                ? "text-green-600"
                : status.startsWith("HATA")
                ? "text-red-600"
                : "text-yellow-600"
            }
          >
            {status}
          </span>
        </div>
      </div>

      <div className="w-full overflow-x-auto border border-gray-200 rounded-lg shadow-sm bg-white">
        <table className="min-w-full border-collapse text-xs">
          <thead className="bg-[#F4F6F9] text-[#0A1A2F] font-semibold">
            <tr>
              <th className="px-3 py-2 border">Kontrat</th>
              <th className="px-3 py-2 border">Alış Miktar</th>
              <th className="px-3 py-2 border">Alış Fiyat</th>
              <th className="px-3 py-2 border">Fark</th>
              <th className="px-3 py-2 border">Satış Fiyat</th>
              <th className="px-3 py-2 border">Satış Miktar</th>
              <th className="px-3 py-2 border">PTF</th>
              <th className="px-3 py-2 border">AOF</th>
              <th className="px-3 py-2 border">Kalan</th>
              <th className="px-3 py-2 border">Eşl. Alış</th>
              <th className="px-3 py-2 border">Eşl. Satış</th>
              <th className="px-3 py-2 border">Net</th>
              <th className="px-3 py-2 border">Alış F.</th>
              <th className="px-3 py-2 border">Satış F.</th>
              <th className="px-3 py-2 border">TE₀</th>
              <th className="px-3 py-2 border">TGS</th>
              <th className="px-3 py-2 border">BOT</th>
            </tr>
          </thead>

          <tbody>
            {rowList.map((r) => {
              const bot = botForContract(r.contract);
              return (
                <tr key={r.contract} className="hover:bg-blue-50 transition-colors border-b">
                  <td className="px-3 py-2 border">{r.contract}</td>
                  <td className="px-3 py-2 border text-right">{r.bidQty}</td>
                  <td className="px-3 py-2 border text-right text-blue-700 font-semibold">
                    {r.bidPrice}
                  </td>
                  <td className="px-3 py-2 border text-right">{r.diff}</td>
                  <td className="px-3 py-2 border text-right text-red-600 font-semibold">
                    {r.askPrice}
                  </td>
                  <td className="px-3 py-2 border text-right">{r.askQty}</td>
                  <td className="px-3 py-2 border text-right">{r.ptf}</td>
                  <td className="px-3 py-2 border text-right">{r.aof}</td>
                  <td className="px-3 py-2 border text-center">{r.remaining}</td>
                  <td className="px-3 py-2 border text-right">{r.matchBuy}</td>
                  <td className="px-3 py-2 border text-right">{r.matchSell}</td>
                  <td className="px-3 py-2 border text-right">{r.matchNet}</td>
                  <td className="px-3 py-2 border text-right">{r.myBuyPrice}</td>
                  <td className="px-3 py-2 border text-right">{r.mySellPrice}</td>
                  <td className="px-3 py-2 border text-right">{r.te0}</td>
                  <td className="px-3 py-2 border text-right">{r.tgs}</td>
                  <td className="px-3 py-2 border text-center">
                    <BotCell status={bot?.status} onClick={() => openBotPanel(r.contract)} />
                  </td>
                </tr>
              );
            })}

            {rowList.length === 0 && (
              <tr>
                <td colSpan={17} className="px-3 py-6 text-center text-gray-500">
                  Henüz veri yok — WS bağlanıyor...
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <BotPanel
        open={panelOpen}
        kontrat={selectedContract}
        existingBot={botForContract(selectedContract)}
        onClose={() => setPanelOpen(false)}
        onSaved={refreshBots}
      />
    </div>
  );
}
