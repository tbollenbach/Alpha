const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const CoordinatorServer = require('./coordinatorServer');

class WebSocketServer {
  constructor() {
    this.wss = null;
    this.clients = new Map(); // userId -> { ws, username, role, status, isMuted, isSpeaking }
    this.config = this.loadConfig();
    this.roles = this.loadRoles();
    this.coordinator = null;
  }

  loadConfig() {
    const configPath = path.join(__dirname, '../../config.json');
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }

  loadRoles() {
    const rolesPath = path.join(__dirname, '../data/roles.json');
    return JSON.parse(fs.readFileSync(rolesPath, 'utf8'));
  }

  start() {
    const port = this.config.websocket.port;
    this.wss = new WebSocket.Server({ 
      port,
      host: '0.0.0.0' // Listen on all network interfaces for LAN access
    });

    console.log(`WebSocket server started on 0.0.0.0:${port} (accessible from LAN)`);

    // Initialize coordinator server
    this.coordinator = new CoordinatorServer(this);

    this.wss.on('connection', (ws) => {
      console.log('New client connected');

      ws.on('message', (message) => {
        this.handleMessage(ws, message);
      });

      ws.on('close', () => {
        this.handleDisconnect(ws);
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
      });
    });
  }

  handleMessage(ws, message) {
    try {
      const data = JSON.parse(message);

      switch (data.type) {
        case 'auth':
          this.handleAuth(ws, data);
          break;
        case 'chat':
          this.handleChatMessage(ws, data);
          break;
        case 'dm':
          this.handleDirectMessage(ws, data);
          break;
        case 'status':
          this.handleStatusChange(ws, data);
          break;
        case 'typing':
          this.handleTyping(ws, data);
          break;
        case 'webrtc_offer':
          this.handleWebRTCOffer(ws, data);
          break;
        case 'webrtc_answer':
          this.handleWebRTCAnswer(ws, data);
          break;
        case 'webrtc_ice':
          this.handleWebRTCIce(ws, data);
          break;
        case 'voice_state':
          this.handleVoiceState(ws, data);
          break;
        // Compute/Coordinator messages
        case 'node_register':
        case 'node_heartbeat':
        case 'node_stats':
        case 'task_request':
        case 'task_result':
        case 'task_progress':
        case 'node_disconnect':
          if (this.coordinator) {
            this.coordinator.handleMessage(ws, data);
          }
          break;
        case 'create_task':
          this.handleCreateTask(ws, data);
          break;
        case 'get_compute_stats':
          this.handleGetComputeStats(ws, data);
          break;
        case 'toggle_compute_sharing':
          this.handleToggleComputeSharing(ws, data);
          break;
        case 'toggle_auto_accept':
          this.handleToggleAutoAccept(ws, data);
          break;
        case 'toggle_node':
          this.handleToggleNode(ws, data);
          break;
        default:
          console.log('Unknown message type:', data.type);
      }
    } catch (error) {
      console.error('Error handling message:', error);
    }
  }

  handleAuth(ws, data) {
    const { username } = data;
    const userId = this.generateUserId();
    
    // Assign role (default to 'member' if not specified)
    const role = this.roles.users[username] || 'member';
    
    this.clients.set(userId, {
      ws,
      username,
      role,
      status: 'online',
      isMuted: true,
      isSpeaking: false
    });

    // Send auth success
    ws.send(JSON.stringify({
      type: 'auth_success',
      userId,
      username,
      role,
      roleData: this.roles.roles[role]
    }));

    // Broadcast user list update
    this.broadcastUserList();

    // Send recent message history (if any)
    this.sendMessageHistory(ws);
  }

  handleChatMessage(ws, data) {
    const client = this.getClientByWs(ws);
    if (!client) return;

    const { room, message } = data;
    
    // Check if user has permission to write
    const roleData = this.roles.roles[client.role];
    if (!roleData.permissions.includes('write') && !roleData.permissions.includes('all')) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'You do not have permission to send messages'
      }));
      return;
    }

    // Broadcast message to all clients in the room
    const messageData = {
      type: 'chat',
      room,
      username: client.username,
      role: client.role,
      message,
      timestamp: new Date().toISOString()
    };

    this.broadcastToRoom(room, messageData);
  }

  handleDirectMessage(ws, data) {
    const sender = this.getClientByWs(ws);
    if (!sender) return;

    const { recipientUsername, message } = data;
    
    // Find recipient
    const recipient = this.getClientByUsername(recipientUsername);
    
    if (!recipient) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'User not found or offline'
      }));
      return;
    }

    const dmData = {
      type: 'dm',
      from: sender.username,
      to: recipientUsername,
      message,
      timestamp: new Date().toISOString()
    };

    // Send to recipient
    recipient.ws.send(JSON.stringify(dmData));
    
    // Send confirmation to sender
    ws.send(JSON.stringify({
      ...dmData,
      type: 'dm_sent'
    }));
  }

  handleStatusChange(ws, data) {
    const client = this.getClientByWs(ws);
    if (!client) return;

    client.status = data.status;
    this.broadcastUserList();
  }

  handleTyping(ws, data) {
    const client = this.getClientByWs(ws);
    if (!client) return;

    const { room, isTyping } = data;

    // Broadcast typing indicator to all clients in the room
    this.broadcastToRoom(room, {
      type: 'typing',
      username: client.username,
      isTyping
    }, ws);
  }

  handleDisconnect(ws) {
    const client = this.getClientByWs(ws);
    if (client) {
      console.log(`Client disconnected: ${client.username}`);
      
      // Remove client
      for (const [userId, clientData] of this.clients.entries()) {
        if (clientData.ws === ws) {
          this.clients.delete(userId);
          break;
        }
      }

      // Broadcast updated user list
      this.broadcastUserList();
    }
  }

  broadcastUserList() {
    const users = Array.from(this.clients.values()).map(client => ({
      username: client.username,
      role: client.role,
      status: client.status,
      roleColor: this.roles.roles[client.role].color,
      isMuted: client.isMuted,
      isSpeaking: client.isSpeaking
    }));

    const message = JSON.stringify({
      type: 'user_list',
      users
    });

    this.broadcast(message);
  }

  broadcastToRoom(room, data, excludeWs = null) {
    const message = JSON.stringify(data);

    this.clients.forEach(client => {
      const roleData = this.roles.roles[client.role];
      
      // Check if client has access to this room
      if (roleData.rooms.includes(room) && client.ws !== excludeWs) {
        client.ws.send(message);
      }
    });
  }

  broadcast(message) {
    this.clients.forEach(client => {
      client.ws.send(message);
    });
  }

  sendMessageHistory(ws) {
    // For MVP, we're not storing message history
    // This can be implemented later with a database
    ws.send(JSON.stringify({
      type: 'message_history',
      messages: []
    }));
  }

  getClientByWs(ws) {
    for (const client of this.clients.values()) {
      if (client.ws === ws) {
        return client;
      }
    }
    return null;
  }

  getClientByUsername(username) {
    for (const client of this.clients.values()) {
      if (client.username === username) {
        return client;
      }
    }
    return null;
  }

  generateUserId() {
    return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // WebRTC Signaling handlers
  handleWebRTCOffer(ws, data) {
    const sender = this.getClientByWs(ws);
    if (!sender) return;

    const { targetUsername, offer } = data;
    const target = this.getClientByUsername(targetUsername);

    if (!target) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Target user not found'
      }));
      return;
    }

    // Forward offer to target
    target.ws.send(JSON.stringify({
      type: 'webrtc_offer',
      fromUsername: sender.username,
      offer
    }));
  }

  handleWebRTCAnswer(ws, data) {
    const sender = this.getClientByWs(ws);
    if (!sender) return;

    const { targetUsername, answer } = data;
    const target = this.getClientByUsername(targetUsername);

    if (!target) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Target user not found'
      }));
      return;
    }

    // Forward answer to target
    target.ws.send(JSON.stringify({
      type: 'webrtc_answer',
      fromUsername: sender.username,
      answer
    }));
  }

  handleWebRTCIce(ws, data) {
    const sender = this.getClientByWs(ws);
    if (!sender) return;

    const { targetUsername, candidate } = data;
    const target = this.getClientByUsername(targetUsername);

    if (!target) return;

    // Forward ICE candidate to target
    target.ws.send(JSON.stringify({
      type: 'webrtc_ice',
      fromUsername: sender.username,
      candidate
    }));
  }

  handleVoiceState(ws, data) {
    const client = this.getClientByWs(ws);
    if (!client) return;

    const { isMuted, isSpeaking } = data;

    if (isMuted !== undefined) {
      client.isMuted = isMuted;
    }

    if (isSpeaking !== undefined) {
      client.isSpeaking = isSpeaking;
    }

    // Broadcast voice state change
    this.broadcast(JSON.stringify({
      type: 'voice_state',
      username: client.username,
      isMuted: client.isMuted,
      isSpeaking: client.isSpeaking
    }));
  }

  handleCreateTask(ws, data) {
    const client = this.getClientByWs(ws);
    if (!client) return;

    // Check if user has permission to create tasks (admin only)
    const roleData = this.roles.roles[client.role];
    if (!roleData.permissions.includes('all')) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'You do not have permission to create tasks'
      }));
      return;
    }

    if (this.coordinator) {
      const { taskType, taskData, options } = data;
      const taskId = this.coordinator.createTask(taskType, taskData, options);

      ws.send(JSON.stringify({
        type: 'task_created',
        taskId,
        message: 'Task created and queued'
      }));
    }
  }

  handleGetComputeStats(ws, data) {
    if (this.coordinator) {
      const stats = this.coordinator.getNetworkStats();

      ws.send(JSON.stringify({
        type: 'compute_stats',
        stats
      }));
    }
  }

  handleToggleComputeSharing(ws, data) {
    const client = this.getClientByWs(ws);
    if (!client) return;

    // Check if user has permission (admin only)
    const roleData = this.roles.roles[client.role];
    if (!roleData.permissions.includes('all')) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'You do not have permission to toggle compute sharing'
      }));
      return;
    }

    if (this.coordinator) {
      this.coordinator.setComputeSharingEnabled(data.enabled);
      console.log(`Compute sharing ${data.enabled ? 'enabled' : 'disabled'} by ${client.username}`);
    }
  }

  handleToggleAutoAccept(ws, data) {
    const client = this.getClientByWs(ws);
    if (!client) return;

    // Check if user has permission (admin only)
    const roleData = this.roles.roles[client.role];
    if (!roleData.permissions.includes('all')) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'You do not have permission to toggle auto-accept'
      }));
      return;
    }

    if (this.coordinator) {
      this.coordinator.setAutoAcceptEnabled(data.enabled);
      console.log(`Auto-accept ${data.enabled ? 'enabled' : 'disabled'} by ${client.username}`);
    }
  }

  handleToggleNode(ws, data) {
    const client = this.getClientByWs(ws);
    if (!client) return;

    // Check if user has permission (admin only)
    const roleData = this.roles.roles[client.role];
    if (!roleData.permissions.includes('all')) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'You do not have permission to toggle nodes'
      }));
      return;
    }

    if (this.coordinator) {
      this.coordinator.toggleNode(data.nodeId, data.enabled);
      console.log(`Node ${data.nodeId} ${data.enabled ? 'enabled' : 'disabled'} by ${client.username}`);
    }
  }

  stop() {
    if (this.wss) {
      this.wss.close();
      console.log('WebSocket server stopped');
    }
  }
}

module.exports = WebSocketServer;

