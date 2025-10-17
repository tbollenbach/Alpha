const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * Coordinator Server - Manages helper nodes and distributes compute tasks
 * Handles node registration, authentication, task assignment, and result collection
 */
class CoordinatorServer {
  constructor(wsServer) {
    this.wsServer = wsServer;
    this.helperNodes = new Map(); // nodeId -> { ws, info, stats, status, lastHeartbeat }
    this.tasks = new Map(); // taskId -> { type, data, status, assignedTo, result, createdAt }
    this.taskQueue = []; // Array of taskIds waiting to be assigned
    this.apiKeys = this.loadApiKeys();
    this.config = this.loadConfig();
    this.computeSharingEnabled = true;
    this.autoAcceptEnabled = true;
    
    // Start heartbeat checker
    this.startHeartbeatChecker();
    
    console.log('Coordinator Server initialized');
  }

  loadConfig() {
    const configPath = path.join(__dirname, '../../config.json');
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }

  loadApiKeys() {
    const keysPath = path.join(__dirname, '../data/apiKeys.json');
    try {
      return JSON.parse(fs.readFileSync(keysPath, 'utf8'));
    } catch (error) {
      // Create default keys file if it doesn't exist
      const defaultKeys = {
        keys: {
          'demo-key-12345': {
            name: 'Demo Helper Node',
            permissions: ['compute', 'report'],
            active: true
          }
        }
      };
      fs.writeFileSync(keysPath, JSON.stringify(defaultKeys, null, 2));
      return defaultKeys;
    }
  }

  /**
   * Handle compute-related messages from helper nodes
   */
  handleMessage(ws, data) {
    try {
      switch (data.type) {
        case 'node_register':
          this.handleNodeRegister(ws, data);
          break;
        case 'node_heartbeat':
          this.handleNodeHeartbeat(ws, data);
          break;
        case 'node_stats':
          this.handleNodeStats(ws, data);
          break;
        case 'task_request':
          this.handleTaskRequest(ws, data);
          break;
        case 'task_result':
          this.handleTaskResult(ws, data);
          break;
        case 'task_progress':
          this.handleTaskProgress(ws, data);
          break;
        case 'node_disconnect':
          this.handleNodeDisconnect(ws, data);
          break;
        default:
          console.log('Unknown compute message type:', data.type);
      }
    } catch (error) {
      console.error('Error handling coordinator message:', error);
      this.sendToNode(ws, {
        type: 'error',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Register a new helper node
   */
  handleNodeRegister(ws, data) {
    const { apiKey, nodeInfo } = data;

    // Authenticate
    if (!this.authenticateNode(apiKey)) {
      this.sendToNode(ws, {
        type: 'register_failed',
        reason: 'Invalid API key'
      });
      return;
    }

    // Generate unique node ID
    const nodeId = this.generateNodeId();

    // Store node info
    this.helperNodes.set(nodeId, {
      ws,
      info: nodeInfo,
      stats: {},
      status: 'idle',
      lastHeartbeat: Date.now(),
      registeredAt: Date.now(),
      apiKey,
      tasksCompleted: 0,
      tasksFailed: 0
    });

    // Send success response
    this.sendToNode(ws, {
      type: 'register_success',
      nodeId,
      message: 'Node registered successfully'
    });

    // Broadcast node list update to UI
    this.broadcastNodeList();

    console.log(`Helper node registered: ${nodeId} (${nodeInfo.hostname || 'unknown'})`);
  }

  /**
   * Handle heartbeat from helper node
   */
  handleNodeHeartbeat(ws, data) {
    const { nodeId } = data;
    const node = this.helperNodes.get(nodeId);

    if (!node) {
      this.sendToNode(ws, {
        type: 'error',
        message: 'Node not registered'
      });
      return;
    }

    node.lastHeartbeat = Date.now();

    // Send acknowledgment
    this.sendToNode(ws, {
      type: 'heartbeat_ack',
      timestamp: Date.now()
    });
  }

  /**
   * Handle stats report from helper node
   */
  handleNodeStats(ws, data) {
    const { nodeId, stats } = data;
    const node = this.helperNodes.get(nodeId);

    if (!node) return;

    node.stats = {
      ...stats,
      lastUpdate: Date.now()
    };

    // Update status based on load
    if (stats.cpuUsage > 90) {
      node.status = 'busy';
    } else if (stats.cpuUsage < 50 && node.status === 'busy') {
      node.status = 'idle';
    }

    // Broadcast updated node list
    this.broadcastNodeList();
  }

  /**
   * Handle task request from helper node
   */
  handleTaskRequest(ws, data) {
    const { nodeId } = data;
    const node = this.helperNodes.get(nodeId);

    if (!node) {
      this.sendToNode(ws, {
        type: 'error',
        message: 'Node not registered'
      });
      return;
    }

    // Find a suitable task from queue
    const task = this.assignTaskToNode(nodeId, node);

    if (task) {
      this.sendToNode(ws, {
        type: 'task_assigned',
        task
      });
    } else {
      this.sendToNode(ws, {
        type: 'no_tasks',
        message: 'No tasks available'
      });
    }
  }

  /**
   * Handle task result submission
   */
  handleTaskResult(ws, data) {
    const { nodeId, taskId, result, success, error } = data;
    const node = this.helperNodes.get(nodeId);
    const task = this.tasks.get(taskId);

    if (!node || !task) {
      this.sendToNode(ws, {
        type: 'error',
        message: 'Invalid node or task ID'
      });
      return;
    }

    // Update task
    task.status = success ? 'completed' : 'failed';
    task.result = result;
    task.error = error;
    task.completedAt = Date.now();
    task.executionTime = task.completedAt - task.startedAt;

    // Update node stats
    if (success) {
      node.tasksCompleted++;
    } else {
      node.tasksFailed++;
    }
    node.status = 'idle';

    // Send acknowledgment
    this.sendToNode(ws, {
      type: 'result_received',
      taskId,
      message: 'Result recorded successfully'
    });

    // Broadcast task update to UI
    this.broadcastTaskUpdate(task);

    console.log(`Task ${taskId} completed by node ${nodeId}: ${success ? 'SUCCESS' : 'FAILED'}`);
  }

  /**
   * Handle task progress update
   */
  handleTaskProgress(ws, data) {
    const { nodeId, taskId, progress } = data;
    const task = this.tasks.get(taskId);

    if (task) {
      task.progress = progress;
      this.broadcastTaskUpdate(task);
    }
  }

  /**
   * Handle node disconnect
   */
  handleNodeDisconnect(ws, data) {
    const { nodeId } = data;
    this.removeNode(nodeId);
  }

  /**
   * Remove a node and reassign its tasks
   */
  removeNode(nodeId) {
    const node = this.helperNodes.get(nodeId);
    
    if (!node) return;

    // Find tasks assigned to this node and requeue them
    this.tasks.forEach((task, taskId) => {
      if (task.assignedTo === nodeId && task.status === 'running') {
        task.status = 'pending';
        task.assignedTo = null;
        this.taskQueue.push(taskId);
        console.log(`Task ${taskId} requeued due to node disconnect`);
      }
    });

    this.helperNodes.delete(nodeId);
    this.broadcastNodeList();

    console.log(`Helper node removed: ${nodeId}`);
  }

  /**
   * Assign a task to a node based on capabilities and load
   */
  assignTaskToNode(nodeId, node) {
    // Find first available task that matches node capabilities
    for (let i = 0; i < this.taskQueue.length; i++) {
      const taskId = this.taskQueue[i];
      const task = this.tasks.get(taskId);

      if (!task || task.status !== 'pending') continue;

      // Check if node can handle this task type
      if (this.canNodeHandleTask(node, task)) {
        // Remove from queue
        this.taskQueue.splice(i, 1);

        // Assign to node
        task.status = 'running';
        task.assignedTo = nodeId;
        task.startedAt = Date.now();
        node.status = 'working';

        return {
          taskId,
          type: task.type,
          data: task.data,
          timeout: task.timeout || 60000
        };
      }
    }

    return null;
  }

  /**
   * Check if a node can handle a specific task
   */
  canNodeHandleTask(node, task) {
    const stats = node.stats;

    switch (task.type) {
      case 'cpu_compute':
        return stats.cpuUsage < 80;
      case 'gpu_compute':
        return stats.hasGPU && stats.gpuUsage < 80;
      case 'memory_task':
        return stats.memoryAvailable > task.memoryRequired;
      default:
        return true; // Generic tasks can run anywhere
    }
  }

  /**
   * Create a new compute task
   */
  createTask(type, data, options = {}) {
    const taskId = this.generateTaskId();

    const task = {
      taskId,
      type,
      data,
      status: 'pending',
      assignedTo: null,
      result: null,
      createdAt: Date.now(),
      timeout: options.timeout || 60000,
      priority: options.priority || 0,
      memoryRequired: options.memoryRequired || 0
    };

    this.tasks.set(taskId, task);
    this.taskQueue.push(taskId);

    // Sort queue by priority
    this.taskQueue.sort((a, b) => {
      const taskA = this.tasks.get(a);
      const taskB = this.tasks.get(b);
      return (taskB.priority || 0) - (taskA.priority || 0);
    });

    this.broadcastTaskUpdate(task);

    console.log(`Task created: ${taskId} (${type})`);
    return taskId;
  }

  /**
   * Authenticate a node using API key
   */
  authenticateNode(apiKey) {
    const keyData = this.apiKeys.keys[apiKey];
    return keyData && keyData.active === true;
  }

  /**
   * Start periodic heartbeat checker
   */
  startHeartbeatChecker() {
    setInterval(() => {
      const now = Date.now();
      const timeout = 30000; // 30 seconds

      this.helperNodes.forEach((node, nodeId) => {
        if (now - node.lastHeartbeat > timeout) {
          console.log(`Node ${nodeId} heartbeat timeout, removing...`);
          this.removeNode(nodeId);
        }
      });
    }, 10000); // Check every 10 seconds
  }

  /**
   * Broadcast node list to all connected UI clients
   */
  broadcastNodeList() {
    const nodes = Array.from(this.helperNodes.entries()).map(([nodeId, node]) => ({
      nodeId,
      hostname: node.info.hostname,
      platform: node.info.platform,
      cpuCores: node.info.cpuCores,
      totalMemory: node.info.totalMemory,
      status: node.status,
      stats: node.stats,
      tasksCompleted: node.tasksCompleted,
      tasksFailed: node.tasksFailed,
      registeredAt: node.registeredAt
    }));

    // Send to main WebSocket server to broadcast to UI clients
    if (this.wsServer) {
      this.wsServer.broadcast(JSON.stringify({
        type: 'compute_nodes',
        nodes
      }));
    }
  }

  /**
   * Broadcast task update to UI
   */
  broadcastTaskUpdate(task) {
    if (this.wsServer) {
      this.wsServer.broadcast(JSON.stringify({
        type: 'compute_task_update',
        task: {
          taskId: task.taskId,
          type: task.type,
          status: task.status,
          assignedTo: task.assignedTo,
          progress: task.progress,
          createdAt: task.createdAt,
          completedAt: task.completedAt,
          executionTime: task.executionTime
        }
      }));
    }
  }

  /**
   * Send message to a specific node
   */
  sendToNode(ws, data) {
    if (ws && ws.readyState === 1) { // WebSocket.OPEN
      ws.send(JSON.stringify(data));
    }
  }

  /**
   * Generate unique node ID
   */
  generateNodeId() {
    return `node_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  /**
   * Generate unique task ID
   */
  generateTaskId() {
    return `task_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  /**
   * Get compute network statistics
   */
  getNetworkStats() {
    const nodes = Array.from(this.helperNodes.values());
    const tasks = Array.from(this.tasks.values());

    // Calculate combined resources
    const totalCPUCores = nodes.reduce((sum, n) => sum + (n.info.cpuCores || 0), 0);
    const totalMemory = nodes.reduce((sum, n) => sum + (n.info.totalMemory || 0), 0);
    const totalGPUs = nodes.reduce((sum, n) => sum + (n.info.gpuCount || 0), 0);
    
    // Calculate average CPU usage across all nodes
    const avgCPUUsage = nodes.length > 0 
      ? nodes.reduce((sum, n) => sum + (n.stats.cpuUsage || 0), 0) / nodes.length 
      : 0;
    
    // Calculate average memory usage across all nodes
    const avgMemoryUsage = nodes.length > 0
      ? nodes.reduce((sum, n) => sum + (n.stats.memoryUsage || 0), 0) / nodes.length
      : 0;

    return {
      totalNodes: nodes.length,
      activeNodes: nodes.filter(n => n.status === 'working').length,
      idleNodes: nodes.filter(n => n.status === 'idle').length,
      totalTasks: tasks.length,
      pendingTasks: tasks.filter(t => t.status === 'pending').length,
      runningTasks: tasks.filter(t => t.status === 'running').length,
      completedTasks: tasks.filter(t => t.status === 'completed').length,
      failedTasks: tasks.filter(t => t.status === 'failed').length,
      totalCPUCores,
      totalMemory,
      totalGPUs,
      avgCPUUsage: Math.round(avgCPUUsage),
      avgMemoryUsage: Math.round(avgMemoryUsage),
      totalTasksCompleted: nodes.reduce((sum, n) => sum + (n.tasksCompleted || 0), 0),
      totalTasksFailed: nodes.reduce((sum, n) => sum + (n.tasksFailed || 0), 0)
    };
  }

  /**
   * Clean up old completed tasks
   */
  cleanupOldTasks(maxAge = 3600000) { // Default: 1 hour
    const now = Date.now();
    let cleaned = 0;

    this.tasks.forEach((task, taskId) => {
      if (task.status === 'completed' || task.status === 'failed') {
        if (now - (task.completedAt || task.createdAt) > maxAge) {
          this.tasks.delete(taskId);
          cleaned++;
        }
      }
    });

    if (cleaned > 0) {
      console.log(`Cleaned up ${cleaned} old tasks`);
    }
  }

  /**
   * Toggle compute sharing globally
   */
  setComputeSharingEnabled(enabled) {
    this.computeSharingEnabled = enabled;
    console.log(`Compute sharing ${enabled ? 'enabled' : 'disabled'} globally`);
    
    // Broadcast to all connected UI clients
    if (this.wsServer) {
      this.wsServer.broadcast(JSON.stringify({
        type: 'compute_sharing_toggled',
        enabled
      }));
    }
  }

  /**
   * Toggle auto-accept globally
   */
  setAutoAcceptEnabled(enabled) {
    this.autoAcceptEnabled = enabled;
    console.log(`Auto-accept ${enabled ? 'enabled' : 'disabled'} globally`);
    
    // Broadcast to all connected UI clients
    if (this.wsServer) {
      this.wsServer.broadcast(JSON.stringify({
        type: 'auto_accept_toggled',
        enabled
      }));
    }
  }

  /**
   * Toggle individual node
   */
  toggleNode(nodeId, enabled) {
    const node = this.helperNodes.get(nodeId);
    if (!node) {
      console.log(`Node ${nodeId} not found`);
      return;
    }

    node.enabled = enabled;
    
    if (!enabled) {
      // If disabling, reassign any tasks this node was working on
      this.tasks.forEach((task, taskId) => {
        if (task.assignedTo === nodeId && task.status === 'running') {
          task.status = 'pending';
          task.assignedTo = null;
          this.taskQueue.push(taskId);
          console.log(`Task ${taskId} reassigned due to node ${nodeId} being disabled`);
        }
      });
    }

    console.log(`Node ${nodeId} ${enabled ? 'enabled' : 'disabled'}`);
    
    // Broadcast updated node list
    this.broadcastNodeList();
  }
}

module.exports = CoordinatorServer;

