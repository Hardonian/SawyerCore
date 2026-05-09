export var OfflineSupportLevel;
(function (OfflineSupportLevel) {
    OfflineSupportLevel["FULL"] = "FULL";
    OfflineSupportLevel["PARTIAL"] = "PARTIAL";
    OfflineSupportLevel["NONE"] = "NONE";
    OfflineSupportLevel["DEGRADED"] = "DEGRADED"; // Falls back to simpler model/logic
})(OfflineSupportLevel || (OfflineSupportLevel = {}));
