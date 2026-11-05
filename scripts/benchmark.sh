#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p reports
start=$(date +%s%N)
for i in $(seq 1 "${1:-10}"); do curl -fsS "http://localhost:8080/api/public/trace/LOT-DEMO-001" >/dev/null; done
end=$(date +%s%N)
elapsed=$(( (end-start) / 1000000 ))
printf 'metric,value\nrequests,%s\nelapsed_ms,%s\nthroughput_req_per_sec,%.3f\n' "${1:-10}" "$elapsed" "$(awk "BEGIN {print ${1:-10} / ($elapsed / 1000)}")" > reports/benchmark.csv
throughput=$(awk "BEGIN {print ${1:-10} / ($elapsed / 1000)}")
cat > reports/benchmark.svg <<EOF
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="240" role="img">
<text x="24" y="32" font-family="sans-serif" font-size="20">TraceChain benchmark</text>
<rect x="24" y="70" width="$(awk "BEGIN {print 560 * ($throughput / ($throughput + 100))}")" height="42" fill="#2563eb"/>
<text x="24" y="145" font-family="sans-serif">Throughput: ${throughput} requests/s</text>
<text x="24" y="175" font-family="sans-serif">Requests: ${1:-10} · elapsed: ${elapsed} ms</text>
</svg>
EOF
cat reports/benchmark.csv
