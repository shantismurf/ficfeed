#!/bin/bash
cd /home/container
rm -rf * .*
git clone https://github.com/shantismurf/ficfeed.git temp
mv temp/* .
mv temp/.* . 2>/dev/null || true
rm -rf temp
npm install
echo "Deploy complete!"
ls -la