//! CPU, memory and GPU load for the System tab. CPU and RAM come from
//! `sysinfo`; NVIDIA GPUs are read through `nvidia-smi`, which ships with the driver.

use std::sync::Mutex;

use serde::Serialize;
use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Gpu {
    pub name: String,
    pub load: f64,
    pub mem_used_mb: f64,
    pub mem_total_mb: f64,
    pub temp_c: Option<f64>,
    pub power_w: Option<f64>,
    pub power_limit_w: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Proc {
    pub name: String,
    pub pid: u32,
    pub cpu: f64,
    pub mem_mb: f64,
    /// VRAM held on the GPU, when the driver reports it.
    pub gpu_mem_mb: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Stats {
    pub cpu_name: String,
    pub cpu: f64,
    pub cores: Vec<f64>,
    pub mem_used_gb: f64,
    pub mem_total_gb: f64,
    pub swap_used_gb: f64,
    pub swap_total_gb: f64,
    pub gpus: Vec<Gpu>,
    /// Why GPU stats are missing, if they are.
    pub gpu_note: Option<String>,
    pub top: Vec<Proc>,
}

/// CPU usage is a delta between two reads, so the same `System` lives across calls.
static SYS: Mutex<Option<System>> = Mutex::new(None);

const GB: f64 = 1024.0 * 1024.0 * 1024.0;

fn nvidia_smi(args: &[&str]) -> Option<String> {
    let mut cmd = std::process::Command::new("nvidia-smi");
    cmd.args(args);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW: a console app would flash a window every poll.
        cmd.creation_flags(0x0800_0000);
    }
    let out = cmd.output().ok()?;
    out.status.success().then(|| String::from_utf8_lossy(&out.stdout).into_owned())
}

fn field(s: &str) -> Option<f64> {
    s.trim().trim_end_matches(" %").trim_end_matches(" W").parse().ok()
}

fn gpus() -> (Vec<Gpu>, Vec<(u32, f64)>) {
    let Some(text) = nvidia_smi(&[
        "--query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw,power.limit",
        "--format=csv,noheader,nounits",
    ]) else {
        return (vec![], vec![]);
    };
    let list = text
        .lines()
        .filter_map(|l| {
            let f: Vec<&str> = l.split(',').collect();
            Some(Gpu {
                name: f.first()?.trim().to_string(),
                load: field(f.get(1)?)?,
                mem_used_mb: field(f.get(2)?)?,
                mem_total_mb: field(f.get(3)?)?,
                temp_c: f.get(4).and_then(|v| field(v)),
                power_w: f.get(5).and_then(|v| field(v)),
                power_limit_w: f.get(6).and_then(|v| field(v)),
            })
        })
        .collect();
    let apps = nvidia_smi(&["--query-compute-apps=pid,used_memory", "--format=csv,noheader,nounits"])
        .unwrap_or_default()
        .lines()
        .filter_map(|l| {
            let (pid, mem) = l.split_once(',')?;
            Some((pid.trim().parse().ok()?, field(mem)?))
        })
        .collect();
    (list, apps)
}

pub fn stats() -> Stats {
    let mut guard = SYS.lock().unwrap_or_else(|e| e.into_inner());
    let first = guard.is_none();
    let sys = guard.get_or_insert_with(System::new);
    sys.refresh_cpu_usage();
    if first {
        // The first CPU read has nothing to compare against.
        std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
        sys.refresh_cpu_usage();
    }
    sys.refresh_memory();
    sys.refresh_processes_specifics(
        ProcessesToUpdate::All,
        true,
        ProcessRefreshKind::nothing().with_cpu().with_memory(),
    );

    let (gpus, gpu_apps) = gpus();
    let cpu_count = sys.cpus().len().max(1) as f64;

    // Merge processes by name so e.g. 30 browser helpers show as one row.
    let mut merged: std::collections::HashMap<String, Proc> = std::collections::HashMap::new();
    for (pid, p) in sys.processes() {
        let name = p.name().to_string_lossy().trim_end_matches(".exe").to_string();
        let gpu = gpu_apps.iter().find(|(id, _)| *id == pid.as_u32()).map(|(_, m)| *m);
        let e = merged.entry(name.clone()).or_insert(Proc { name, pid: pid.as_u32(), cpu: 0.0, mem_mb: 0.0, gpu_mem_mb: None });
        e.cpu += p.cpu_usage() as f64 / cpu_count;
        e.mem_mb += p.memory() as f64 / 1024.0 / 1024.0;
        if let Some(g) = gpu {
            e.gpu_mem_mb = Some(e.gpu_mem_mb.unwrap_or(0.0) + g);
        }
    }
    let mut top: Vec<Proc> = merged.into_values().filter(|p| p.name != "System Idle Process").collect();
    top.sort_by(|a, b| {
        let score = |p: &Proc| p.mem_mb + p.cpu * 200.0 + p.gpu_mem_mb.unwrap_or(0.0);
        score(b).total_cmp(&score(a))
    });
    top.truncate(8);

    Stats {
        cpu_name: sys.cpus().first().map(|c| c.brand().trim().to_string()).unwrap_or_default(),
        cpu: sys.global_cpu_usage() as f64,
        cores: sys.cpus().iter().map(|c| c.cpu_usage() as f64).collect(),
        mem_used_gb: sys.used_memory() as f64 / GB,
        mem_total_gb: sys.total_memory() as f64 / GB,
        swap_used_gb: sys.used_swap() as f64 / GB,
        swap_total_gb: sys.total_swap() as f64 / GB,
        gpu_note: gpus.is_empty().then(|| "GPU stats need an NVIDIA GPU with nvidia-smi.".to_string()),
        gpus,
        top,
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn reads_this_machine() {
        let s = super::stats();
        eprintln!(
            "cpu {:.0}% ({} cores, {}) ram {:.1}/{:.1} GB gpus {:?}",
            s.cpu,
            s.cores.len(),
            s.cpu_name,
            s.mem_used_gb,
            s.mem_total_gb,
            s.gpus.iter().map(|g| format!("{} {:.0}% {:.0}/{:.0} MB", g.name, g.load, g.mem_used_mb, g.mem_total_mb)).collect::<Vec<_>>()
        );
        for p in &s.top {
            eprintln!("  {:24} cpu {:5.1}% mem {:7.0} MB gpu {:?}", p.name, p.cpu, p.mem_mb, p.gpu_mem_mb);
        }
        assert!(s.mem_total_gb > 0.0 && !s.cores.is_empty());
    }
}
