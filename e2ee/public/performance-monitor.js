/**
 * Performance Monitor for WebRTC E2EE Evaluation
 * Collects metrics: latency, jitter, packet loss, bitrate, CPU usage
 */

class PerformanceMonitor {
  constructor(peerConnection, options = {}) {
    this.pc = peerConnection;
    this.sessionId = options.sessionId || `session-${Date.now()}`;
    this.interval = options.interval || 1000; // 1 second default
    this.isMonitoring = false;
    this.statsHistory = [];
    this.startTime = null;
    
    // Storage for computed metrics
    this.metrics = {
      latency: [],
      jitter: [],
      packetLoss: [],
      bitrate: [],
      frameRate: [],
      cpu: []
    };
  }

  /**
   * Start collecting stats periodically
   */
  start() {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    this.startTime = Date.now();
    console.log(`[PerformanceMonitor] Started for session: ${this.sessionId}`);
    
    this.intervalId = setInterval(() => {
      this.collectStats();
    }, this.interval);
  }

  /**
   * Stop collecting stats
   */
  stop() {
    if (!this.isMonitoring) return;
    
    this.isMonitoring = false;
    clearInterval(this.intervalId);
    console.log(`[PerformanceMonitor] Stopped. Collected ${this.statsHistory.length} samples`);
  }

  /**
   * Collect WebRTC stats snapshot
   */
  async collectStats() {
    if (!this.pc) return;

    try {
      const stats = await this.pc.getStats();
      const timestamp = Date.now();
      const snapshot = {
        timestamp,
        elapsed: timestamp - this.startTime,
        inbound: {},
        outbound: {},
        candidate: {},
        transport: {}
      };

      stats.forEach(report => {
        switch (report.type) {
          case 'inbound-rtp':
            if (report.mediaType === 'video') {
              snapshot.inbound.video = this.extractInboundStats(report);
            } else if (report.mediaType === 'audio') {
              snapshot.inbound.audio = this.extractInboundStats(report);
            }
            break;
            
          case 'outbound-rtp':
            if (report.mediaType === 'video') {
              snapshot.outbound.video = this.extractOutboundStats(report);
            } else if (report.mediaType === 'audio') {
              snapshot.outbound.audio = this.extractOutboundStats(report);
            }
            break;
            
          case 'candidate-pair':
            if (report.state === 'succeeded' || report.nominated) {
              snapshot.candidate = this.extractCandidateStats(report);
            }
            break;
            
          case 'transport':
            snapshot.transport = this.extractTransportStats(report);
            break;
        }
      });

      this.statsHistory.push(snapshot);
      
      // Calculate derived metrics
      this.calculateMetrics(snapshot);
      
      // Optional: log to console
      if (this.statsHistory.length % 10 === 0) {
        console.log(`[Stats] Sample #${this.statsHistory.length}`, this.getSummary());
      }
    } catch (error) {
      console.error('[PerformanceMonitor] Error collecting stats:', error);
    }
  }

  /**
   * Extract inbound RTP statistics
   */
  extractInboundStats(report) {
    return {
      packetsReceived: report.packetsReceived || 0,
      packetsLost: report.packetsLost || 0,
      bytesReceived: report.bytesReceived || 0,
      jitter: report.jitter || 0,
      framesDecoded: report.framesDecoded || 0,
      framesDropped: report.framesDropped || 0,
      framesPerSecond: report.framesPerSecond || 0,
      timestamp: report.timestamp
    };
  }

  /**
   * Extract outbound RTP statistics
   */
  extractOutboundStats(report) {
    return {
      packetsSent: report.packetsSent || 0,
      bytesSent: report.bytesSent || 0,
      framesSent: report.framesSent || 0,
      framesPerSecond: report.framesPerSecond || 0,
      timestamp: report.timestamp
    };
  }

  /**
   * Extract candidate pair statistics (for RTT/latency)
   */
  extractCandidateStats(report) {
    return {
      currentRoundTripTime: report.currentRoundTripTime || 0,
      availableOutgoingBitrate: report.availableOutgoingBitrate || 0,
      availableIncomingBitrate: report.availableIncomingBitrate || 0,
      bytesSent: report.bytesSent || 0,
      bytesReceived: report.bytesReceived || 0,
      timestamp: report.timestamp
    };
  }

  /**
   * Extract transport statistics
   */
  extractTransportStats(report) {
    return {
      bytesSent: report.bytesSent || 0,
      bytesReceived: report.bytesReceived || 0,
      selectedCandidatePairChanges: report.selectedCandidatePairChanges || 0,
      timestamp: report.timestamp
    };
  }

  /**
   * Calculate derived metrics from current and previous snapshots
   */
  calculateMetrics(currentSnapshot) {
    if (this.statsHistory.length < 2) return;

    const previousSnapshot = this.statsHistory[this.statsHistory.length - 2];
    const timeDelta = (currentSnapshot.timestamp - previousSnapshot.timestamp) / 1000; // seconds

    // Latency (RTT from candidate pair)
    if (currentSnapshot.candidate.currentRoundTripTime) {
      const rttMs = currentSnapshot.candidate.currentRoundTripTime * 1000;
      this.metrics.latency.push({
        timestamp: currentSnapshot.timestamp,
        value: rttMs
      });
    }

    // Jitter (from inbound video)
    if (currentSnapshot.inbound.video?.jitter !== undefined) {
      const jitterMs = currentSnapshot.inbound.video.jitter * 1000;
      this.metrics.jitter.push({
        timestamp: currentSnapshot.timestamp,
        value: jitterMs
      });
    }

    // Packet Loss Rate
    if (currentSnapshot.inbound.video) {
      const curr = currentSnapshot.inbound.video;
      const prev = previousSnapshot.inbound.video;
      
      if (curr && prev) {
        const packetsReceived = curr.packetsReceived - prev.packetsReceived;
        const packetsLost = curr.packetsLost - prev.packetsLost;
        const totalPackets = packetsReceived + packetsLost;
        
        const lossRate = totalPackets > 0 ? (packetsLost / totalPackets) * 100 : 0;
        
        this.metrics.packetLoss.push({
          timestamp: currentSnapshot.timestamp,
          value: lossRate,
          packetsLost,
          packetsReceived
        });
      }
    }

    // Bitrate (incoming video)
    if (currentSnapshot.inbound.video && previousSnapshot.inbound.video) {
      const bytesDelta = currentSnapshot.inbound.video.bytesReceived - 
                        previousSnapshot.inbound.video.bytesReceived;
      const bitrateKbps = (bytesDelta * 8) / (timeDelta * 1000);
      
      this.metrics.bitrate.push({
        timestamp: currentSnapshot.timestamp,
        value: bitrateKbps
      });
    }

    // Frame Rate
    if (currentSnapshot.inbound.video?.framesPerSecond) {
      this.metrics.frameRate.push({
        timestamp: currentSnapshot.timestamp,
        value: currentSnapshot.inbound.video.framesPerSecond
      });
    }
  }

  /**
   * Calculate statistical summary (mean, P50, P95, P99)
   */
  calculateStats(dataArray) {
    if (!dataArray || dataArray.length === 0) {
      return { mean: 0, p50: 0, p95: 0, p99: 0, min: 0, max: 0 };
    }

    const values = dataArray.map(d => d.value).sort((a, b) => a - b);
    const len = values.length;

    const sum = values.reduce((acc, val) => acc + val, 0);
    const mean = sum / len;

    const p50Index = Math.floor(len * 0.50);
    const p95Index = Math.floor(len * 0.95);
    const p99Index = Math.floor(len * 0.99);

    return {
      mean: mean.toFixed(2),
      p50: values[p50Index].toFixed(2),
      p95: values[p95Index].toFixed(2),
      p99: values[p99Index].toFixed(2),
      min: values[0].toFixed(2),
      max: values[len - 1].toFixed(2),
      count: len
    };
  }

  /**
   * Get summary of all metrics
   */
  getSummary() {
    return {
      sessionId: this.sessionId,
      duration: Date.now() - this.startTime,
      samples: this.statsHistory.length,
      latency: this.calculateStats(this.metrics.latency),
      jitter: this.calculateStats(this.metrics.jitter),
      packetLoss: this.calculateStats(this.metrics.packetLoss),
      bitrate: this.calculateStats(this.metrics.bitrate),
      frameRate: this.calculateStats(this.metrics.frameRate)
    };
  }

  /**
   * Export data as JSON
   */
  exportJSON() {
    return {
      sessionId: this.sessionId,
      startTime: this.startTime,
      endTime: Date.now(),
      duration: Date.now() - this.startTime,
      interval: this.interval,
      rawStats: this.statsHistory,
      metrics: this.metrics,
      summary: this.getSummary()
    };
  }

  /**
   * Export data as CSV string
   */
  exportCSV() {
    const headers = [
      'timestamp',
      'elapsed_ms',
      'latency_ms',
      'jitter_ms',
      'packet_loss_pct',
      'bitrate_kbps',
      'frame_rate_fps'
    ];

    let csv = headers.join(',') + '\n';

    this.statsHistory.forEach((snapshot, index) => {
      const latency = this.metrics.latency[index]?.value || '';
      const jitter = this.metrics.jitter[index]?.value || '';
      const packetLoss = this.metrics.packetLoss[index]?.value || '';
      const bitrate = this.metrics.bitrate[index]?.value || '';
      const frameRate = this.metrics.frameRate[index]?.value || '';

      const row = [
        snapshot.timestamp,
        snapshot.elapsed,
        latency,
        jitter,
        packetLoss,
        bitrate,
        frameRate
      ];

      csv += row.join(',') + '\n';
    });

    return csv;
  }

  /**
   * Download data as file
   */
  downloadData(format = 'json') {
    const data = format === 'json' ? 
      JSON.stringify(this.exportJSON(), null, 2) : 
      this.exportCSV();
    
    const blob = new Blob([data], { 
      type: format === 'json' ? 'application/json' : 'text/csv' 
    });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `webrtc-performance-${this.sessionId}.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    console.log(`[PerformanceMonitor] Downloaded ${format.toUpperCase()} data`);
  }

  /**
   * Send data to server for storage
   */
  async uploadData(endpoint = '/api/performance') {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(this.exportJSON())
      });

      if (response.ok) {
        console.log('[PerformanceMonitor] Data uploaded successfully');
        return await response.json();
      } else {
        throw new Error(`Upload failed: ${response.status}`);
      }
    } catch (error) {
      console.error('[PerformanceMonitor] Upload error:', error);
      throw error;
    }
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PerformanceMonitor;
}
