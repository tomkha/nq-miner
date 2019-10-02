@echo off
echo "------------------------START Miner----------------------"
SET UV_THREADPOOL_SIZE=32
nq-miner.exe
echo "------------------------END Miner----------------------"
echo "Something went wrong or you exited"
pause