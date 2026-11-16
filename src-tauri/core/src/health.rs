//! Saúde do computador: CPU, memória, discos, processos, lixo e bateria.

use crate::platform;
use crate::sys::{list_drives, DriveInfo};
use serde::Serialize;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use sysinfo::{ProcessesToUpdate, System};

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CpuInfo {
    /// Uso total (0–100).
    pub usage: f32,
    pub brand: String,
    pub cores: usize,
    pub physical_cores: Option<usize>,
    pub frequency_mhz: u64,
    pub per_core: Vec<f32>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MemoryInfo {
    pub total: u64,
    pub used: u64,
    pub available: u64,
    pub swap_total: u64,
    pub swap_used: u64,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SystemInfo {
    pub os: String,
    pub os_version: String,
    pub host_name: String,
    pub arch: String,
    pub uptime_secs: u64,
    pub boot_time: u64,
    pub process_count: usize,
    pub elevated: bool,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct HealthSnapshot {
    pub cpu: CpuInfo,
    pub memory: MemoryInfo,
    pub disks: Vec<DriveInfo>,
    pub system: SystemInfo,
    pub taken_at: i64,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ProcessInfo {
    pub pid: u32,
    pub name: String,
    /// Uso de CPU relativo ao computador inteiro (0–100).
    pub cpu: f32,
    pub memory: u64,
    pub exe: Option<String>,
    pub protected: bool,
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct JunkInfo {
    pub recycle_bytes: u64,
    pub recycle_items: u64,
    pub temp_bytes: u64,
    pub temp_files: u64,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BatteryInfo {
    pub percent: f32,
    pub charging: bool,
    pub plugged: bool,
    /// Capacidade atual em relação à original (0–100), quando disponível.
    pub health: Option<f32>,
    pub cycles: Option<u32>,
    pub vendor: Option<String>,
    pub model: Option<String>,
    /// Minutos restantes (descarregando) ou até carregar.
    pub minutes_left: Option<u32>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TrimReport {
    pub processes: u32,
    pub freed_bytes: u64,
    pub before_available: u64,
    pub after_available: u64,
}

/// Processos que nunca devem ser encerrados pelo app.
const PROTECTED: &[&str] = &[
    "system",
    "registry",
    "smss.exe",
    "csrss.exe",
    "wininit.exe",
    "winlogon.exe",
    "services.exe",
    "lsass.exe",
    "lsaiso.exe",
    "svchost.exe",
    "dwm.exe",
    "explorer.exe",
    "fontdrvhost.exe",
    "sihost.exe",
    "ctfmon.exe",
    "memory compression",
    "secure system",
    "msmpeng.exe",
    "spoolsv.exe",
    "audiodg.exe",
    "msedgewebview2.exe",
    "organizador.exe",
    "system idle process",
    "init",
    "systemd",
];

pub struct HealthMonitor {
    sys: Mutex<System>,
    cpu_primed: Mutex<Option<Instant>>,
    procs_primed: Mutex<bool>,
    junk: Mutex<Option<(Instant, JunkInfo)>>,
}

impl Default for HealthMonitor {
    fn default() -> Self {
        HealthMonitor {
            sys: Mutex::new(System::new()),
            cpu_primed: Mutex::new(None),
            procs_primed: Mutex::new(false),
            junk: Mutex::new(None),
        }
    }
}

fn is_protected(name: &str, pid: u32) -> bool {
    let n = name.to_ascii_lowercase();
    pid <= 4 || pid == std::process::id() || PROTECTED.contains(&n.as_str())
}

impl HealthMonitor {
    pub fn snapshot(&self) -> HealthSnapshot {
        let mut sys = self.sys.lock().unwrap_or_else(|e| e.into_inner());
        {
            let mut primed = self.cpu_primed.lock().unwrap_or_else(|e| e.into_inner());
            if primed.is_none() {
                // A primeira medição de CPU precisa de duas leituras espaçadas.
                sys.refresh_cpu_all();
                std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL.max(Duration::from_millis(250)));
            }
            sys.refresh_cpu_all();
            *primed = Some(Instant::now());
        }
        sys.refresh_memory();
        let cpus = sys.cpus();
        let cpu = CpuInfo {
            usage: sys.global_cpu_usage().clamp(0.0, 100.0),
            brand: cpus.first().map(|c| c.brand().trim().to_string()).unwrap_or_default(),
            cores: cpus.len(),
            physical_cores: System::physical_core_count(),
            frequency_mhz: cpus.first().map(|c| c.frequency()).unwrap_or(0),
            per_core: cpus.iter().map(|c| c.cpu_usage()).collect(),
        };
        let memory = MemoryInfo {
            total: sys.total_memory(),
            used: sys.total_memory().saturating_sub(sys.available_memory()),
            available: sys.available_memory(),
            swap_total: sys.total_swap(),
            swap_used: sys.used_swap(),
        };
        let process_count = sys.processes().len();
        drop(sys);
        HealthSnapshot {
            cpu,
            memory,
            disks: list_drives(),
            system: SystemInfo {
                os: System::long_os_version().or_else(System::name).unwrap_or_else(|| std::env::consts::OS.into()),
                os_version: System::os_version().unwrap_or_default(),
                host_name: System::host_name().unwrap_or_default(),
                arch: System::cpu_arch(),
                uptime_secs: System::uptime(),
                boot_time: System::boot_time(),
                process_count,
                elevated: platform::is_elevated(),
            },
            taken_at: crate::model::now_ms(),
        }
    }

    pub fn top_processes(&self, limit: usize) -> Vec<ProcessInfo> {
        let mut sys = self.sys.lock().unwrap_or_else(|e| e.into_inner());
        {
            let mut primed = self.procs_primed.lock().unwrap_or_else(|e| e.into_inner());
            if !*primed {
                sys.refresh_processes(ProcessesToUpdate::All, true);
                std::thread::sleep(Duration::from_millis(300));
                *primed = true;
            }
        }
        sys.refresh_processes(ProcessesToUpdate::All, true);
        let cores = sys.cpus().len().max(1) as f32;
        let mut list: Vec<ProcessInfo> = sys
            .processes()
            .values()
            .map(|p| {
                let name = p.name().to_string_lossy().into_owned();
                let pid = p.pid().as_u32();
                ProcessInfo {
                    protected: is_protected(&name, pid),
                    pid,
                    cpu: (p.cpu_usage() / cores).clamp(0.0, 100.0),
                    memory: p.memory(),
                    exe: p.exe().map(|e| e.to_string_lossy().into_owned()),
                    name,
                }
            })
            .collect();
        // Junta processos com o mesmo nome (ex.: várias abas do navegador).
        list.sort_by(|a, b| b.memory.cmp(&a.memory));
        list.truncate(limit.max(1) * 4);
        list
    }

    pub fn kill(&self, pid: u32) -> Result<(), String> {
        let mut sys = self.sys.lock().unwrap_or_else(|e| e.into_inner());
        sys.refresh_processes(ProcessesToUpdate::All, true);
        let p = sys.process(sysinfo::Pid::from_u32(pid)).ok_or("O processo já foi encerrado.")?;
        let name = p.name().to_string_lossy().into_owned();
        if is_protected(&name, pid) {
            return Err(format!("“{name}” é essencial para o Windows e não deve ser encerrado."));
        }
        if p.kill() {
            Ok(())
        } else {
            Err(format!("Não foi possível encerrar “{name}”. Ele pode exigir permissão de administrador."))
        }
    }

    /// Libera memória ociosa dos processos (efeito temporário).
    pub fn trim_memory(&self) -> TrimReport {
        let mut sys = self.sys.lock().unwrap_or_else(|e| e.into_inner());
        sys.refresh_memory();
        sys.refresh_processes(ProcessesToUpdate::All, true);
        let before = sys.available_memory();
        let pids: Vec<u32> = sys.processes().keys().map(|p| p.as_u32()).collect();
        let processes = platform::trim_working_sets(&pids);
        std::thread::sleep(Duration::from_millis(400));
        sys.refresh_memory();
        let after = sys.available_memory();
        TrimReport { processes, freed_bytes: after.saturating_sub(before), before_available: before, after_available: after }
    }

    /// Lixeira e temporários do usuário (guardado por 60 s, pois é custoso).
    pub fn junk_estimate(&self, force: bool) -> JunkInfo {
        if !force {
            if let Some((t, j)) = self.junk.lock().unwrap_or_else(|e| e.into_inner()).as_ref() {
                if t.elapsed() < Duration::from_secs(60) {
                    return j.clone();
                }
            }
        }
        let (recycle_bytes, recycle_items) = platform::recycle_bin_info().unwrap_or((0, 0));
        let (temp_bytes, temp_files) = dir_size_limited(&std::env::temp_dir(), 400_000, Duration::from_secs(4));
        let j = JunkInfo { recycle_bytes, recycle_items, temp_bytes, temp_files };
        *self.junk.lock().unwrap_or_else(|e| e.into_inner()) = Some((Instant::now(), j.clone()));
        j
    }
}

/// Soma o tamanho de uma pasta com limite de arquivos e de tempo.
pub fn dir_size_limited(root: &std::path::Path, max_files: u64, max_time: Duration) -> (u64, u64) {
    let start = Instant::now();
    let mut stack = vec![root.to_path_buf()];
    let (mut bytes, mut files) = (0u64, 0u64);
    while let Some(d) = stack.pop() {
        if files >= max_files || start.elapsed() > max_time {
            break;
        }
        let Ok(rd) = std::fs::read_dir(&d) else { continue };
        for e in rd.flatten() {
            let Ok(ft) = e.file_type() else { continue };
            if ft.is_symlink() {
                continue;
            }
            if ft.is_dir() {
                stack.push(e.path());
            } else if let Ok(m) = e.metadata() {
                bytes += m.len();
                files += 1;
            }
        }
    }
    (bytes, files)
}

/// Bateria do notebook (None em computadores de mesa).
pub fn battery() -> Option<BatteryInfo> {
    use starship_battery::units::ratio::percent;
    use starship_battery::units::time::minute;
    use starship_battery::State;
    if let Ok(manager) = starship_battery::Manager::new() {
        if let Ok(mut list) = manager.batteries() {
            if let Some(Ok(b)) = list.next() {
                let state = b.state();
                let health = b.state_of_health().get::<percent>();
                let left = match state {
                    State::Discharging => b.time_to_empty().map(|t| t.get::<minute>() as u32),
                    State::Charging => b.time_to_full().map(|t| t.get::<minute>() as u32),
                    _ => None,
                };
                return Some(BatteryInfo {
                    percent: b.state_of_charge().get::<percent>().clamp(0.0, 100.0),
                    charging: state == State::Charging,
                    plugged: matches!(state, State::Charging | State::Full),
                    health: if health.is_finite() && health > 0.0 { Some(health.min(100.0)) } else { None },
                    cycles: b.cycle_count(),
                    vendor: b.vendor().map(|s| s.trim().to_string()).filter(|s| !s.is_empty()),
                    model: b.model().map(|s| s.trim().to_string()).filter(|s| !s.is_empty()),
                    minutes_left: left,
                });
            }
        }
    }
    platform::power_status().map(|(pct, plugged, charging)| BatteryInfo {
        percent: pct,
        charging,
        plugged,
        health: None,
        cycles: None,
        vendor: None,
        model: None,
        minutes_left: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mede_cpu_memoria_e_processos() {
        let m = HealthMonitor::default();
        let s = m.snapshot();
        assert!(s.memory.total > 0);
        assert!(s.cpu.cores > 0);
        assert!((0.0..=100.0).contains(&s.cpu.usage));
        let top = m.top_processes(5);
        assert!(!top.is_empty() && top.len() <= 20);
        let all = m.top_processes(100_000);
        assert!(all.iter().any(|p| p.pid == std::process::id() && p.protected), "o próprio app nunca pode ser encerrado");
    }

    #[test]
    fn protege_processos_essenciais() {
        assert!(is_protected("csrss.exe", 600));
        assert!(is_protected("Explorer.EXE", 9000));
        assert!(!is_protected("chrome.exe", 9000));
    }

    #[test]
    fn soma_pasta_com_limite() {
        let d = tempfile::tempdir().unwrap();
        for i in 0..5 {
            std::fs::write(d.path().join(format!("f{i}")), vec![0u8; 100]).unwrap();
        }
        assert_eq!(dir_size_limited(d.path(), 1000, Duration::from_secs(5)), (500, 5));
    }
}
