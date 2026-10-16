# Laya and AnyJev decision services

Wisentry calls these models from its server-side outreach qualification action. The models return typed decisions and probabilities; they do not generate website summaries or email copy. Those prose features use the separately configured text-generation provider.

## Laya

Laya's `/v1/systemone` endpoint accepts multiple typed questions over the same conversation. Wisentry sends a fit choice and a buying-intent yes/no question. To run it locally:

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install "laya[serve]"
$env:LAYA_API_KEY = "replace-with-a-long-random-secret"
$env:LAYA_HOST = "127.0.0.1"
laya-serve
```

Set `LAYA_URL=http://127.0.0.1:8000` and `LAYA_API_KEY` in Wisentry's server environment. Keep the service private. Laya downloads its checkpoints when first used; allow for checkpoint storage and the first-request load time.

## AnyJev

Wisentry uses AnyJev's Tacit HTTP decision endpoint. The reference setup runs a local vLLM server and the AnyJev gateway:

```bash
python -m pip install "anyjev[client]" vllm
vllm serve morriszjm/Tacit-9B --host 127.0.0.1 --port 8000
python -m anyjev.serve --model morriszjm/Tacit-9B --upstream http://127.0.0.1:8000 --adaptive --port 8100
```

Set `ANYJEV_URL=http://127.0.0.1:8100` in Wisentry's server environment. The gateway's default bind address is loopback and it does not provide authentication. If Wisentry and the model service run on different hosts, use a private network and an authenticated reverse proxy; the optional `ANYJEV_API_KEY` is sent as a bearer token for such a proxy, but the built-in gateway does not validate it. Tacit checkpoints and vLLM need substantial disk, memory, and usually GPU resources; choose a smaller Tacit checkpoint if the host cannot serve 9B parameters.

## Routing

- Non-English or multilingual conversation text prefers Laya.
- Other conversations prefer AnyJev.
- If the preferred service is missing or unavailable, Wisentry tries the other configured service.
- If the preferred model's fit confidence is below 68%, Wisentry requests a second assessment from the other configured model and stores that result.
- If only one service is configured, Wisentry uses it regardless of language or confidence.

Qualification is advisory. Wisentry stores the model name, result, confidence, and timestamp alongside the prospect. A founder still reviews the original conversation and confirms the contact details before outreach.
