'use strict';

// ===== Small on-screen notifier (optional but handy) =====
function uiNotify(msg, color = '#0f0') {
  let div = document.getElementById('status');
  if (!div) {
    div = document.createElement('div');
    div.id = 'status';
    div.style.position = 'fixed';
    div.style.bottom = '10px';
    div.style.right = '10px';
    div.style.background = '#111';
    div.style.color = color;
    div.style.padding = '8px 10px';
    div.style.fontFamily = 'monospace';
    div.style.fontSize = '13px';
    div.style.borderRadius = '6px';
    div.style.zIndex = '9999';
    document.body.appendChild(div);
  }
  div.textContent = msg;
}

// ===== Events used by index.html =====
const _EVENTS = {
  onConnected: 'onConnected',
  onRemoteTrack: 'onRemoteTrack',
};

class SimpleSFUClient {
  constructor(options) {
    const defaultSettings = {
      port: 8080,
      configuration: {
        iceServers: [
          { urls: 'stun:stun.stunprotocol.org:3478' },
          { urls: 'stun:stun.l.google.com:19302' },
        ]
      }
    };
    this.settings = Object.assign({}, defaultSettings, options);

    // event bus
    this.eventListeners = new Map();
    Object.keys(_EVENTS).forEach(k => this.eventListeners.set(k, []));

    // state
    this.connection = null;
    this.localPeer = null;
    this.localUUID = null;
    this.localStream = null;
    this.consumers = new Map();
    this.clients = new Map();

    // E2EE
    this.E2EE_KEY = null;
    this._alertedDecryptFail = false;
    this.performanceMonitor = null;
    this.resourceMonitor = null;

    this.initWebSocket();
  }

  // ---------- event helpers ----------
  on(event, cb) {
    if (this.eventListeners.has(event)) this.eventListeners.get(event).push(cb);
  }
  trigger(event, payload=null) {
    if (!this.eventListeners.has(event)) return;
    this.eventListeners.get(event).forEach(cb => cb.call(this, payload));
  }

  // ---------- passphrase / key ----------
  async getKeyFromUser() {
    const required = 'vt-demo-123'; // STRICT match
    const pass = prompt('Enter E2EE passphrase (exactly: vt-demo-123)');
    if (pass !== required) {
      alert('❌ Wrong passphrase');
      throw new Error('Invalid passphrase');
    }
    // derive AES-GCM key
    const enc = new TextEncoder();
    const base = await crypto.subtle.importKey('raw', enc.encode(pass), { name: 'PBKDF2' }, false, ['deriveKey']);
    const salt = enc.encode('vt-salt');
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 },
      base,
      { name: 'AES-GCM', length: 128 },
      false,
      ['encrypt', 'decrypt']
    );
    uiNotify('🔑 E2EE key ready');
    return key;
  }

  // ---------- websocket / signaling ----------
  initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${protocol}://${window.location.hostname}:${this.settings.port}`;
    this.connection = new WebSocket(url);

    this.connection.onopen = () => {
      uiNotify('🟢 Connected to SFU');
      // IMPORTANT: this re-enables the Connect button in index.html
      this.trigger(_EVENTS.onConnected);
    };

    this.connection.onmessage = (evt) => this.handleMessage(evt);
    this.connection.onclose = () => uiNotify('🔴 Disconnected from SFU', '#f66');
  }

  handleMessage({ data }) {
    const msg = JSON.parse(data);
    switch (msg.type) {
      case 'welcome':
        this.localUUID = msg.id;
        break;
      case 'answer':
        this.handleAnswer(msg);
        break;
      case 'peers':
        this.handlePeers(msg);
        break;
      case 'consume':
        this.handleConsume(msg);
        break;
      case 'newProducer':
        this.handleNewProducer(msg);
        break;
      case 'user_left':
        this.removeUser(msg);
        break;
    }
  }

  // ---------- connection flow ----------
  async connect() {
    // derive E2EE key first (strict passphrase)
    this.E2EE_KEY = await this.getKeyFromUser();

    // get local media & show self tile
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    this.localStream = stream;
    this.handleRemoteTrack(stream, (window.username?.value ?? 'me'), 'local-self');

    // create peer
    this.localPeer = new RTCPeerConnection(this.settings.configuration);

    // add tracks + attach ENCRYPT transform
    this.localStream.getTracks().forEach(track => {
      const sender = this.localPeer.addTrack(track, this.localStream);

      // sender transform for video/audio
      const wrapSend = (creator) => {
        const { readable, writable } = creator.call(sender);
        const ts = new TransformStream({
          transform: async (frame, controller) => {
            try {
              const iv = crypto.getRandomValues(new Uint8Array(12));   // 96-bit IV
              const pt = new Uint8Array(frame.data);
              const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, this.E2EE_KEY, pt));
              // FRAME: [ IV(12) | ciphertext ]
              const out = new Uint8Array(12 + ct.length);
              out.set(iv, 0);
              out.set(ct, 12);
              frame.data = out.buffer;
              controller.enqueue(frame);
            } catch (e) {
              console.error('Encrypt error:', e);
            }
          }
        });
        readable.pipeThrough(ts).pipeTo(writable);
      };

      if (sender.createEncodedVideoStreams && track.kind === 'video') wrapSend(sender.createEncodedVideoStreams);
      if (sender.createEncodedAudioStreams && track.kind === 'audio') wrapSend(sender.createEncodedAudioStreams);
    });

    this.localPeer.onicecandidate = (e) => {
      if (e.candidate) {
        this.connection.send(JSON.stringify({ type: 'ice', ice: e.candidate, uqid: this.localUUID }));
      }
    };

    this.localPeer.onnegotiationneeded = async () => {
      const offer = await this.localPeer.createOffer();
      await this.localPeer.setLocalDescription(offer);
      this.connection.send(JSON.stringify({
        type: 'connect',
        sdp: this.localPeer.localDescription,
        uqid: this.localUUID,
        username: window.username?.value ?? 'user'
      }));
    };
  //Added for measurement
  setTimeout(() => {
  if (this.localPeer) {
    this.performanceMonitor = new PerformanceMonitor(this.localPeer, {
      sessionId: `test-${Date.now()}`,
      interval: 1000
    });
    this.performanceMonitor.start();
    
    this.resourceMonitor = new ResourceMonitor({ interval: 1000 });
    this.resourceMonitor.start();
    
    console.log('✅ Monitoring started');
  }
}, 2000);
//
    uiNotify('🎥 Local stream started — connect the other tab with SAME passphrase');
     // Start monitoring after connection is established
    setTimeout(() => {
      this.startMonitoring();
    }, 2000);
  }

  handleAnswer({ sdp }) {
    const desc = new RTCSessionDescription(sdp);
    this.localPeer.setRemoteDescription(desc).catch(console.error);
  }

  async handlePeers({ peers }) {
    if (!peers || !peers.length) return;
    for (const p of peers) await this.consumeOnce(p);
  }

  async handleNewProducer({ id, username }) {
    await this.consumeOnce({ id, username });
  }

  async consumeOnce(peer) {
    const consumerId = crypto.randomUUID();
    const pc = new RTCPeerConnection(this.settings.configuration);
    this.consumers.set(consumerId, pc);
    this.clients.set(peer.id, { ...peer, consumerId });

    pc.addTransceiver('video', { direction: 'recvonly' });
    pc.addTransceiver('audio', { direction: 'recvonly' });

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.connection.send(JSON.stringify({
          type: 'consumer_ice',
          ice: e.candidate, uqid: peer.id, consumerId
        }));
      }
    };

    // attach DECRYPT transform on receiver before we render
    pc.ontrack = (e) => {
      const attachRecv = (receiver, kind) => {
        if (!receiver) return;
        const creator = kind === 'video' ? receiver.createEncodedVideoStreams : receiver.createEncodedAudioStreams;
        if (!creator) return;

        const { readable, writable } = creator.call(receiver);
        const ts = new TransformStream({
          transform: async (frame, controller) => {
            try {
              const buf = new Uint8Array(frame.data);
              if (buf.length < 13) { controller.enqueue(frame); return; }
              const iv = buf.subarray(0, 12);
              const ct = buf.subarray(12);
              const pt = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, this.E2EE_KEY, ct));
              frame.data = pt.buffer;
              controller.enqueue(frame);
            } catch (e) {
              if (!this._alertedDecryptFail) {
                alert('❌ Decryption failed! Make sure BOTH tabs entered exactly: vt-demo-123');
                this._alertedDecryptFail = true; // avoid spamming
              }
            }
          }
        });
        readable.pipeThrough(ts).pipeTo(writable);
      };

      // do it per kind
      const rxVideo = pc.getReceivers().find(r => r.track && r.track.kind === 'video');
      const rxAudio = pc.getReceivers().find(r => r.track && r.track.kind === 'audio');
      attachRecv(rxVideo, 'video');
      attachRecv(rxAudio, 'audio');

      // render stream
      this.handleRemoteTrack(e.streams[0], peer.username, this.clients.get(peer.id)?.consumerId || consumerId);
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.connection.send(JSON.stringify({ type: 'consume', id: peer.id, consumerId, sdp: pc.localDescription }));
  }

  handleConsume({ sdp, id, consumerId }) {
    const desc = new RTCSessionDescription(sdp);
    this.consumers.get(consumerId)?.setRemoteDescription(desc).catch(console.error);
  }

  removeUser({ id }) {
    const c = this.clients.get(id);
    if (c?.consumerId) {
      this.consumers.delete(c.consumerId);
    }
    this.clients.delete(id);
  }

  // ---------- UI helpers ----------
  findUserVideo(consumerId) {
    const video = document.querySelector(`#remote_${consumerId}`);
    return video || false;
  }

  createVideoElement(label, stream, consumerId) {
    const video = document.createElement('video');
    video.id = `remote_${consumerId}`;
    video.srcObject = stream;
    video.autoplay = true;
    video.muted = (label === (window.username?.value ?? 'user'));
    return video;
  }

  createVideoWrapper(video, label, consumerId) {
    const div = document.createElement('div');
    div.id = `user_${consumerId}`;
    div.classList.add('videoWrap');

    const name = document.createElement('div');
    name.classList.add('display_name');
    name.textContent = label;

    div.appendChild(name);
    div.appendChild(video);
    document.querySelector('.videos-inner')?.appendChild(div);
    return div;
  }

  handleRemoteTrack(stream, label, consumerId='self') {
    const existing = this.findUserVideo(consumerId);
    if (existing) {
      const t = stream.getTracks()[0];
      if (!existing.srcObject.getTracks().includes(t)) existing.srcObject.addTrack(t);
    } else {
      const v = this.createVideoElement(label, stream, consumerId);
      this.createVideoWrapper(v, label, consumerId);
    }
  }
  // ---------- Performance Monitoring Methods ----------

  /**
   * Start performance monitoring
   */
  startMonitoring() {
    if (!this.localPeer) {
      console.warn('[SimpleSFUClient] Cannot start monitoring - no peer connection yet');
      return;
    }

    if (this.performanceMonitor) {
      console.log('[SimpleSFUClient] Monitoring already started');
      return;
    }

    console.log('[SimpleSFUClient] Starting performance monitoring...');
    
    this.performanceMonitor = new PerformanceMonitor(this.localPeer, {
      sessionId: `e2ee-test-${this.localUUID || Date.now()}`,
      interval: 1000
    });
    this.performanceMonitor.start();
    
    this.resourceMonitor = new ResourceMonitor({ interval: 1000 });
    this.resourceMonitor.start();
    
    console.log('✅ Performance monitoring started');
    uiNotify('✅ Monitoring active', '#0f0');
  }

  /**
   * Stop monitoring
   */
  stopMonitoring() {
    if (this.performanceMonitor) {
      this.performanceMonitor.stop();
      console.log('📊 Performance Summary:', this.performanceMonitor.getSummary());
    }
    
    if (this.resourceMonitor) {
      this.resourceMonitor.stop();
      console.log('📊 Resource Summary:', this.resourceMonitor.getSummary());
    }
  }

  /**
   * Get current metrics
   */
  getCurrentMetrics() {
    if (!this.performanceMonitor) return null;
    
    return {
      performance: this.performanceMonitor.getSummary(),
      resources: this.resourceMonitor ? this.resourceMonitor.getSummary() : null
    };
  }

  /**
   * Export results
   */
  exportResults(format = 'json') {
    if (!this.performanceMonitor) {
      console.warn('No performance data to export');
      return;
    }
    
    this.performanceMonitor.downloadData(format);
    
    if (this.resourceMonitor) {
      this.resourceMonitor.downloadData(format);
    }
    
    console.log(`✅ Exported results as ${format.toUpperCase()}`);
  } 
  

}


