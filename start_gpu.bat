@echo off
echo "------------------------START Miner----------------------"
nq-miner.exe -t cuda -a "NQ..." -p eu.nimpool.io:8444 -n "My rig"
echo "------------------------END Miner----------------------"
echo "Something went wrong or you exited"
pause
