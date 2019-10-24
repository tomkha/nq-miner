#!/bin/bash

echo "------------------------START Miner----------------------"
./nq-miner -t cuda -a "NQ..." -p eu.nimpool.io:8444 -n "My rig"
echo "------------------------END Miner----------------------"
echo "something went wrong or you exited"
