//! Deterministic telemetry capture and local persistence.

use std::collections::VecDeque;
use std::fs::{create_dir_all, File, OpenOptions};
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct MemorySnapshot {
    pub used_bytes: u64,
    pub safe_threshold_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DeviceProfileSnapshot {
    pub device_hash: String,
    pub cpu_arch: String,
    pub memory_total_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RequestTelemetry {
    pub request_id: String,
    pub timestamp_ms: u64,
    pub task_type: String,
    pub input_size: usize,
    pub selected_provider: String,
    pub rejected_providers: Vec<String>,
    pub latency_ms: u64,
    pub cost_usd_micros: Option<u64>,
    pub success: bool,
    pub degraded: bool,
    pub timeout: bool,
    pub tokens_used: Option<u64>,
    pub memory_snapshot: Option<MemorySnapshot>,
    pub device_profile: Option<DeviceProfileSnapshot>,
}

#[derive(Debug, Clone)]
pub struct TelemetryConfig {
    pub jsonl_path: PathBuf,
    pub rolling_window_size: usize,
    pub archive_path: Option<PathBuf>,
}

impl Default for TelemetryConfig {
    fn default() -> Self {
        Self {
            jsonl_path: PathBuf::from("./var/telemetry/requests.jsonl"),
            rolling_window_size: 100,
            archive_path: None,
        }
    }
}

#[derive(Debug, Error)]
pub enum TelemetryError {
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("serialize error: {0}")]
    Serialize(#[from] serde_json::Error),
}

pub struct TelemetryEngine {
    config: TelemetryConfig,
    rolling: VecDeque<RequestTelemetry>,
}

impl TelemetryEngine {
    pub fn new(config: TelemetryConfig) -> Result<Self, TelemetryError> {
        if let Some(parent) = config.jsonl_path.parent() {
            create_dir_all(parent)?;
        }
        if let Some(path) = &config.archive_path {
            if let Some(parent) = path.parent() {
                create_dir_all(parent)?;
            }
        }

        Ok(Self {
            rolling: VecDeque::with_capacity(config.rolling_window_size),
            config,
        })
    }

    pub fn record(&mut self, event: RequestTelemetry) -> Result<(), TelemetryError> {
        let file = OpenOptions::new()
            .append(true)
            .create(true)
            .open(&self.config.jsonl_path)?;

        let mut writer = BufWriter::new(file);
        serde_json::to_writer(&mut writer, &event)?;
        writer.write_all(b"\n")?;
        writer.flush()?;

        self.rolling.push_back(event);
        while self.rolling.len() > self.config.rolling_window_size {
            self.rolling.pop_front();
        }
        Ok(())
    }

    pub fn rolling_window(&self) -> &VecDeque<RequestTelemetry> {
        &self.rolling
    }

    pub fn load_jsonl(path: &Path) -> Result<Vec<RequestTelemetry>, TelemetryError> {
        if !path.exists() {
            return Ok(vec![]);
        }
        let raw = std::fs::read_to_string(path)?;
        let mut events = Vec::new();
        for line in raw.lines().filter(|line| !line.trim().is_empty()) {
            events.push(serde_json::from_str::<RequestTelemetry>(line)?);
        }
        Ok(events)
    }

    #[cfg(feature = "archive")]
    pub fn archive_jsonl(&self) -> Result<Option<PathBuf>, TelemetryError> {
        use flate2::{write::GzEncoder, Compression};

        let Some(archive_path) = &self.config.archive_path else {
            return Ok(None);
        };

        let source = std::fs::read(&self.config.jsonl_path)?;
        let archive_file = File::create(archive_path)?;
        let mut encoder = GzEncoder::new(archive_file, Compression::default());
        encoder.write_all(&source)?;
        encoder.finish()?;
        Ok(Some(archive_path.clone()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn event() -> RequestTelemetry {
        RequestTelemetry {
            request_id: "r1".to_string(),
            timestamp_ms: 1,
            task_type: "chat".to_string(),
            input_size: 12,
            selected_provider: "llama.cpp".to_string(),
            rejected_providers: vec!["cloud-a".to_string()],
            latency_ms: 10,
            cost_usd_micros: Some(10),
            success: true,
            degraded: false,
            timeout: false,
            tokens_used: Some(100),
            memory_snapshot: Some(MemorySnapshot {
                used_bytes: 100,
                safe_threshold_bytes: 200,
            }),
            device_profile: Some(DeviceProfileSnapshot {
                device_hash: "dev".to_string(),
                cpu_arch: "x86_64".to_string(),
                memory_total_bytes: 1024,
            }),
        }
    }

    #[test]
    fn writes_and_reads_jsonl() {
        let dir = std::env::temp_dir().join("sawyer_telemetry_test");
        let _ = std::fs::remove_dir_all(&dir);
        let path = dir.join("requests.jsonl");

        let mut engine = TelemetryEngine::new(TelemetryConfig {
            jsonl_path: path.clone(),
            rolling_window_size: 2,
            archive_path: None,
        })
        .expect("engine");

        engine.record(event()).expect("record");
        let loaded = TelemetryEngine::load_jsonl(&path).expect("load");
        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].request_id, "r1");
    }

    #[test]
    fn rolling_window_respects_size() {
        let dir = std::env::temp_dir().join("sawyer_telemetry_test_win");
        let _ = std::fs::remove_dir_all(&dir);
        let path = dir.join("requests.jsonl");

        let mut engine = TelemetryEngine::new(TelemetryConfig {
            jsonl_path: path,
            rolling_window_size: 2,
            archive_path: None,
        })
        .expect("engine");

        let mut a = event();
        a.request_id = "a".to_string();
        let mut b = event();
        b.request_id = "b".to_string();
        let mut c = event();
        c.request_id = "c".to_string();

        engine.record(a).expect("a");
        engine.record(b).expect("b");
        engine.record(c).expect("c");

        assert_eq!(engine.rolling_window().len(), 2);
        assert_eq!(engine.rolling_window()[0].request_id, "b");
        assert_eq!(engine.rolling_window()[1].request_id, "c");
    }
}
