#!/usr/bin/env python3
"""
Performance Data Analysis Script
Analyzes WebRTC performance data and generates visualizations
"""

import json
import pandas as pd
import matplotlib.pyplot as plt
import numpy as np
from pathlib import Path
import sys

class PerformanceAnalyzer:
    def __init__(self, data_file):
        """Initialize analyzer with data file"""
        self.data_file = data_file
        self.data = self.load_data()
        
    def load_data(self):
        """Load JSON data from file"""
        with open(self.data_file, 'r') as f:
            return json.load(f)
    
    def extract_metrics_timeseries(self):
        """Extract time series data for all metrics"""
        if 'metrics' not in self.data:
            print("No metrics found in data")
            return None
            
        metrics = self.data['metrics']
        
        # Convert to pandas DataFrames
        dfs = {}
        for metric_name in ['latency', 'jitter', 'packetLoss', 'bitrate', 'frameRate']:
            if metric_name in metrics and len(metrics[metric_name]) > 0:
                df = pd.DataFrame(metrics[metric_name])
                df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
                df['elapsed_sec'] = df.index * (self.data.get('interval', 1000) / 1000)
                dfs[metric_name] = df
                
        return dfs
    
    def plot_latency(self, dfs, output_dir='plots'):
        """Plot latency over time"""
        Path(output_dir).mkdir(exist_ok=True)
        
        if 'latency' not in dfs or dfs['latency'].empty:
            print("No latency data available")
            return
            
        df = dfs['latency']
        
        plt.figure(figsize=(12, 6))
        plt.plot(df['elapsed_sec'], df['value'], linewidth=0.8, alpha=0.7)
        
        # Add statistics
        mean = df['value'].mean()
        p95 = df['value'].quantile(0.95)
        p99 = df['value'].quantile(0.99)
        
        plt.axhline(y=mean, color='g', linestyle='--', label=f'Mean: {mean:.2f} ms')
        plt.axhline(y=p95, color='orange', linestyle='--', label=f'P95: {p95:.2f} ms')
        plt.axhline(y=p99, color='r', linestyle='--', label=f'P99: {p99:.2f} ms')
        
        plt.xlabel('Time (seconds)')
        plt.ylabel('Latency (ms)')
        plt.title(f'Round-Trip Latency - {self.data.get("sessionId", "Unknown Session")}')
        plt.legend()
        plt.grid(True, alpha=0.3)
        plt.tight_layout()
        
        output_file = Path(output_dir) / 'latency.png'
        plt.savefig(output_file, dpi=150)
        print(f"✅ Latency plot saved to {output_file}")
        plt.close()
    
    def plot_jitter(self, dfs, output_dir='plots'):
        """Plot jitter over time"""
        Path(output_dir).mkdir(exist_ok=True)
        
        if 'jitter' not in dfs or dfs['jitter'].empty:
            print("No jitter data available")
            return
            
        df = dfs['jitter']
        
        plt.figure(figsize=(12, 6))
        plt.plot(df['elapsed_sec'], df['value'], linewidth=0.8, alpha=0.7, color='purple')
        
        # Add statistics
        mean = df['value'].mean()
        p95 = df['value'].quantile(0.95)
        
        plt.axhline(y=mean, color='g', linestyle='--', label=f'Mean: {mean:.2f} ms')
        plt.axhline(y=p95, color='r', linestyle='--', label=f'P95: {p95:.2f} ms')
        
        plt.xlabel('Time (seconds)')
        plt.ylabel('Jitter (ms)')
        plt.title(f'Jitter - {self.data.get("sessionId", "Unknown Session")}')
        plt.legend()
        plt.grid(True, alpha=0.3)
        plt.tight_layout()
        
        output_file = Path(output_dir) / 'jitter.png'
        plt.savefig(output_file, dpi=150)
        print(f"✅ Jitter plot saved to {output_file}")
        plt.close()
    
    def plot_packet_loss(self, dfs, output_dir='plots'):
        """Plot packet loss over time"""
        Path(output_dir).mkdir(exist_ok=True)
        
        if 'packetLoss' not in dfs or dfs['packetLoss'].empty:
            print("No packet loss data available")
            return
            
        df = dfs['packetLoss']
        
        plt.figure(figsize=(12, 6))
        plt.plot(df['elapsed_sec'], df['value'], linewidth=0.8, alpha=0.7, color='red')
        
        mean = df['value'].mean()
        plt.axhline(y=mean, color='orange', linestyle='--', label=f'Mean: {mean:.2f}%')
        
        plt.xlabel('Time (seconds)')
        plt.ylabel('Packet Loss (%)')
        plt.title(f'Packet Loss Rate - {self.data.get("sessionId", "Unknown Session")}')
        plt.legend()
        plt.grid(True, alpha=0.3)
        plt.tight_layout()
        
        output_file = Path(output_dir) / 'packet_loss.png'
        plt.savefig(output_file, dpi=150)
        print(f"✅ Packet loss plot saved to {output_file}")
        plt.close()
    
    def plot_bitrate(self, dfs, output_dir='plots'):
        """Plot bitrate over time"""
        Path(output_dir).mkdir(exist_ok=True)
        
        if 'bitrate' not in dfs or dfs['bitrate'].empty:
            print("No bitrate data available")
            return
            
        df = dfs['bitrate']
        
        plt.figure(figsize=(12, 6))
        plt.plot(df['elapsed_sec'], df['value'], linewidth=0.8, alpha=0.7, color='blue')
        
        mean = df['value'].mean()
        plt.axhline(y=mean, color='g', linestyle='--', label=f'Mean: {mean:.2f} kbps')
        
        plt.xlabel('Time (seconds)')
        plt.ylabel('Bitrate (kbps)')
        plt.title(f'Incoming Video Bitrate - {self.data.get("sessionId", "Unknown Session")}')
        plt.legend()
        plt.grid(True, alpha=0.3)
        plt.tight_layout()
        
        output_file = Path(output_dir) / 'bitrate.png'
        plt.savefig(output_file, dpi=150)
        print(f"✅ Bitrate plot saved to {output_file}")
        plt.close()
    
    def plot_all_metrics_combined(self, dfs, output_dir='plots'):
        """Create a combined plot with all metrics"""
        Path(output_dir).mkdir(exist_ok=True)
        
        fig, axes = plt.subplots(2, 2, figsize=(15, 10))
        fig.suptitle(f'Performance Metrics - {self.data.get("sessionId", "Unknown")}', 
                     fontsize=16)
        
        # Latency
        if 'latency' in dfs and not dfs['latency'].empty:
            df = dfs['latency']
            axes[0, 0].plot(df['elapsed_sec'], df['value'], linewidth=0.8)
            axes[0, 0].axhline(y=df['value'].mean(), color='r', linestyle='--', alpha=0.7)
            axes[0, 0].set_xlabel('Time (s)')
            axes[0, 0].set_ylabel('Latency (ms)')
            axes[0, 0].set_title('Round-Trip Latency')
            axes[0, 0].grid(True, alpha=0.3)
        
        # Jitter
        if 'jitter' in dfs and not dfs['jitter'].empty:
            df = dfs['jitter']
            axes[0, 1].plot(df['elapsed_sec'], df['value'], linewidth=0.8, color='purple')
            axes[0, 1].axhline(y=df['value'].mean(), color='r', linestyle='--', alpha=0.7)
            axes[0, 1].set_xlabel('Time (s)')
            axes[0, 1].set_ylabel('Jitter (ms)')
            axes[0, 1].set_title('Jitter')
            axes[0, 1].grid(True, alpha=0.3)
        
        # Packet Loss
        if 'packetLoss' in dfs and not dfs['packetLoss'].empty:
            df = dfs['packetLoss']
            axes[1, 0].plot(df['elapsed_sec'], df['value'], linewidth=0.8, color='red')
            axes[1, 0].axhline(y=df['value'].mean(), color='orange', linestyle='--', alpha=0.7)
            axes[1, 0].set_xlabel('Time (s)')
            axes[1, 0].set_ylabel('Packet Loss (%)')
            axes[1, 0].set_title('Packet Loss')
            axes[1, 0].grid(True, alpha=0.3)
        
        # Bitrate
        if 'bitrate' in dfs and not dfs['bitrate'].empty:
            df = dfs['bitrate']
            axes[1, 1].plot(df['elapsed_sec'], df['value'], linewidth=0.8, color='blue')
            axes[1, 1].axhline(y=df['value'].mean(), color='g', linestyle='--', alpha=0.7)
            axes[1, 1].set_xlabel('Time (s)')
            axes[1, 1].set_ylabel('Bitrate (kbps)')
            axes[1, 1].set_title('Bitrate')
            axes[1, 1].grid(True, alpha=0.3)
        
        plt.tight_layout()
        
        output_file = Path(output_dir) / 'combined_metrics.png'
        plt.savefig(output_file, dpi=150)
        print(f"✅ Combined plot saved to {output_file}")
        plt.close()
    
    def print_statistics(self):
        """Print detailed statistics"""
        print("\n" + "="*60)
        print("PERFORMANCE STATISTICS SUMMARY")
        print("="*60 + "\n")
        
        summary = self.data.get('summary', {})
        
        print(f"Session ID: {self.data.get('sessionId', 'Unknown')}")
        print(f"Duration: {summary.get('duration', 0) / 1000:.2f} seconds")
        print(f"Samples: {summary.get('samples', 0)}\n")
        
        # Print each metric
        for metric in ['latency', 'jitter', 'packetLoss', 'bitrate', 'frameRate']:
            if metric in summary:
                stats = summary[metric]
                print(f"{metric.upper()}:")
                print(f"  Mean: {stats.get('mean', 'N/A')}")
                print(f"  P50:  {stats.get('p50', 'N/A')}")
                print(f"  P95:  {stats.get('p95', 'N/A')}")
                print(f"  P99:  {stats.get('p99', 'N/A')}")
                print(f"  Min:  {stats.get('min', 'N/A')}")
                print(f"  Max:  {stats.get('max', 'N/A')}")
                print()
        
        print("="*60 + "\n")
    
    def generate_report(self, output_dir='plots'):
        """Generate all plots and statistics"""
        print("\n📊 Generating performance analysis...\n")
        
        # Extract time series
        dfs = self.extract_metrics_timeseries()
        
        if dfs is None:
            print("❌ No metrics data found")
            return
        
        # Print statistics
        self.print_statistics()
        
        # Generate plots
        self.plot_latency(dfs, output_dir)
        self.plot_jitter(dfs, output_dir)
        self.plot_packet_loss(dfs, output_dir)
        self.plot_bitrate(dfs, output_dir)
        self.plot_all_metrics_combined(dfs, output_dir)
        
        print(f"\n✅ Analysis complete! Plots saved to {output_dir}/")


def compare_two_tests(baseline_file, e2ee_file, output_dir='comparison'):
    """Compare baseline vs E2EE results"""
    Path(output_dir).mkdir(exist_ok=True)
    
    print("\n🔍 Comparing Baseline vs E2EE...\n")
    
    with open(baseline_file) as f:
        baseline = json.load(f)
    with open(e2ee_file) as f:
        e2ee = json.load(f)
    
    # Extract summaries
    baseline_summary = baseline.get('summary', {})
    e2ee_summary = e2ee.get('summary', {})
    
    # Comparison data
    metrics = ['latency', 'jitter', 'packetLoss', 'bitrate']
    stats = ['mean', 'p95', 'p99']
    
    fig, axes = plt.subplots(2, 2, figsize=(14, 10))
    fig.suptitle('Baseline vs E2EE Comparison', fontsize=16)
    
    for idx, metric in enumerate(metrics):
        ax = axes[idx // 2, idx % 2]
        
        baseline_vals = []
        e2ee_vals = []
        labels = []
        
        for stat in stats:
            b_val = float(baseline_summary.get(metric, {}).get(stat, 0))
            e_val = float(e2ee_summary.get(metric, {}).get(stat, 0))
            baseline_vals.append(b_val)
            e2ee_vals.append(e_val)
            labels.append(stat.upper())
        
        x = np.arange(len(labels))
        width = 0.35
        
        ax.bar(x - width/2, baseline_vals, width, label='Baseline', alpha=0.8)
        ax.bar(x + width/2, e2ee_vals, width, label='E2EE', alpha=0.8)
        
        ax.set_ylabel(metric.capitalize())
        ax.set_title(f'{metric.capitalize()} Comparison')
        ax.set_xticks(x)
        ax.set_xticklabels(labels)
        ax.legend()
        ax.grid(True, alpha=0.3, axis='y')
    
    plt.tight_layout()
    
    output_file = Path(output_dir) / 'baseline_vs_e2ee.png'
    plt.savefig(output_file, dpi=150)
    print(f"✅ Comparison plot saved to {output_file}")
    plt.close()
    
    # Print numerical comparison
    print("\n" + "="*60)
    print("NUMERICAL COMPARISON")
    print("="*60 + "\n")
    
    for metric in metrics:
        print(f"{metric.upper()}:")
        b_mean = float(baseline_summary.get(metric, {}).get('mean', 0))
        e_mean = float(e2ee_summary.get(metric, {}).get('mean', 0))
        diff = e_mean - b_mean
        pct = (diff / b_mean * 100) if b_mean > 0 else 0
        
        print(f"  Baseline: {b_mean:.2f}")
        print(f"  E2EE:     {e_mean:.2f}")
        print(f"  Δ:        {diff:+.2f} ({pct:+.2f}%)")
        print()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python analyze_performance.py <data_file.json>")
        print("  python analyze_performance.py --compare <baseline.json> <e2ee.json>")
        sys.exit(1)
    
    if sys.argv[1] == '--compare' and len(sys.argv) == 4:
        compare_two_tests(sys.argv[2], sys.argv[3])
    else:
        analyzer = PerformanceAnalyzer(sys.argv[1])
        analyzer.generate_report()
