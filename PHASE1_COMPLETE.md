# ✅ Phase 1 — Complete

**Project:** EventLive Pro — full-stack event management & live-streaming platform
**Stack:** MERN (MongoDB, Express, React, Node.js) + JWT
**Status:** Complete, verified end-to-end, and committed.

---

## 🎯 Objectives (all met)

| # | Task                                         | Status |
| - | -------------------------------------------- | ------ |
| 1 | Initialize a React + Vite frontend           | ✅ Done |
| 2 | Initialize a Node.js + Express backend       | ✅ Done |
| 3 | Configure Tailwind CSS                        | ✅ Done |
| 4 | Configure MongoDB + Mongoose                  | ✅ Done |
| 5 | Configure JWT Authentication                  | ✅ Done |
| 6 | Create `.env.example` files                   | ✅ Done |
| 7 | Professional monorepo folder structure        | ✅ Done |
| 8 | Initialize Git                                | ✅ Done |
| 9 | Detailed `README.md` with setup instructions  | ✅ Done |

---

## 🏗️ What was built

### Monorepo (npm workspaces)
- Root `package.json` orchestrates both apps with `concurrently` (`npm run dev`).
- Shared tooling: `.gitignore`, `.editorconfig`, `.nvmrc`.

### Backend — `server/` (Express, ESM)
- `src/index.js` → boots DB + HTTP server with graceful shutdown.
- `src/app.js` → Helmet, CORS (credentials), rate limiting, morgan, JSON parsing, health check.
- **MongoDB + Mongoose:** `config/db.js` connection, `models/User.js` (bcrypt hashing, role enum, password never serialized).
- **JWT auth:** register / login / logout / me, `protect` + `authorize` middleware, token via header **and** httpOnly cookie.
- Centralized error handling (Mongoose / JWT errors normalized to clean JSON).

### Frontend — `client/` (React 18 + Vite + Tailwind)
- Vite dev server with `/api` → backend proxy.
- Tailwind with a custom brand theme and reusable component classes.
- Auth context + Axios service layer, protected routes.
- Pages: Home, Login, Register, Dashboard, NotFound; Navbar + ProtectedRoute components.

---

## 🧪 Verification results

| Check                                          | Result |
| ---------------------------------------------- | ------ |
| `esbuild` toolchain                            | ✅ `v0.21.5` working |
| Frontend production build (`vite build`)       | ✅ 96 modules, CSS + JS bundles emitted |
| Frontend dev server (`:5173`)                  | ✅ Serves `index.html` (HTTP 200) |
| Vite `/api` proxy → Express                    | ✅ Forwards correctly (401 JSON returned) |
| Backend dev server (`:5000`)                   | ✅ Connects to DB, listens |
| `GET /health`                                  | ✅ `{ status: "ok" }` |
| `POST /apiauth.service.js`                       | ✅ Creates user, issues JWT, role `user` |
| `GET /api/auth/me` (Bearer token)              | ✅ Returns user, password **not** leaked |

> **Local database note:** No system MongoDB is required for development. The
> backend can run against an auto-provisioned in-memory MongoDB via
> `npm run dev:memdb --workspace server` (added `mongodb-memory-server`). For a
> real/persistent database, set `MONGODB_URI` and use `npm run dev`.

---

## 🚀 How to run

```bash
npm install
cp server/.env.example server/.env   # set JWT_SECRET + MONGODB_URI
cp client/.env.example client/.env

# Option A — your own MongoDB:
npm run dev                          # client :5173 + server :5000

# Option B — zero-setup in-memory MongoDB:
npm run dev:client
npm run dev:memdb --workspace server
```

---

## 📦 API surface (Phase 1)

| Method | Endpoint           | Auth    | Description                |
| ------ | ------------------ | ------- | -------------------------- |
| POST   | `/apiauth.service.js` | Public  | Register, returns JWT      |
| POST   | `/api/auth/login`    | Public  | Login, returns JWT         |
| POST   | `/api/auth/logout`   | Public  | Clears auth cookie         |
| GET    | `/api/auth/me`       | Private | Current authenticated user |

---

## ➡️ Next: Phase 2 — Events

- Event model (title, description, schedule, organizer, status, capacity).
- CRUD endpoints with `organizer`/`admin` authorization.
- Frontend: event list, detail, and create/edit forms.
- Pagination, filtering, and validation.
