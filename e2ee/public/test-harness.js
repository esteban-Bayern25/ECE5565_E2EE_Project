/**
 * Automated Test Harness
 * Runs multiple test scenarios and collects performance data
 */

class TestHarness {
  constructor() {
    this.tests = [];
    this.results = [];
    this.currentTest = null;
  }

  /**
   * Define test scenarios
   */
  defineTests() {
    return [
      {
        id: 'baseline-no-e2ee',
        name: 'Baseline (No E2EE)',
        duration: 60000, // 1 minute
        enableE2EE: false,
        participants: 2,
        description: 'Baseline test without encryption'
      },
      {
        id: 'e2ee-enabled',
        name: 'E2EE Enabled',
        duration: 60000,
        enableE2EE: true,
        participants: 2,
        passphrase: 'vt-demo-123',
        description: 'Test with SFrame E2EE encryption'
      },
      {
        id: 'e2ee-multi-party',
        name: 'E2EE Multi-party (4 peers)',
        duration: 120000, // 2 minutes
        enableE2EE: true,
        participants: 4,
        passphrase: 'vt-demo-123',
        description: 'Multi-party conference with E2EE'
      },
      {
        id: 'baseline-multi-party',
        name: 'Baseline Multi-party (4 peers)',
        duration: 120000,
        enableE2EE: false,
        participants: 4,
        description: 'Multi-party without E2EE for comparison'
      }
    ];
  }

  /**
   * Run all tests sequentially
   */
  async runAllTests() {
    this.tests = this.defineTests();
    console.log(`🚀 Starting test harness with ${this.tests.length} tests`);

    for (const test of this.tests) {
      await this.runTest(test);
      
      // Wait between tests
      console.log('⏸️  Waiting 10 seconds before next test...');
      await this.sleep(10000);
    }

    console.log('✅ All tests completed!');
    this.generateReport();
  }

  /**
   * Run a single test
   */
  async runTest(testConfig) {
    console.log(`\n📋 Running test: ${testConfig.name}`);
    console.log(`   Duration: ${testConfig.duration/1000}s, E2EE: ${testConfig.enableE2EE}`);
    
    this.currentTest = {
      config: testConfig,
      startTime: Date.now(),
      data: null
    };

    // Notify user to set up test
    const proceed = await this.notifyUser(testConfig);
    if (!proceed) {
      console.log('⏭️  Test skipped by user');
      return;
    }

    // Run test for specified duration
    console.log(`⏱️  Test running for ${testConfig.duration/1000} seconds...`);
    await this.sleep(testConfig.duration);

    // Collect results
    this.collectTestResults(testConfig);
    
    console.log(`✅ Test "${testConfig.name}" completed`);
  }

  /**
   * Notify user to set up test conditions
   */
  async notifyUser(testConfig) {
    const message = `
Test: ${testConfig.name}
${testConfig.description}

Setup Instructions:
- Open ${testConfig.participants} browser tab(s)
${testConfig.enableE2EE ? `- Use passphrase: ${testConfig.passphrase}` : '- Do NOT enable E2EE'}
- Start the connection in each tab
- Test will run for ${testConfig.duration/1000} seconds

Ready to proceed?
    `;

    return confirm(message);
  }

  /**
   * Collect results from current test
   */
  collectTestResults(testConfig) {
    // Get metrics from the SimpleSFUClient instance
    const metrics = window.simple?.getCurrentMetrics();
    
    if (!metrics) {
      console.warn('⚠️  No metrics available for this test');
      return;
    }

    const result = {
      testId: testConfig.id,
      testName: testConfig.name,
      timestamp: Date.now(),
      duration: Date.now() - this.currentTest.startTime,
      config: testConfig,
      metrics: metrics,
      performanceData: window.simple.performanceMonitor?.exportJSON(),
      resourceData: window.simple.resourceMonitor?.exportJSON()
    };

    this.results.push(result);
    console.log('📊 Results collected:', result);
  }

  /**
   * Generate comparison report
   */
  generateReport() {
    console.log('\n' + '='.repeat(60));
    console.log('📈 TEST RESULTS SUMMARY');
    console.log('='.repeat(60) + '\n');

    // Compare baseline vs E2EE
    const baseline = this.results.find(r => r.testId === 'baseline-no-e2ee');
    const e2ee = this.results.find(r => r.testId === 'e2ee-enabled');

    if (baseline && e2ee) {
      console.log('🔍 Baseline vs E2EE Comparison (2 peers):\n');
      
      this.compareMetric('Latency P95', baseline, e2ee, 'latency', 'p95');
      this.compareMetric('Latency P99', baseline, e2ee, 'latency', 'p99');
      this.compareMetric('Jitter P95', baseline, e2ee, 'jitter', 'p95');
      this.compareMetric('Packet Loss', baseline, e2ee, 'packetLoss', 'mean');
      this.compareMetric('Bitrate', baseline, e2ee, 'bitrate', 'mean');
      this.compareMetric('Frame Rate', baseline, e2ee, 'frameRate', 'mean');
      
      if (baseline.resourceData && e2ee.resourceData) {
        console.log('\n💾 Resource Usage:');
        console.log(`Baseline Memory: ${baseline.metrics.resources?.memory?.mean || 'N/A'}`);
        console.log(`E2EE Memory: ${e2ee.metrics.resources?.memory?.mean || 'N/A'}`);
      }
    }

    console.log('\n' + '='.repeat(60));
  }

  /**
   * Compare a specific metric between two tests
   */
  compareMetric(label, baseline, e2ee, metricType, stat) {
    const baseVal = parseFloat(baseline.metrics?.performance?.[metricType]?.[stat]) || 0;
    const e2eeVal = parseFloat(e2ee.metrics?.performance?.[metricType]?.[stat]) || 0;
    
    const diff = e2eeVal - baseVal;
    const diffPct = baseVal > 0 ? ((diff / baseVal) * 100).toFixed(2) : 0;
    const arrow = diff > 0 ? '↑' : diff < 0 ? '↓' : '=';
    
    console.log(`${label}:`);
    console.log(`  Baseline: ${baseVal}`);
    console.log(`  E2EE:     ${e2eeVal} ${arrow} (${diffPct >= 0 ? '+' : ''}${diffPct}%)`);
    console.log('');
  }

  /**
   * Export all test results
   */
  exportAllResults() {
    const data = {
      timestamp: Date.now(),
      tests: this.tests,
      results: this.results,
      summary: this.generateSummaryData()
    };

    // Download as JSON
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `test-results-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log('✅ All results exported');
  }

  /**
   * Generate summary data for analysis
   */
  generateSummaryData() {
    return this.results.map(r => ({
      testId: r.testId,
      testName: r.testName,
      e2eeEnabled: r.config.enableE2EE,
      participants: r.config.participants,
      latencyP95: r.metrics?.performance?.latency?.p95,
      latencyP99: r.metrics?.performance?.latency?.p99,
      jitterP95: r.metrics?.performance?.jitter?.p95,
      packetLoss: r.metrics?.performance?.packetLoss?.mean,
      bitrate: r.metrics?.performance?.bitrate?.mean,
      frameRate: r.metrics?.performance?.frameRate?.mean,
      memoryMean: r.metrics?.resources?.memory?.mean
    }));
  }

  /**
   * Utility: Sleep function
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ===== USAGE =====
/*
// In your browser console or test script:

const harness = new TestHarness();

// Run all tests
await harness.runAllTests();

// Export results
harness.exportAllResults();

// Or run a single test
const testConfig = {
  id: 'custom-test',
  name: 'Custom Test',
  duration: 30000,
  enableE2EE: true,
  participants: 2,
  passphrase: 'vt-demo-123'
};
await harness.runTest(testConfig);
*/
