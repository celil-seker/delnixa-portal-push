export default function BotCell({ status, onClick }) {
  const icon = status === "ACTIVE" ? "🟢" : status === "PAUSED" ? "⏸️" : status === "DONE" ? "✅" : "🔔";
  return (
    <button onClick={onClick} className="flex items-center justify-center text-lg w-full">
      {icon}
    </button>
  );
}
