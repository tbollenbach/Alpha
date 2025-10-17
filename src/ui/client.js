const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const AudioManager = require('./audioManager');

class ChatClient {
  constructor() {
    this.ws = null;
    this.username = null;
    this.userId = null;
    this.role = null;
    this.currentRoom = '#AlphaLobby';
    this.dmWindows = new Map(); // recipientUsername -> DM window element
    this.typingTimeout = null;
    this.audioManager = null;
    this.voiceConnected = false;
    
    this.loadConfig();
    this.initializeUI();
  }

  loadConfig() {
    const configPath = path.join(__dirname, '../../config.json');
    this.config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }

  initializeUI() {
    // Auth modal elements
    this.authModal = document.getElementById('authModal');
    this.usernameInput = document.getElementById('usernameInput');
    this.joinBtn = document.getElementById('joinBtn');
    this.authError = document.getElementById('authError');

    // Main app elements
    this.app = document.getElementById('app');
    this.userList = document.getElementById('userList');
    this.userCount = document.getElementById('userCount');
    this.messageContainer = document.getElementById('messageContainer');
    this.messageInput = document.getElementById('messageInput');
    this.sendBtn = document.getElementById('sendBtn');
    this.currentUsername = document.getElementById('currentUsername');
    this.currentRole = document.getElementById('currentRole');
    this.typingIndicator = document.getElementById('typingIndicator');

    // Voice controls
    this.voiceBtn = document.getElementById('voiceBtn');
    this.muteBtn = document.getElementById('muteBtn');
    this.voiceStatus = document.getElementById('voiceStatus');

    // Compute network elements
    this.nodesList = document.getElementById('nodesList');
    this.createTaskBtn = document.getElementById('createTaskBtn');
    this.taskType = document.getElementById('taskType');
    this.statNodes = document.getElementById('stat-nodes');
    this.statActive = document.getElementById('stat-active');
    this.statCores = document.getElementById('stat-cores');
    this.statMemory = document.getElementById('stat-memory');
    this.statGpus = document.getElementById('stat-gpus');
    this.statTasks = document.getElementById('stat-tasks');
    this.statCompleted = document.getElementById('stat-completed');
    this.enableCompute = document.getElementById('enableCompute');
    this.autoAccept = document.getElementById('autoAccept');

    // Event listeners
    this.joinBtn.addEventListener('click', () => this.handleJoin());
    this.usernameInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.handleJoin();
    });

    this.sendBtn.addEventListener('click', () => this.sendMessage());
    this.messageInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.sendMessage();
    });

    this.messageInput.addEventListener('input', () => this.handleTyping());

    // Voice event listeners
    this.voiceBtn.addEventListener('click', () => this.toggleVoiceChannel());
    this.muteBtn.addEventListener('click', () => this.toggleMute());

    // Compute network event listeners
    this.createTaskBtn.addEventListener('click', () => this.createComputeTask());
    this.enableCompute.addEventListener('change', () => this.toggleComputeSharing());
    this.autoAccept.addEventListener('change', () => this.toggleAutoAccept());

    // Focus username input
    this.usernameInput.focus();
    
    // Request compute stats periodically
    setInterval(() => this.requestComputeStats(), 5000);
    
    // Add demo data temporarily to show what it should look like
    setTimeout(() => {
      this.addDemoData();
    }, 3000);
  }

  handleJoin() {
    const username = this.usernameInput.value.trim();

    if (!username) {
      this.showAuthError('Please enter a username');
      return;
    }

    if (username.length < 3) {
      this.showAuthError('Username must be at least 3 characters');
      return;
    }

    this.username = username;
    this.connect();
  }

  showAuthError(message) {
    this.authError.textContent = message;
    setTimeout(() => {
      this.authError.textContent = '';
    }, 3000);
  }

  connect() {
    // Hardcoded server IP - connects to central server at 192.168.1.211
    const wsUrl = 'ws://192.168.1.211:8080';
    
    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.on('open', () => {
        console.log('Connected to server at 192.168.1.211:8080');
        this.authenticate();
      });

      this.ws.on('message', (data) => {
        this.handleMessage(data);
      });

      this.ws.on('close', () => {
        console.log('Disconnected from server');
        this.handleDisconnect();
      });

      this.ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.showAuthError('Failed to connect to server at 192.168.1.211:8080');
      });
    } catch (error) {
      console.error('Connection error:', error);
      this.showAuthError('Failed to connect to server at 192.168.1.211:8080');
    }
  }

  authenticate() {
    this.send({
      type: 'auth',
      username: this.username
    });
  }

  handleMessage(data) {
    try {
      const message = JSON.parse(data);

      switch (message.type) {
        case 'auth_success':
          this.handleAuthSuccess(message);
          break;
        case 'user_list':
          this.updateUserList(message.users);
          break;
        case 'chat':
          this.displayMessage(message);
          break;
        case 'dm':
          this.handleDirectMessage(message);
          break;
        case 'dm_sent':
          this.handleDMSent(message);
          break;
        case 'typing':
          this.handleTypingIndicator(message);
          break;
        case 'webrtc_offer':
          if (this.audioManager) {
            this.audioManager.handleOffer(message.fromUsername, message.offer);
          }
          break;
        case 'webrtc_answer':
          if (this.audioManager) {
            this.audioManager.handleAnswer(message.fromUsername, message.answer);
          }
          break;
        case 'webrtc_ice':
          if (this.audioManager) {
            this.audioManager.handleIceCandidate(message.fromUsername, message.candidate);
          }
          break;
        case 'voice_state':
          this.handleVoiceStateChange(message);
          break;
        case 'compute_nodes':
          this.updateComputeNodes(message.nodes);
          break;
        case 'compute_stats':
          this.updateComputeStats(message.stats);
          break;
        case 'compute_task_update':
          this.handleTaskUpdate(message.task);
          break;
        case 'task_created':
          this.handleTaskCreated(message);
          break;
        case 'error':
          this.displayError(message.message);
          break;
        default:
          console.log('Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('Error handling message:', error);
    }
  }

  handleAuthSuccess(data) {
    this.userId = data.userId;
    this.role = data.role;
    
    // Hide auth modal, show app
    this.authModal.style.display = 'none';
    this.app.style.display = 'grid';

    // Update user info display
    this.currentUsername.textContent = this.username;
    this.currentRole.textContent = data.roleData.name;
    this.currentRole.style.backgroundColor = data.roleData.color;

    console.log(`Authenticated as ${this.username} (${this.role})`);
  }

  updateUserList(users) {
    this.userList.innerHTML = '';
    this.userCount.textContent = users.length;

    users.forEach(user => {
      const userItem = document.createElement('div');
      userItem.className = 'user-item';
      userItem.dataset.username = user.username;

      const statusDot = document.createElement('div');
      statusDot.className = `user-status ${user.status}`;

      const userDetails = document.createElement('div');
      userDetails.className = 'user-details';

      const userName = document.createElement('div');
      userName.className = 'user-name';
      userName.textContent = user.username;

      const roleBadge = document.createElement('div');
      roleBadge.className = 'user-role-badge';
      roleBadge.textContent = user.role;
      roleBadge.style.backgroundColor = user.roleColor;

      userDetails.appendChild(userName);
      userDetails.appendChild(roleBadge);

      userItem.appendChild(statusDot);
      userItem.appendChild(userDetails);

      // Add voice indicator
      const voiceIndicator = document.createElement('div');
      voiceIndicator.className = 'voice-indicator';
      if (user.isMuted !== undefined) {
        voiceIndicator.textContent = user.isMuted ? '🔇' : '🎤';
        if (user.isSpeaking && !user.isMuted) {
          voiceIndicator.classList.add('speaking');
        }
        if (user.isMuted) {
          voiceIndicator.classList.add('muted');
        }
      }
      userItem.appendChild(voiceIndicator);

      // Add click handler for DM
      if (user.username !== this.username) {
        userItem.addEventListener('click', () => {
          this.openDMWindow(user.username);
        });
      }

      this.userList.appendChild(userItem);
    });

    // If voice is connected, establish peer connections with new users
    if (this.audioManager && this.voiceConnected) {
      this.audioManager.connectToAllUsers(users);
    }
  }

  sendMessage() {
    const message = this.messageInput.value.trim();

    if (!message) return;

    this.send({
      type: 'chat',
      room: this.currentRoom,
      message
    });

    this.messageInput.value = '';
    this.clearTypingIndicator();
  }

  displayMessage(data) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message';

    // Create avatar
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = data.username.charAt(0).toUpperCase();
    avatar.style.backgroundColor = this.getAvatarColor(data.username);

    // Create message content
    const content = document.createElement('div');
    content.className = 'message-content';

    const header = document.createElement('div');
    header.className = 'message-header';

    const username = document.createElement('span');
    username.className = 'message-username';
    username.textContent = data.username;

    const roleSpan = document.createElement('span');
    roleSpan.className = 'message-role';
    roleSpan.textContent = data.role;
    
    // Get role color from roles.json
    const rolesPath = path.join(__dirname, '../data/roles.json');
    const roles = JSON.parse(fs.readFileSync(rolesPath, 'utf8'));
    if (roles.roles[data.role]) {
      roleSpan.style.backgroundColor = roles.roles[data.role].color;
    }

    const timestamp = document.createElement('span');
    timestamp.className = 'message-timestamp';
    timestamp.textContent = this.formatTime(data.timestamp);

    header.appendChild(username);
    header.appendChild(roleSpan);
    header.appendChild(timestamp);

    const text = document.createElement('div');
    text.className = 'message-text';
    text.textContent = data.message;

    content.appendChild(header);
    content.appendChild(text);

    messageDiv.appendChild(avatar);
    messageDiv.appendChild(content);

    this.messageContainer.appendChild(messageDiv);
    this.scrollToBottom();
  }

  handleTyping() {
    // Clear existing timeout
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }

    // Send typing start
    this.send({
      type: 'typing',
      room: this.currentRoom,
      isTyping: true
    });

    // Set timeout to send typing stop
    this.typingTimeout = setTimeout(() => {
      this.clearTypingIndicator();
    }, 2000);
  }

  clearTypingIndicator() {
    this.send({
      type: 'typing',
      room: this.currentRoom,
      isTyping: false
    });
  }

  handleTypingIndicator(data) {
    if (data.username === this.username) return;

    if (data.isTyping) {
      this.typingIndicator.textContent = `${data.username} is typing...`;
    } else {
      this.typingIndicator.textContent = '';
    }
  }

  openDMWindow(recipientUsername) {
    // Check if DM window already exists
    if (this.dmWindows.has(recipientUsername)) {
      // Bring to front
      const existingWindow = this.dmWindows.get(recipientUsername);
      existingWindow.style.zIndex = 1000;
      return;
    }

    // Clone template
    const template = document.getElementById('dmWindowTemplate');
    const dmWindow = template.cloneNode(true);
    dmWindow.id = `dm-${recipientUsername}`;
    dmWindow.style.display = 'flex';

    // Set username
    dmWindow.querySelector('.dm-username').textContent = `DM: ${recipientUsername}`;

    // Get elements
    const dmInput = dmWindow.querySelector('.dm-input');
    const dmSend = dmWindow.querySelector('.dm-send');
    const dmClose = dmWindow.querySelector('.dm-close');
    const dmMessages = dmWindow.querySelector('.dm-messages');

    // Event listeners
    dmSend.addEventListener('click', () => {
      this.sendDirectMessage(recipientUsername, dmInput, dmMessages);
    });

    dmInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.sendDirectMessage(recipientUsername, dmInput, dmMessages);
      }
    });

    dmClose.addEventListener('click', () => {
      this.closeDMWindow(recipientUsername);
    });

    // Add to DOM and map
    document.body.appendChild(dmWindow);
    this.dmWindows.set(recipientUsername, dmWindow);

    // Make draggable (simple implementation)
    this.makeDraggable(dmWindow);

    // Focus input
    dmInput.focus();
  }

  sendDirectMessage(recipientUsername, inputElement, messagesContainer) {
    const message = inputElement.value.trim();

    if (!message) return;

    this.send({
      type: 'dm',
      recipientUsername,
      message
    });

    inputElement.value = '';
  }

  handleDirectMessage(data) {
    // Incoming DM
    if (!this.dmWindows.has(data.from)) {
      this.openDMWindow(data.from);
    }

    const dmWindow = this.dmWindows.get(data.from);
    const messagesContainer = dmWindow.querySelector('.dm-messages');

    this.addDMMessage(messagesContainer, data.from, data.message, data.timestamp, false);
  }

  handleDMSent(data) {
    // Confirmation that our DM was sent
    const dmWindow = this.dmWindows.get(data.to);
    if (dmWindow) {
      const messagesContainer = dmWindow.querySelector('.dm-messages');
      this.addDMMessage(messagesContainer, 'You', data.message, data.timestamp, true);
    }
  }

  addDMMessage(container, sender, message, timestamp, isSent) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `dm-message ${isSent ? 'sent' : 'received'}`;

    const header = document.createElement('div');
    header.className = 'dm-message-header';
    header.textContent = sender;

    const text = document.createElement('div');
    text.className = 'dm-message-text';
    text.textContent = message;

    const time = document.createElement('div');
    time.className = 'dm-message-time';
    time.textContent = this.formatTime(timestamp);

    messageDiv.appendChild(header);
    messageDiv.appendChild(text);
    messageDiv.appendChild(time);

    container.appendChild(messageDiv);
    container.scrollTop = container.scrollHeight;
  }

  closeDMWindow(recipientUsername) {
    const dmWindow = this.dmWindows.get(recipientUsername);
    if (dmWindow) {
      dmWindow.remove();
      this.dmWindows.delete(recipientUsername);
    }
  }

  makeDraggable(element) {
    const header = element.querySelector('.dm-header');
    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;

    header.style.cursor = 'move';

    header.addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('dm-close')) return;
      
      isDragging = true;
      initialX = e.clientX - element.offsetLeft;
      initialY = e.clientY - element.offsetTop;
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;

      e.preventDefault();
      currentX = e.clientX - initialX;
      currentY = e.clientY - initialY;

      element.style.left = currentX + 'px';
      element.style.top = currentY + 'px';
      element.style.right = 'auto';
      element.style.bottom = 'auto';
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
    });
  }

  displayError(message) {
    console.error('Server error:', message);
    // Could display a toast notification here
  }

  handleDisconnect() {
    // Show reconnection UI or redirect to auth
    console.log('Connection lost');
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  async toggleVoiceChannel() {
    if (!this.voiceConnected) {
      // Join voice channel
      this.audioManager = new AudioManager(this);
      const initialized = await this.audioManager.initialize();
      
      if (initialized) {
        this.voiceConnected = true;
        this.voiceBtn.textContent = '🔊 Leave Voice';
        this.voiceBtn.classList.add('active');
        this.muteBtn.disabled = false;
        this.voiceStatus.textContent = 'Connected (Muted)';
        
        // Connect to all existing users
        // We'll get the user list and connect to them
        console.log('Joined voice channel');
      } else {
        this.displayError('Failed to access microphone. Please check permissions.');
      }
    } else {
      // Leave voice channel
      if (this.audioManager) {
        this.audioManager.cleanup();
        this.audioManager = null;
      }
      
      this.voiceConnected = false;
      this.voiceBtn.textContent = '🔇 Join Voice';
      this.voiceBtn.classList.remove('active');
      this.muteBtn.disabled = true;
      this.muteBtn.textContent = '🎤 Muted';
      this.muteBtn.classList.remove('unmuted');
      this.voiceStatus.textContent = 'Disconnected';
      
      console.log('Left voice channel');
    }
  }

  async toggleMute() {
    if (!this.audioManager) return;
    
    const isUnmuted = await this.audioManager.toggleMute();
    
    if (isUnmuted) {
      this.muteBtn.textContent = '🎤 Unmuted';
      this.muteBtn.classList.add('unmuted');
      this.voiceStatus.textContent = 'Connected (Unmuted)';
    } else {
      this.muteBtn.textContent = '🎤 Muted';
      this.muteBtn.classList.remove('unmuted');
      this.voiceStatus.textContent = 'Connected (Muted)';
    }
  }

  updateVoiceState(state) {
    this.send({
      type: 'voice_state',
      ...state
    });
  }

  handleVoiceStateChange(data) {
    const { username, isMuted, isSpeaking } = data;
    
    // Update user list visual indicators
    const userItems = this.userList.querySelectorAll('.user-item');
    userItems.forEach(item => {
      if (item.dataset.username === username) {
        const voiceIndicator = item.querySelector('.voice-indicator');
        if (voiceIndicator) {
          if (isSpeaking && !isMuted) {
            voiceIndicator.classList.add('speaking');
          } else {
            voiceIndicator.classList.remove('speaking');
          }
          
          if (isMuted) {
            voiceIndicator.textContent = '🔇';
            voiceIndicator.classList.add('muted');
          } else {
            voiceIndicator.textContent = '🎤';
            voiceIndicator.classList.remove('muted');
          }
        }
      }
    });
  }

  formatTime(timestamp) {
    const date = new Date(timestamp);
    let hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    return `${hours}:${minutes} ${ampm}`;
  }

  getAvatarColor(username) {
    const colors = [
      '#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', 
      '#f0932b', '#eb4d4b', '#6c5ce7', '#a29bfe',
      '#fd79a8', '#fdcb6e', '#e17055', '#74b9ff'
    ];
    
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
      hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    return colors[Math.abs(hash) % colors.length];
  }

  scrollToBottom() {
    this.messageContainer.scrollTop = this.messageContainer.scrollHeight;
  }

  // Compute Network Methods

  updateComputeNodes(nodes) {
    this.nodesList.innerHTML = '';

    if (nodes.length === 0) {
      this.nodesList.innerHTML = '<p style="color: #8e9297; text-align: center; padding: 20px;">No helper nodes connected</p>';
      return;
    }

    nodes.forEach(node => {
      const nodeItem = document.createElement('div');
      nodeItem.className = 'node-item';
      nodeItem.dataset.nodeId = node.nodeId;
      
      if (node.status === 'working') {
        nodeItem.classList.add('working');
      } else if (node.status === 'offline') {
        nodeItem.classList.add('offline');
      }

      // Node header with toggle
      const nodeHeader = document.createElement('div');
      nodeHeader.className = 'node-header';

      const nodeName = document.createElement('div');
      nodeName.className = 'node-name';
      nodeName.textContent = node.hostname || node.nodeId;

      const nodeToggle = document.createElement('input');
      nodeToggle.type = 'checkbox';
      nodeToggle.className = 'node-toggle';
      nodeToggle.checked = node.enabled !== false; // Default to enabled
      nodeToggle.addEventListener('change', (e) => {
        this.toggleNode(node.nodeId, e.target.checked);
      });

      nodeHeader.appendChild(nodeName);
      nodeHeader.appendChild(nodeToggle);

      const nodeStatus = document.createElement('div');
      nodeStatus.className = 'node-status';
      nodeStatus.textContent = `${node.status.toUpperCase()} | ${node.cpuCores} cores | ${(node.totalMemory / (1024**3)).toFixed(1)}GB`;

      const nodeProgress = document.createElement('div');
      nodeProgress.className = 'node-progress';
      nodeProgress.textContent = `✅ ${node.tasksCompleted} | ❌ ${node.tasksFailed}`;

      nodeItem.appendChild(nodeHeader);
      nodeItem.appendChild(nodeStatus);
      nodeItem.appendChild(nodeProgress);

      this.nodesList.appendChild(nodeItem);
    });
  }

  updateComputeStats(stats) {
    this.statNodes.textContent = stats.totalNodes;
    this.statActive.textContent = stats.activeNodes;
    this.statCores.textContent = stats.totalCPUCores;
    this.statMemory.textContent = (stats.totalMemory / (1024**3)).toFixed(1) + ' GB';
    this.statGpus.textContent = stats.totalGPUs || 0;
    this.statTasks.textContent = stats.pendingTasks + stats.runningTasks;
    this.statCompleted.textContent = stats.completedTasks;
  }

  handleTaskUpdate(task) {
    // Display task update in chat
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message';
    messageDiv.style.backgroundColor = '#2f3136';

    const content = document.createElement('div');
    content.className = 'message-content';
    content.innerHTML = `
      <div class="message-text">
        <strong>🖥️ Task Update:</strong> ${task.taskId}<br>
        Status: ${task.status.toUpperCase()}<br>
        ${task.executionTime ? `Execution Time: ${(task.executionTime / 1000).toFixed(2)}s` : ''}
      </div>
    `;

    messageDiv.appendChild(content);
    this.messageContainer.appendChild(messageDiv);
    this.scrollToBottom();
  }

  handleTaskCreated(message) {
    // Display task created confirmation
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message';
    messageDiv.style.backgroundColor = '#2f3136';

    const content = document.createElement('div');
    content.className = 'message-content';
    content.innerHTML = `
      <div class="message-text">
        <strong>✅ Task Created:</strong> ${message.taskId}<br>
        ${message.message}
      </div>
    `;

    messageDiv.appendChild(content);
    this.messageContainer.appendChild(messageDiv);
    this.scrollToBottom();
  }

  createComputeTask() {
    const taskType = this.taskType.value;
    
    // Create task data based on type
    let taskData = {};
    let options = {};

    switch (taskType) {
      case 'cpu_compute':
        taskData = { iterations: 5000000 };
        break;
      case 'hash_compute':
        taskData = { input: 'OurWorld', iterations: 100000, algorithm: 'sha256' };
        break;
      case 'fibonacci':
        taskData = { n: 35 };
        break;
      case 'prime_check':
        taskData = { start: 1, end: 100000 };
        break;
    }

    this.send({
      type: 'create_task',
      taskType,
      taskData,
      options
    });

    console.log(`Creating ${taskType} task...`);
  }

  requestComputeStats() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.send({
        type: 'get_compute_stats'
      });
    }
  }

  toggleComputeSharing() {
    const enabled = this.enableCompute.checked;
    console.log(`Compute sharing ${enabled ? 'enabled' : 'disabled'}`);
    
    // Send to server
    this.send({
      type: 'toggle_compute_sharing',
      enabled
    });
  }

  toggleAutoAccept() {
    const enabled = this.autoAccept.checked;
    console.log(`Auto-accept tasks ${enabled ? 'enabled' : 'disabled'}`);
    
    // Send to server
    this.send({
      type: 'toggle_auto_accept',
      enabled
    });
  }

  toggleNode(nodeId, enabled) {
    console.log(`Node ${nodeId} ${enabled ? 'enabled' : 'disabled'}`);
    
    // Send to server
    this.send({
      type: 'toggle_node',
      nodeId,
      enabled
    });

    // Update visual state
    const nodeItem = document.querySelector(`[data-node-id="${nodeId}"]`);
    if (nodeItem) {
      if (enabled) {
        nodeItem.classList.remove('disabled');
      } else {
        nodeItem.classList.add('disabled');
      }
    }
  }

  addDemoData() {
    // Add demo nodes to show what the interface should look like
    const demoNodes = [
      {
        nodeId: 'local-demo-001',
        hostname: 'Local-Machine',
        platform: 'Windows',
        cpuCores: 8,
        totalMemory: 16 * 1024**3,
        gpuCount: 1,
        status: 'idle',
        stats: { cpuUsage: 25, memoryUsage: 60 },
        tasksCompleted: 0,
        tasksFailed: 0,
        enabled: true
      }
    ];

    this.updateComputeNodes(demoNodes);
    this.updateComputeStats({
      totalNodes: 1,
      activeNodes: 0,
      totalCPUCores: 8,
      totalMemory: 16 * 1024**3,
      totalGPUs: 1,
      pendingTasks: 0,
      runningTasks: 0,
      completedTasks: 0,
      failedTasks: 0
    });

    console.log('Demo data added to show interface');
  }

}

// Initialize client when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.chatClient = new ChatClient();
});

