#!/usr/bin/env bash

local MINER_API_PORT=3110

stats_raw=$(curl --connect-timeout 2 --max-time $API_TIMEOUT --silent --noproxy '*' http://localhost:${MINER_API_PORT}/api)
if [[ $? -ne 0  || -z $stats_raw ]]
then
  echo -e "${YELLOW}Failed to read $miner stats from localhost:${MINER_API_PORT}${NOCOLOR}"
else
  local temp=$(jq '.temp' <<< $gpu_stats)
  local fan=$(jq '.fan' <<< $gpu_stats)

  [[ $cpu_indexes_array != '[]' ]] && #remove Internal Gpus
    temp=$(jq -c "del(.$cpu_indexes_array)" <<< $temp) &&
    fan=$(jq -c "del(.$cpu_indexes_array)" <<< $fan)

  stats=$(jq -c --argjson temp "$temp" \
                --argjson fan "$fan" \
                '{ total_khs: (.totalHashrate / 1000 | floor), hs: (.hashrates | map(. // 0 | floor)), hs_units: "hs", $temp, $fan, uptime, ver: .version[9:], ar: [.shares - .errors, .errors], algo: "argon2d-nim"}' <<< "$stats_raw")
  khs=$(jq -r '.total_khs' <<< "$stats")
fi

[[ -z $stats ]] && stats="null"
[[ -z $khs ]] && khs=0
