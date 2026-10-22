FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src/ ./src/

ENV CHAOS_MODE=live_hybrid

EXPOSE 9000

HEALTHCHECK --interval=5s --timeout=3s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:9000/health', timeout=2).status==200 else 1)"

CMD ["python", "src/app.py", "--host", "0.0.0.0", "--port", "9000"]
