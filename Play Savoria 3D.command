#!/bin/bash
cd "$(dirname "$0")"
PORT=8977
if ! lsof -i :$PORT >/dev/null 2>&1; then
  python3 serve.py >/dev/null 2>&1 &
  sleep 0.6
fi
open "http://localhost:$PORT/"
