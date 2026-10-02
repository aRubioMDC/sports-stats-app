# Backend-only image for self-host (split-container architecture).
# Unlike infra/Dockerfile (Railway target), this does NOT bundle the frontend build.
FROM python:3.12-slim
WORKDIR /app

COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend/ ./backend/
WORKDIR /app/backend

RUN useradd --no-create-home --shell /usr/sbin/nologin appuser \
    && chown -R appuser /app
USER appuser

ENV PORT=8000
EXPOSE 8000

# No frontend dist present, so the StaticFiles mount in main.py stays inactive.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health', timeout=3)"

CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
