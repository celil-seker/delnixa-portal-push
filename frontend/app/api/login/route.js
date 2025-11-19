export async function POST(req) {
  // 🔧 /login çağrılarını backend'deki /central/login'e yönlendirir
  const body = await req.json();

  const res = await fetch("http://delnixa-portal-api-1:8000/central/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  return new Response(JSON.stringify(data), {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
