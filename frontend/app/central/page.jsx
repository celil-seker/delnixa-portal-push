"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CentralLogin() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/central/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json(); if (data.access_token) { localStorage.setItem("portal_token", data.access_token); } if (data.access_token) { localStorage.setItem("portal_token", data.access_token); }

      if (data.access_token) {
        localStorage.setItem("access_token", data.access_token);
        router.push("/central/dashboard");
      } else {
        alert(data.detail || "Kullanıcı adı veya şifre hatalı.");
      }
    } catch (err) {
      alert("Sunucuya bağlanılamadı. Lütfen tekrar deneyin.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-gray-50">
      <div className="bg-white shadow-lg rounded-2xl p-8 w-full max-w-md border border-gray-200">
        <h1 className="text-2xl font-semibold text-center mb-6 text-gray-800">
          Merkezi Hesap Girişi
        </h1>
        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700">Kullanıcı Adı</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring focus:ring-blue-200 focus:border-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Şifre</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring focus:ring-blue-200 focus:border-blue-500 outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-semibold hover:bg-blue-700 transition disabled:bg-gray-400"
          >
            {loading ? "Giriş yapılıyor..." : "Giriş Yap"}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-5">
          © {new Date().getFullYear()} Delnixa Energy Portal
        </p>
      </div>
    </div>
  );
}

