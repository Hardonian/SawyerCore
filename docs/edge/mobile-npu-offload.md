# Mobile/NPU Offload Path

## IMPLEMENTED
- Mobile node registration + heartbeat.
- NPU eligibility checks with battery/thermal safe degrade behavior.
- Mobile-compatible task classes and preload sync plan.

## STUBBED
- Android ONNX Runtime / Qualcomm runtime invocation.

## CONFIG-DEPENDENT
- `enable_mobile_npu`, battery/thermal toggles.

## FUTURE
- Real Android deployment agent and secured model sync channel.
