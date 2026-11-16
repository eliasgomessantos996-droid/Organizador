//! Ordenação "natural" de nomes, como no Explorer do Windows:
//! "foto2" vem antes de "foto10", sem diferenciar maiúsculas e acentos.

use std::cmp::Ordering;

/// Remove acentos comuns do português e converte para minúsculas.
pub fn fold_char(c: char) -> char {
    if c.is_ascii() {
        return c.to_ascii_lowercase();
    }
    match c {
        'á' | 'à' | 'â' | 'ã' | 'ä' | 'å' | 'Á' | 'À' | 'Â' | 'Ã' | 'Ä' | 'Å' => 'a',
        'é' | 'è' | 'ê' | 'ë' | 'É' | 'È' | 'Ê' | 'Ë' => 'e',
        'í' | 'ì' | 'î' | 'ï' | 'Í' | 'Ì' | 'Î' | 'Ï' => 'i',
        'ó' | 'ò' | 'ô' | 'õ' | 'ö' | 'Ó' | 'Ò' | 'Ô' | 'Õ' | 'Ö' => 'o',
        'ú' | 'ù' | 'û' | 'ü' | 'Ú' | 'Ù' | 'Û' | 'Ü' => 'u',
        'ç' | 'Ç' => 'c',
        'ñ' | 'Ñ' => 'n',
        _ => c.to_lowercase().next().unwrap_or(c),
    }
}

/// Versão "dobrada" de um texto (minúsculas e sem acentos), para buscas.
pub fn fold(s: &str) -> String {
    s.chars().map(fold_char).collect()
}

fn trim_zeros(d: &[u8]) -> &[u8] {
    let mut i = 0;
    while i + 1 < d.len() && d[i] == b'0' {
        i += 1;
    }
    &d[i..]
}

/// Compara dois nomes em ordem natural.
pub fn natural_cmp(a: &str, b: &str) -> Ordering {
    let (ab, bb) = (a.as_bytes(), b.as_bytes());
    let (mut i, mut j) = (0usize, 0usize);
    while i < ab.len() && j < bb.len() {
        let (ca, cb) = (ab[i], bb[j]);
        if ca.is_ascii_digit() && cb.is_ascii_digit() {
            let si = i;
            while i < ab.len() && ab[i].is_ascii_digit() {
                i += 1;
            }
            let sj = j;
            while j < bb.len() && bb[j].is_ascii_digit() {
                j += 1;
            }
            let na = trim_zeros(&ab[si..i]);
            let nb = trim_zeros(&bb[sj..j]);
            let o = na.len().cmp(&nb.len()).then_with(|| na.cmp(nb));
            if o != Ordering::Equal {
                return o;
            }
        } else {
            // i e j estão sempre em limites de caractere.
            let ch_a = a[i..].chars().next().unwrap_or('\0');
            let ch_b = b[j..].chars().next().unwrap_or('\0');
            let (fa, fb) = (fold_char(ch_a), fold_char(ch_b));
            if fa != fb {
                return fa.cmp(&fb);
            }
            i += ch_a.len_utf8();
            j += ch_b.len_utf8();
        }
    }
    (ab.len() - i).cmp(&(bb.len() - j)).then_with(|| a.cmp(b))
}

/// Coringas do Windows (* e ?) sobre textos já "dobrados".
pub fn wildcard_match(pattern: &str, text: &str) -> bool {
    let p: Vec<char> = pattern.chars().collect();
    let t: Vec<char> = text.chars().collect();
    let (mut pi, mut ti) = (0usize, 0usize);
    let (mut star, mut mark) = (None::<usize>, 0usize);
    while ti < t.len() {
        if pi < p.len() && (p[pi] == '?' || p[pi] == t[ti]) {
            pi += 1;
            ti += 1;
        } else if pi < p.len() && p[pi] == '*' {
            star = Some(pi);
            mark = ti;
            pi += 1;
        } else if let Some(s) = star {
            pi = s + 1;
            mark += 1;
            ti = mark;
        } else {
            return false;
        }
    }
    while pi < p.len() && p[pi] == '*' {
        pi += 1;
    }
    pi == p.len()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn numeros_em_ordem_natural() {
        let mut v = vec!["foto10.jpg", "foto2.jpg", "Foto1.jpg", "foto002.jpg", "álbum", "Album 3", "zebra"];
        v.sort_by(|a, b| natural_cmp(a, b));
        assert_eq!(v, vec!["álbum", "Album 3", "Foto1.jpg", "foto002.jpg", "foto2.jpg", "foto10.jpg", "zebra"]);
    }

    #[test]
    fn ignora_maiusculas_e_acentos() {
        assert_eq!(natural_cmp("Relatório", "relatorio"), "Relatório".cmp("relatorio"));
        assert_ne!(natural_cmp("a", "B"), Ordering::Greater);
        assert_eq!(fold("Ação Ÿ"), "acao ÿ");
    }

    #[test]
    fn coringas() {
        assert!(wildcard_match("*.pdf", "contrato.pdf"));
        assert!(wildcard_match("foto??.jpg", "foto12.jpg"));
        assert!(!wildcard_match("foto??.jpg", "foto1.jpg"));
        assert!(wildcard_match("*rel*2024*", "meu relatorio 2024 final"));
        assert!(!wildcard_match("*.doc", "a.docx"));
    }
}
