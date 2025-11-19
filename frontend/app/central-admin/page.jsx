"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function CentralAdmin() {
  const [form, setForm] = useState({
    username: "",
    password: "",
    company_name: "",
    company_id: "",
    epias_username: "",
    epias_password: "",
  });
  const [status, setStatus] = useState("");
  const router = useRouter();

  // Kaydet butonuna basınca backend'e gönder
  const handleSubmit = async () => {
    setStatus("Kaydediliyor...");
    try {
      const res = await fetch("/api/central/admin/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();

      if (res.ok) {
        setStatus("✅ Merkezi hesap başarıyla kaydedildi!");
        // 2 saniye sonra merkezi giriş sayfasına yönlendir
        setTimeout(() => {
          router.push("/central");
        }, 2000);
      } else {
        setStatus(data.detail || "Bir hata oluştu.");
      }
    } catch (e) {
      setStatus("Sunucuya bağlanılamadı.");
    }
  };

  return (
    <div className="max-w-lg mx-auto p-8">
      <h1 className="text-2xl font-semibold mb-6 text-center">
        Merkezi Hesap Kaydı
      </h1>

      <label className="block mb-2">Kullanıcı Adı</label>
      <input
        className="w-full border p-2 rounded mb-4"
        value={form.username}
        onChange={(e) => setForm({ ...form, username: e.target.value })}
      />

      <label className="block mb-2">Şifre</label>
      <input
        type="password"
        className="w-full border p-2 rounded mb-4"
        value={form.password}
        onChange={(e) => setForm({ ...form, password: e.target.value })}
      />

      <label className="block mb-2">Şirket Adı</label>
      <input
        className="w-full border p-2 rounded mb-4"
        value={form.company_name}
        onChange={(e) => setForm({ ...form, company_name: e.target.value })}
      />

      <label className="block mb-2">Şirket ID</label>
      <input
        className="w-full border p-2 rounded mb-4"
        value={form.company_id}
        onChange={(e) => setForm({ ...form, company_id: e.target.value })}
      />

      <label className="block mb-2">EPİAŞ Kullanıcı Adı</label>
      <input
        className="w-full border p-2 rounded mb-4"
        value={form.epias_username}
        onChange={(e) => setForm({ ...form, epias_username: e.target.value })}
      />

      <label className="block mb-2">EPİAŞ Şifre</label>
      <input
        type="password"
        className="w-full border p-2 rounded mb-4"
        value={form.epias_password}
        onChange={(e) => setForm({ ...form, epias_password: e.target.value })}
      />

      <button
        onClick={handleSubmit}
        className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
      >
        Kaydet
      </button>

      {status && <p className="text-center text-sm mt-4">{status}</p>}
    </div>
  );
}

