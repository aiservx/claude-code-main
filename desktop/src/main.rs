#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::Command;
use tauri::Manager;
use tracing::{error, info};
use tracing_subscriber::{fmt, EnvFilter};

mod commands;

fn main() {
    // Initialize logging
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env().add_directive(tracing::Level::INFO.into()))
        .init();

    info!("Starting Open Claude Code Desktop");

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            commands::run_claude,
            commands::check_ollama,
            commands::get_ollama_models,
            commands::get_system_info,
        ])
        .setup(|app| {
            info!("Desktop app setup complete");

            // Get the main window
            let window = app.get_webview_window("main").unwrap();

            // Set window title
            window.set_title("Open Claude Code").unwrap();

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
