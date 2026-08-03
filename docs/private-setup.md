# Wiring a private ops repo

The engine treats the private side as pure data + plugins. The ops repo contains **no framework
code**: real platform adapters, one TOML config per studio, annotations, the committed dataset, and
two workflows. It checks this repo out as a sibling, pinned to a tag.

```
<ops repo>/
├── adapters/            one module per real platform, default-exporting PlatformAdapter
├── studios/             one TOML per studio (same schema as demo/studios/)
├── annotations/         stars.json · overrides.toml · pins.toml · tag-groups.toml · geo.json
├── data/                dataset.json + summary.json + feed ics, committed by cron
└── .github/workflows/
    ├── fetch.yml        cron every 3h
    └── deploy.yml       build site from engine + private data → static host
```

## fetch.yml core

```yaml
on:
  schedule: [{ cron: "17 */3 * * *" }]
  workflow_dispatch:
jobs:
  fetch:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/checkout@v4
        with: { repository: abbymunsen/studioweek, ref: v0.1.0, path: engine }
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci --prefix engine
      # mirror the star store (Cloudflare KV) into annotations/stars.json first
      - run: |
          curl -sf -H "Authorization: Bearer $CF_API_TOKEN" \
            "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT/storage/kv/namespaces/$CF_KV_NS/values/starred" \
            > annotations/stars.json.tmp && \
            jq '{starred: .}' annotations/stars.json.tmp > annotations/stars.json
        env: { CF_API_TOKEN: "${{ secrets.CF_API_TOKEN }}", ... }
      - run: npx --prefix engine tsx engine/src/cli/fetch.ts
             --studios studios --adapters adapters --annotations annotations --out data
      - run: npx --prefix engine tsx engine/src/cli/build-ics.ts
             --data data --annotations annotations --out data
      - run: |
          git config user.name cron && git config user.email cron@invalid
          git add data annotations && git diff --cached --quiet || git commit -m "data: $(date -u +%FT%H:%M)"
          git push
```

The fetch step exits non-zero when any studio's data is stale >24h — let that fail the job; that's
the alarm. The job summary carries new untagged names, exclusion drops, and detached stars.

## deploy.yml core

Build the engine's frontend against private data and ship it to Cloudflare Pages:

```yaml
- run: STUDIOWEEK_DATA=$PWD/data npm run --prefix engine web:build
- run: npx wrangler pages deploy engine/web/dist --project-name <project>
```

Then, in Cloudflare: put Access in front of the Pages project, add a bypass policy for
`/<random-token>.ics` (the calendar-subscription URL — rotate the token to revoke), and deploy
`worker/stars-worker.js` behind the same Access application for star sync.

## Per-studio setup ritual

1. `studios/<id>.toml` — platform, params, color, address, pricing, teachers, tag rules.
2. `tsx engine/src/cli/validate.ts --studios studios --annotations annotations`
3. `tsx engine/src/cli/geocode.ts --studios studios --annotations annotations`
4. Hand-enter transit minutes per pin into `annotations/geo.json` (one Google Maps look each).
5. Run a fetch; check the summary's untagged names; add tag rules until the bucket is empty-ish.

## Hygiene

Keep a `denylist.txt` of vendor/studio strings in the ops repo and grep any change you intend to
upstream to the public engine before pushing it. The public repo was born clean; keep it that way.
