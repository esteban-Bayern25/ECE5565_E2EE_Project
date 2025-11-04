// public/sframe-client.js
(async () => {
    // small utility helpers
    function base64ToUint8Array(b64) {
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      return arr;
    }
    function uint8ArrayToHex(u) {
      return Array.from(u).map(b => b.toString(16).padStart(2,'0')).join('');
    }
  
    // fetch session key from our KMS endpoint
    async function fetchSessionKey() {
      const resp = await fetch('/kms/sessionKey');
      if (!resp.ok) throw new Error('Failed to fetch session key');
      return await resp.json(); // { keyId, key (base64) ... }
    }
  
    // import AES-GCM key into SubtleCrypto
    async function importKey(base64Key) {
      const keyBytes = base64ToUint8Array(base64Key);
      return await crypto.subtle.importKey(
        'raw',
        keyBytes,
        'AES-GCM',
        false,
        ['encrypt','decrypt']
      );
    }
  
    // Build a simple per-session counter nonce
    function makeIV(counter) {
      // AES-GCM expects 12-byte IV: produce 12 bytes from counter
      const iv = new Uint8Array(12);
      // split counter (64-bit) into last 8 bytes; first 4 bytes zero
      const dv = new DataView(new ArrayBuffer(8));
      dv.setBigUint64(0, BigInt(counter));
      iv.set(new Uint8Array(4).fill(0), 0);
      iv.set(new Uint8Array(dv.buffer), 4);
      return iv;
    }
  
    // PREPEND a minimal header to the ciphertext so receiver can parse:
    // Header layout (total 1+8 bytes = 9 bytes):
    // 1 byte version (1)
    // 8 bytes counter (big-endian)
    // Followed by AES-GCM ciphertext (with implicit tag appended by WebCrypto)
    function packCiphertext(counter, ciphertext) {
      const header = new Uint8Array(1 + 8 + ciphertext.byteLength);
      header[0] = 1; // version
      const dv = new DataView(header.buffer, 1, 8);
      dv.setBigUint64(0, BigInt(counter));
      header.set(new Uint8Array(ciphertext), 1 + 8);
      return header.buffer;
    }
  
    function unpackCiphertext(buffer) {
      const view = new Uint8Array(buffer);
      if (view.length < 9) throw new Error('ciphertext too short');
      const version = view[0];
      if (version !== 1) throw new Error('unsupported version');
      const dv = new DataView(buffer, 1, 8);
      const counter = dv.getBigUint64(0);
      const ciphertext = view.slice(1 + 8);
      return { counter: Number(counter), ciphertext: ciphertext.buffer };
    }
  
    // Attach SFrame-like encryption to RTCRtpSender
    async function attachEncryptorToSender(pc, keyObj) {
      const senders = pc.getSenders();
      for (const sender of senders) {
        if (!sender.createEncodedStreams) continue; // skip if not supported
        // Per-sender counter
        let counter = 1;
        const streams = sender.createEncodedStreams();
        const readable = streams.readable;
        const writable = streams.writable;
  
        const transformer = new TransformStream({
          async transform(encodedFrame, controller) {
            // encodedFrame.data is an ArrayBuffer (payload)
            try {
              const iv = makeIV(counter++);
              const ct = await crypto.subtle.encrypt(
                { name: 'AES-GCM', iv, tagLength: 128 },
                keyObj,
                encodedFrame.data
              );
              const packed = packCiphertext(counter - 1, ct);
              // replace payload with packed ciphertext
              encodedFrame.data = packed;
              // (optionally) change encodedFrame.type or other metadata to mark encrypted
              controller.enqueue(encodedFrame);
            } catch (e) {
              console.error('encrypt error', e);
              // drop or forward unencrypted if you want; here we drop
            }
          }
        });
        readable.pipeThrough(transformer).pipeTo(writable).catch(e => console.warn(e));
      }
    }
  
    // Attach decryptor to RTCRtpReceiver
    async function attachDecryptorToReceiver(pc, keyObj) {
      const receivers = pc.getReceivers();
      for (const receiver of receivers) {
        if (!receiver.createEncodedStreams) continue;
        const streams = receiver.createEncodedStreams();
        const readable = streams.readable;
        const writable = streams.writable;
  
        const transformer = new TransformStream({
          async transform(encodedFrame, controller) {
            try {
              // parse header, decrypt
              const { counter, ciphertext } = unpackCiphertext(encodedFrame.data);
              const iv = makeIV(counter);
              const plain = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv, tagLength: 128 },
                keyObj,
                ciphertext
              );
              encodedFrame.data = plain;
              controller.enqueue(encodedFrame);
            } catch (e) {
              // Decrypt failed -> log and drop frame
              console.warn('decrypt failed', e);
              // Option: controller.enqueue nothing -> frame dropped
            }
          }
        });
  
        readable.pipeThrough(transformer).pipeTo(writable).catch(e => console.warn(e));
      }
    }
  
    // Hook into your application logic.
    // This function expects you have a RTCPeerConnection 'pc' created already.
    // Call this after negotiation is done and senders/receivers exist (e.g., in ontrack or after createAnswer)
    async function enableSframeE2EE(pc) {
      const session = await fetchSessionKey();
      const aesKey = await importKey(session.key);
      console.log('SFrame PoC: got keyId', session.keyId);
  
      // attach to outgoing senders and incoming receivers
      await attachEncryptorToSender(pc, aesKey);
      await attachDecryptorToReceiver(pc, aesKey);
  
      // Optionally keep a reference to aesKey/session.keyId to support key rotation later
      return { keyId: session.keyId };
    }
  
    // Export to window so your other client code can call it
    window.enableSframeE2EE = enableSframeE2EE;
  
  })();
  