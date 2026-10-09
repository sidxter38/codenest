# CodeNest — Project Progress Log

## 2026-09-29 — Complete Platform Monochrome Overhaul, Language Cleanups, Real-Time Live Collab, Auto-Save, and Token-Optimized AI Error Diagnosis

### What was done

**1. Problem One: Minimalist Black, White, and Slate/Gray Monochrome Theme & New Logo**
- Replaced outdated amber/cyan styling with a clean, high-contrast monochrome design system (`#09090b` obsidian background, `#141417` panel surfaces, `#27272a` borders, `#ffffff` foreground typography, silver gradient accents).
- Integrated the new monochrome ribbon-star 3D logo into `frontend/src/assets/logo.png`, `frontend/public/logo.png`, `frontend/public/favicon.png`, and updated `frontend/src/components/ui/Logo.tsx` with clean white branding.
- Removed visual bloat: deleted the 12.4 MB `gradient-flow.mp4` video background and removed all heavy video layers from `AppShell.tsx`.
- Converted `AuroraBackground.css` into a subtle, low-contrast dark graphite mesh with silver micro-specks.

**2. Problem Two: Language Specialization, Docker Cleanup & C: Drive Protection**
- Strictly limited platform languages to three developer workflows:
  1. `HTML/CSS/JS`: Web Project (bundled in one folder with instant sandboxed `<iframe>` preview).
  2. `JavaScript`: Standalone Node.js programming.
  3. `Python`: Python 3.11 execution.
- Completely removed `C`, `C++`, and `Java` from all backend routes, execution services, seed scripts, and frontend components (`Dashboard.tsx`, `Playground.tsx`, `CollaborativeWorkspace.tsx`, `CommandPalette.tsx`, `Landing.tsx`).
- Deleted legacy Docker asset directories `docker/c` and `docker/java` and cleaned up C: drive container footprints (replaced 1.4GB `gcc:latest` and 450MB `eclipse-temurin` with lightweight `python:3.11-alpine` and `node:18-alpine`).
- Realigned Monaco code editor layout to professional standards: tab bar with dirty indicators, code/diff toggle, cursor position tracker (`Ln X, Col Y`), spaces/encoding badges, dockable terminal output, and full-width bottom status bar.
- Interactive Terminal Stdin & EOFError Auto-Recovery: Both JavaScript and Python run directly in the Terminal Output. When programs call `input()` or `process.stdin` without prior stdin, the runtime captures the prompt, flags `waitingForInput: true`, and presents an auto-focused inline terminal input prompt (`Submit ↵`), automatically piping responses back to the process without crashing. Added a persistent terminal prompt bar (`> Run with Input ↵`) in both Playground and Project Workspace. Added global `prompt()` student polyfill for Node.js.

**3. Problem Three: Real-Time Live Collaboration & Auto-Save System**
- Dedicated **Collab** button in the project workspace header displaying active peer count (`Users` icon + badge).
- Live Collaboration Modal: generates and copies unique project link (`/project/:id`), lets users enter and persist their desired display name (`localStorage`), and lists active peers in room.
- Monaco Remote Cursor Engine: Implemented custom Monaco `IContentWidget` that renders remote users' names in colored tags directly over their live caret line with sub-pixel alignment, broadcasting cursor moves throttled over WebSockets (`PROJ-${projectId}`).
- Dedicated **Auto-Save** button (`Zap` icon, `⚡ Auto-Save: ON/OFF`) with visual status indicators (`Saved ✓` / `Saving…` / `Unsaved changes`) and 1.5s debounced autosave.

**4. Problem Four: AI Review Token Optimization & Targeted Error Guidance**
- Capped AI review token usage to prevent burning quota (`maxOutputTokens: 600` for full reviews, `maxOutputTokens: 350` for diagnostics).
- AI Review is strictly on-demand (no automated background loops).
- Targeted Error Action: When program execution produces a runtime or syntax error (e.g., Python exceptions), a 1-click **"Fix with AI (Token-Optimized)"** action appears in the terminal bar.
- Generates an immediate 1-2 line summary, approach explanation, and replacement code snippet with 1-click **"Apply Fix to Editor"**.
- Built-in instant rule-based fallback diagnostics for Python errors (`ZeroDivisionError`, `IndexError`, `TypeError`, `SyntaxError`) to provide zero-latency fixes even if the AI API is rate-limited.

**5. Comprehensive Architecture Documentation**
- Created `docs/COMPILATION_AND_LANGUAGES.md` detailing:
  - Sandboxed iframe architecture for HTML/CSS/JS.
  - Ephemeral Alpine container runtimes for Node.js and Python.
  - 6-step checklist for future language expansion (Dockerfile, Judge0 ID, Monaco highlighter, static rules, routes, and testing).

---

## 2026-09-28 — Fixes & Feature Pass (AI Agent)

- Guest Playground (`/playground`) with rate-limited execution
- Python 3.11 container integration
- Monaco inline error markers and static code analysis
- Amber/graphite palette and initial Judge0 CE setup
