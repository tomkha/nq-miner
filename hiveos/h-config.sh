#!/usr/bin/env bash
# This code is included in /hive/bin/custom function

[[ -z $CUSTOM_TEMPLATE ]] && echo -e "${YELLOW}CUSTOM_TEMPLATE is empty${NOCOLOR}" && return 1
[[ -z $CUSTOM_URL ]] && echo -e "${YELLOW}CUSTOM_URL is empty${NOCOLOR}" && return 1

CUSTOM_ADDRESS=`echo $CUSTOM_TEMPLATE | cut -d "." -f1`
CUSTOM_WORKER_NAME=`echo $CUSTOM_TEMPLATE | cut -d "." -f2`

# Creating miner.conf contents
conf="--pool $CUSTOM_URL --address '$CUSTOM_ADDRESS' --name '$CUSTOM_WORKER_NAME' ${CUSTOM_USER_CONFIG}"

GPU_COUNT_NVIDIA=`gpu-detect NVIDIA`
if [[ "$GPU_COUNT_NVIDIA" -gt "0" ]]
then
  conf="$conf --type cuda"
else
  conf="$conf --type opencl"
fi

[[ -z $CUSTOM_CONFIG_FILENAME ]] && echo -e "${RED}No CUSTOM_CONFIG_FILENAME is set${NOCOLOR}" && return 1
echo "$conf" > $CUSTOM_CONFIG_FILENAME
