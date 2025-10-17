const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

class ChatClient {
  constructor() {
    this.ws = null;
    this.username = null;
    this.userId = null;
    this.role = null;
    this.currentRoom = '#AlphaLobby';
    this.dmWindows = new Map(); // recipientUsername -> DM window element
    this.typingTimeout = null;
    
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

    // Focus username input
    this.usernameInput.focus();
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

      // Add click handler for DM
      if (user.username !== this.username) {
        userItem.addEventListener('click', () => {
          this.openDMWindow(user.username);
        });
      }

      this.userList.appendChild(userItem);
    });
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
}

// Initialize client when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.chatClient = new ChatClient();
});

