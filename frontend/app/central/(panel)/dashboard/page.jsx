"use client";

import { useEffect, useState } from "react";

export default function DashboardPage() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) return;

    fetch(`${process.env.NEXT_PUBLIC_API_URL}/central/dashboard?token=${token}`)
      .then((res) => res.json())
      .then((data) => setUser(data))
      .catch(() => {});
  }, []);

  return (
    <div className="p-8">
      <h2 className="text-2xl font-semibold text-gray-800 mb-4">
        Hoş geldiniz, {user?.username || ""}
      </h2>

      <div className="grid md:grid-cols-2 gap-6">

        {/* Şirket Bilgileri */}
        <div className="bg-white rounded-xl shadow p-5 border-l-4 border-gray-400">
          <h3 className="font-semibold text-gray-700 mb-2">Şirket Bilgileri</h3>
          <p><b>Şirket:</b> {user?.company_name || "-"}</p>
          <p><b>Şirket Kodu:</b> {user?.company_id || "-"}</p>
        </div>

        {/* EPİAŞ Bilgileri */}
        <div className="bg-white rounded-xl shadow p-5 border-l-4 border-gray-400">
          <h3 className="font-semibold text-gray-700 mb-2">EPİAŞ Bilgileri</h3>
          <p><b>Kullanıcı Adı:</b> {user?.epias_username || "-"}</p>
          <p><b>Şifre:</b> ********</p>
        </div>

      </div>

      <div className="mt-10 bg-gray-50 border rounded-xl p-6 text-center text-gray-700 shadow">
        📊 Yakında burada GİP ve GÖP piyasa analizleri, EPİAŞ canlı tahtası ve işlem raporları yer alacak.
      </div>
    </div>
  );
}

