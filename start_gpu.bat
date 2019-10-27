@echo off
echo "------------------------START Miner----------------------"
SET UV_THREADPOOL_SIZE=32
nq-miner.exe -t cuda -a "NQ..." -p eu.nimpool.io:8444 -n "My rig"
echo "------------------------END Miner----------------------"
echo "Something went wrong or you exited"
pause
