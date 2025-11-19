"use client";

export async function connectWS(portalToken, onMessage, onStatus) {
    try {
        onStatus("⏳ Backend kontrol ediliyor...");

        // Mutlaka tam URL ile çağır
        const resp = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/epias/ws/connect?portal_token=${portalToken}`);

        if (!resp.ok) throw new Error("Backend WS connect hatası");
        const data = await resp.json();

        // Full EPİAŞ URL
        const wsUrl = `wss://gunici.epias.com.tr/gunici-service${data.ws_path}`;

        onStatus("🔑 JWT alındı — WS bağlanıyor...");

        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            onStatus("🟢 WS bağlı — HOURLY_CONTRACT_BOARD dinleniyor");
            ws.send(JSON.stringify({
                cmd: "subscribe",
                channels: ["HOURLY_CONTRACT_BOARD"]
            }));
        };

        ws.onmessage = (evt) => {
            try {
                const msg = JSON.parse(evt.data);
                onMessage(msg);
            } catch (e) {
                console.error("Parse error:", e);
            }
        };

        ws.onerror = () => onStatus("🟠 WS hata");
        ws.onclose = () => onStatus("🔴 WS kapandı");

        return ws;

    } catch (err) {
        onStatus("❌ WS bağlantısı kurulamadı");
        console.error(err);
        return null;
    }
}
