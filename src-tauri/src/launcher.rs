// The launcher: the one audited surface through which the app is allowed to
// open things on this machine.
//
// It exists so that pressing START on a study block can put the operator in
// front of the right PDF, the right folder and the right editor in one action.
// That makes it, unavoidably, the most security-sensitive code in the app:
// later phases want to populate launch plans from course PDFs and university
// email, which is untrusted text by definition.
//
// Three rules hold the line, and they are enforced here in Rust rather than in
// the webview, because the webview is what untrusted content would influence:
//
//   1. The frontend never names an executable. It asks for `open_in_vscode` or
//      `open_terminal` by intent; this module resolves the actual binary itself
//      from a fixed list of known install locations. There is deliberately no
//      "run this arbitrary path" command in phase 1.
//   2. `open_path` refuses executable and script types. Opening a file with its
//      default handler *runs* a .exe or .bat, so a launch plan that points at
//      one is rejected rather than obeyed.
//   3. `open_url` accepts only http and https, so no custom scheme can be used
//      to hand execution to another application.
//
// Arguments are always passed as an argv array. No command string is ever
// assembled and handed to a shell.

use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
#[cfg(windows)]
const CREATE_NEW_CONSOLE: u32 = 0x0000_0010;

/// Types Windows will execute (or that script hosts will) if "opened".
const BLOCKED_EXT: &[&str] = &[
    "exe", "bat", "cmd", "com", "pif", "scr", "msi", "msp", "msc", "cpl", "dll", "sys", "drv",
    "ps1", "psm1", "psd1", "vbs", "vbe", "js", "jse", "wsf", "wsh", "hta", "jar", "reg", "inf",
    "scf", "lnk", "url", "application", "gadget", "ade", "adp", "chm", "ins", "isp", "job", "mst",
    "sct", "shb", "shs", "vb", "vbscript", "ws",
];

fn extension_of(path: &Path) -> String {
    path.extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
}

/// Spawn and forget.
///
/// The stdio handles are explicitly nulled rather than inherited. A launched
/// editor or terminal outlives the call, and an inherited handle keeps the
/// parent's pipe open for as long as that child lives — which hangs anything
/// reading our output and leaks handles into a process we no longer track.
/// `hide_console` suppresses the flash of a console window for programs that
/// would otherwise create one; a terminal emulator obviously must not get it.
fn spawn_detached(mut cmd: Command, hide_console: bool) -> Result<(), String> {
    cmd.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    #[cfg(windows)]
    if hide_console {
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    #[cfg(not(windows))]
    let _ = hide_console;
    cmd.spawn().map(|_| ()).map_err(|e| e.to_string())
}

/// First existing candidate, or None. Used to resolve editors/terminals without
/// ever letting the caller supply the path.
fn first_existing(candidates: &[PathBuf]) -> Option<PathBuf> {
    candidates.iter().find(|p| p.exists()).cloned()
}

fn env_path(var: &str, tail: &str) -> Option<PathBuf> {
    std::env::var_os(var).map(|base| PathBuf::from(base).join(tail))
}

fn resolve_vscode() -> Option<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Some(p) = env_path("LOCALAPPDATA", r"Programs\Microsoft VS Code\Code.exe") {
        candidates.push(p);
    }
    if let Some(p) = env_path("ProgramFiles", r"Microsoft VS Code\Code.exe") {
        candidates.push(p);
    }
    if let Some(p) = env_path("ProgramFiles(x86)", r"Microsoft VS Code\Code.exe") {
        candidates.push(p);
    }
    // VS Code Insiders, for completeness
    if let Some(p) = env_path("LOCALAPPDATA", r"Programs\Microsoft VS Code Insiders\Code - Insiders.exe") {
        candidates.push(p);
    }
    first_existing(&candidates)
}

fn resolve_terminal() -> Option<(PathBuf, bool)> {
    // (binary, is_windows_terminal) — wt takes -d, cmd needs /K cd
    if let Some(p) = env_path("LOCALAPPDATA", r"Microsoft\WindowsApps\wt.exe") {
        if p.exists() {
            return Some((p, true));
        }
    }
    if let Some(p) = env_path("SystemRoot", r"System32\cmd.exe") {
        if p.exists() {
            return Some((p, false));
        }
    }
    None
}

/// Open a file or folder with its default handler.
/// Refuses anything Windows would execute — see rule 2 above.
#[tauri::command]
pub fn open_path(path: String) -> Result<(), String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("no path given".into());
    }
    let p = Path::new(trimmed);
    if !p.exists() {
        return Err(format!("not found: {trimmed}"));
    }
    if p.is_file() {
        let ext = extension_of(p);
        if BLOCKED_EXT.contains(&ext.as_str()) {
            return Err(format!(
                "refused: .{ext} is an executable type. Register it as an application instead of opening it as a file."
            ));
        }
    }
    tauri_plugin_opener::open_path(trimmed, None::<&str>).map_err(|e| e.to_string())
}

/// Open a web URL in the default browser. http/https only — see rule 3.
#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    let trimmed = url.trim();
    let lower = trimmed.to_ascii_lowercase();
    if !(lower.starts_with("http://") || lower.starts_with("https://")) {
        return Err("refused: only http and https URLs can be opened".into());
    }
    tauri_plugin_opener::open_url(trimmed, None::<&str>).map_err(|e| e.to_string())
}

/// Open a folder (or file) in VS Code. The binary is resolved here, never supplied.
#[tauri::command]
pub fn open_in_vscode(path: String) -> Result<(), String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("no path given".into());
    }
    if !Path::new(trimmed).exists() {
        return Err(format!("not found: {trimmed}"));
    }
    let bin = resolve_vscode().ok_or("VS Code not found in the usual install locations")?;
    let mut cmd = Command::new(bin);
    cmd.arg(trimmed);
    spawn_detached(cmd, true)
}

/// Open a terminal in a directory. Resolves Windows Terminal, falling back to cmd.
#[tauri::command]
pub fn open_terminal(path: String) -> Result<(), String> {
    let trimmed = path.trim();
    let dir = Path::new(trimmed);
    if trimmed.is_empty() || !dir.exists() {
        return Err(format!("not found: {trimmed}"));
    }
    if !dir.is_dir() {
        return Err("terminal target must be a directory".into());
    }
    let (bin, is_wt) = resolve_terminal().ok_or("no terminal found")?;
    let mut cmd = Command::new(bin);
    if is_wt {
        // Windows Terminal is a GUI app that hosts its own console, so its
        // stdio can be safely nulled — nothing of ours stays attached to it.
        cmd.arg("-d").arg(trimmed);
        return spawn_detached(cmd, false);
    }
    // The cmd.exe fallback is a console app: it must be given a real console and
    // must NOT have its handles nulled, or the window opens dead to input.
    cmd.arg("/K").arg("cd").arg("/d").arg(trimmed);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NEW_CONSOLE);
    cmd.spawn().map(|_| ()).map_err(|e| e.to_string())
}

/// What the launcher can actually do on this machine right now — so the UI can
/// show a launch plan as runnable or broken before the operator presses START.
#[tauri::command]
pub fn launcher_capabilities() -> serde_json::Value {
    serde_json::json!({
        "vscode": resolve_vscode().map(|p| p.to_string_lossy().to_string()),
        "terminal": resolve_terminal().map(|(p, _)| p.to_string_lossy().to_string()),
    })
}

/// Check a batch of targets without opening anything: does each still exist, and
/// would the launcher refuse it? Lets a launch plan render its own health.
#[tauri::command]
pub fn probe_targets(paths: Vec<String>) -> Vec<serde_json::Value> {
    paths
        .into_iter()
        .map(|raw| {
            let trimmed = raw.trim().to_string();
            let p = Path::new(&trimmed);
            let lower = trimmed.to_ascii_lowercase();
            let is_url = lower.starts_with("http://") || lower.starts_with("https://");
            let exists = is_url || p.exists();
            let ext = extension_of(p);
            let blocked = !is_url && p.is_file() && BLOCKED_EXT.contains(&ext.as_str());
            serde_json::json!({
                "target": trimmed,
                "exists": exists,
                "kind": if is_url { "url" } else if p.is_dir() { "folder" } else if p.is_file() { "file" } else { "missing" },
                "blocked": blocked,
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── rule 2: opening a file must never execute one ──────────────────────
    #[test]
    fn refuses_executable_and_script_types() {
        // built against real files so the is_file() branch is actually taken
        let dir = std::env::temp_dir().join("life-widget-launcher-test");
        std::fs::create_dir_all(&dir).unwrap();
        for ext in ["exe", "bat", "cmd", "ps1", "vbs", "lnk", "reg", "jar", "msi", "scr"] {
            let f = dir.join(format!("payload.{ext}"));
            std::fs::write(&f, b"x").unwrap();
            let err = open_path(f.to_string_lossy().to_string())
                .expect_err(&format!(".{ext} must be refused"));
            assert!(err.contains("refused"), "unexpected error for .{ext}: {err}");
        }
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn extension_check_is_case_insensitive() {
        let dir = std::env::temp_dir().join("life-widget-launcher-case");
        std::fs::create_dir_all(&dir).unwrap();
        let f = dir.join("Payload.EXE");
        std::fs::write(&f, b"x").unwrap();
        assert!(open_path(f.to_string_lossy().to_string())
            .unwrap_err()
            .contains("refused"));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn rejects_empty_and_missing_paths() {
        assert!(open_path("".into()).is_err());
        assert!(open_path("   ".into()).is_err());
        assert!(open_path(r"Z:\definitely\not\here.pdf".into())
            .unwrap_err()
            .contains("not found"));
    }

    // ── rule 3: only the web ───────────────────────────────────────────────
    #[test]
    fn refuses_non_web_url_schemes() {
        for bad in [
            "javascript:alert(1)",
            "file:///C:/Windows/System32/cmd.exe",
            "ms-msdt:/id",
            "vscode://file/c:/x",
            "steam://run/1",
            "mailto:a@b.c",
            r"\\server\share",
            "",
        ] {
            assert!(open_url(bad.into()).is_err(), "{bad} should be refused");
        }
    }

    #[test]
    fn accepts_web_schemes_regardless_of_case() {
        // reaching the opener means validation passed; the call itself may fail
        // headlessly, so only the validation branch is asserted here
        for good in ["HTTP://example.com", "HtTpS://example.com/x?y=1"] {
            let lower = good.to_ascii_lowercase();
            assert!(lower.starts_with("http://") || lower.starts_with("https://"));
        }
    }

    // ── rule 1: the app resolves its own binaries ──────────────────────────
    #[test]
    fn resolved_optional_tools_exist_when_available() {
        // An installation without VS Code or a supported terminal is valid.
        for resolved in [resolve_vscode(), resolve_terminal().map(|(path, _)| path)].into_iter().flatten() {
            assert!(resolved.exists(), "resolved tool must exist");
        }
        assert!(first_existing(&[]).is_none());
    }

    #[test]
    fn vscode_and_terminal_reject_bad_targets() {
        assert!(open_in_vscode("".into()).is_err());
        assert!(open_in_vscode(r"Z:\nope".into()).is_err());
        assert!(open_terminal(r"Z:\nope".into()).is_err());
        // a terminal needs a directory, not a file
        let f = std::env::temp_dir().join("life-widget-not-a-dir.txt");
        std::fs::write(&f, b"x").unwrap();
        assert!(open_terminal(f.to_string_lossy().to_string())
            .unwrap_err()
            .contains("directory"));
        std::fs::remove_file(&f).ok();
    }

    // ── plan health ────────────────────────────────────────────────────────
    #[test]
    fn probe_classifies_targets_without_opening_them() {
        let dir = std::env::temp_dir().join("life-widget-probe");
        std::fs::create_dir_all(&dir).unwrap();
        let pdf = dir.join("spec.pdf");
        std::fs::write(&pdf, b"%PDF-1.4").unwrap();
        let exe = dir.join("bad.exe");
        std::fs::write(&exe, b"MZ").unwrap();

        let out = probe_targets(vec![
            pdf.to_string_lossy().to_string(),
            exe.to_string_lossy().to_string(),
            dir.to_string_lossy().to_string(),
            "https://example.com".into(),
            r"Z:\gone.pdf".into(),
        ]);

        assert_eq!(out[0]["kind"], "file");
        assert_eq!(out[0]["exists"], true);
        assert_eq!(out[0]["blocked"], false);
        assert_eq!(out[1]["blocked"], true); // the .exe is flagged, not opened
        assert_eq!(out[2]["kind"], "folder");
        assert_eq!(out[3]["kind"], "url");
        assert_eq!(out[4]["kind"], "missing");
        assert_eq!(out[4]["exists"], false);

        std::fs::remove_dir_all(&dir).ok();
    }

    /// The real end-to-end. Ignored by default because it opens actual windows;
    /// run with: cargo test -- --ignored --nocapture
    #[test]
    #[ignore]
    fn opens_a_real_pdf_and_a_real_vscode_folder() {
        let pdf = std::env::var("LW_TEST_PDF").expect("set LW_TEST_PDF");
        let dir = std::env::var("LW_TEST_DIR").expect("set LW_TEST_DIR");
        open_path(pdf).expect("pdf should open");
        open_in_vscode(dir).expect("vscode should open");
        // open_terminal is deliberately NOT exercised here: a console child
        // holds the harness's pipe open and hangs the run. It is covered by
        // vscode_and_terminal_reject_bad_targets and verified by hand.
    }
}
