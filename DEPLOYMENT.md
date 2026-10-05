# Deploying Ponte

Ponte runs as one Node.js service: it serves the compiled interface and the API from the same origin. There is no database to provision. Use a current patched Node.js 22 release or later.

## Node hosting

Set the build command to `npm ci && npm run build` and the start command to `npm start`. The host can remove development dependencies after the build with `npm prune --omit=dev`; the server runtime is included in production dependencies.

Set these variables in the hosting service's secret/environment settings:

```env
NODE_ENV=production
APP_ORIGIN=https://your-real-domain.example
HOST=0.0.0.0
PORT=3001
AI_PROVIDER=openrouter
OPENROUTER_API_KEY=your-key
OPENROUTER_MODEL=apodex/apodex-1.1-mini:free
AI_DAILY_REQUEST_LIMIT=100
```

Use the port assigned by your host if it supplies `PORT` automatically. `APP_ORIGIN` is the full public origin, including any nonstandard port, without a path. Production startup requires it and rejects public HTTP origins. Configure HTTPS at the host or reverse proxy. Localhost HTTP is allowed for release checks.

Health checks should request **`GET /api/health`**. A healthy service returns `200` and `{"status":"ok"}`. This checks the app, not upstream model availability. Live AI calls still depend on provider access and quota.

### Reverse proxies

`TRUST_PROXY` defaults to `0`: client-supplied forwarding headers are ignored. If traffic reaches Node through exactly one trusted proxy, set `TRUST_PROXY=1`. Keep the Node port private behind that proxy, and have the proxy replace forwarding headers. Do not use a hop count unless it matches every route into the service. Otherwise clients may spoof their IP or everyone may share one rate limit. See the [Express proxy guide](https://expressjs.com/en/guide/behind-proxies.html).

Allow enough time for AI requests at the proxy: a provider attempt can take up to 180 seconds and automatic corrections can add attempts. A 13-minute upstream read timeout accommodates the bounded analysis path. Upload bodies have a 30-second receipt timeout and a 10 MB file limit. Avoid logging request bodies at the proxy.

## Container

The Dockerfile uses a multi-stage build. The runtime has production dependencies only, runs as the `node` user and includes a health check. Its build context excludes `.env`, Git metadata, reports and local documents.

```bash
docker build -t ponte:latest .
docker run --rm --name ponte \
  -p 127.0.0.1:3001:3001 \
  --env-file /path/to/private/ponte.env \
  --read-only --tmpfs /tmp:rw,noexec,nosuid,size=64m \
  --cap-drop=ALL --security-opt=no-new-privileges \
  --memory=512m --cpus=1 \
  ponte:latest
```

The private environment file contains the production variables above. Place an HTTPS reverse proxy in front of the bound local port. Use the equivalent settings on a container hosting service. Podman can run the same image and commands. When building with Podman, add `--format docker` so the Dockerfile health check is retained.

## Traffic and provider use

Defaults for one server process:

| Limit                            | Default            |
| -------------------------------- | ------------------ |
| General API requests per IP      | 180 per 10 minutes |
| Analysis/chat requests per IP    | 20 per 10 minutes  |
| PDF uploads per IP               | 8 per 10 minutes   |
| Simultaneous uploads/PDF readers | 2                  |
| PDF reader deadline              | 30 seconds         |
| Simultaneous provider calls      | 3                  |
| Provider attempts per UTC day    | 100                |

`API_RATE_LIMIT`, `AI_RATE_LIMIT`, `AI_DAILY_REQUEST_LIMIT` and `PDF_TIMEOUT_MS` are configurable within validated bounds. Example chat does not use the AI allowance. A provider retry or evidence correction counts as another attempt. Failed attempts count too, since the provider may already have processed them.

These counters are in memory and reset on restart. Multiple replicas have separate counters. For a larger service, enforce shared limits at the gateway or with a shared store. Set a hard spending/usage limit on the provider account as well: request counts are not a currency budget, and scripts or other apps using the same key are outside Ponte's counters. The free model is kept pinned; Ponte never chooses a paid fallback.

## Data and maintenance

Uploads are read in bounded workers and are not written to disk. PDF reader failures, malformed requests and unexpected internal errors return sanitized messages. A request ID lets you correlate unexpected failures without logging document text. IP rate-limit counters live in server memory; application logs do not record document contents, questions or API keys.

Fonts and their license notices are served with the app. Interface assets are cached under their content hashes; HTML and API responses are not cached. Production responses include a same-origin Content Security Policy and other security headers. Cross-site write requests are rejected. The API is still anonymous; these protections do not replace authentication if your deployment requires private access.

Configure the AI provider's data settings for the documents you intend to accept. Live analysis sends document text and questions to the configured provider. Do not advertise local inference or guaranteed accuracy.

Before releasing a new build, run:

```bash
npm run format:check
npm run build
npm run check:release
npm test
npx playwright install chromium
npm run test:e2e
npm audit
```

The browser tests start an isolated production server with empty provider credentials. Optional live checks use fictional fixtures and consume provider quota. See [VALIDATION.md](VALIDATION.md) for what was actually verified.
