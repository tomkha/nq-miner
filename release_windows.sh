#!/usr/bin/env bash

# prerequisite:
# node 10, yarn, pkg, node-gyp

# https://gist.github.com/DarrenN/8c6a5b969481725a4413
PACKAGE_VERSION=$(cat package.json \
  | grep version \
  | head -1 \
  | awk -F: '{ print $2 }' \
  | sed 's/[",]//g')
PACKAGE_VERSION_NO_WHITESPACE="$(echo -e "${PACKAGE_VERSION}" | tr -d '[:space:]')"
OUTFILE="nq-miner-windows-${PACKAGE_VERSION_NO_WHITESPACE}.zip"
echo "Building ${OUTFILE}"

#rm -rf node_modules
yarn
#cd node_modules/node-lmdb && node-gyp rebuild && cd ../..

rm -rf dist && mkdir dist

pkg -t node10-windows --options max_old_space_size=4096 -o nq-miner.exe index.js

mv nq-miner.exe dist/nq-miner.exe
cp build/Release/nimiq_miner_cuda.node dist/
cp build/Release/nimiq_miner_opencl.node dist/
cp node_modules/node-lmdb/build/Release/node-lmdb.node dist/
cp node_modules/@nimiq/core/build/Release/nimiq_node.node dist/
cp README.md dist/
cp start_gpu.bat dist/

echo "Create zipped"
cd dist/
zip -r ${OUTFILE} .
cd ..
