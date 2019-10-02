#!/usr/bin/env bash

# Pre-requisite (see pinned message in discord)
# =============================================

# 1. Running nodejs 10 
# 2. npm install pkg@4.3.7
# 3. Clone nimiq repo
#   - git clone https://github.com/nimiq-network/core.git
#   - cd core

#   To avoid the 'module did not self register' problem, replace jungle-db with leveldb:
#   - vi src\main\platform\nodejs\index.prefix.js
#   // const JDB = require('@nimiq/jungle-db');
#   const JDB = require('@nimiq/jungle-db/dist/leveldb.js');

#   To build optimised nimiq node files for all cpu.
#   - vi binding.gyp
#   Replace "packaging": "<!(echo $PACKAGING)"
#   with: "packaging": "1"

#   - Still in the core folder, run yarn then npm link to create a symlink to the modified nimiq core.
# =============================================

# Once the above is done, you can run the following script:
# "C:\Program Files\Git\git-bash.exe" release_windows.sh

# https://gist.github.com/DarrenN/8c6a5b969481725a4413
PACKAGE_VERSION=$(cat package.json \
  | grep version \
  | head -1 \
  | awk -F: '{ print $2 }' \
  | sed 's/[",]//g')
PACKAGE_VERSION_NO_WHITESPACE="$(echo -e "${PACKAGE_VERSION}" | tr -d '[:space:]')"
OUTFILE="nq-miner-windows-${PACKAGE_VERSION_NO_WHITESPACE}.zip"
echo "Building ${OUTFILE}"

rm -rf node_modules
yarn
npm link @nimiq/core
rm -rf dist
mkdir dist
pkg -t node10-windows -o nq-miner.exe index.js
mv nq-miner.exe dist/nq-miner.exe

cp build/Release/nimiq_miner_cuda.node dist/
cp build/Release/nimiq_miner_opencl.node dist/
cp node_modules/leveldown/build/Release/leveldown.node dist/
cp node_modules/cpuid-git/build/Release/cpuid.node dist/
cp node_modules/@nimiq/core/build/Release/*.node dist/
cp dist/nimiq_node_compat.node dist/nimiq_node_sse2.node
rm dist/nimiq_node_native.node
cp miner.sample.conf dist/miner.conf
cp README.md dist
#cp hiveos-flightsheet.png dist
cp start_gpu.bat dist

echo "Create zipped"
cd dist/
zip -r ${OUTFILE} .
cd ..

read -p "Press [Enter] key to quit"
