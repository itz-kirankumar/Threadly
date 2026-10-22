FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    HF_HOME=/home/laya/.cache/huggingface \
    LAYA_HOST=0.0.0.0 \
    LAYA_PORT=8000

RUN python -m pip install --no-cache-dir "laya[serve]==0.4.13" \
    && useradd --create-home --uid 10001 --shell /usr/sbin/nologin laya \
    && mkdir -p /home/laya/.cache/huggingface \
    && chown -R 10001:10001 /home/laya

COPY --chmod=755 entrypoint.sh /usr/local/bin/laya-entrypoint

USER 10001:10001
EXPOSE 8000
ENTRYPOINT ["laya-entrypoint"]
CMD ["laya-serve"]
