export async function POST(request) {
  try {
    const body = await request.json();

    // Container içi hostname — dışarıdan erişim yok, sadece sunucu tarafı
    const upstream = 'http://delnixa-portal-api-1:8000/central/login';

    const res = await fetch(upstream, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await res.text(); // bazen JSON, bazen hata metni olabilir
    return new Response(data, {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('content-type') || 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ detail: 'Proxy error', error: String(err) }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

