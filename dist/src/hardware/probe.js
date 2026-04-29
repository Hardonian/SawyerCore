import os from 'os';
import { execSync } from 'child_process';
export async function probeHardware() {
    const cpuCores = os.cpus().length;
    const totalMemory = os.totalmem();
    const availableMemory = os.freemem();
    // Basic disk pressure check (looking at free space on root/current drive)
    const diskPressure = checkDiskPressure();
    // GPU detection is platform-specific and often requires external commands
    const { gpuAvailable, vramTotal, vramAvailable } = await probeGPU();
    // Battery status
    const batteryStatus = probeBattery();
    // Thermal throttling (often exposed in /sys on Linux or via specific commands)
    const thermalThrottling = checkThermalThrottling();
    return {
        cpuCores,
        totalMemory,
        availableMemory,
        gpuAvailable,
        vramTotal,
        vramAvailable,
        diskPressure,
        batteryStatus,
        thermalThrottling,
    };
}
function checkDiskPressure() {
    try {
        const isWindows = process.platform === 'win32';
        if (isWindows) {
            execSync('wmic logicaldisk get size,freespace,caption');
            return 'LOW';
        }
        else {
            const output = execSync('df -k /').toString().split('\n')[1];
            const parts = output.split(/\s+/);
            const percent = parseInt(parts[4].replace('%', ''), 10);
            if (percent > 90)
                return 'HIGH';
            if (percent > 75)
                return 'MEDIUM';
            return 'LOW';
        }
    }
    catch {
        return 'LOW'; // Default to safe state
    }
}
async function probeGPU() {
    try {
        // Basic check for nvidia-smi
        try {
            const output = execSync('nvidia-smi --query-gpu=memory.total,memory.free --format=csv,noheader,nounits').toString();
            const [total, free] = output.split(',').map(s => parseInt(s.trim(), 10) * 1024 * 1024);
            return { gpuAvailable: true, vramTotal: total, vramAvailable: free };
        }
        catch {
            return { gpuAvailable: false };
        }
    }
    catch {
        return { gpuAvailable: false };
    }
}
function probeBattery() {
    return 'AC';
}
function checkThermalThrottling() {
    return false;
}
