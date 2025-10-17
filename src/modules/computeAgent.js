const WebSocket = require('ws');
const os = require('os');
const fs = require('fs');
const path = require('path');

/**
 * Compute Agent - Runs on helper nodes
 * Connects to coordinator, reports stats, requests and executes tasks
 */
class ComputeAgent {
  constructor(isLocalAgent = false) {
    this.ws = null;
    this.nodeId = null;
    this.config = this.loadConfig();
    this.isRunning = false;
    this.isLocalAgent = isLocalAgent;
    this.currentTask = null;
    this.stats = {};
    
    // Timers
    this.heartbeatInterval = null;
    this.statsInterval = null;
    this.taskRequestInterval = null;
  }

  loadConfig() {
    const configPath = path.join(__dirname, '../../config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    
    // Load agent-specific config
    const agentConfigPath = path.join(__dirname, '../../agentConfig.json');
    try {
      const agentConfig = JSON.parse(fs.readFileSync(agentConfigPath, 'utf8'));
      return { ...config, agent: agentConfig };
    } catch (error) {
      console.log('No agent config found, using defaults');
      return { ...config, agent: { enabled: false } };
    }
  }

  /**
   * Start the compute agent
   */
  async start() {
    // For local coordinator agent, always enable
    if (!this.config.agent || (!this.config.agent.enabled && !this.isLocalAgent)) {
      console.log('Compute agent is disabled');
      return false;
    }

    console.log('Starting Compute Agent...');
    
    const coordinatorUrl = this.config.agent.coordinatorUrl || 
      `ws://${this.config.websocket.host}:${this.config.websocket.port}`;
    
    console.log(`Connecting to: ${coordinatorUrl}`);
    console.log(`Agent config:`, this.config.agent);
    
    try {
      await this.connect(coordinatorUrl);
      this.isRunning = true;
      return true;
    } catch (error) {
      console.error('Failed to start compute agent:', error);
      return false;
    }
  }

  /**
   * Connect to coordinator server
   */
  connect(url) {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);

      this.ws.on('open', () => {
        console.log('Connected to coordinator');
        this.register();
        this.startIntervals();
        resolve();
      });

      this.ws.on('message', (data) => {
        this.handleMessage(data);
      });

      this.ws.on('close', () => {
        console.log('Disconnected from coordinator');
        this.handleDisconnect();
      });

      this.ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        reject(error);
      });
    });
  }

  /**
   * Register this node with the coordinator
   */
  register() {
    const nodeInfo = this.collectNodeInfo();
    
    // Use local agent key for the coordinator's own agent
    const apiKey = this.config.agent.apiKey || 'local-coordinator-agent';
    
    this.send({
      type: 'node_register',
      apiKey,
      nodeInfo
    });
  }

  /**
   * Collect system information about this node
   */
  collectNodeInfo() {
    return {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      cpuCores: os.cpus().length,
      cpuModel: os.cpus()[0].model,
      totalMemory: os.totalmem(),
      gpuCount: this.detectGPUCount(),
      nodeVersion: process.version,
      capabilities: this.detectCapabilities()
    };
  }

  /**
   * Detect what this node can do (CPU, GPU, etc.)
   */
  detectCapabilities() {
    const capabilities = ['cpu_compute'];

    // Check for GPU (simplified - in production use proper GPU detection)
    // This is a placeholder - real implementation would check for CUDA, OpenCL, etc.
    if (process.platform === 'win32' || process.platform === 'linux') {
      // Assume possibility of GPU
      capabilities.push('gpu_compute');
    }

    return capabilities;
  }

  /**
   * Detect GPU count (placeholder - real implementation would use proper detection)
   */
  detectGPUCount() {
    // This is a simplified detection - in production you'd use:
    // - nvidia-smi for NVIDIA GPUs
    // - AMD GPU detection tools
    // - OpenCL/CUDA runtime detection
    
    // For demo purposes, randomly assign 0-2 GPUs
    const hasGPU = Math.random() > 0.7; // 30% chance of having GPU
    return hasGPU ? Math.floor(Math.random() * 2) + 1 : 0;
  }

  /**
   * Collect current system stats
   */
  collectStats() {
    const cpus = os.cpus();
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    
    // Calculate CPU usage (simplified)
    let totalIdle = 0;
    let totalTick = 0;
    
    cpus.forEach(cpu => {
      for (const type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    });
    
    const cpuUsage = 100 - ~~(100 * totalIdle / totalTick);

    return {
      cpuUsage,
      cpuCores: cpus.length,
      memoryTotal: totalMemory,
      memoryUsed: totalMemory - freeMemory,
      memoryFree: freeMemory,
      memoryUsage: ((totalMemory - freeMemory) / totalMemory * 100).toFixed(2),
      memoryAvailable: freeMemory,
      uptime: os.uptime(),
      loadAverage: os.loadavg(),
      hasGPU: false, // Placeholder
      gpuUsage: 0    // Placeholder
    };
  }

  /**
   * Handle messages from coordinator
   */
  handleMessage(data) {
    try {
      const message = JSON.parse(data);

      switch (message.type) {
        case 'register_success':
          this.handleRegisterSuccess(message);
          break;
        case 'register_failed':
          this.handleRegisterFailed(message);
          break;
        case 'task_assigned':
          this.handleTaskAssigned(message);
          break;
        case 'no_tasks':
          // No tasks available, just wait
          break;
        case 'result_received':
          this.handleResultReceived(message);
          break;
        case 'heartbeat_ack':
          // Heartbeat acknowledged
          break;
        case 'error':
          console.error('Coordinator error:', message.message);
          break;
        default:
          console.log('Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('Error handling message:', error);
    }
  }

  /**
   * Handle successful registration
   */
  handleRegisterSuccess(message) {
    this.nodeId = message.nodeId;
    console.log(`Registered with coordinator as ${this.nodeId}`);
  }

  /**
   * Handle failed registration
   */
  handleRegisterFailed(message) {
    console.error('Registration failed:', message.reason);
    this.stop();
  }

  /**
   * Handle task assignment
   */
  async handleTaskAssigned(message) {
    const { task } = message;
    
    if (this.currentTask) {
      console.log('Already executing a task, cannot accept new task');
      return;
    }

    this.currentTask = task;
    console.log(`Executing task ${task.taskId} (${task.type})`);

    try {
      const result = await this.executeTask(task);
      
      this.send({
        type: 'task_result',
        nodeId: this.nodeId,
        taskId: task.taskId,
        result,
        success: true
      });

      console.log(`Task ${task.taskId} completed successfully`);
    } catch (error) {
      console.error(`Task ${task.taskId} failed:`, error);
      
      this.send({
        type: 'task_result',
        nodeId: this.nodeId,
        taskId: task.taskId,
        error: error.message,
        success: false
      });
    } finally {
      this.currentTask = null;
    }
  }

  /**
   * Execute a task based on its type
   */
  async executeTask(task) {
    const { type, data, timeout } = task;

    // Set timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Task timeout')), timeout);
    });

    // Execute task based on type
    const taskPromise = this.runTaskByType(type, data);

    return Promise.race([taskPromise, timeoutPromise]);
  }

  /**
   * Run task based on its type
   */
  async runTaskByType(type, data) {
    switch (type) {
      case 'cpu_compute':
        return this.runCPUCompute(data);
      
      case 'hash_compute':
        return this.runHashCompute(data);
      
      case 'fibonacci':
        return this.runFibonacci(data);
      
      case 'prime_check':
        return this.runPrimeCheck(data);
      
      case 'custom_code':
        return this.runCustomCode(data);
      
      default:
        throw new Error(`Unknown task type: ${type}`);
    }
  }

  /**
   * CPU compute task - burn cycles
   */
  async runCPUCompute(data) {
    const { iterations = 1000000 } = data;
    let result = 0;

    for (let i = 0; i < iterations; i++) {
      result += Math.sqrt(i) * Math.random();
      
      // Report progress every 10%
      if (i % Math.floor(iterations / 10) === 0) {
        this.reportProgress((i / iterations * 100).toFixed(0));
      }
    }

    return { result, iterations };
  }

  /**
   * Hash compute task - compute multiple hashes
   */
  async runHashCompute(data) {
    const crypto = require('crypto');
    const { input = 'test', iterations = 10000, algorithm = 'sha256' } = data;
    
    let hash = input;
    for (let i = 0; i < iterations; i++) {
      hash = crypto.createHash(algorithm).update(hash).digest('hex');
      
      if (i % Math.floor(iterations / 10) === 0) {
        this.reportProgress((i / iterations * 100).toFixed(0));
      }
    }

    return { hash, iterations };
  }

  /**
   * Fibonacci calculation
   */
  async runFibonacci(data) {
    const { n = 40 } = data;
    
    const fib = (num) => {
      if (num <= 1) return num;
      return fib(num - 1) + fib(num - 2);
    };

    const result = fib(n);
    return { n, result };
  }

  /**
   * Prime number check
   */
  async runPrimeCheck(data) {
    const { start = 1, end = 100000 } = data;
    const primes = [];

    const isPrime = (num) => {
      if (num <= 1) return false;
      if (num <= 3) return true;
      if (num % 2 === 0 || num % 3 === 0) return false;
      
      for (let i = 5; i * i <= num; i += 6) {
        if (num % i === 0 || num % (i + 2) === 0) return false;
      }
      return true;
    };

    for (let i = start; i <= end; i++) {
      if (isPrime(i)) {
        primes.push(i);
      }
      
      if ((i - start) % Math.floor((end - start) / 10) === 0) {
        this.reportProgress(((i - start) / (end - start) * 100).toFixed(0));
      }
    }

    return { start, end, primeCount: primes.length, primes: primes.slice(0, 100) };
  }

  /**
   * Execute custom code (DANGEROUS - use with caution!)
   */
  async runCustomCode(data) {
    const { code } = data;
    
    // WARNING: Executing arbitrary code is dangerous!
    // In production, this should be heavily sandboxed
    console.warn('Executing custom code - THIS IS DANGEROUS IN PRODUCTION!');
    
    try {
      // Create a sandboxed function
      const func = new Function('data', code);
      const result = func(data);
      return { result };
    } catch (error) {
      throw new Error(`Code execution failed: ${error.message}`);
    }
  }

  /**
   * Report task progress to coordinator
   */
  reportProgress(progress) {
    if (this.currentTask) {
      this.send({
        type: 'task_progress',
        nodeId: this.nodeId,
        taskId: this.currentTask.taskId,
        progress
      });
    }
  }

  /**
   * Handle result received acknowledgment
   */
  handleResultReceived(message) {
    // Result was received by coordinator
  }

  /**
   * Start periodic intervals for heartbeat, stats, and task requests
   */
  startIntervals() {
    // Heartbeat every 10 seconds
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, 10000);

    // Stats every 5 seconds
    this.statsInterval = setInterval(() => {
      this.sendStats();
    }, 5000);

    // Request tasks every 3 seconds if idle
    this.taskRequestInterval = setInterval(() => {
      if (!this.currentTask) {
        this.requestTask();
      }
    }, 3000);
  }

  /**
   * Send heartbeat to coordinator
   */
  sendHeartbeat() {
    this.send({
      type: 'node_heartbeat',
      nodeId: this.nodeId,
      timestamp: Date.now()
    });
  }

  /**
   * Send stats to coordinator
   */
  sendStats() {
    this.stats = this.collectStats();
    
    this.send({
      type: 'node_stats',
      nodeId: this.nodeId,
      stats: this.stats
    });
  }

  /**
   * Request a task from coordinator
   */
  requestTask() {
    this.send({
      type: 'task_request',
      nodeId: this.nodeId
    });
  }

  /**
   * Handle disconnect from coordinator
   */
  handleDisconnect() {
    this.clearIntervals();
    this.isRunning = false;
    
    // Attempt to reconnect after delay
    setTimeout(() => {
      if (this.config.agent && this.config.agent.enabled) {
        console.log('Attempting to reconnect...');
        this.start();
      }
    }, 5000);
  }

  /**
   * Clear all intervals
   */
  clearIntervals() {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    if (this.statsInterval) clearInterval(this.statsInterval);
    if (this.taskRequestInterval) clearInterval(this.taskRequestInterval);
  }

  /**
   * Send message to coordinator
   */
  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  /**
   * Stop the compute agent
   */
  stop() {
    console.log('Stopping Compute Agent...');
    
    this.clearIntervals();
    
    if (this.nodeId) {
      this.send({
        type: 'node_disconnect',
        nodeId: this.nodeId
      });
    }

    if (this.ws) {
      this.ws.close();
    }

    this.isRunning = false;
  }
}

module.exports = ComputeAgent;

