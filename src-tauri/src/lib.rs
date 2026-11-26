use tauri::{
    AppHandle, Emitter, Manager,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};
use serde_json::Value;

const MAIN_WIDTH: f64 = 546.0;
const RAIL_WIDTH: f64 = 442.0;
const RAIL_TABS_WIDTH: f64 = 72.0;
const RAIL_HANDLE_WIDTH: f64 = 34.0;
const EXPANDED_HEIGHT: f64 = 1020.0;

fn expanded_width(sidecar_mode: Option<&str>, sidecar_open: Option<bool>) -> f64 {
    match sidecar_mode {
        Some("panel") => MAIN_WIDTH + RAIL_WIDTH,
        Some("menu") => MAIN_WIDTH + RAIL_TABS_WIDTH,
        Some("handle") => MAIN_WIDTH + RAIL_HANDLE_WIDTH,
        _ if sidecar_open.unwrap_or(false) => MAIN_WIDTH + RAIL_WIDTH,
        _ => MAIN_WIDTH + RAIL_HANDLE_WIDTH,
    }
}

fn set_logical_size_keep_right(
    window: &tauri::WebviewWindow,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    let position = window.outer_position().map_err(|e| e.to_string())?;
    let size = window.outer_size().map_err(|e| e.to_string())?;
    let right_edge = position.x + size.width as i32;

    window
        .set_size(tauri::LogicalSize::new(width, height))
        .map_err(|e| e.to_string())?;
    let actual_size = window.outer_size().map_err(|e| e.to_string())?;
    let fallback_width = (width * scale).round() as u32;
    let actual_width = if actual_size.width > 0 {
        actual_size.width
    } else {
        fallback_width
    };
    let next_x = right_edge - actual_width as i32;
    window
        .set_position(tauri::PhysicalPosition::new(next_x, position.y))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn toggle_compact(
    window: tauri::WebviewWindow,
    compact: bool,
    sidecar_open: Option<bool>,
    sidecar_mode: Option<String>,
) -> Result<(), String> {
    let (width, height) = if compact {
        (480.0_f64, 540.0_f64)
    } else {
        (
            expanded_width(sidecar_mode.as_deref(), sidecar_open),
            EXPANDED_HEIGHT,
        )
    };
    set_logical_size_keep_right(&window, width, height)
}

#[tauri::command]
fn set_sidecar_open(window: tauri::WebviewWindow, open: bool) -> Result<(), String> {
    let width = if open {
        MAIN_WIDTH + RAIL_WIDTH
    } else {
        MAIN_WIDTH + RAIL_HANDLE_WIDTH
    };
    set_logical_size_keep_right(&window, width, EXPANDED_HEIGHT)
}

#[tauri::command]
fn set_sidecar_mode(window: tauri::WebviewWindow, mode: String) -> Result<(), String> {
    let width = expanded_width(Some(mode.as_str()), None);
    set_logical_size_keep_right(&window, width, EXPANDED_HEIGHT)
}

#[tauri::command]
fn set_always_on_top(window: tauri::WebviewWindow, on_top: bool) -> Result<(), String> {
    window.set_always_on_top(on_top).map_err(|e| e.to_string())
}

// Nudge the local Ollama server awake so on-device features (nutrition
// estimation) work without the operator thinking about it. Probes the API
// first and only spawns a server for localhost URLs; returns whether Ollama
// ended up reachable. Failures are soft — callers fire-and-forget.
#[tauri::command]
async fn ensure_ollama(url: String) -> Result<bool, String> {
    // derive the base (http://localhost:11434) from the configured chat URL
    let base = url
        .split("/api/")
        .next()
        .unwrap_or("http://localhost:11434")
        .trim_end_matches('/')
        .to_string();
    let probe = format!("{}/api/tags", base);
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_millis(1500))
        .build()
        .map_err(|e| e.to_string())?;
    if client.get(&probe).send().await.is_ok() {
        return Ok(true); // already up
    }
    if !(base.contains("localhost") || base.contains("127.0.0.1")) {
        return Ok(false); // remote endpoint is down — nothing to spawn here
    }

    // try PATH first, then the default Windows install location
    let mut candidates = vec![std::path::PathBuf::from("ollama")];
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        candidates.push(
            std::path::PathBuf::from(local)
                .join("Programs")
                .join("Ollama")
                .join("ollama.exe"),
        );
    }
    for bin in candidates {
        let mut cmd = std::process::Command::new(&bin);
        cmd.arg("serve");
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW — no console flash
        }
        if cmd.spawn().is_ok() {
            // poll briefly until the server answers (model loading comes later)
            for _ in 0..10 {
                tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                if client.get(&probe).send().await.is_ok() {
                    return Ok(true);
                }
            }
            return Ok(false);
        }
    }
    Ok(false) // ollama not installed — estimates stay blank, manual kcal still works
}

// After resume from sleep, a transparent always-on-top WebView2 window can come
// back blank/frozen until its composition surface is rebuilt. Nudging the size by
// one pixel and restoring it forces that rebuild — fr13nd wakes up with eyes open.
#[tauri::command]
fn wake_repaint(window: tauri::WebviewWindow) {
    use tauri::PhysicalSize;
    if let Ok(sz) = window.inner_size() {
        let _ = window.set_size(PhysicalSize::new(sz.width + 1, sz.height));
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(60));
            let _ = window.set_size(sz);
        });
    }
}

// Public edition: never discover or migrate another application's data.
fn data_file_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    app.path().app_local_data_dir()
        .map(|dir| dir.join("fr13nd-public-data.json"))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn read_data(app: AppHandle) -> Result<String, String> {
    let path = data_file_path(&app)?;
    if path.exists() {
        std::fs::read_to_string(&path).map_err(|e| e.to_string())
    } else {
        Ok(String::new())
    }
}

#[tauri::command]
async fn ollama_chat(url: String, body: Value) -> Result<Value, String> {
    let client = reqwest::Client::new();
    let res = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = res.status();
    let text = res.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("{} {}", status.as_u16(), text));
    }
    serde_json::from_str(&text).map_err(|e| e.to_string())
}

// Streaming variant: posts with stream:true, forwards each content delta over a
// channel, and returns the final assembled message (with any tool_calls).
#[tauri::command]
async fn ollama_stream(
    url: String,
    body: Value,
    on_chunk: tauri::ipc::Channel<String>,
) -> Result<Value, String> {
    use futures_util::StreamExt;

    let client = reqwest::Client::new();
    let res = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = res.status();
    if !status.is_success() {
        let text = res.text().await.unwrap_or_default();
        return Err(format!("{} {}", status.as_u16(), text));
    }

    let mut stream = res.bytes_stream();
    let mut buffer = String::new();
    let mut full_content = String::new();
    let mut final_message = serde_json::json!({});

    while let Some(chunk) = stream.next().await {
        let bytes = chunk.map_err(|e| e.to_string())?;
        buffer.push_str(&String::from_utf8_lossy(&bytes));

        while let Some(nl) = buffer.find('\n') {
            let line: String = buffer.drain(..=nl).collect();
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            if let Ok(obj) = serde_json::from_str::<Value>(line) {
                if let Some(c) = obj
                    .get("message")
                    .and_then(|m| m.get("content"))
                    .and_then(|c| c.as_str())
                {
                    if !c.is_empty() {
                        full_content.push_str(c);
                        let _ = on_chunk.send(c.to_string());
                    }
                }
                if obj.get("done").and_then(|d| d.as_bool()).unwrap_or(false) {
                    if let Some(m) = obj.get("message") {
                        final_message = m.clone();
                    }
                }
            }
        }
    }

    match final_message.as_object_mut() {
        Some(map) => {
            map.insert("content".into(), Value::String(full_content));
        }
        None => {
            final_message = serde_json::json!({ "content": full_content });
        }
    }
    Ok(final_message)
}

mod launcher;

const ANTHROPIC_URL: &str = "https://api.anthropic.com/v1/messages";

// Anthropic Messages API. The API key stays in the Rust process, never the webview.
#[tauri::command]
async fn claude_chat(api_key: String, body: Value) -> Result<Value, String> {
    let client = reqwest::Client::new();
    let res = client
        .post(ANTHROPIC_URL)
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = res.status();
    let text = res.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("{} {}", status.as_u16(), text));
    }
    serde_json::from_str(&text).map_err(|e| e.to_string())
}

// Streaming variant (SSE). Forwards each text delta and returns the full text.
#[tauri::command]
async fn claude_stream(
    api_key: String,
    body: Value,
    on_chunk: tauri::ipc::Channel<String>,
) -> Result<Value, String> {
    use futures_util::StreamExt;

    let client = reqwest::Client::new();
    let res = client
        .post(ANTHROPIC_URL)
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = res.status();
    if !status.is_success() {
        let text = res.text().await.unwrap_or_default();
        return Err(format!("{} {}", status.as_u16(), text));
    }

    let mut stream = res.bytes_stream();
    let mut buffer = String::new();
    let mut full = String::new();

    while let Some(chunk) = stream.next().await {
        let bytes = chunk.map_err(|e| e.to_string())?;
        buffer.push_str(&String::from_utf8_lossy(&bytes));

        while let Some(nl) = buffer.find('\n') {
            let line: String = buffer.drain(..=nl).collect();
            let line = line.trim();
            if let Some(rest) = line.strip_prefix("data:") {
                let data = rest.trim();
                if data.is_empty() || data == "[DONE]" {
                    continue;
                }
                if let Ok(obj) = serde_json::from_str::<Value>(data) {
                    if obj.get("type").and_then(|t| t.as_str()) == Some("content_block_delta") {
                        if let Some(t) = obj
                            .get("delta")
                            .and_then(|d| d.get("text"))
                            .and_then(|t| t.as_str())
                        {
                            full.push_str(t);
                            let _ = on_chunk.send(t.to_string());
                        }
                    }
                }
            }
        }
    }

    Ok(serde_json::json!({ "text": full }))
}

#[tauri::command]
fn write_data(app: AppHandle, content: String) -> Result<(), String> {
    let path = data_file_path(&app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    // Atomic: write to a temp file, then rename over the target so a crash or
    // half-write can never truncate the real data file.
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, content.as_bytes()).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

// Keep a rolling set of dated backups so a bad write or accidental wipe stays
// recoverable. Called once per load with the operator's local date.
#[tauri::command]
fn backup_data(app: AppHandle, label: String) -> Result<(), String> {
    let path = data_file_path(&app)?;
    if !path.exists() {
        return Ok(());
    }
    let dir = match path.parent() {
        Some(d) => d,
        None => return Ok(()),
    };
    let safe: String = label
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-')
        .collect();
    if !safe.is_empty() {
        let backup = dir.join(format!("fr13nd-public-data.{}.bak.json", safe));
        if !backup.exists() {
            let _ = std::fs::copy(&path, &backup);
        }
    }
    // prune to the 7 most-recent *.bak.json
    if let Ok(entries) = std::fs::read_dir(dir) {
        let mut baks: Vec<std::path::PathBuf> = entries
            .filter_map(|e| e.ok().map(|e| e.path()))
            .filter(|p| {
                p.file_name()
                    .and_then(|n| n.to_str())
                    .map(|n| n.starts_with("fr13nd-public-data.") && n.ends_with(".bak.json"))
                    .unwrap_or(false)
            })
            .collect();
        baks.sort_by_key(|p| std::fs::metadata(p).and_then(|m| m.modified()).ok());
        while baks.len() > 7 {
            let oldest = baks.remove(0);
            let _ = std::fs::remove_file(oldest);
        }
    }
    Ok(())
}

// List the rolling backups (fr13nd-public-data.<label>.bak.json) next to the data
// file, newest first, so the operator can roll back from inside the app.
#[tauri::command]
fn list_backups(app: AppHandle) -> Result<Vec<Value>, String> {
    let path = data_file_path(&app)?;
    let dir = match path.parent() {
        Some(d) => d.to_path_buf(),
        None => return Ok(vec![]),
    };
    let mut out: Vec<(u64, Value)> = vec![];
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for e in entries.flatten() {
            let p = e.path();
            let name = match p.file_name().and_then(|n| n.to_str()) {
                Some(n) => n.to_string(),
                None => continue,
            };
            if !(name.starts_with("fr13nd-public-data.") && name.ends_with(".bak.json")) {
                continue;
            }
            let label = name
                .trim_start_matches("fr13nd-public-data.")
                .trim_end_matches(".bak.json")
                .to_string();
            let meta = std::fs::metadata(&p).ok();
            let modified = meta
                .as_ref()
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);
            let bytes = meta.as_ref().map(|m| m.len()).unwrap_or(0);
            out.push((modified, serde_json::json!({ "file": name, "label": label, "modified": modified, "bytes": bytes })));
        }
    }
    out.sort_by(|a, b| b.0.cmp(&a.0));
    Ok(out.into_iter().map(|(_, v)| v).collect())
}

// Read one backup's contents. Only our own backup files, no path traversal.
#[tauri::command]
fn read_backup(app: AppHandle, file: String) -> Result<String, String> {
    if file.contains('/')
        || file.contains('\\')
        || !(file.starts_with("fr13nd-public-data.") && file.ends_with(".bak.json"))
    {
        return Err("invalid backup file".into());
    }
    let path = data_file_path(&app)?;
    let dir = path.parent().ok_or("no data dir")?;
    std::fs::read_to_string(dir.join(&file)).map_err(|e| e.to_string())
}

// Snapshot the current data file to a uniquely-labelled backup (always writes).
// Used to capture a safety copy of "current" right before a restore.
#[tauri::command]
fn snapshot_backup(app: AppHandle, label: String) -> Result<(), String> {
    let path = data_file_path(&app)?;
    if !path.exists() {
        return Ok(());
    }
    let dir = path.parent().ok_or("no data dir")?;
    let safe: String = label
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-')
        .collect();
    if safe.is_empty() {
        return Ok(());
    }
    let backup = dir.join(format!("fr13nd-public-data.{}.bak.json", safe));
    std::fs::copy(&path, &backup).map(|_| ()).map_err(|e| e.to_string())
}

// Write a portable export to Desktop/fr13nd-public/exports/<name>; returns the full path.
#[tauri::command]
fn export_data(app: AppHandle, content: String, name: String) -> Result<String, String> {
    let safe: String = name
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_' || *c == '.')
        .collect();
    if safe.is_empty() {
        return Err("invalid export name".into());
    }
    let desktop = app.path().desktop_dir().map_err(|e| e.to_string())?;
    let dir = desktop.join("fr13nd-public").join("exports");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let target = dir.join(&safe);
    std::fs::write(&target, content.as_bytes()).map_err(|e| e.to_string())?;
    Ok(target.to_string_lossy().to_string())
}

// Mirror the current data into a human-visible, date-organized archive on the
// Desktop: Desktop/fr13nd-public/fr13nd-<YYYY-MM-DD>.json — one file per local day,
// overwritten through the day so it always holds that day's latest state. This
// is a convenience copy you can see and back up; the source of truth stays the
// atomic file in app_local_data_dir. Failures here never affect the real save.
#[tauri::command]
fn mirror_data(app: AppHandle, content: String, label: String) -> Result<(), String> {
    let safe: String = label
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-')
        .collect();
    if safe.is_empty() {
        return Ok(());
    }
    let desktop = app.path().desktop_dir().map_err(|e| e.to_string())?;
    let dir = desktop.join("fr13nd-public");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    // Drop a one-time note so the folder is self-explanatory.
    let readme = dir.join("_ABOUT.txt");
    if !readme.exists() {
        let _ = std::fs::write(
            &readme,
            "This is your fr13nd data archive.\r\n\r\n\
             One file per day, named fr13nd-YYYY-MM-DD.json, holding that day's \
             latest state (quests, signal, vessel, fuel, work, craft, memory).\r\n\r\n\
             These are plain-text copies you can read, back up, or move anywhere. \
             The app's live working copy lives elsewhere and keeps running even if \
             this folder is emptied \u{2014} so deleting files here is safe.\r\n",
        );
    }

    // Atomic write of today's file (temp + rename).
    let target = dir.join(format!("fr13nd-{}.json", safe));
    let tmp = dir.join(format!(".fr13nd-{}.json.tmp", safe));
    std::fs::write(&tmp, content.as_bytes()).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &target).map_err(|e| e.to_string())?;

    // Prune to the 400 most-recent daily files (~13 months; ~25 KB each). Only
    // touches our own fr13nd-*.json so anything else in the folder is left alone.
    if let Ok(entries) = std::fs::read_dir(&dir) {
        let mut files: Vec<std::path::PathBuf> = entries
            .filter_map(|e| e.ok().map(|e| e.path()))
            .filter(|p| {
                p.file_name()
                    .and_then(|n| n.to_str())
                    .map(|n| n.starts_with("fr13nd-") && n.ends_with(".json"))
                    .unwrap_or(false)
            })
            .collect();
        files.sort_by_key(|p| std::fs::metadata(p).and_then(|m| m.modified()).ok());
        while files.len() > 400 {
            let oldest = files.remove(0);
            let _ = std::fs::remove_file(oldest);
        }
    }
    Ok(())
}

// Append one chat turn to a human-readable, per-day transcript on the Desktop:
// Desktop/fr13nd-public/conversations/fr13nd-chat-<YYYY-MM-DD>.md. Append-only, so the
// full conversation history survives [CLEAR] in the app and any loss of the
// working data file.
#[tauri::command]
fn append_conversation(app: AppHandle, label: String, text: String) -> Result<(), String> {
    use std::io::Write;
    let safe: String = label
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-')
        .collect();
    if safe.is_empty() {
        return Ok(());
    }
    let desktop = app.path().desktop_dir().map_err(|e| e.to_string())?;
    let dir = desktop.join("fr13nd-public").join("conversations");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let file = dir.join(format!("fr13nd-chat-{}.md", safe));
    let mut f = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&file)
        .map_err(|e| e.to_string())?;
    f.write_all(text.as_bytes()).map_err(|e| e.to_string())
}

// Append a "void" diary entry to a per-day file on the Desktop:
// Desktop/fr13nd-public/void/void-<YYYY-MM-DD>.md. Append-only and durable.
#[tauri::command]
fn append_void(app: AppHandle, label: String, text: String) -> Result<(), String> {
    use std::io::Write;
    let safe: String = label
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-')
        .collect();
    if safe.is_empty() {
        return Ok(());
    }
    let desktop = app.path().desktop_dir().map_err(|e| e.to_string())?;
    let dir = desktop.join("fr13nd-public").join("void");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let file = dir.join(format!("void-{}.md", safe));
    let mut f = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&file)
        .map_err(|e| e.to_string())?;
    f.write_all(text.as_bytes()).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            // Autostart on login is handled by a Startup-folder shortcut, which
            // fires after the shell is ready (Run-key apps can die early at boot).

            #[cfg(desktop)]
            {
                use tauri_plugin_global_shortcut::{
                    Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState,
                };

                // Ctrl+Shift+Space summons the widget from anywhere and drops
                // focus straight into the capture bar.
                let capture_shortcut =
                    Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Space);

                app.handle().plugin(
                    tauri_plugin_global_shortcut::Builder::new()
                        .with_handler(move |app, _shortcut, event| {
                            if event.state() == ShortcutState::Pressed {
                                if let Some(w) = app.get_webview_window("main") {
                                    let _ = w.show();
                                    let _ = w.set_focus();
                                    let _ = w.emit("focus-capture", ());
                                }
                            }
                        })
                        .build(),
                )?;

                if let Err(err) = app.global_shortcut().register(capture_shortcut) {
                    eprintln!("Failed to register capture shortcut: {err}");
                }
            }

            let open_i = MenuItem::with_id(app, "open", "Open", true, None::<&str>)?;
            let compact_i =
                MenuItem::with_id(app, "compact", "Compact mode", true, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let quit_i = MenuItem::with_id(app, "quit", "Exit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open_i, &compact_i, &sep, &quit_i])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().cloned().expect("app icon missing"))
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "compact" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.emit("toggle-compact", ());
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            toggle_compact,
            set_sidecar_open,
            set_sidecar_mode,
            set_always_on_top,
            wake_repaint,
            ensure_ollama,
            read_data,
            write_data,
            backup_data,
            mirror_data,
            list_backups,
            read_backup,
            snapshot_backup,
            export_data,
            append_conversation,
            append_void,
            ollama_chat,
            ollama_stream,
            claude_chat,
            claude_stream,
            launcher::open_path,
            launcher::open_url,
            launcher::open_in_vscode,
            launcher::open_terminal,
            launcher::launcher_capabilities,
            launcher::probe_targets,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
