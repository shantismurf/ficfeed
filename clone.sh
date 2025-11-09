#!/bin/bash
rm -rf /home/container/*
rm -rf /home/container/.git
cd /home/container
git clone https://github.com/shantismurf/ficfeed.git .
npm install