use serde::{Deserialize, Serialize};
use std::process::Command;
use tracing::{error, info};

#[derive(Debug, Serialize, Deserialize)]
pub struct OllamaModel {
    pub name: String,
    pub size: u64,
    pub modified_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SystemInfo {
    pub os: String,
    pub arch: String,
    pub cpu_cores: usize,
    pub memory_total: u64,
    pub has_ollama: bool,
}

#[tauri::command]
pub async fn run_claude(args: Vec<String>) -> Result<String, String> {
    info!("Running Claude Code with args: {:?}", args);

    let mut cmd = Command::new("bun");
    cmd.arg("run");
    cmd.arg("./src/entrypoints/cli.tsx");

    for arg in &args {
        cmd.arg(arg);
    }

    // Set environment variables for Ollama
    if std::env::var("CLAUDE_CODE_USE_OLLAMA").is_ok() {
        cmd.env("CLAUDE_CODE_USE_OLLAMA", "1");
    }
    if let Ok(ollama_url) = std::env::var("OLLAMA_BASE_URL") {
        cmd.env("OLLAMA_BASE_URL", ollama_url);
    }
    if let Ok(model) = std::env::var("OLLAMA_MODEL") {
        cmd.env("OLLAMA_MODEL", model);
    }

    let output = cmd.output().map_err(|e| {
        error!("Failed to run Claude: {}", e);
        format!("Failed to run Claude: {}", e)
    })?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
pub async fn check_ollama() -> Result<bool, String> {
    info!("Checking if Ollama is available");

    let output = Command::new("ollama")
        .arg("--version")
        .output();

    match output {
        Ok(out) => Ok(out.status.success()),
        Err(_) => Ok(false),
    }
}

#[tauri::command]
pub async fn get_ollama_models() -> Result<Vec<OllamaModel>, String> {
    info!("Getting Ollama models");

    let output = Command::new("ollama")
        .arg("list")
        .output()
        .map_err(|e| format!("Failed to run ollama list: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut models = Vec::new();

    // Parse the output (skip header line)
    for line in stdout.lines().skip(1) {
        if line.trim().is_empty() {
            continue;
        }

        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 3 {
            models.push(OllamaModel {
                name: parts[0].to_string(),
                size: parts[1].parse().unwrap_or(0),
                modified_at: parts.get(3).map(|s| s.to_string()),
            });
        }
    }

    Ok(models)
}

#[tauri::command]
pub async fn get_system_info() -> Result<SystemInfo, String> {
    info!("Getting system info");

    let os = std::env::consts::OS.to_string();
    let arch = std::env::consts::ARCH.to_string();

    // Check for Ollama
    let has_ollama = Command::new("ollama")
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);

    // Get CPU cores
    let cpu_cores = num_cpus::get();

    // Get memory (this is a rough estimate on Windows)
    let memory_total = if cfg!(windows) {
        // Use sysinfo crate for better memory detection
        16 * 1024 * 1024 * 1024 // Default to 16GB if we can't detect
    } else {
        16 * 1024 * 1024 * 1024
    };

    Ok(SystemInfo {
        os,
        arch,
        cpu_cores,
        memory_total,
        has_ollama,
    })
}
