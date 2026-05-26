use serde::Serialize;
use std::fs;
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;
use tauri::Manager;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

const BRIDGE_PORT: u16 = 48890;
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

struct BackendState {
    child: Mutex<Option<Child>>,
    runtime: RuntimeInfo,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeInfo {
    app_server_url: String,
    backend_label: String,
    backend_mode: String,
    project_path_hint: String,
    startup_error: Option<String>,
}

impl BackendState {
    fn start() -> Self {
        let mut startup_error = None;
        let child = match spawn_real_wsl_backend() {
            Ok(child) => Some(child),
            Err(error) => {
                if readyz(BRIDGE_PORT) {
                    None
                } else {
                    startup_error = Some(error);
                    None
                }
            }
        };

        if startup_error.is_none() && !wait_for_ready(BRIDGE_PORT) {
            startup_error = Some(format!(
                "Timed out waiting for real WSL app-server bridge on 127.0.0.1:{BRIDGE_PORT}"
            ));
        }

        Self {
            child: Mutex::new(child),
            runtime: RuntimeInfo {
                app_server_url: format!("ws://127.0.0.1:{BRIDGE_PORT}"),
                backend_label: "Tauri desktop + real WSL app-server".to_string(),
                backend_mode: "real-wsl".to_string(),
                project_path_hint: project_path_hint(),
                startup_error,
            },
        }
    }
}

impl Drop for BackendState {
    fn drop(&mut self) {
        if let Ok(mut child) = self.child.lock() {
            if let Some(process) = child.as_mut() {
                let _ = process.kill();
            }
        }
    }
}

#[tauri::command]
fn desktop_runtime_info(state: tauri::State<'_, BackendState>) -> RuntimeInfo {
    state.runtime.clone()
}

#[tauri::command]
fn pick_files() -> Result<Vec<String>, String> {
    Ok(rfd::FileDialog::new()
        .pick_files()
        .unwrap_or_default()
        .into_iter()
        .map(|path| path.to_string_lossy().into_owned())
        .collect())
}

#[tauri::command]
fn pick_folder() -> Result<Option<String>, String> {
    Ok(rfd::FileDialog::new()
        .pick_folder()
        .map(|path| path.to_string_lossy().into_owned()))
}

#[tauri::command]
fn read_image_data_url(path: String) -> Result<String, String> {
    let native_path = native_file_path(&path);
    let mime = image_mime(&path).ok_or_else(|| "Unsupported image type.".to_string())?;
    let bytes =
        fs::read(&native_path).map_err(|error| format!("Could not read image preview: {error}"))?;
    Ok(format!("data:{mime};base64,{}", base64_encode(&bytes)))
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            app.manage(BackendState::start());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            desktop_runtime_info,
            pick_files,
            pick_folder,
            read_image_data_url
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Codex Desktop P03");
}

fn native_file_path(path: &str) -> PathBuf {
    let path = path.replace('\\', "/");
    let parts: Vec<&str> = path.split('/').collect();
    if parts.len() > 3 && parts[0].is_empty() && parts[1] == "mnt" && parts[2].len() == 1 {
        let drive = parts[2].to_ascii_uppercase();
        let rest = parts[3..].join("\\");
        return PathBuf::from(format!("{drive}:\\{rest}"));
    }
    PathBuf::from(path)
}

fn image_mime(path: &str) -> Option<&'static str> {
    let lower = path.to_ascii_lowercase();
    if lower.ends_with(".png") {
        return Some("image/png");
    }
    if lower.ends_with(".jpg") || lower.ends_with(".jpeg") {
        return Some("image/jpeg");
    }
    if lower.ends_with(".gif") {
        return Some("image/gif");
    }
    if lower.ends_with(".webp") {
        return Some("image/webp");
    }
    None
}

fn base64_encode(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut encoded = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let first = chunk[0];
        let second = chunk.get(1).copied().unwrap_or(0);
        let third = chunk.get(2).copied().unwrap_or(0);
        let value = ((first as u32) << 16) | ((second as u32) << 8) | third as u32;
        encoded.push(TABLE[((value >> 18) & 0x3f) as usize] as char);
        encoded.push(TABLE[((value >> 12) & 0x3f) as usize] as char);
        encoded.push(if chunk.len() > 1 {
            TABLE[((value >> 6) & 0x3f) as usize] as char
        } else {
            '='
        });
        encoded.push(if chunk.len() > 2 {
            TABLE[(value & 0x3f) as usize] as char
        } else {
            '='
        });
    }
    encoded
}

fn spawn_real_wsl_backend() -> Result<Child, String> {
    let repo_root = repo_root();
    let script = repo_root.join("scripts").join("p03-real-app-server.mjs");
    let cache_dir = repo_root.join(".cache");
    fs::create_dir_all(&cache_dir)
        .map_err(|error| format!("Failed to create desktop backend log directory: {error}"))?;
    let log = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(cache_dir.join("p03-tauri-backend.log"))
        .map_err(|error| format!("Failed to open desktop backend log: {error}"))?;
    let log_stderr = log
        .try_clone()
        .map_err(|error| format!("Failed to clone desktop backend log: {error}"))?;
    let mut command = Command::new("node");
    command
        .arg(script)
        .current_dir(&repo_root)
        .stdin(Stdio::null())
        .stdout(Stdio::from(log))
        .stderr(Stdio::from(log_stderr));

    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);

    command
        .spawn()
        .map_err(|error| format!("Failed to start real WSL app-server helper: {error}"))
}

fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("..")
}

fn project_path_hint() -> String {
    let path = repo_root().to_string_lossy().replace('\\', "/");
    let bytes = path.as_bytes();
    if bytes.len() > 2 && bytes[1] == b':' {
        let drive = (bytes[0] as char).to_ascii_lowercase();
        return format!("/mnt/{drive}/{}", path[3..].trim_start_matches('/'));
    }
    path
}

fn wait_for_ready(port: u16) -> bool {
    for _ in 0..80 {
        if readyz(port) {
            return true;
        }
        thread::sleep(Duration::from_millis(250));
    }
    false
}

fn readyz(port: u16) -> bool {
    let address: SocketAddr = match format!("127.0.0.1:{port}").parse() {
        Ok(address) => address,
        Err(_) => return false,
    };
    let mut stream = match TcpStream::connect_timeout(&address, Duration::from_millis(500)) {
        Ok(stream) => stream,
        Err(_) => return false,
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(500)));
    let request =
        format!("GET /readyz HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n");
    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }
    let mut buffer = [0_u8; 256];
    match stream.read(&mut buffer) {
        Ok(size) => std::str::from_utf8(&buffer[..size])
            .map(|response| response.starts_with("HTTP/1.1 200"))
            .unwrap_or(false),
        Err(_) => false,
    }
}
