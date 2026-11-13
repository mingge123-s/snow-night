#!/bin/bash
# Usage: tools/batch.sh name "query" [wait] [w] [h]  (repeatable groups of 2 via multiple invocations)
source ~/.nvm/nvm.sh
cd ~/repos/snow-night
node tools/shot.mjs ~/work/shots/$1.png "$2" ${3:-5000} ${4:-960} ${5:-540}
