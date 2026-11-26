# fr13nd

A desktop companion that turns plans, creative practice, and daily routines into a compact command console. Built with **Svelte 5, TypeScript, Tauri 2, and Rust**.

Includes fictional sample data so you can explore the interface immediately. AI is off by default; no account or API key is required.

## What it does

- **Quests:** recurring goals, progress tracking, and task checklists.
- **Craft:** creative projects, practice sessions, and small next actions.
- **Quick capture:** turn a thought into a local task, with undo and an offline fallback.
- **Daily panels:** home and pet routines, recipes, reading/watch queue, work sessions, and optional personal trackers.
- **Companion:** optional tool-calling conversations with a configured Claude or Ollama backend.
- **Desktop shell:** compact mode, tray controls, always-on-top, and a global capture shortcut.
- **Local persistence:** atomic saves, rolling backups, and exports.

## Try the browser preview

Use a current Node.js LTS release (Node 22 or newer) and npm:

```sh
npm ci
npm run dev
```

Open `http://localhost:1420`. The preview uses separate, tab-scoped session storage. It has no desktop filesystem access, no live AI, and no OS tray or shortcut integration. Edits survive a refresh in the same tab. A new browser session starts from the fictional examples. The sample conversation is explicitly labeled as scripted.

## Run the desktop app

Install the Rust toolchain and the native build prerequisites for Tauri. On Windows this includes the Microsoft C++ build tools and WebView2 runtime.

```sh
npm ci
npm run tauri dev
```

Create an installer with `npm run tauri build`. Desktop behavior is primarily designed for Windows; other operating systems have not been verified.

AI is optional. In **AGENT → CFG**, choose **Ollama** and a locally installed tool-capable model, or **Claude** and your own API key/model. A model identifier must be available to the selected provider. Cloud requests send the applicable app context and messages to that provider. Turning AI off also disables automatic local inference.

## Design and implementation

```text
Svelte panels → reactive WidgetStore → Tauri IPC → Rust storage / desktop shell
                        ↓
               optional agent tools
                        ↓
                 configured provider
```

`src/lib/store.svelte.ts` owns app state and persistence. `src/lib/demo.ts` creates the fictional first-run content. `src/lib/runtime.ts` separates browser preview behavior from native commands. The agent modules split context construction, tools, transport, and scheduled behavior. Rust provides native window controls, constrained launch helpers, and file operations.

The school module contains tested domain logic but currently has no dedicated visible panel.

## Data storage and privacy

- Starter data is generated from the fictional examples in `src/lib/demo.ts`.
- The desktop app uses the identifier `app.fr13nd.portfolio` and reads only its own app data directory.
- Its local save is `fr13nd-public-data.json` in the OS-managed app data directory. Its desktop archive is `Desktop/fr13nd-public/`.
- Exports and desktop JSON mirrors redact the API-key setting but retain user-entered content. Treat them as personal data.
- Desktop working saves and rolling backups store configured API keys as plaintext; an OS credential vault is not yet implemented.
- The browser preview never stores an API key and keeps AI disabled. Fonts use local fallbacks without remote requests.

## Verify and package

```sh
npm run check
npm test
npm run build
npm run privacy:check
cargo test --locked --manifest-path src-tauri/Cargo.toml
npm run package:public
```

The packaging command checks source files for common credential and personal-path patterns, then creates `release/fr13nd-public.zip`. Dependencies, builds, local data, and Git metadata are excluded.

## License

MIT. See [LICENSE](LICENSE).
