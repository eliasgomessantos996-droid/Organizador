//! Envia o progresso das tarefas longas para a interface (evento "task-progress").

use organizador_core::progress::{CancelFlag, Progress, ProgressUpdate};
use serde::Serialize;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

use crate::state::AppState;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TaskEvent {
    task_id: String,
    #[serde(flatten)]
    update: ProgressUpdate,
}

pub struct TaskProgress {
    app: AppHandle,
    task_id: String,
    cancel: CancelFlag,
    last: Mutex<Option<Instant>>,
}

impl TaskProgress {
    pub fn new(app: &AppHandle, task_id: &str) -> TaskProgress {
        let cancel = app.state::<AppState>().begin_task(task_id);
        TaskProgress { app: app.clone(), task_id: task_id.to_string(), cancel, last: Mutex::new(None) }
    }
}

impl Drop for TaskProgress {
    fn drop(&mut self) {
        self.app.state::<AppState>().end_task(&self.task_id);
    }
}

impl Progress for TaskProgress {
    fn report(&self, update: ProgressUpdate) {
        // Limita a ~12 eventos por segundo para não sobrecarregar a interface.
        let mut last = self.last.lock().unwrap_or_else(|e| e.into_inner());
        let finished = update.total > 0 && update.done >= update.total;
        if let Some(t) = *last {
            if t.elapsed() < Duration::from_millis(80) && !finished {
                return;
            }
        }
        *last = Some(Instant::now());
        let _ = self.app.emit("task-progress", TaskEvent { task_id: self.task_id.clone(), update });
    }

    fn cancelled(&self) -> bool {
        self.cancel.is_cancelled()
    }
}

/// Executa trabalho pesado fora da thread principal.
pub async fn blocking<T, F>(f: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> T + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f).await.map_err(|e| format!("Falha interna: {e}"))
}
