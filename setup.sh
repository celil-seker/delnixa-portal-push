#!/bin/bash
set -e
echo "== Delnixa Portal kurulum =="

if [ ! -f certs/fullchain.pem ]; then
  mkdir -p certs
  openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout certs/privkey.pem -out certs/fullchain.pem \
    -subj "/CN=localhost"
  echo "Self-signed sertifika oluşturuldu."
fi

if [ ! -f frontend/.env.local ]; then
  cp frontend/.env.local.example
cd ~/Proje/opt-delnixa-portal

# 1) Gereksiz/boş placeholder dosyaları temizle
git rm -f "-H" "-d" "EOF" "accessToken:" "return" "ws_url:" "}" 2>/dev/null

# 2) setup.sh oluştur
cat > setup.sh << 'EOF'
#!/bin/bash
set -e
echo "== Delnixa Portal kurulum =="

if [ ! -f certs/fullchain.pem ]; then
  mkdir -p certs
  openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout certs/privkey.pem -out certs/fullchain.pem \
    -subj "/CN=localhost"
  echo "Self-signed sertifika oluşturuldu."
fi

if [ ! -f frontend/.env.local ]; then
  cp frontend/.env.local.example frontend/.env.local
  echo "frontend/.env.local oluşturuldu."
fi

if [ ! -f .env ]; then
  cp .env.example .env
  echo ".env oluşturuldu — içindeki JWT_SECRET'ı değiştirmen önerilir."
fi

echo "Kurulum tamam. Şimdi çalıştır: docker compose up -d --build"
