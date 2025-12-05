#!/usr/bin/env python3
"""
overall_comparison.py

Aggregate all baseline_* and e2ee_* JSON result files in the current
directory and produce an overall "Baseline vs E2EE" comparison plot.

Usage:
    python overall_comparison.py              # use current directory
    python overall_comparison.py /path/to/json/dir
"""

import json
import sys
from pathlib import Path

import numpy as np
import matplotlib.pyplot as plt

METRIC_KEYS = ["latency", "jitter", "packetLoss", "bitrate", "frameRate"]


def aggregate_metrics(files):
    """Aggregate metric samples across a list of JSON files.

    Returns:
        metrics: dict[str, np.ndarray] with concatenated samples
        total_samples: total count of latency samples
        total_duration_ms: sum of session durations in ms
    """
    metrics = {k: [] for k in METRIC_KEYS}
    total_samples = 0
    total_duration_ms = 0

    for path in files:
        path = Path(path)
        with path.open("r") as f:
            data = json.load(f)

        m = data.get("metrics", {})
        # concatenate values for each metric
        for key in METRIC_KEYS:
            if key not in m:
                continue
            metrics[key].extend(point["value"] for point in m[key])

        summary = data.get("summary", {})
        total_samples += int(summary.get("samples", len(m.get("latency", []))))
        total_duration_ms += int(summary.get("duration", 0))

    # convert lists to numpy arrays
    for k in metrics:
        metrics[k] = np.array(metrics[k], dtype=float)

    return metrics, total_samples, total_duration_ms


def compute_stats(arr):
    """Compute mean, p50, p95, p99, min, max for a 1D array."""
    arr = np.asarray(arr, dtype=float)
    if arr.size == 0:
        return {
            "mean": np.nan,
            "p50": np.nan,
            "p95": np.nan,
            "p99": np.nan,
            "min": np.nan,
            "max": np.nan,
            "count": 0,
        }

    stats = {
        "mean": float(arr.mean()),
        "p50": float(np.quantile(arr, 0.50)),
        "p95": float(np.quantile(arr, 0.95)),
        "p99": float(np.quantile(arr, 0.99)),
        "min": float(arr.min()),
        "max": float(arr.max()),
        "count": int(arr.size),
    }
    return stats


def print_summary(name, metrics, total_samples, total_duration_ms):
    """Pretty-print the aggregated statistics for one configuration."""
    print(f"===== {name} configuration =====")
    print(f"Total samples:  {total_samples}")
    print(f"Total duration: {total_duration_ms / 1000:.1f} s "
          f"({total_duration_ms / 60000:.2f} min)")
    print()

    for metric_key in ["latency", "jitter", "packetLoss", "bitrate", "frameRate"]:
        stats = compute_stats(metrics[metric_key])
        units = {
            "latency": "ms",
            "jitter": "ms",
            "packetLoss": "%",
            "bitrate": "kb/s",
            "frameRate": "fps",
        }[metric_key]

        print(metric_key.upper())
        print(f"  mean: {stats['mean']:.2f} {units}")
        print(f"  p50:  {stats['p50']:.2f} {units}")
        print(f"  p95:  {stats['p95']:.2f} {units}")
        print(f"  p99:  {stats['p99']:.2f} {units}")
        print(f"  min:  {stats['min']:.2f} {units}")
        print(f"  max:  {stats['max']:.2f} {units}")
        print()


def build_bar_data(baseline_metrics, e2ee_metrics, metric_key):
    """Return arrays of [mean, p95, p99] for baseline and E2EE."""
    b_stats = compute_stats(baseline_metrics[metric_key])
    e_stats = compute_stats(e2ee_metrics[metric_key])
    baseline_vals = np.array(
        [b_stats["mean"], b_stats["p95"], b_stats["p99"]], dtype=float
    )
    e2ee_vals = np.array(
        [e_stats["mean"], e_stats["p95"], e_stats["p99"]], dtype=float
    )
    return baseline_vals, e2ee_vals


def make_overall_plot(baseline_metrics, e2ee_metrics,
                      output_path="baseline_vs_e2ee_overall.png"):
    """Create 2x2 subplot figure comparing Baseline vs E2EE."""
    # Prepare bar values
    latency_b, latency_e = build_bar_data(baseline_metrics, e2ee_metrics, "latency")
    jitter_b, jitter_e = build_bar_data(baseline_metrics, e2ee_metrics, "jitter")
    packet_b, packet_e = build_bar_data(baseline_metrics, e2ee_metrics, "packetLoss")
    bitrate_b, bitrate_e = build_bar_data(baseline_metrics, e2ee_metrics, "bitrate")

    labels = ["MEAN", "P95", "P99"]
    x = np.arange(len(labels))
    width = 0.35

    fig, axes = plt.subplots(2, 2, figsize=(11, 8))
    fig.suptitle("Baseline vs E2EE - Overall Comparison", fontsize=16)

    # Latency subplot
    ax = axes[0, 0]
    ax.bar(x - width / 2, latency_b, width, label="Baseline")
    ax.bar(x + width / 2, latency_e, width, label="E2EE")
    ax.set_xticks(x)
    ax.set_xticklabels(labels)
    ax.set_ylabel("Latency (ms)")
    ax.set_title("Latency Comparison")
    ax.legend()
    ax.grid(True, axis="y", alpha=0.3)

    # Jitter subplot
    ax = axes[0, 1]
    ax.bar(x - width / 2, jitter_b, width, label="Baseline")
    ax.bar(x + width / 2, jitter_e, width, label="E2EE")
    ax.set_xticks(x)
    ax.set_xticklabels(labels)
    ax.set_ylabel("Jitter (ms)")
    ax.set_title("Jitter Comparison")
    ax.legend()
    ax.grid(True, axis="y", alpha=0.3)

    # Packet loss subplot
    ax = axes[1, 0]
    ax.bar(x - width / 2, packet_b, width, label="Baseline")
    ax.bar(x + width / 2, packet_e, width, label="E2EE")
    ax.set_xticks(x)
    ax.set_xticklabels(labels)
    ax.set_ylabel("Packet loss (%)")
    ax.set_title("Packet Loss Comparison")
    ax.legend()
    ax.grid(True, axis="y", alpha=0.3)

    # Bitrate subplot
    ax = axes[1, 1]
    ax.bar(x - width / 2, bitrate_b, width, label="Baseline")
    ax.bar(x + width / 2, bitrate_e, width, label="E2EE")
    ax.set_xticks(x)
    ax.set_xticklabels(labels)
    ax.set_ylabel("Bitrate (kb/s)")
    ax.set_title("Bitrate Comparison")
    ax.legend()
    ax.grid(True, axis="y", alpha=0.3)

    fig.tight_layout(rect=[0, 0.03, 1, 0.95])
    output_path = Path(output_path)
    fig.savefig(output_path, dpi=150)
    print(f" Saved overall comparison figure to {output_path}")


def main():
    if len(sys.argv) > 1:
        root = Path(sys.argv[1])
    else:
        root = Path(".")

    if not root.is_dir():
        print(f"Error: {root} is not a directory")
        sys.exit(1)

    baseline_files = sorted(root.glob("baseline_test*_peer*.json"))
    e2ee_files = sorted(root.glob("e2ee_test*_peer*.json"))

    if not baseline_files or not e2ee_files:
        print("Could not find expected JSON files. "
              "Make sure files named baseline_test*_peer*.json and "
              "e2ee_test*_peer*.json are in the target directory.")
        sys.exit(1)

    print("Found baseline files:")
    for f in baseline_files:
        print("  ", f.name)
    print("\nFound E2EE files:")
    for f in e2ee_files:
        print("  ", f.name)
    print()

    baseline_metrics, baseline_samples, baseline_duration = aggregate_metrics(baseline_files)
    e2ee_metrics, e2ee_samples, e2ee_duration = aggregate_metrics(e2ee_files)

    # Print textual summary (numbers used in your report text)
    print_summary("Baseline", baseline_metrics, baseline_samples, baseline_duration)
    print_summary("E2EE", e2ee_metrics, e2ee_samples, e2ee_duration)

    # Create overall comparison plot
    make_overall_plot(baseline_metrics, e2ee_metrics)


if __name__ == "__main__":
    main()
