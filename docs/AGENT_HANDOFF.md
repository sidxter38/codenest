# CodeNest — Agent Handoff

## Architecture (Current)

Full-stack TypeScript monorepo:
- `/backend` — Express + Prisma (SQLite dev / PostgreSQL prod) + WebSocket / Socket.IO real-time collaboration server + lightweight Alpine Docker sandboxes (`python:3.11-alpine`, `node:18-alpine`).
- `/frontend` — React 18 + TypeScript + Webpack + Monaco Editor + minimalist Black/White/Slate monochrome theme.

## Running Locally

```bash
# From d:/CodeNest root
npm run dev        # starts frontend (port 3000) and backend (port 5000) concurrently
npm run build      # verifies build for both frontend and backend
```

## Supported Languages & Workflows

1. **HTML/CSS/JS (Web Projects)** — Client-side sandboxed `<iframe>` with live DOM injection and zero server overhead.
2. **JavaScript (Node.js)** — Ephemeral container execution (`node:18-alpine`) or Judge0 ID `63`.
3. **Python (Python 3.11)** — Ephemeral container execution (`python:3.11-alpine`) or Judge0 ID `71` with AI error diagnosis.

*(C and Java have been completely removed from runtime and Docker storage to preserve disk space on C: drive).*

## Key Features & User Controls

- **Minimalist Monochrome Theme**: `#09090b` obsidian background, `#141417` panels, `#27272a` borders, pure white typography, and new ribbon-star monochrome 3D logo.
- **Real-Time Collaboration**: Top-right **Collab** button generates a shareable link (`/project/:id`), lets users set their desired display name, and renders colored remote cursor widgets directly on Monaco with active peer counts.
- **Auto-Save Toggle**: Top-right `⚡ Auto-Save: ON/OFF` button with 1.5s debounced persistence and visual status badges (`Saved ✓` / `Saving…` / `Unsaved changes`).
- **Token-Optimized AI Error Guidance**: When runtime errors occur, a 1-click "Fix with AI (Token-Optimized)" action appears in the terminal panel, providing a concise diagnosis (<350 tokens) with a 1-click "Apply Fix to Editor" button.
- **Interactive Terminal Input & EOFError Recovery**: Seamless interactive stdin in both Playground and Project Workspace. Programs requiring user input (`input()` or `process.stdin`) display an auto-focused terminal prompt card (`Submit ↵`) and a persistent input bar (`> Run with Input ↵`), piping responses without crashing.
- **Compilation & Language Expansion Guide**: Full architectural documentation located at `docs/COMPILATION_AND_LANGUAGES.md`.

## Important Files

| Path | Purpose |
| :--- | :--- |
| `backend/src/routes/projects.ts` | Authenticated project/file/member routes, error diagnosis endpoint |
| `backend/src/services/execution.ts` | Isolated runtime execution for Python and Node.js (Alpine containers) |
| `backend/src/services/gemini.ts` | Token-capped Gemini AI review & Python error diagnosis |
| `backend/src/sockets/socketServer.ts` | Real-time presence, cursor movement, and code change sync |
| `frontend/src/pages/ProjectWorkspace.tsx` | Main IDE workspace: Monaco, Collab modal, Auto-save, AI error card |
| `frontend/src/pages/ProjectWorkspace.css` | Professional monochrome editor styles, cursor widgets, status bar |
| `frontend/src/styles/global.css` | Monochrome design tokens (`#09090B`, `#141417`, `#27272A`, `#FFFFFF`) |
| `docs/COMPILATION_AND_LANGUAGES.md` | Complete runtime compilation and language addition manual |

## Verification Status

- Backend compiles with 0 errors (`npm run build` in `/backend`).
- Frontend compiles with 0 errors (`npm run build` in `/frontend`).
- Database seeded with SQLite via `npm run db:seed`.
