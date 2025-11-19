FROM python:3.11-slim

WORKDIR /app

# Sisteme gerekli ek paketler
RUN apt-get update && apt-get install -y --no-install-recommends gcc \
    && pip install --upgrade pip

# requirements.txt dosyasını ÖNCE kopyala
COPY requirements.txt /app/requirements.txt

# Paketleri yükle
RUN pip install -r requirements.txt

# Şimdi tüm backend kodunu kopyala
COPY . .

# Gereksiz paketleri kaldır
RUN apt-get purge -y --auto-remove gcc \
    && rm -rf /var/lib/apt/lists/*

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

