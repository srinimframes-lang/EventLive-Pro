# White-Label Custom Domains — Setup Guide

This guide explains how to enable **automatic custom-domain approval** for the
EventLive Pro white-label system: customers add their own domain (e.g.
`live.ramstudios.com`), prove ownership via DNS, and the Super Admin approves it.
When the Vercel integration is configured, approval **attaches the domain to the
Vercel project and SSL is issued automatically**.

If the Vercel integration is **not** configured, everything still works — the
app verifies DNS ownership and you attach the domain once in the Vercel
dashboard (manual mode).

---

## 1. How it works

```
Customer adds domain ─▶ pending
        │  (adds DNS records below)
        ▼
DNS ownership verified (TXT)  ──▶ Super Admin "Approve"
        │                                │
        │                                ├─ Vercel integration ON:
        │                                │    attach domain → Vercel issues SSL
        │                                │    status: active, sslStatus: issued
        │                                └─ Vercel integration OFF:
        │                                     status: active, sslStatus: manual
        ▼                                     (attach domain manually in Vercel)
https://live.ramstudios.com loads the customer's branded site
```

- Live links for that customer automatically use their domain, e.g.
  `https://live.ramstudios.com/live/ABCD12`.
- With no custom domain, everything stays on `https://eventlivepro.com`.

---

## 2. DNS records the customer must add

**Recommended:** keep the customer’s existing website on the **root** domain.
Use a **live subdomain** for EventLivePro (do not change the root A record).

### Subdomain (recommended — e.g. `live.maaevents9.in` / `live.customer.com`)

| Type  | Host / Name              | Value                  | Purpose         |
| ----- | ------------------------ | ---------------------- | --------------- |
| TXT   | `_eventlive-verify.live` | `<verifyToken>`        | Ownership proof |
| CNAME | `live`                   | `cname.vercel-dns.com` | Routing + SSL   |

On GoDaddy (zone = apex, e.g. `maaevents9.in`): add those two records only.
**Do not** change `A @ → 68.178.159.168` (or whatever hosts the existing site).

### Apex / root domain (legacy — avoid; takes over existing website)

Root domains **cannot** use a CNAME on GoDaddy and most registrars. Adding EventLive
on the apex requires an A record to Vercel and would replace the existing site on `@`.
New domain adds are auto-rewritten to `live.<apex>`.

| Type | Host / Name         | Value           | Purpose         |
| ---- | ------------------- | --------------- | --------------- |
| TXT  | `_eventlive-verify` | `<verifyToken>` | Ownership proof |
| A    | `@`                 | `76.76.21.21`   | Routing + SSL   |

### Registrar Guide

| Registrar  | Field name | TXT Host (live subdomain) | Routing (live subdomain) |
| ---------- | ---------- | ------------------------- | ------------------------ |
| GoDaddy    | Host       | `_eventlive-verify.live`  | CNAME `live` → `cname.vercel-dns.com` |
| Hostinger  | Host       | `_eventlive-verify.live`  | CNAME `live` → `cname.vercel-dns.com` |
| Namecheap  | Host       | `_eventlive-verify.live`  | CNAME `live` → `cname.vercel-dns.com` |
| Cloudflare | Name       | `_eventlive-verify.live`  | CNAME `live` → `cname.vercel-dns.com` |
| Other      | Host/Name  | `_eventlive-verify.live`  | CNAME left-most label |

After the records propagate, click **Verify**. On success the app sets
`dnsVerified`, attaches the custom domain, refreshes the tenant cache, and
starts SSL (automatic when Vercel is configured, otherwise manual).

---

## 3. Environment variables (backend / Render)

Add these to the **server** environment (Render → your service → Environment).
All are optional — leaving them blank keeps the system in manual mode.

| Variable            | Required | Description                                                                 |
| ------------------- | -------- | --------------------------------------------------------------------------- |
| `VERCEL_TOKEN`      | for auto | Vercel access token with access to the project.                            |
| `VERCEL_PROJECT_ID` | for auto | The Vercel **Project ID** that serves the frontend SPA.                    |
| `VERCEL_TEAM_ID`    | optional | Only if the project lives under a Vercel **Team** (not a personal account).|

The integration is considered **enabled** only when both `VERCEL_TOKEN` and
`VERCEL_PROJECT_ID` are set. The Admin → White Label tab shows a badge:
- `Auto SSL: Vercel connected` (enabled)
- `Auto SSL: manual mode` (not configured)

### Getting the values

1. **Token** — Vercel → Account Settings → **Tokens** → *Create Token*
   (scope it to the team that owns the project). Copy the value.
2. **Project ID** — Vercel → your project → **Settings → General** →
   *Project ID* (format `prj_...`).
3. **Team ID** (only for team projects) — Vercel → Team → **Settings → General**
   → *Team ID* (format `team_...`).

After setting these on Render, redeploy / restart the service so they load.

---

## 4. Test the full workflow

### A) Manual mode (no token) — verify nothing breaks
1. Admin → **White Label** → badge reads *Auto SSL: manual mode*.
2. Add a domain for a customer → it appears as **pending**, `ssl: pending`.
3. Click **Approve** → with DNS unverified you'll be prompted to *force*;
   forcing sets it **active**, `ssl: manual` (you then add it in Vercel UI).

### B) Automatic mode (token set)
1. Set `VERCEL_TOKEN` + `VERCEL_PROJECT_ID` on Render and restart.
2. Admin → White Label → badge reads *Auto SSL: Vercel connected*.
3. Customer adds the domain (Dashboard → White-label panel) and the two DNS
   records, then clicks **Verify DNS** → `DNS ✓ verified`.
4. Super Admin clicks **Approve**:
   - domain is attached to the Vercel project,
   - `status: active`, `attached`, and `ssl` becomes `issued` once Vercel
     finishes provisioning (use **Refresh** to re-read live status).
5. Open `https://<domain>` → the customer's branded site loads over HTTPS.
6. If Vercel needs extra verification records, they're shown inline under the
   domain row — add them and click **Refresh**.

### Endpoint smoke test (no auth needed for the public one)
```bash
# public resolve (should be {"isCustom":false} for the platform domain)
curl "https://eventlive-pro.onrender.com/api/tenant/resolve?host=eventlivepro.com"

# admin endpoints require a Super Admin bearer token:
curl -H "Authorization: Bearer <token>" \
  https://eventlive-pro.onrender.com/api/admin/domains/integration
```

---

## 5. Admin actions reference (White Label tab)

| Action   | Effect                                                                       |
| -------- | ---------------------------------------------------------------------------- |
| Add      | Register a domain for a customer (pending).                                   |
| Verify   | Re-check the DNS TXT record; auto-attaches to Vercel when enabled+verified.  |
| Approve  | Activate the domain; attaches to Vercel + reads SSL status (or manual).      |
| Refresh  | Re-read live Vercel verification/SSL status (only shown when enabled).       |
| Suspend  | Deactivate without deleting (site stops resolving to the customer brand).    |
| Remove   | Delete the domain (also detaches from Vercel when enabled).                  |

Per-customer **branding** (business name, logo, primary color, WhatsApp,
contact, footer) is edited in the same tab, or by the customer in their
Dashboard → *White-label branding & domains* panel.

---

## 6. Notes & safety

- The integration is **fully optional and additive** — with no token the rest of
  the app (auth, Super Admin, customer login, payments, credits, streaming,
  live pages) is unaffected.
- Approved domains are added to a cached CORS allow-list so the SPA on a custom
  domain can call the API.
- Stream keys, YouTube embeds, and credit deduction are unchanged by white-label.
