# Baseline Setup: simple_sfu

## Requirements
- Node.js v16+
- npm
- Any browser (but would recommend chrome)

## Steps
1. Clone repo:
   git clone repo
   ```cd setup```

2. Install:
   ```npm install```

3. Run:
   ```npm start```

4. Connect:
   - Open http://localhost:8080 in 2 browser tabs
   - Allow camera/mic
   - Verify video/audio streams flow through SFU


## Aditional Resources/ links
- https://www.metered.ca/blog/webrtc-sfu-the-complete-guide/

If you want to see the traffic in Wireshark run this command 
```sudo tcpdump -i lo0 tcp port 8080 -w sfu_signaling.pcap```
