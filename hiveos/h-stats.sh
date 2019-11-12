#!/usr/bin/env bash

. /hive/miners/custom/$CUSTOM_MINER/h-manifest.conf

local API_URL="http://localhost:3110/api"

stats=$(curl -s "$API_URL" | jq -c --argjson gpu_stats "$gpu_stats" '{ total_khs: (.totalHashrate / 1000), hs: (.hashrates | map(. / 1000)), hs_units: "khs", temp: $gpu_stats.temp, fan: $gpu_stats.fan, uptime, ver: .version, ar: [.shares - .errors, .errors], algo: "argon2d-nim" }')
khs=$(jq -r '.total_khs' <<< "$stats")

[[ -z $stats ]] && stats="null"
[[ -z $khs ]] && khs=0
