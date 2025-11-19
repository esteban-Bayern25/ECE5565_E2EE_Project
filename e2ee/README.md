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
   - Allow camera and microphone
   - Enter a shared passphrase for E2EE
   - Verify video/audio streams flow through SFU


# Packet Capture Instructions (Wireshark / tcpdump / dumpcap)
To help debug or validate E2EE vs non-E2EE WebRTC flows, you can capture the SFU signaling + UDP media traffic.

This section provides cross-platform instructions for Windows, macOS, and Linux.

If you want to see the traffic in Wireshark run this command 
```sudo tcpdump -i lo0 tcp port 8080 -w sfu_signaling.pcap```

To view STUN, DTLS, signaling, and media packets in wireshark:

```stun || dtls || tcp.port == 8080 || udp.port >= 10000```

### If DTLS appears as plain UDP
You may need to tell Wireshark to decode UDP as DTLS:
1. Select a UDP packet from the WebRTC connection
2. Go to Analyze → Decode As…
3. Under the “Current” column, choose DTLS
4. Click OK

### Full WebRTC (STUN, DTLS, RTP)
```sudo tcpdump -i any \ -f 'tcp port 8080 or udp port 3478 or udp portrange 10000-65535' \ -w sfu_capture.pcapng ```

### Windows Capture
1. List available interfaces
Run:

```"C:\Program Files\Wireshark\dumpcap.exe" -D```

Identify interfaces used for network traffic
(common: Ethernet, Wi-Fi, vEthernet on WSL2/Hyper-V).

2. Capture traffic (example)
```"C:\Program Files\Wireshark\dumpcap.exe" ^ -i 6 -i 9 -i 4 ^ -f "tcp port 8080 or udp port 3478 or udp portrange 10000-65535" ^ -w "C:\captures\sfu_combined_3.pcapng"```

- Replace 6 9 4 with your interface numbers.
- Output file is written to C:\captures\.

You should see:
- TCP 8080 → SFU signaling
- STUN Binding requests/responses
- DTLS ClientHello / handshake
- If E2EE enabled, only DTLS keys exist; media remains encrypted
- RTP/RTCP (may show as DTLS or SRTP packets)

## Aditional Resources/ links
- https://www.metered.ca/blog/webrtc-sfu-the-complete-guide/