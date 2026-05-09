use std::collections::{BTreeMap, BTreeSet};
use std::fs::{File, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Scope {
    Global,
    Device,
    Session,
    User,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KBVar {
    pub key: String,
    pub value: Value,
    pub scope: Scope,
    pub timestamp: u64,
    pub confidence: f32,
}

#[derive(Debug)]
pub struct KBStore {
    vars: BTreeMap<String, KBVar>,
    index: BTreeMap<String, BTreeSet<String>>,
    log_path: Option<PathBuf>,
}

impl Default for KBStore {
    fn default() -> Self {
        Self::new()
    }
}

impl KBStore {
    pub fn new() -> Self {
        Self {
            vars: BTreeMap::new(),
            index: BTreeMap::new(),
            log_path: None,
        }
    }

    pub fn with_jsonl(path: impl AsRef<Path>) -> std::io::Result<Self> {
        let path = path.as_ref().to_path_buf();
        let mut store = Self {
            vars: BTreeMap::new(),
            index: BTreeMap::new(),
            log_path: Some(path.clone()),
        };
        if path.exists() {
            store.load_from_jsonl(&path)?;
        }
        Ok(store)
    }

    pub fn set(&mut self, key: &str, value: Value, scope: Scope, confidence: f32) -> bool {
        let timestamp = now_unix_secs();
        self.set_with_timestamp(key, value, scope, confidence, timestamp)
    }

    pub fn set_with_timestamp(
        &mut self,
        key: &str,
        value: Value,
        scope: Scope,
        confidence: f32,
        timestamp: u64,
    ) -> bool {
        let candidate = KBVar {
            key: key.to_string(),
            value,
            scope,
            timestamp,
            confidence,
        };
        let accepted = self.upsert(candidate.clone());
        if accepted {
            self.append_jsonl(&candidate)
                .expect("failed to append kb record");
        }
        accepted
    }

    pub fn get(&self, key: &str) -> Option<&KBVar> {
        self.vars.get(key)
    }

    pub fn list(&self) -> Vec<&KBVar> {
        self.vars.values().collect()
    }

    pub fn fuzzy_get(&self, query: &str) -> Option<&KBVar> {
        let query_tokens = tokens(query);
        if query_tokens.is_empty() {
            return None;
        }

        let mut best: Option<(&str, usize, f32, u64)> = None;

        for token in &query_tokens {
            if let Some(keys) = self.index.get(token) {
                for key in keys {
                    if let Some(var) = self.vars.get(key) {
                        let var_tokens = tokens_for_var(var);
                        let overlap = query_tokens.intersection(&var_tokens).count();
                        let candidate = (key.as_str(), overlap, var.confidence, var.timestamp);
                        match best {
                            None => best = Some(candidate),
                            Some(current) => {
                                if candidate.1 > current.1
                                    || (candidate.1 == current.1 && candidate.2 > current.2)
                                    || (candidate.1 == current.1
                                        && (candidate.2 - current.2).abs() < f32::EPSILON
                                        && candidate.3 > current.3)
                                    || (candidate.1 == current.1
                                        && (candidate.2 - current.2).abs() < f32::EPSILON
                                        && candidate.3 == current.3
                                        && candidate.0 < current.0)
                                {
                                    best = Some(candidate);
                                }
                            }
                        }
                    }
                }
            }
        }

        best.and_then(|(k, score, _, _)| if score > 0 { self.vars.get(k) } else { None })
    }

    fn upsert(&mut self, candidate: KBVar) -> bool {
        let should_write = match self.vars.get(&candidate.key) {
            None => true,
            Some(existing) => {
                candidate.timestamp > existing.timestamp
                    || candidate.confidence > existing.confidence
            }
        };

        if should_write {
            self.vars.insert(candidate.key.clone(), candidate.clone());
            self.reindex_key(&candidate.key);
            true
        } else {
            false
        }
    }

    fn load_from_jsonl(&mut self, path: &Path) -> std::io::Result<()> {
        let file = File::open(path)?;
        let reader = BufReader::new(file);
        for line in reader.lines() {
            let line = line?;
            if line.trim().is_empty() {
                continue;
            }
            if let Ok(record) = serde_json::from_str::<KBVar>(&line) {
                let _ = self.upsert(record);
            }
        }
        Ok(())
    }

    fn append_jsonl(&self, var: &KBVar) -> std::io::Result<()> {
        let Some(path) = &self.log_path else {
            return Ok(());
        };
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let mut f = OpenOptions::new().create(true).append(true).open(path)?;
        let row = serde_json::to_string(var)?;
        writeln!(f, "{row}")?;
        Ok(())
    }

    fn reindex_key(&mut self, key: &str) {
        for keys in self.index.values_mut() {
            keys.remove(key);
        }
        if let Some(var) = self.vars.get(key) {
            for token in tokens_for_var(var) {
                self.index.entry(token).or_default().insert(key.to_string());
            }
        }
    }
}

fn now_unix_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn tokens_for_var(var: &KBVar) -> BTreeSet<String> {
    let mut out = tokens(&var.key);
    out.extend(tokens(&var.value.to_string()));
    out
}

fn tokens(input: &str) -> BTreeSet<String> {
    input
        .split(|c: char| !c.is_alphanumeric())
        .filter(|t| !t.is_empty())
        .map(|t| t.to_ascii_lowercase())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn set_get_and_overwrite_rules() {
        let mut kb = KBStore::new();
        assert!(kb.set_with_timestamp("a", json!(1), Scope::Global, 0.4, 10));
        assert!(!kb.set_with_timestamp("a", json!(2), Scope::Global, 0.3, 9));
        assert!(kb.set_with_timestamp("a", json!(3), Scope::Global, 0.9, 9));
        assert_eq!(kb.get("a").expect("kb").value, json!(3));
    }

    #[test]
    fn persistence_roundtrip_jsonl() {
        let path = std::env::temp_dir().join(format!("sawyer-kb-{}.jsonl", std::process::id()));
        let _ = std::fs::remove_file(&path);
        {
            let mut kb = KBStore::with_jsonl(&path).expect("create");
            assert!(kb.set_with_timestamp("user.name", json!("sam"), Scope::User, 0.8, 11));
            assert!(kb.set_with_timestamp("device.mode", json!("edge"), Scope::Device, 0.7, 12));
        }
        let kb2 = KBStore::with_jsonl(&path).expect("load");
        let _ = std::fs::remove_file(&path);
        assert_eq!(kb2.get("user.name").expect("present").value, json!("sam"));
        assert_eq!(kb2.list().len(), 2);
    }

    #[test]
    fn fuzzy_get_uses_overlap_and_confidence() {
        let mut kb = KBStore::new();
        kb.set_with_timestamp("profile.favorite.color", json!("blue"), Scope::User, 0.6, 1);
        kb.set_with_timestamp(
            "profile.favorite.food",
            json!("blueberry pie"),
            Scope::User,
            0.9,
            1,
        );
        let found = kb.fuzzy_get("favorite blueberry").expect("match");
        assert_eq!(found.key, "profile.favorite.food");
    }
}
