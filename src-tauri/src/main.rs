// Oculta a janela de console no Windows em builds de release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod emit;
mod state;

use commands::{files, scan, trash};
use state::AppState;
use std::time::Duration;
use tauri::Manager;
use tauri_plugin_window_state::StateFlags;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_window_state::Builder::new()
                // A janela começa oculta e a interface a mostra quando estiver pronta.
                .with_state_flags(StateFlags::all() & !StateFlags::VISIBLE)
                .build(),
        )
        .manage(AppState::default())
        .setup(|app| {
            // Garantia: se a interface não mostrar a janela em 4 s, mostra mesmo assim.
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_secs(4));
                if let Some(w) = handle.get_webview_window("main") {
                    if !w.is_visible().unwrap_or(true) {
                        let _ = w.show();
                    }
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            files::app_info,
            files::special_folders,
            files::list_drives,
            files::list_dir,
            files::stat_path,
            files::path_exists,
            files::is_dir,
            files::folder_size,
            files::read_text_preview,
            files::open_path,
            files::reveal_path,
            files::check_conflicts,
            files::copy_items,
            files::move_items,
            files::delete_items,
            files::rename_item,
            files::create_folder,
            files::create_text_file,
            files::clipboard_write,
            files::clipboard_read,
            files::clipboard_clear,
            files::set_protected_paths,
            files::check_protected,
            files::cancel_task,
            files::save_text_file,
            scan::scan_start,
            scan::scan_query,
            scan::scan_summary,
            scan::scan_ids,
            scan::scan_paths,
            scan::scan_remove,
            scan::scan_stats,
            scan::scan_dispose,
            trash::trash_list,
            trash::trash_restore,
            trash::trash_purge,
            trash::trash_restore_paths,
            trash::undo_moves,
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o Organizador");
}
