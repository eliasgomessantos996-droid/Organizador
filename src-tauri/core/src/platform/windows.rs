//! Implementações para Windows (APIs Win32).

use super::ClipboardFiles;
use std::ffi::OsStr;
use std::iter::once;
use std::os::windows::ffi::OsStrExt;
use std::ptr::null_mut;
use std::time::Duration;
use windows_sys::Win32::Foundation::{GlobalFree, POINT};
use windows_sys::Win32::System::DataExchange::{
    CloseClipboard, EmptyClipboard, GetClipboardData, IsClipboardFormatAvailable, OpenClipboard, RegisterClipboardFormatW,
    SetClipboardData,
};
use windows_sys::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE, GMEM_ZEROINIT};
use windows_sys::Win32::UI::Shell::{DragQueryFileW, DROPFILES};

const CF_HDROP: u32 = 15;
const DROPEFFECT_COPY: u32 = 1;
const DROPEFFECT_MOVE: u32 = 2;
const DROPEFFECT_LINK: u32 = 4;

pub(crate) fn wide(s: &str) -> Vec<u16> {
    OsStr::new(s).encode_wide().chain(once(0)).collect()
}

struct ClipboardGuard;

impl ClipboardGuard {
    fn open() -> Result<ClipboardGuard, String> {
        // Outro programa pode estar usando a área de transferência: tenta algumas vezes.
        for _ in 0..12 {
            if unsafe { OpenClipboard(null_mut()) } != 0 {
                return Ok(ClipboardGuard);
            }
            std::thread::sleep(Duration::from_millis(15));
        }
        Err("A área de transferência está ocupada por outro programa.".into())
    }
}

impl Drop for ClipboardGuard {
    fn drop(&mut self) {
        unsafe {
            CloseClipboard();
        }
    }
}

fn drop_effect_format() -> u32 {
    unsafe { RegisterClipboardFormatW(wide("Preferred DropEffect").as_ptr()) }
}

/// Coloca arquivos na área de transferência do Windows (compatível com o Explorer).
pub fn clipboard_set_files(paths: &[String], cut: bool) -> Result<(), String> {
    let mut list: Vec<u16> = Vec::new();
    for p in paths {
        list.extend(OsStr::new(p).encode_wide());
        list.push(0);
    }
    list.push(0);
    let header = std::mem::size_of::<DROPFILES>();
    let total = header + list.len() * 2;
    unsafe {
        let _guard = ClipboardGuard::open()?;
        EmptyClipboard();
        let h = GlobalAlloc(GMEM_MOVEABLE | GMEM_ZEROINIT, total);
        if h.is_null() {
            return Err("Memória insuficiente para copiar.".into());
        }
        let ptr = GlobalLock(h) as *mut u8;
        if ptr.is_null() {
            GlobalFree(h);
            return Err("Não foi possível acessar a área de transferência.".into());
        }
        let df = ptr as *mut DROPFILES;
        (*df).pFiles = header as u32;
        (*df).pt = POINT { x: 0, y: 0 };
        (*df).fNC = 0;
        (*df).fWide = 1;
        std::ptr::copy_nonoverlapping(list.as_ptr() as *const u8, ptr.add(header), list.len() * 2);
        GlobalUnlock(h);
        if SetClipboardData(CF_HDROP, h).is_null() {
            GlobalFree(h);
            return Err("Não foi possível copiar para a área de transferência.".into());
        }
        let h2 = GlobalAlloc(GMEM_MOVEABLE, 4);
        if !h2.is_null() {
            let p2 = GlobalLock(h2) as *mut u32;
            if !p2.is_null() {
                *p2 = if cut { DROPEFFECT_MOVE } else { DROPEFFECT_COPY | DROPEFFECT_LINK };
                GlobalUnlock(h2);
                if SetClipboardData(drop_effect_format(), h2).is_null() {
                    GlobalFree(h2);
                }
            } else {
                GlobalFree(h2);
            }
        }
    }
    Ok(())
}

/// Lê arquivos copiados/recortados (inclusive pelo Explorer do Windows).
pub fn clipboard_get_files() -> Option<ClipboardFiles> {
    unsafe {
        if IsClipboardFormatAvailable(CF_HDROP) == 0 {
            return None;
        }
        let _guard = ClipboardGuard::open().ok()?;
        let h = GetClipboardData(CF_HDROP);
        if h.is_null() {
            return None;
        }
        let count = DragQueryFileW(h, u32::MAX, null_mut(), 0);
        let mut paths = Vec::with_capacity(count as usize);
        for i in 0..count {
            let len = DragQueryFileW(h, i, null_mut(), 0);
            let mut buf = vec![0u16; len as usize + 1];
            let got = DragQueryFileW(h, i, buf.as_mut_ptr(), len + 1);
            paths.push(String::from_utf16_lossy(&buf[..got as usize]));
        }
        let fmt = drop_effect_format();
        let mut cut = false;
        if IsClipboardFormatAvailable(fmt) != 0 {
            let h2 = GetClipboardData(fmt);
            if !h2.is_null() {
                let p = GlobalLock(h2) as *const u32;
                if !p.is_null() {
                    let effect = *p;
                    cut = effect & DROPEFFECT_MOVE != 0 && effect & DROPEFFECT_COPY == 0;
                    GlobalUnlock(h2);
                }
            }
        }
        Some(ClipboardFiles { paths, cut })
    }
}

/// Esvazia a área de transferência (após colar itens recortados).
pub fn clipboard_clear() {
    if let Ok(_guard) = ClipboardGuard::open() {
        unsafe {
            EmptyClipboard();
        }
    }
}

/* ═════════════════════════ Sistema ═════════════════════════ */

use super::{InstalledProgram, StartupItem};
use std::ffi::c_void;
use std::ptr::null;
use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
use windows_sys::Win32::Security::{GetTokenInformation, TokenElevation, TOKEN_ELEVATION, TOKEN_QUERY};
use windows_sys::Win32::Storage::FileSystem::{GetFileVersionInfoSizeW, GetFileVersionInfoW, VerQueryValueW};
use windows_sys::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};
use windows_sys::Win32::System::ProcessStatus::K32EmptyWorkingSet;
use windows_sys::Win32::System::Threading::{GetCurrentProcess, OpenProcess, OpenProcessToken, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_SET_QUOTA};
use windows_sys::Win32::UI::Shell::{SHEmptyRecycleBinW, SHQueryRecycleBinW, ShellExecuteW, SHERB_NOCONFIRMATION, SHERB_NOPROGRESSUI, SHERB_NOSOUND, SHQUERYRBINFO};
use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ, KEY_WOW64_64KEY, REG_BINARY};
use winreg::{RegKey, RegValue};

/// Tamanho e quantidade de itens na Lixeira de todas as unidades.
pub fn recycle_bin_info() -> Result<(u64, u64), String> {
    let mut info = SHQUERYRBINFO { cbSize: std::mem::size_of::<SHQUERYRBINFO>() as u32, i64Size: 0, i64NumItems: 0 };
    let hr = unsafe { SHQueryRecycleBinW(null(), &mut info) };
    if hr < 0 {
        return Err(format!("Não foi possível consultar a Lixeira (código 0x{hr:08X})."));
    }
    Ok((info.i64Size.max(0) as u64, info.i64NumItems.max(0) as u64))
}

/// Esvazia a Lixeira de todas as unidades, sem confirmação nem som.
pub fn empty_recycle_bin() -> Result<(), String> {
    let hr = unsafe { SHEmptyRecycleBinW(null_mut(), null(), SHERB_NOCONFIRMATION | SHERB_NOPROGRESSUI | SHERB_NOSOUND) };
    // E_UNEXPECTED quando a Lixeira já está vazia.
    if hr < 0 && hr as u32 != 0x8000_FFFF {
        return Err(format!("Não foi possível esvaziar a Lixeira (código 0x{hr:08X})."));
    }
    Ok(())
}

/// O Organizador está rodando como administrador?
pub fn is_elevated() -> bool {
    unsafe {
        let mut token: HANDLE = null_mut();
        if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) == 0 {
            return false;
        }
        let mut elevation = TOKEN_ELEVATION { TokenIsElevated: 0 };
        let mut len = 0u32;
        let ok = GetTokenInformation(
            token,
            TokenElevation,
            &mut elevation as *mut _ as *mut c_void,
            std::mem::size_of::<TOKEN_ELEVATION>() as u32,
            &mut len,
        );
        CloseHandle(token);
        ok != 0 && elevation.TokenIsElevated != 0
    }
}

/// Abre um arquivo, programa ou endereço pelo shell do Windows (com UAC quando preciso).
pub fn shell_execute(file: &str, params: Option<&str>, verb: Option<&str>) -> Result<(), String> {
    let f = wide(file);
    let p = params.map(wide);
    let v = verb.map(wide);
    let r = unsafe {
        ShellExecuteW(
            null_mut(),
            v.as_ref().map(|v| v.as_ptr()).unwrap_or(null()),
            f.as_ptr(),
            p.as_ref().map(|p| p.as_ptr()).unwrap_or(null()),
            null(),
            SW_SHOWNORMAL,
        )
    };
    if (r as isize) <= 32 {
        return Err(if (r as isize) == 5 { "A ação foi cancelada ou não foi autorizada.".into() } else { format!("Não foi possível abrir “{file}”.") });
    }
    Ok(())
}

/// Reinicia o Organizador pedindo permissão de administrador.
pub fn relaunch_as_admin() -> Result<(), String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    shell_execute(&exe.to_string_lossy(), Some("--elevado"), Some("runas"))
}

/// Libera memória ociosa dos processos (esvazia o conjunto de trabalho).
pub fn trim_working_sets(pids: &[u32]) -> u32 {
    let mut n = 0;
    for &pid in pids {
        unsafe {
            let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_SET_QUOTA, 0, pid);
            if !h.is_null() {
                if K32EmptyWorkingSet(h) != 0 {
                    n += 1;
                }
                CloseHandle(h);
            }
        }
    }
    n
}

/// Bateria pela API simples do Windows (porcentagem e se está na tomada).
pub fn power_status() -> Option<(f32, bool, bool)> {
    let mut s = SYSTEM_POWER_STATUS { ACLineStatus: 0, BatteryFlag: 0, BatteryLifePercent: 0, SystemStatusFlag: 0, BatteryLifeTime: 0, BatteryFullLifeTime: 0 };
    if unsafe { GetSystemPowerStatus(&mut s) } == 0 || s.BatteryFlag == 128 || s.BatteryLifePercent == 255 {
        return None;
    }
    Some((s.BatteryLifePercent as f32, s.ACLineStatus == 1, s.BatteryFlag & 8 != 0))
}

/// Empresa e descrição gravadas no executável (Propriedades > Detalhes).
pub fn file_version_info(path: &str) -> (Option<String>, Option<String>) {
    unsafe {
        let w = wide(path);
        let mut handle = 0u32;
        let size = GetFileVersionInfoSizeW(w.as_ptr(), &mut handle);
        if size == 0 {
            return (None, None);
        }
        let mut buf = vec![0u8; size as usize];
        if GetFileVersionInfoW(w.as_ptr(), 0, size, buf.as_mut_ptr() as *mut c_void) == 0 {
            return (None, None);
        }
        let mut ptr: *mut c_void = null_mut();
        let mut len = 0u32;
        let tr = if VerQueryValueW(buf.as_ptr() as *const c_void, wide("\\VarFileInfo\\Translation").as_ptr(), &mut ptr, &mut len) != 0 && len >= 4 {
            let p = ptr as *const u16;
            format!("{:04x}{:04x}", *p, *p.add(1))
        } else {
            "040904b0".to_string()
        };
        let query = |field: &str| -> Option<String> {
            let mut p: *mut c_void = null_mut();
            let mut l = 0u32;
            let key = wide(&format!("\\StringFileInfo\\{tr}\\{field}"));
            if VerQueryValueW(buf.as_ptr() as *const c_void, key.as_ptr(), &mut p, &mut l) != 0 && l > 0 && !p.is_null() {
                let s = std::slice::from_raw_parts(p as *const u16, l as usize);
                let text = String::from_utf16_lossy(s).trim_end_matches('\0').trim().to_string();
                if text.is_empty() {
                    None
                } else {
                    Some(text)
                }
            } else {
                None
            }
        };
        (query("CompanyName"), query("FileDescription"))
    }
}

/// Expande variáveis como %ProgramFiles% em um caminho.
fn expand_env(s: &str) -> String {
    let mut out = String::new();
    let mut rest = s;
    while let Some(start) = rest.find('%') {
        out.push_str(&rest[..start]);
        let after = &rest[start + 1..];
        match after.find('%') {
            Some(end) => {
                let var = &after[..end];
                match std::env::var(var) {
                    Ok(v) => out.push_str(&v),
                    Err(_) => {
                        out.push('%');
                        out.push_str(var);
                        out.push('%');
                    }
                }
                rest = &after[end + 1..];
            }
            None => {
                out.push_str(&rest[start..]);
                rest = "";
            }
        }
    }
    out.push_str(rest);
    out
}

/// Separa o executável e os argumentos de uma linha de comando.
pub fn split_command(cmd: &str) -> (String, String) {
    let c = cmd.trim();
    if let Some(rest) = c.strip_prefix('"') {
        if let Some(end) = rest.find('"') {
            return (expand_env(&rest[..end]), rest[end + 1..].trim().to_string());
        }
    }
    let lower = c.to_ascii_lowercase();
    for ext in [".exe", ".cmd", ".bat", ".com"] {
        if let Some(i) = lower.find(ext) {
            let end = i + ext.len();
            return (expand_env(&c[..end]), c[end..].trim().to_string());
        }
    }
    match c.split_once(' ') {
        Some((a, b)) => (expand_env(a), b.trim().to_string()),
        None => (expand_env(c), String::new()),
    }
}

const RUN: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
const RUN32: &str = r"Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run";
const APPROVED: &str = r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved";

fn hive(name: &str) -> RegKey {
    RegKey::predef(if name == "hkcu" { HKEY_CURRENT_USER } else { HKEY_LOCAL_MACHINE })
}

/// Ativado segundo a chave StartupApproved (a mesma do Gerenciador de Tarefas).
fn approved_enabled(hive_name: &str, group: &str, value: &str) -> bool {
    hive(hive_name)
        .open_subkey_with_flags(format!("{APPROVED}\\{group}"), KEY_READ)
        .and_then(|k| k.get_raw_value(value))
        .map(|v| v.bytes.first().map(|b| b & 1 == 0).unwrap_or(true))
        .unwrap_or(true)
}

fn startup_folder(common: bool) -> Option<std::path::PathBuf> {
    let base = if common { std::env::var_os("ProgramData") } else { std::env::var_os("APPDATA") }?;
    Some(std::path::PathBuf::from(base).join(r"Microsoft\Windows\Start Menu\Programs\Startup"))
}

/// Programas que iniciam com o Windows (Registro + pastas Inicializar).
pub fn startup_items() -> Vec<StartupItem> {
    let mut out = Vec::new();
    let sources = [("hkcu", RUN, "Run", "Registro do usuário"), ("hklm", RUN, "Run", "Registro do computador"), ("hklm", RUN32, "Run32", "Registro do computador (32 bits)")];
    for (h, path, group, location) in sources {
        let key = match hive(h).open_subkey_with_flags(path, KEY_READ | KEY_WOW64_64KEY) {
            Ok(k) => k,
            Err(_) => continue,
        };
        for (name, value) in key.enum_values().flatten() {
            let command = value.to_string();
            if command.trim().is_empty() {
                continue;
            }
            let (exe, _) = split_command(&command);
            let exists = std::path::Path::new(&exe).exists();
            let (publisher, description) = if exists { file_version_info(&exe) } else { (None, None) };
            out.push(StartupItem {
                id: format!("reg|{h}|{group}|{name}"),
                name: name.clone(),
                command,
                path: Some(exe),
                location: location.into(),
                scope: if h == "hkcu" { "user".into() } else { "machine".into() },
                enabled: approved_enabled(h, group, &name),
                needs_admin: h != "hkcu",
                publisher,
                description,
                exists,
            });
        }
    }
    for (common, h, location) in [(false, "hkcu", "Pasta Inicializar do usuário"), (true, "hklm", "Pasta Inicializar de todos os usuários")] {
        let Some(dir) = startup_folder(common) else { continue };
        let Ok(rd) = std::fs::read_dir(&dir) else { continue };
        for entry in rd.flatten() {
            let file = entry.file_name().to_string_lossy().into_owned();
            if file.eq_ignore_ascii_case("desktop.ini") {
                continue;
            }
            let p = entry.path();
            let name = p.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or(file.clone());
            out.push(StartupItem {
                id: format!("folder|{h}|StartupFolder|{file}"),
                name,
                command: p.to_string_lossy().into_owned(),
                path: Some(p.to_string_lossy().into_owned()),
                location: location.into(),
                scope: if common { "machine".into() } else { "user".into() },
                enabled: approved_enabled(h, "StartupFolder", &file),
                needs_admin: common,
                publisher: None,
                description: None,
                exists: true,
            });
        }
    }
    out.sort_by_key(|i| i.name.to_lowercase());
    out
}

/// Ativa ou desativa um programa de inicialização (sem apagar a entrada).
pub fn set_startup_enabled(id: &str, enabled: bool) -> Result<(), String> {
    let parts: Vec<&str> = id.splitn(4, '|').collect();
    if parts.len() != 4 {
        return Err("Item de inicialização inválido.".into());
    }
    let (h, group, value) = (parts[1], parts[2], parts[3]);
    let (key, _) = hive(h)
        .create_subkey(format!("{APPROVED}\\{group}"))
        .map_err(|e| if h == "hkcu" { format!("Não foi possível alterar: {e}") } else { "Este item vale para todos os usuários e exige o Organizador como administrador.".into() })?;
    let mut bytes = vec![if enabled { 2u8 } else { 3u8 }, 0, 0, 0];
    let filetime: u64 = if enabled { 0 } else { (crate::model::now_ms().max(0) as u64) * 10_000 + 116_444_736_000_000_000 };
    bytes.extend_from_slice(&filetime.to_le_bytes());
    key.set_raw_value(value, &RegValue { bytes: bytes.into(), vtype: REG_BINARY })
        .map_err(|e| if h == "hkcu" { format!("Não foi possível alterar: {e}") } else { "Este item vale para todos os usuários e exige o Organizador como administrador.".into() })
}

const UNINSTALL: &str = r"Software\Microsoft\Windows\CurrentVersion\Uninstall";
const UNINSTALL32: &str = r"Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall";

/// Programas instalados (mesma fonte de "Aplicativos instalados" do Windows).
pub fn installed_programs() -> Vec<InstalledProgram> {
    let mut out: Vec<InstalledProgram> = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for (h, path, src) in [("hklm", UNINSTALL, "hklm"), ("hklm", UNINSTALL32, "hklm32"), ("hkcu", UNINSTALL, "hkcu")] {
        let Ok(root) = hive(h).open_subkey_with_flags(path, KEY_READ | KEY_WOW64_64KEY) else { continue };
        for keyname in root.enum_keys().flatten() {
            let Ok(k) = root.open_subkey_with_flags(&keyname, KEY_READ) else { continue };
            let name: String = match k.get_value("DisplayName") {
                Ok(n) => n,
                Err(_) => continue,
            };
            let name = name.trim().to_string();
            if name.is_empty() {
                continue;
            }
            let system: u32 = k.get_value("SystemComponent").unwrap_or(0);
            let parent: Result<String, _> = k.get_value("ParentKeyName");
            let release: String = k.get_value("ReleaseType").unwrap_or_default();
            if system == 1 || parent.is_ok() || ["Update", "Hotfix", "Security Update"].contains(&release.as_str()) {
                continue;
            }
            let version: String = k.get_value("DisplayVersion").unwrap_or_default();
            if !seen.insert(format!("{}|{}", name.to_lowercase(), version)) {
                continue;
            }
            let uninstall: Option<String> = k.get_value("UninstallString").ok().filter(|s: &String| !s.trim().is_empty());
            let date: String = k.get_value("InstallDate").unwrap_or_default();
            let install_date = if date.len() == 8 && date.chars().all(|c| c.is_ascii_digit()) {
                Some(format!("{}-{}-{}", &date[..4], &date[4..6], &date[6..8]))
            } else {
                None
            };
            let size_kb: u32 = k.get_value("EstimatedSize").unwrap_or(0);
            out.push(InstalledProgram {
                id: format!("{src}|{keyname}"),
                name,
                publisher: k.get_value("Publisher").ok().filter(|s: &String| !s.trim().is_empty()),
                version: if version.is_empty() { None } else { Some(version) },
                install_date,
                size: if size_kb > 0 { Some(size_kb as u64 * 1024) } else { None },
                location: k.get_value("InstallLocation").ok().filter(|s: &String| !s.trim().is_empty()),
                can_uninstall: uninstall.is_some(),
                scope: if h == "hkcu" { "user".into() } else { "machine".into() },
            });
        }
    }
    out.sort_by_key(|p| p.name.to_lowercase());
    out
}

/// Abre o desinstalador do programa (o próprio programa conduz a remoção).
pub fn uninstall_program(id: &str) -> Result<(), String> {
    let (src, keyname) = id.split_once('|').ok_or("Programa inválido.")?;
    let (h, path) = match src {
        "hklm" => ("hklm", UNINSTALL),
        "hklm32" => ("hklm", UNINSTALL32),
        _ => ("hkcu", UNINSTALL),
    };
    let k = hive(h)
        .open_subkey_with_flags(format!("{path}\\{keyname}"), KEY_READ | KEY_WOW64_64KEY)
        .map_err(|_| "O programa não foi encontrado (talvez já tenha sido removido).".to_string())?;
    let cmd: String = k.get_value("UninstallString").map_err(|_| "Este programa não informa um desinstalador.".to_string())?;
    let (exe, args) = split_command(&cmd);
    shell_execute(&exe, if args.is_empty() { None } else { Some(&args) }, None)
}

/// Ferramentas do Windows que complementam o Organizador.
pub fn launch_tool(id: &str) -> Result<(), String> {
    let target = match id {
        "cleanmgr" => "cleanmgr.exe",
        "dfrgui" => "dfrgui.exe",
        "taskmgr" => "taskmgr.exe",
        "resmon" => "resmon.exe",
        "msinfo32" => "msinfo32.exe",
        "storage" => "ms-settings:storagesense",
        "apps" => "ms-settings:appsfeatures",
        "startup-apps" => "ms-settings:startupapps",
        "windowsupdate" => "ms-settings:windowsupdate",
        "defender" => "windowsdefender:",
        "power" => "powercfg.cpl",
        "recyclebin" => "shell:RecycleBinFolder",
        _ => return Err("Ferramenta desconhecida.".into()),
    };
    shell_execute(target, None, None)
}

const SELF_RUN_NAME: &str = "Organizador";

/// O Organizador está configurado para iniciar com o Windows?
pub fn self_autostart() -> bool {
    hive("hkcu")
        .open_subkey_with_flags(RUN, KEY_READ)
        .and_then(|k| k.get_value::<String, _>(SELF_RUN_NAME))
        .is_ok()
}

pub fn set_self_autostart(enabled: bool) -> Result<(), String> {
    let (key, _) = hive("hkcu").create_subkey(RUN).map_err(|e| e.to_string())?;
    if enabled {
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        key.set_value(SELF_RUN_NAME, &format!("\"{}\" --inicializacao", exe.to_string_lossy())).map_err(|e| e.to_string())
    } else {
        match key.delete_value(SELF_RUN_NAME) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    }
}
