# EventLive Pro

A full‑stack **event management & live‑streaming platform** built on the **MERN** stack with **JWT authentication** and a modern **React + Vite + Tailwind CSS** frontend.

This repository is a **monorepo** containing two workspaces:

| Workspace | Path        | Stack                                                            |
| --------- | ----------- | ---------------------------------------------------------------- |
| Frontend  | `client/`   | React 18, Vite, React Router, Tailwind CSS, Axios, socket.io‑client, hls.js |
| Backend   | `server/`   | Node.js, Express, MongoDB, Mongoose, JWT, bcryptjs, Socket.IO    |

---

## ✨ Features (Phase 1)

- ⚙️ **Monorepo** managed with npm workspaces — run both apps with one command.
- 🔐 **JWT authentication** — register, login, logout, and a protected `/me` endpoint.
- 🧂 **Secure passwords** — hashed with bcrypt, never returned in API responses.
- 🍃 **MongoDB + Mongoose** — schema validation, indexes, and clean models.
- 🛡️ **Hardened API** — Helmet, CORS, rate limiting, centralized error handling.
- 🎨 **Tailwind CSS** — custom brand theme with reusable component classes.
- 🧭 **Client‑side routing** with protected routes and an auth context.
- 🧪 **Sensible defaults** — Vite dev proxy, ESLint, EditorConfig, `.env.example` files.

---

## 📁 Project Structure

```
EventLive-pro/
├── package.json              # Root workspace config + dev scripts (concurrently)
├── .gitignore
├── .editorconfig
├── .nvmrc
├── README.md
│
├── client/                   # React + Vite frontend
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js        # Dev server + /api proxy to backend
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── .eslintrc.cjs
│   ├── .env.example
│   ├── public/
│   │   └── vite.svg
│   └── src/
│       ├── main.jsx          # App entry (Router + AuthProvider)
│       ├── App.jsx           # Routes & layout
│       ├── index.css         # Tailwind layers + component classes
│       ├── components/
│       │   ├── Navbar.jsx
│       │   └── ProtectedRoute.jsx
│       ├── context/
│       │   └── AuthContext.jsx
│       ├── pages/
│       │   ├── Home.jsx
│       │   ├── Login.jsx
│       │   ├── Register.jsx
│       │   ├── Dashboard.jsx
│       │   └── NotFound.jsx
│       ├── services/
│       │   ├── api.js        # Axios instance + interceptors
│       │   └── auth.service.js
│       ├── hooks/
│       └── utils/
│
└── server/                   # Node + Express backend
    ├── package.json
    ├── .env.example
    └── src/
        ├── index.js          # Bootstraps DB + HTTP server
        ├── app.js            # Express app & middleware
        ├── config/
        │   ├── env.js        # Validated env config
        │   └── db.js         # Mongoose connection
        ├── models/
        │   └── User.js
        ├── controllers/
        │   └── auth.controller.js
        ├── routes/
        │   ├── index.js
        │   └── auth.routes.js
        ├── middleware/
        │   ├── auth.middleware.js   # protect + authorize
        │   └── error.middleware.js  # notFound + errorHandler
        └── utils/
            └── generateToken.js
```

---

## ✅ Prerequisites

- **Node.js** >= 18 (a `.nvmrc` pins Node 20 — run `nvm use` if you use nvm)
- **npm** >= 9
- **MongoDB** — a local instance (`mongodb://127.0.0.1:27017`) or a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster

---

## 🚀 Getting Started

### 1. Install dependencies

From the repository root (installs both workspaces at once):

```bash
npm install
```

### 2. Configure environment variables

```bash
# Backend
cp server/.env.example server/.env

# Frontend
cp client/.env.example client/.env
```

> On Windows PowerShell use `Copy-Item server/.env.example server/.env`.

Then edit `server/.env` and set a strong `JWT_SECRET` and your `MONGODB_URI`.
Generate a secret quickly:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 3. Start MongoDB

Make sure MongoDB is running locally, or point `MONGODB_URI` at your Atlas cluster.

> **No MongoDB installed?** You can run the backend against a throwaway,
> zero-setup in-memory MongoDB instead — see
> [Zero-setup local database](#-zero-setup-local-database) below.

### 4. Run the app (dev)

From the repository root, start **both** the API and the frontend together:

```bash
npm run dev
```

- Frontend → http://localhost:5173
- Backend  → http://localhost:5000
- Health   → http://localhost:5000/health

You can also run them individually:

```bash
npm run dev:server   # Express API only
npm run dev:client   # Vite frontend only
```

### 🧪 Zero-setup local database

If you don't have MongoDB installed, run the backend against an **in-memory
MongoDB** that is downloaded and started automatically (great for local dev and
quick verification — data is ephemeral and reset on restart):

```bash
npm run dev:memdb --workspace server
```

For a real/persistent database, use the standard `npm run dev:server` (or
`npm start`) with a valid `MONGODB_URI`.

---

## 🔌 API Reference (Phase 1)

Base URL: `http://localhost:5000/api`

**Auth**

| Method | Endpoint         | Auth    | Description                         |
| ------ | ---------------- | ------- | ----------------------------------- |
| POST   | `auth.service.js` | Public  | Create a new account, returns JWT   |
| POST   | `/auth/login`    | Public  | Authenticate, returns JWT           |
| POST   | `/auth/logout`   | Public  | Clears the auth cookie              |
| GET    | `/auth/me`       | Private | Returns the current user            |

**Events** (Phase 2)

| Method | Endpoint            | Auth          | Description                                   |
| ------ | ------------------- | ------------- | --------------------------------------------- |
| GET    | `/events`           | Public        | List events (pagination, filter, search)      |
| GET    | `/events/:idOrSlug` | Public        | Get a single event by id or slug              |
| POST   | `/events`           | Private        | Create an event (caller becomes organizer)    |
| PATCH  | `/events/:id`       | Owner / admin  | Update an event                               |
| DELETE | `/events/:id`       | Owner / admin  | Delete an event                               |

`GET /events` query params: `page`, `limit`, `status`, `category`, `search`, `organizer`, `sort`, and `mine=true` (with a token, scopes to your own events).

**Live streaming** (Phase 3)

| Method | Endpoint                              | Auth          | Description                                  |
| ------ | ------------------------------------- | ------------- | -------------------------------------------- |
| GET    | `/events/:id/stream`                  | Public        | Player config (provider, sources, live flag) |
| PATCH  | `/events/:id/stream`                  | Owner / admin | Update stream source/provider                |
| GET    | `/events/:id/stream/key`              | Owner / admin | Reveal RTMP ingest URL + stream key          |
| POST   | `/events/:id/stream/key/regenerate`   | Owner / admin | Rotate the RTMP stream key                   |
| POST   | `/events/:id/stream/live`             | Owner / admin | Toggle live (`{ live: boolean }`)            |
| GET    | `/events/:id/chat`                    | Public        | Recent chat history                          |
| GET    | `/events/:id/questions`               | Public        | Q&A list (top-voted first)                   |

**Real-time gateway (Socket.IO)** — connect with an optional `auth.token`:

| Direction | Event              | Payload                              |
| --------- | ------------------ | ------------------------------------ |
| ⇧ emit    | `room:join`        | `{ eventId, guestName? }` → ack      |
| ⇧ emit    | `chat:send`        | `{ text }`                           |
| ⇧ emit    | `qa:ask`           | `{ text }`                           |
| ⇧ emit    | `qa:upvote`        | `{ questionId }`                     |
| ⇧ emit    | `qa:answer`        | `{ questionId, answer }` (owner/admin) |
| ⇩ on      | `presence:viewers` | `{ eventId, count }`                 |
| ⇩ on      | `chat:message`     | chat message                         |
| ⇩ on      | `qa:question`      | new question                         |
| ⇩ on      | `qa:updated`       | updated question (upvote/answer)     |
| ⇩ on      | `stream:status`    | `{ isLive, status, ... }`            |

Live player supports **YouTube embeds**, **HLS** (via `hls.js`), and **WebRTC** (WHEP).
Broadcasters use the **streaming studio** (`/events/:id/studio`) to configure the
source, manage the RTMP stream key, go live, and moderate chat & Q&A. Viewers watch
at `/events/:slug/live`.

The token is returned in the JSON body **and** set as an `httpOnly` cookie.
For protected requests send it via the `Authorization: Bearer <token>` header
(the frontend does this automatically).

### Example

```bash
# Register
curl -X POST http://localhost:5000/apiauth.service.js \
  -H "Content-Type: application/json" \
  -d '{"name":"Ada Lovelace","email":"ada@example.com","password":"supersecret"}'

# Get current user
curl http://localhost:5000/api/auth/me \
  -H "Authorization: Bearer <TOKEN_FROM_ABOVE>"
```

---

## 🧰 Available Scripts

Run from the repository root:

| Script                 | Description                                        |
| ---------------------- | -------------------------------------------------- |
| `npm run dev`          | Run backend + frontend concurrently                |
| `npm run dev:server`   | Run the Express API with nodemon                   |
| `npm run dev:client`   | Run the Vite dev server                            |
| `npm run build`        | Build the frontend for production                  |
| `npm run start`        | Start the backend in production mode               |
| `npm run lint`         | Lint the frontend                                  |

---

## 🔐 Environment Variables

### `server/.env`

| Variable                  | Default                                  | Description                          |
| ------------------------- | ---------------------------------------- | ------------------------------------ |
| `NODE_ENV`                | `development`                            | Runtime environment                  |
| `PORT`                    | `5000`                                   | API port                             |
| `CLIENT_URL`              | `http://localhost:5173`                  | Allowed CORS origin                  |
| `MONGODB_URI`             | `mongodb://127.0.0.1:27017/eventlive`    | MongoDB connection string            |
| `JWT_SECRET`              | —                                        | Secret used to sign JWTs (required)  |
| `JWT_EXPIRES_IN`          | `7d`                                     | Token lifetime                       |
| `JWT_COOKIE_EXPIRES_DAYS` | `7`                                      | Cookie lifetime in days              |

### `client/.env`

| Variable        | Default | Description                                  |
| --------------- | ------- | -------------------------------------------- |
| `VITE_API_URL`  | `/api`  | API base URL (proxied to backend in dev)     |

---

## 🗺️ Roadmap

- **Phase 1 — Foundation** ✅ Monorepo, auth, tooling
- **Phase 2 — Events** ✅ Event CRUD API + UI (list/detail/create/edit), filtering, search, ownership auth
- **Phase 3 — Live streaming** ✅ YouTube/HLS/WebRTC player, RTMP key mgmt, real‑time chat, Q&A, live viewer counter, studio dashboard
- **Phase 4 — Analytics & payments** — dashboards, Stripe integration

---

## 📝 License

MIT © EventLive Pro
<!-- redeploy trigger -->