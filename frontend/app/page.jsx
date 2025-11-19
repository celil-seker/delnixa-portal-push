"use client";
import { useState } from "react";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    alert("Giriş yapılıyor: " + username);
  };

  const handleCentralRedirect = () => {
    window.location.href = "/central";
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        background: "#F9FAFB",
        fontFamily: "Inter, Segoe UI, Arial, sans-serif",
      }}
    >
      {/* Sol Tanıtım Alanı */}
      <div
        style={{
          background: "#FFFFFF",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          padding: "80px",
        }}
      >
        <img
          src="/logo.svg"
          alt="Delnixa Logo"
          style={{ width: "120px", marginBottom: "24px" }}
        />
        <h1 style={{ color: "#003366", fontSize: "28px", fontWeight: "bold" }}>
          Delnixa Energy Intelligence
        </h1>
        <p
          style={{
            color: "#555",
            fontSize: "15px",
            marginTop: "16px",
            textAlign: "center",
            maxWidth: "380px",
            lineHeight: "1.5",
          }}
        >
          Delnixa, yapay zekâ ve veri analitiğiyle enerji piyasasında dijital
          dönüşüm sağlar. Akıllı sistemlerle enerji verimliliğini artırır ve
          maliyet yönetimini optimize eder.
        </p>
      </div>

      {/* Sağ Login Alanı */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          background: "#F9FAFB",
        }}
      >
        <form
          onSubmit={handleSubmit}
          style={{
            width: "380px",
            background: "#fff",
            padding: "40px",
            borderRadius: "16px",
            boxShadow: "0 8px 20px rgba(0,0,0,0.08)",
          }}
        >
          <div style={{ textAlign: "center", marginBottom: "24px" }}>
            <img
              src="/logo.svg"
              alt="Delnixa Logo"
              style={{ width: "90px", marginBottom: "8px" }}
            />
            <h2 style={{ color: "#003366", fontWeight: "bold", fontSize: "20px" }}>
              Delnixa Portal’a Giriş Yapın
            </h2>
          </div>

          <label style={{ fontWeight: "600", color: "#333" }}>Kullanıcı Adı</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={{
              width: "100%",
              padding: "10px",
              borderRadius: "8px",
              border: "1px solid #ccc",
              marginTop: "6px",
              marginBottom: "18px",
            }}
          />

          <label style={{ fontWeight: "600", color: "#333" }}>Şifre</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{
              width: "100%",
              padding: "10px",
              borderRadius: "8px",
              border: "1px solid #ccc",
              marginTop: "6px",
              marginBottom: "10px",
            }}
          />

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "18px",
            }}
          >
            <label style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <input
                type="checkbox"
                checked={remember}
                onChange={() => setRemember(!remember)}
              />
              <span style={{ color: "#444" }}>Beni Hatırla</span>
            </label>
            <a href="#" style={{ color: "#003366", fontSize: "14px" }}>
              Şifremi Unuttum
            </a>
          </div>

          <button
            type="submit"
            style={{
              width: "100%",
              background: "#003366",
              color: "#fff",
              padding: "12px",
              borderRadius: "8px",
              fontWeight: "600",
              border: "none",
              cursor: "pointer",
            }}
          >
            GİRİŞ YAP
          </button>

          <button
            type="button"
            onClick={handleCentralRedirect}
            style={{
              width: "100%",
              border: "1px solid #003366",
              color: "#003366",
              padding: "12px",
              borderRadius: "8px",
              fontWeight: "600",
              background: "#fff",
              marginTop: "16px",
              cursor: "pointer",
            }}
          >
            Merkezi Hesap
          </button>
        </form>
      </div>
    </main>
  );
}

