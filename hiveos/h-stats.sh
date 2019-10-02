#!/usr/bin/env bash

#######################
# Functions
#######################

get_cards_hashes(){
        # hs is global
        hs=''
        local offset=9

        for (( i=0; i < ${GPU_COUNT}; i++ )); do
                local card_hash=`cat $LOG_NAME | grep -a "GPU" | tail -n 1 | awk -v offset="$offset" '{ printf $offset"\n" }'`
                hs[$i]=`echo $card_hash`
                let offset+=4
        done
}

get_miner_uptime(){
        ps -o etimes= -C $CUSTOM_NAME | awk '{print $1}'
}

get_log_time_diff(){
        local last_log=`cat $LOG_NAME | grep -a "NQMiner:" |  tail -n 1 | awk {'print $1,$2'} | sed 's/[][]//g' | sed -r 's/^.{2}//'`
        local last_log_unix=`date --date="$last_log" +%s`
        local cur_time_unix=`date +%s`
        echo `expr $cur_time_unix - $last_log_unix`
}

#######################
# MAIN script body
#######################

. /hive/miners/custom/$CUSTOM_MINER/h-manifest.conf

local LOG_NAME="$CUSTOM_LOG_BASENAME.log"

[[ -z $GPU_COUNT_NVIDIA ]] &&
    GPU_COUNT_NVIDIA=`gpu-detect NVIDIA`
[[ -z $GPU_COUNT_AMD ]] &&
    GPU_COUNT_AMD=`gpu-detect AMD`

# Calculate total GPU amount
GPU_COUNT=`expr $GPU_COUNT_NVIDIA + $GPU_COUNT_AMD`

# Calculate log freshness
local diffTime=$(get_log_time_diff)
local maxDelay=60

# If log is fresh the calc miner stats or set to null if not
if [ "$diffTime" -lt "$maxDelay" ]; then
        # Per-card hashes array
        get_cards_hashes       
        # Hashes units
        local hs_units='khs'
        # Get temp and fan of GPUs from $gpu_stats
        local temp=$(jq -c "[.temp$nvidia_indexes_array]" <<< $gpu_stats)
        local fan=$(jq -c "[.fan$nvidia_indexes_array]" <<< $gpu_stats)          
        # Miner uptime
        local uptime=$(get_miner_uptime)
        # Mining algorithm
        local algo="argon2d-nim"

        # Amount of A/R shares (by pool)
        local ac=`cat $LOG_NAME | grep -c "Found share"`
        local rj=`cat $LOG_NAME | grep -c "invalid share"`
        
        # create JSON 
        stats=$(jq -nc \
                                --argjson hs "`echo ${hs[@]} | tr " " "\n" | jq -cs '.'`" \
                                --arg hs_units "$hs_units" \
                                --argjson temp "$temp" \
                                --argjson fan "$fan" \
                                --arg uptime "$uptime" \
                                --arg ac "$ac" \
                                --arg rj "$rj" \
                                --arg algo "$algo" \
                                '{$hs, $hs_units, $temp, $fan, $uptime, ar: [$ac, $rj], $algo}')
        # Hold total hashes, summing up elements of hs
        khs=$(awk 'BEGIN {sum=0; for (i in ARGV) sum+=ARGV[i]; print sum}' "${hs[@]}")
else
        # If log is old, don't send anything, miner crashed
        stats=""
        khs=0
fi

