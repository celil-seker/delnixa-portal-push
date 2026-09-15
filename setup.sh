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
  echo "NEXT_PUBLIC_API_URL=" > frontend/.env.local
  echo "frontend/.env.local oluşturuldu."
fi
if [ ! -f .env ]; then
  cp .env.example .env
  echo ".env oluşturuldu."
fi
echo "Kurulum tamam. Şimdi çalıştır: docker compose up -d --build"
