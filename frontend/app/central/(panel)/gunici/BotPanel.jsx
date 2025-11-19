export default function BotPanel({ open, kontrat, onClose }) {
    if (!open) return null;

    return (
        <div className="fixed right-0 top-0 w-[380px] h-full bg-white shadow-xl border-l border-blue-900 z-50">
            <div className="p-4 border-b border-blue-900 text-blue-900 font-semibold">
                BOT AYARLARI
            </div>

            <div className="p-4 text-sm">
                Kontrat: {kontrat}
                <br />
                (Panel içeriği sonra doldurulacak)
            </div>

            <button
                onClick={onClose}
                className="absolute top-2 right-2 text-xl text-blue-900"
            >
                ✖
            </button>
        </div>
    );
}
