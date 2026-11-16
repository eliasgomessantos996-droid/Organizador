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
