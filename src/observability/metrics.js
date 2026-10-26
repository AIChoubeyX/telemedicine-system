class MetricsTracker {
  constructor() {
    this.startTime = Date.now();
    this.totalRequests = 0;
    this.totalSuccesses = 0;
    this.totalClientErrors = 0; // 4xx
    this.totalServerErrors = 0; // 5xx
    this.totalLatencyMs = 0;
    this.activeRequests = 0;
  }

  middleware() {
    return (req, res, next) => {
      // Skip static or internal metric endpoints
      if (req.path === '/health' || req.path === '/ready' || req.path === '/metrics') {
        return next();
      }

      this.totalRequests++;
      this.activeRequests++;
      const start = Date.now();

      res.on('finish', () => {
        this.activeRequests--;
        const duration = Date.now() - start;
        this.totalLatencyMs += duration;

        if (res.statusCode >= 500) {
          this.totalServerErrors++;
        } else if (res.statusCode >= 400) {
          this.totalClientErrors++;
        } else {
          this.totalSuccesses++;
        }
      });

      next();
    };
  }

  getMetrics() {
    const uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000);
    const avgLatencyMs =
      this.totalRequests > 0
        ? Number((this.totalLatencyMs / this.totalRequests).toFixed(2))
        : 0;

    const memory = process.memoryUsage();

    return {
      uptimeSeconds,
      requests: {
        total: this.totalRequests,
        active: this.activeRequests,
        successes: this.totalSuccesses,
        clientErrors4xx: this.totalClientErrors,
        serverErrors5xx: this.totalServerErrors
      },
      latency: {
        averageMs: avgLatencyMs,
        totalMs: this.totalLatencyMs
      },
      system: {
        nodeVersion: process.version,
        memoryUsageMb: {
          rss: Number((memory.rss / 1024 / 1024).toFixed(2)),
          heapTotal: Number((memory.heapTotal / 1024 / 1024).toFixed(2)),
          heapUsed: Number((memory.heapUsed / 1024 / 1024).toFixed(2))
        }
      }
    };
  }
}

export const metrics = new MetricsTracker();
