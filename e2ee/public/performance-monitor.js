/**
 * Enhanced Performance Monitor for WebRTC E2EE Evaluation
 * Supports monitoring multiple peer connections (local + consumers)
 * Collects: latency, jitter, packet loss, bitrate, frame rate
 */

class PerformanceMonitor {
  constructor(options = {}) {
    this.sessionId = options.sessionId || `session-${Date.now()}`;
    this.interval = options.interval || 1000; // 1 second default
    this.isMonitoring = false;
    this.statsHistory = [];
    this.startTime = null;
    
    // Track peer connections
    this.localPeer = null;
    this.consumers = new Map(); // consumerId -> RTCPeerConnection
    
    // Previous stats for delta calculations
    this.prevStats = {
      inbound: {},
      outbound: {}
    };
    
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
   * Set the local peer connection
   */
  setLocalPeer(peerConnection) {
    this.localPeer = peerConnection;
    console.log('[PerformanceMonitor] Local peer connection set');
  }

  /**
   * Add a consumer connection to monitor
   */
  addConsumer(consumerId, peerConnection) {
    this.consumers.set(consumerId, peerConnection);
    console.log(`[PerformanceMonitor] Added consumer: ${consumerId} (total: ${this.consumers.size})`);
  }

  /**
   * Remove a consumer connection
   */
  removeConsumer(consumerId) {
    this.consumers.delete(consumerId);
    console.log(`[PerformanceMonitor] Removed consumer: ${consumerId}`);
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
   * Collect WebRTC stats from all connections
   */
  async collectStats() {
    try {
      const timestamp = Date.now();
      const snapshot = {
        timestamp,
        elapsed: timestamp - this.startTime,
        inbound: {},
        outbound: {},
        candidate: {},
        transport: {},
        consumers: this.consumers.size
      };

      // Collect from local peer (outbound + latency)
      if (this.localPeer) {
        await this.collectLocalStats(snapshot);
      }

      // Collect from all consumers (inbound)
      for (const [consumerId, pc] of this.consumers) {
        await this.collectConsumerStats(snapshot, consumerId, pc);
      }

      this.statsHistory.push(snapshot);
      
      // Calculate derived metrics
      this.calculateMetrics(snapshot);
      
      // Optional: log to console every 10 samples
      if (this.statsHistory.length % 10 === 0) {
        console.log(`[Stats] Sample #${this.statsHistory.length}`, snapshot);
      }
    } catch (error) {
      console.error('[PerformanceMonitor] Error collecting stats:', error);
    }
  }

  /**
   * Collect stats from local peer (outbound + candidate pair)
   */
  async collectLocalStats(snapshot) {
    if (!this.localPeer) return;

    const stats = await this.localPeer.getStats();
    
    stats.forEach(report => {
      switch (report.type) {
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
  }

  /**
   * Collect stats from consumer connections (inbound)
   */
  async collectConsumerStats(snapshot, consumerId, pc) {
    if (!pc) return;

    const stats = await pc.getStats();
    
    stats.forEach(report => {
      if (report.type === 'inbound-rtp') {
        if (report.mediaType === 'video') {
          if (!snapshot.inbound.video) {
            snapshot.inbound.video = this.extractInboundStats(report);
          } else {
            // Aggregate multiple video streams
            this.aggregateInboundStats(snapshot.inbound.video, report);
          }
        } else if (report.mediaType === 'audio') {
          if (!snapshot.inbound.audio) {
            snapshot.inbound.audio = this.extractInboundStats(report);
          } else {
            // Aggregate multiple audio streams
            this.aggregateInboundStats(snapshot.inbound.audio, report);
          }
        }
      }
    });
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
   * Aggregate stats from multiple inbound streams
   */
  aggregateInboundStats(existing, report) {
    existing.packetsReceived += report.packetsReceived || 0;
    existing.packetsLost += report.packetsLost || 0;
    existing.bytesReceived += report.bytesReceived || 0;
    
    // For jitter, take the maximum (worst case)
    existing.jitter = Math.max(existing.jitter, report.jitter || 0);
    
    existing.framesDecoded += report.framesDecoded || 0;
    existing.framesDropped += report.framesDropped || 0;
    
    // For FPS, take the average
    if (report.framesPerSecond) {
      existing.framesPerSecond = (existing.framesPerSecond + report.framesPerSecond) / 2;
    }
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
   * Calculate derived metrics from snapshot
   */
  calculateMetrics(snapshot) {
    const ts = snapshot.timestamp;

    // LATENCY: from candidate pair RTT
    if (snapshot.candidate.currentRoundTripTime !== undefined) {
      const latencyMs = snapshot.candidate.currentRoundTripTime * 1000;
      this.metrics.latency.push({ timestamp: ts, value: latencyMs });
    }

    // JITTER: from inbound video (in seconds, convert to ms)
    if (snapshot.inbound.video?.jitter !== undefined) {
      const jitterMs = snapshot.inbound.video.jitter * 1000;
      this.metrics.jitter.push({ timestamp: ts, value: jitterMs });
    }

    // PACKET LOSS: calculate from inbound stats
    if (snapshot.inbound.video) {
      const received = snapshot.inbound.video.packetsReceived || 0;
      const lost = snapshot.inbound.video.packetsLost || 0;
      const total = received + lost;
      
      if (total > 0) {
        const lossPercent = (lost / total) * 100;
        this.metrics.packetLoss.push({ timestamp: ts, value: lossPercent });
      }
    }

    // BITRATE: calculate from bytes delta
    if (snapshot.inbound.video && this.prevStats.inbound.video) {
      const bytesDelta = snapshot.inbound.video.bytesReceived - this.prevStats.inbound.video.bytesReceived;
      const timeDelta = (snapshot.timestamp - this.prevStats.timestamp) / 1000; // seconds
      
      if (timeDelta > 0) {
        const bitrateKbps = (bytesDelta * 8) / (timeDelta * 1000); // kbps
        this.metrics.bitrate.push({ timestamp: ts, value: bitrateKbps });
      }
    }

    // FRAME RATE: from inbound video
    if (snapshot.inbound.video?.framesPerSecond !== undefined) {
      this.metrics.frameRate.push({ 
        timestamp: ts, 
        value: snapshot.inbound.video.framesPerSecond 
      });
    }

    // Store current stats for next delta calculation
    this.prevStats = {
      timestamp: ts,
      inbound: JSON.parse(JSON.stringify(snapshot.inbound)),
      outbound: JSON.parse(JSON.stringify(snapshot.outbound))
    };
  }

  /**
   * Calculate percentile
   */
  calculatePercentile(values, percentile) {
    if (values.length === 0) return 0;
    
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Get summary statistics
   */
  getSummary() {
    const summary = {
      sessionId: this.sessionId,
      duration: Date.now() - this.startTime,
      samples: this.statsHistory.length,
      consumers: this.consumers.size
    };

    // Calculate stats for each metric
    ['latency', 'jitter', 'packetLoss', 'bitrate', 'frameRate'].forEach(metric => {
      const values = this.metrics[metric].map(m => m.value);
      
      if (values.length > 0) {
        summary[metric] = {
          mean: (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2),
          p50: this.calculatePercentile(values, 50).toFixed(2),
          p95: this.calculatePercentile(values, 95).toFixed(2),
          p99: this.calculatePercentile(values, 99).toFixed(2),
          min: Math.min(...values).toFixed(2),
          max: Math.max(...values).toFixed(2),
          count: values.length
        };
      } else {
        summary[metric] = {
          mean: 0,
          p50: 0,
          p95: 0,
          p99: 0,
          min: 0,
          max: 0,
          count: 0
        };
      }
    });

    return summary;
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
      consumers: this.consumers.size,
      rawStats: this.statsHistory,
      metrics: this.metrics,
      summary: this.getSummary()
    };
  }

  /**
   * Export data as CSV
   */
  exportCSV() {
    const lines = ['timestamp,elapsed,latency,jitter,packetLoss,bitrate,frameRate'];
    
    this.statsHistory.forEach(snapshot => {
      const row = [
        snapshot.timestamp,
        snapshot.elapsed,
        snapshot.candidate.currentRoundTripTime ? (snapshot.candidate.currentRoundTripTime * 1000).toFixed(2) : '',
        snapshot.inbound.video?.jitter ? (snapshot.inbound.video.jitter * 1000).toFixed(2) : '',
        snapshot.inbound.video ? this.calculatePacketLoss(snapshot.inbound.video) : '',
        '', // bitrate needs delta calculation
        snapshot.inbound.video?.framesPerSecond || ''
      ];
      lines.push(row.join(','));
    });
    
    return lines.join('\n');
  }

  /**
   * Calculate packet loss percentage
   */
  calculatePacketLoss(stats) {
    const received = stats.packetsReceived || 0;
    const lost = stats.packetsLost || 0;
    const total = received + lost;
    return total > 0 ? ((lost / total) * 100).toFixed(2) : '0';
  }

  /**
   * Download data as file
   */
  downloadData(format = 'json') {
    const data = format === 'csv' ? this.exportCSV() : JSON.stringify(this.exportJSON(), null, 2);
    const blob = new Blob([data], { type: format === 'csv' ? 'text/csv' : 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `webrtc-performance-${this.sessionId}.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    console.log(`[PerformanceMonitor] Downloaded ${format.toUpperCase()}: ${a.download}`);
  }
}
