#!/usr/bin/env bash

CUSTOM_DIR=`dirname $0`
cd $CUSTOM_DIR

export LD_LIBRARY_PATH=$LD_LIBRARY_PATH:$CUSTOM_DIR

. h-manifest.conf


[[ -z $CUSTOM_LOG_BASENAME ]] && echo -e "${RED}No CUSTOM_LOG_BASENAME is set${NOCOLOR}" && exit 1

[[ -z $CUSTOM_CONFIG_FILENAME ]] && echo -e "${RED}No CUSTOM_CONFIG_FILENAME is set${NOCOLOR}" && exit 1
[[ ! -f $CUSTOM_CONFIG_FILENAME ]] && echo -e "${RED}Custom config ${YELLOW}$CUSTOM_CONFIG_FILENAME${RED} is not found${NOCOLOR}" && exit 1

CUSTOM_LOG_BASEDIR=`dirname "$CUSTOM_LOG_BASENAME"`
[[ ! -d $CUSTOM_LOG_BASEDIR ]] && mkdir -p $CUSTOM_LOG_BASEDIR

xargs -a $CUSTOM_CONFIG_FILENAME ./$CUSTOM_NAME $@ 2>&1 | tee $CUSTOM_LOG_BASENAME.log
