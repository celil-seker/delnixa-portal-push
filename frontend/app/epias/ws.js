"use client";

export async function connectWS(portalToken, onMessage, onStatus) {
    try {
        onStatus("⏳ Backend kontrol ediliyor...");

        // Doğru endpoint
        const resp = await fetch(`/api/epias/ws/connect?portal_token=${portalToken}`);
        if (!resp.ok) throw new Error("Backend WS connect hatası");
        const data = await resp.json();

        // Backend zaten full ws_url dönüyor
        const wsUrl = data.ws_url;

        onStatus("🔑 JWT alındı — WS bağlanıyor...");

        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            onStatus("🟢 WS bağlı — HOURLY_CONTRACT_BOARD dinleniyor");
            ws.send(JSON.stringify({
                cmd: "subscribe",
                channels: ["HOURLY_CONTRACT_BOARD"]
            }));
        };

        ws.onmessage = (msg) => {
            onMessage(msg.data);
        };

        ws.onerror = (err) => {
            onStatus("❌ WS hata");
            console.log("WS ERROR:", err);
        };

        ws.onclose = () => {
            onStatus("🔄 Bağlantı kapandı — tekrar bağlanıyor...");
            setTimeout(() => connectWS(portalToken, onMessage, onStatus), 3000);
        };

    } catch (err) {
        onStatus("❌ WS bağlantısı kurulamadı");
        console.error(err);
    }
}

