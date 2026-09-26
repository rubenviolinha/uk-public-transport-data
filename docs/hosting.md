# Hosting the display API

The project can be hosted as a small backend service, but the API server and
the data poller should be treated as separate processes:

```text
BODS / Darwin feeds -> private poller -> persistent cache -> display API -> devices
```

The provider credentials belong only in the poller's server-side environment.
They must never be included in browser code, firmware, customer configuration,
or API responses.

## Container deployment

The repository includes a `Dockerfile` for the API process:

```bash
docker build -t uk-public-transport-data .
docker run --rm -p 8787:8787 --env-file .env \
  -v "$PWD/data:/app/data" uk-public-transport-data
```

Run the poller as a second process or scheduled worker using the same image:

```bash
docker run --rm --env-file .env \
  -v "$PWD/data:/app/data" \
  uk-public-transport-data npm run display:watch
```

The `data/` volume is required if runtime configuration and the last successful
cache must survive container replacement. In a managed platform, use its
persistent volume or replace the local JSON cache with a managed database or
object store before running multiple API instances.

## Production requirements before selling access

* Put the API behind HTTPS and authentication/device authorisation.
* Set a strong `DISPLAY_ADMIN_TOKEN`; production configuration endpoints reject unauthenticated requests.
* Add per-customer rate limits and usage monitoring.
* Keep BODS and Darwin credentials in the platform's secret store.
* Make the poller single-writer, or use a shared datastore with locking.
* Monitor feed failures, cache age, request latency, and provider usage.
* Display the required BODS/National Rail attribution and a data-quality disclaimer.
* Do not expose raw provider feeds or pass your provider credentials to customers.
* Confirm the current provider licences and any high-volume charging before launch.

Short-lived serverless functions are suitable for the API only if the cache is
external and polling is handled by a scheduled job or long-running worker. A
continuous `display:watch` process should run in a worker/container/VPS rather
than inside a request handler.
