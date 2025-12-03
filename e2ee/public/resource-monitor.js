/**
 * Resource Monitor - Tracks CPU and Memory usage
 * Note: Browser-based measurements have limitations
 */

class ResourceMonitor {
  constructor(options = {}) {
    this.interval = options.interval || 1000;
    this.isMonitoring = false;
    this.measurements = [];
    this.startTime = null;
    
    // Check for Performance API support
    this.hasPerformanceAPI = 'performance' in window && 'memory' in performance;
  }

  /**
   * Start monitoring resources
   */
  start() {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    this.startTime = Date.now();
    
    console.log('[ResourceMonitor] Started monitoring');
    
    this.intervalId = setInterval(() => {
      this.collectMeasurement();
    }, this.interval);
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (!this.isMonitoring) return;
    
    this.isMonitoring = false;
    clearInterval(this.intervalId);
    
    console.log(`[ResourceMonitor] Stopped. Collected ${this.measurements.length} measurements`);
  }

  /**
   * Collect current resource usage
   */
  collectMeasurement() {
    const timestamp = Date.now();
    const measurement = {
      timestamp,
      elapsed: timestamp - this.startTime
    };

    // Memory (Chrome only)
    if (this.hasPerformanceAPI) {
      const memory = performance.memory;
      measurement.memory = {
        usedJSHeapSize: memory.usedJSHeapSize,
        totalJSHeapSize: memory.totalJSHeapSize,
        jsHeapSizeLimit: memory.jsHeapSizeLimit,
        usedPercent: ((memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100).toFixed(2)
      };
    }

    // Performance timing
    if (performance.timing) {
      measurement.navigation = {
        loadTime: performance.timing.loadEventEnd - performance.timing.navigationStart,
        domReady: performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart
      };
    }

    // Performance entries for long tasks
    if (performance.getEntriesByType) {
      const longTasks = performance.getEntriesByType('longtask');
      measurement.longTasks = longTasks.length;
      
      // Clear old entries to prevent memory leak
      if (longTasks.length > 0) {
        performance.clearMarks();
        performance.clearMeasures();
      }
    }

    this.measurements.push(measurement);
  }

  /**
   * Get summary statistics
   */
  getSummary() {
    if (!this.hasPerformanceAPI || this.measurements.length === 0) {
      return { error: 'No performance data available' };
    }

    const memoryValues = this.measurements
      .filter(m => m.memory)
      .map(m => m.memory.usedJSHeapSize);

    if (memoryValues.length === 0) {
      return { error: 'No memory measurements' };
    }

    const sorted = [...memoryValues].sort((a, b) => a - b);
    const mean = memoryValues.reduce((a, b) => a + b, 0) / memoryValues.length;

    return {
      memory: {
        mean: (mean / 1048576).toFixed(2) + ' MB',
        min: (sorted[0] / 1048576).toFixed(2) + ' MB',
        max: (sorted[sorted.length - 1] / 1048576).toFixed(2) + ' MB',
        p95: (sorted[Math.floor(sorted.length * 0.95)] / 1048576).toFixed(2) + ' MB'
      },
      measurements: this.measurements.length,
      duration: Date.now() - this.startTime
    };
  }

  /**
   * Export data as JSON
   */
  exportJSON() {
    return {
      startTime: this.startTime,
      endTime: Date.now(),
      duration: Date.now() - this.startTime,
      measurements: this.measurements,
      summary: this.getSummary()
    };
  }

  /**
   * Export as CSV
   */
  exportCSV() {
    const headers = ['timestamp', 'elapsed_ms', 'used_heap_mb', 'total_heap_mb', 'heap_used_pct'];
    let csv = headers.join(',') + '\n';

    this.measurements.forEach(m => {
      if (m.memory) {
        const row = [
          m.timestamp,
          m.elapsed,
          (m.memory.usedJSHeapSize / 1048576).toFixed(2),
          (m.memory.totalJSHeapSize / 1048576).toFixed(2),
          m.memory.usedPercent
        ];
        csv += row.join(',') + '\n';
      }
    });

    return csv;
  }

  /**
   * Download measurements
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
    a.download = `resource-usage-${Date.now()}.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ResourceMonitor;
}
