#!/bin/bash

# 1. Define paths
PROTO_FILE="./agent-backend/websocket.proto"
GO_OUT_DIR="../agent/pb"
TS_OUT_DIR="../backend/pb-generated"

# 2. Create directories if they don't exist
mkdir -p $GO_OUT_DIR
mkdir -p $TS_OUT_DIR

echo "Generating Protobuf code..."

# 3. Generate Go code
echo "Generating Go code..."
protoc --go_out=$GO_OUT_DIR --go_opt=paths=source_relative \
       --go-grpc_out=$GO_OUT_DIR --go-grpc_opt=paths=source_relative \
       $PROTO_FILE
# 4. Generate TypeScript code (using ts-proto)
# Note: This assumes you ran 'npm install ts-proto' in your backend folder
# Resolve plugin path for Windows protoc
PROTOC_GEN_TS_PROTO_PATH=$(cygpath -w "$(pwd)/../backend/node_modules/.bin/protoc-gen-ts_proto.exe")

echo "Generating TypeScript code..."
protoc --plugin=protoc-gen-ts_proto="$PROTOC_GEN_TS_PROTO_PATH" \
       --ts_proto_out=$TS_OUT_DIR \
       $PROTO_FILE

echo "Done! Code generated in $GO_OUT_DIR and $TS_OUT_DIR"