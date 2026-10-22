# Laya prospect qualification

Threadly uses Laya as its primary typed-decision model for prospect fit and buying intent. The app calls Laya's authenticated `POST /v1/systemone` endpoint with both questions in one request. Laya routes the request to its English or multilingual checkpoint. AnyJev is optional and is used only when Laya is unavailable or its fit confidence is below the current fallback threshold.

## Run the production-shaped service

The included Compose service pins Laya 0.4.13, keeps model weights in a persistent Docker volume, preloads the English and multilingual checkpoints, requires bearer authentication, runs as an unprivileged user, and publishes its port on loopback only. It is a CPU deployment; plan for at least 8 GB RAM and 10 GB free disk as recommended by Laya. Checkpoint download and preload make the first startup take several minutes.

1. Install Docker Engine or Docker Desktop with Compose v2 for the production-shaped container. For this Windows development workspace, install the server package into the isolated environment instead:

   ```powershell
   python -m venv infra/laya/.venv
   .\infra\laya\.venv\Scripts\python.exe -m pip install "laya[serve]==0.4.13"
   ```

2. Generate a random token and save it to `infra/laya/secrets/api-key`. Keep a copy in the Next.js server's secret manager as `LAYA_API_KEY`. For a local development token, run:

   ```powershell
   node -e "const fs=require('node:fs');const c=require('node:crypto');fs.mkdirSync('infra/laya/secrets',{recursive:true});const k=c.randomBytes(32).toString('hex');fs.writeFileSync('infra/laya/secrets/api-key',k);console.log(k)"
   ```

   Copy the printed value into `.env.local` as `LAYA_API_KEY`. The secrets directory is git-ignored.
3. Set `LAYA_URL=http://127.0.0.1:8000` and the matching `LAYA_API_KEY` in `.env.local` when the Next.js server runs on the same host. Restart Next.js after changing its environment.
4. Start Laya with `docker compose -f compose.laya.yaml up -d --build` on the container host, or run `infra/laya/start-local.ps1` for this Windows development workspace. The local script runs lazily with one checkpoint resident to reduce memory pressure; the first qualification downloads and loads its checkpoint.
5. Wait until `docker compose -f compose.laya.yaml ps` reports `healthy` (container) or `http://127.0.0.1:8000/health` responds (local), then qualify a reviewed prospect from the Outreach page. Stop the local service with `infra/laya/stop-local.ps1`.

The Laya service health check verifies the HTTP process is responsive. A successful prospect qualification verifies authenticated inference. The app's `GET /api/health` response reports whether a decision endpoint is configured under `checks.prospectQualification`; the endpoint never exposes the URL or token.

## Separate app and model hosts

For a Vercel or other hosted Next.js deployment, `127.0.0.1` points to the app's own runtime and cannot reach a model server on another machine. Deploy the Laya service on a persistent CPU or GPU host, put it behind TLS, restrict ingress to the app's egress/private network, and require a long random `LAYA_API_KEY`. Set the app's server-only `LAYA_URL` to that private HTTPS endpoint and the matching key in its secret manager, then redeploy. Do not expose the model service without authentication. If your hosting platform cannot route privately to the model host, use a trusted network tunnel or a private service connection supported by both hosts.

Use `LAYA_DEVICE=cuda` only on a host with a compatible NVIDIA driver and container runtime. Provision persistent storage for `/home/laya/.cache/huggingface`; removing the `laya-model-cache` volume forces model downloads again. Monitor memory, disk, startup health, inference errors, and latency. Tune `LAYA_THREADS` to the host's available CPU cores.

## Decision behavior

- Laya is preferred for every prospect and performs its own language routing.
- If Laya is not configured, AnyJev can qualify prospects by itself.
- If Laya errors or its fit confidence is below 68%, configured AnyJev is tried as a secondary fallback.
- Qualification remains advisory. Review the original conversation and verify contact details before outreach.

The 68% threshold is a fallback policy, not a validated guarantee of accuracy. Evaluate it on labeled examples from your prospect workflow before relying on the score for business decisions.
