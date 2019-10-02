#!/usr/bin/env bash
# This code is included in /hive/bin/custom function

[[ -z $CUSTOM_TEMPLATE ]] && echo -e "${YELLOW}CUSTOM_TEMPLATE is empty${NOCOLOR}" && return 1
[[ -z $CUSTOM_URL ]] && echo -e "${YELLOW}CUSTOM_URL is empty${NOCOLOR}" && return 1

CUSTOM_DOMAIN=`echo $CUSTOM_URL | cut -d ":" -f1`
CUSTOM_PORT=`echo $CUSTOM_URL | cut -d ":" -f2`
CUSTOM_ADDRESS=`echo $CUSTOM_TEMPLATE | cut -d "." -f1`
CUSTOM_WORKER_NAME=`echo $CUSTOM_TEMPLATE | cut -d "." -f2`

# Creating miner.conf contents
conf="{
    // Wallet address
    \"address\": \"${CUSTOM_ADDRESS}\",

    // Pool server
    \"host\": \"${CUSTOM_DOMAIN}\",

    // Pool port
    \"port\": \"${CUSTOM_PORT}\",

    // Device name to show in the dashboard
    \"name\": \"${CUSTOM_WORKER_NAME}\",

    ${CUSTOM_USER_CONFIG}
}"

[[ -z $CUSTOM_CONFIG_FILENAME ]] && echo -e "${RED}No CUSTOM_CONFIG_FILENAME is set${NOCOLOR}" && return 1
echo "$conf" > $CUSTOM_CONFIG_FILENAME

