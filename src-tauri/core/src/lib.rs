//! Núcleo do Organizador: toda a lógica de arquivos, varredura, limpeza e
//! sistema, sem dependência do Tauri (testável em qualquer plataforma).

pub mod fsops;
pub mod model;
pub mod natural;
pub mod progress;
pub mod query;
pub mod safety;
pub mod scan;
pub mod platform;
pub mod sys;
pub mod trashbin;
pub mod health;
pub mod cleanup;
pub mod diskmap;
pub mod duplicates;
pub mod rules;
