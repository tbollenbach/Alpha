# OurWorld Chat

A Discord-like desktop chat application built with Electron and Node.js, featuring real-time messaging, direct messages, and role-based access control.

## Features

✅ **Single Public Room**: #AlphaLobby - A main chat room where all users can communicate

✅ **Real-time Messaging**: WebSocket-based instant messaging

✅ **Direct Messages (DM)**: Click any user to open a private chat window

✅ **Role-Based System**: Three user roles (Admin, Member, Guest) with different permissions

✅ **User Presence**: See who's online in real-time

✅ **Typing Indicators**: See when someone is typing

✅ **Voice Channels**: Real-time voice chat with WebRTC peer-to-peer audio

✅ **Microphone Controls**: Mute/unmute your microphone with visual indicators

✅ **Speaking Indicators**: See who's currently speaking with animated indicators

✅ **Distributed Compute Sharing**: Connect helper nodes to share compute resources

✅ **Task Distribution System**: Assign compute tasks with intelligent load balancing

✅ **Resource Monitoring**: Real-time hardware stats and performance tracking

✅ **API Key Authentication**: Secure node-to-coordinator connections

✅ **Dark Theme**: Modern, Discord-inspired UI

✅ **Auto-Update Checker**: Checks GitHub for new releases every 30 minutes

✅ **Local Testing**: Run multiple instances for testing

## Project Structure

```
OurWorld/
├── src/
│   ├── main.js                    # Electron main process
│   ├── ui/
│   │   ├── index.html            # Main UI layout
│   │   ├── styles.css            # Dark theme styling
│   │   ├── client.js             # Client-side WebSocket logic
│   │   ├── audioManager.js       # WebRTC audio management
│   │   ├── agent.html            # Agent UI for helper nodes
│   │   └── agentStyles.css       # Agent UI styling
│   ├── core/
│   │   ├── websocketServer.js    # WebSocket server & message routing
│   │   └── coordinatorServer.js  # Compute coordinator
│   ├── modules/
│   │   └── computeAgent.js       # Helper node agent
│   ├── data/
│   │   └── roles.json            # Role definitions & user assignments
│   └── utils/
│       └── updateChecker.js      # GitHub update polling
├── public/
│   └── icon.png                  # App icon (placeholder)
├── config.json                   # Application configuration
├── package.json                  # Dependencies
└── README.md                     # This file
```

## Installation

### Prerequisites

- Node.js (v16 or higher)
- npm (comes with Node.js)

### Setup

1. **Install Dependencies**

```bash
npm install
```

2. **Configure the Application**

Edit `config.json` to customize:
- WebSocket port (default: 8080)
- GitHub repository for updates
- Update check interval

```json
{
  "websocket": {
    "port": 8080,
    "host": "localhost"
  },
  "update": {
    "githubRepo": "yourusername/ourworld-chat",
    "checkInterval": 1800000
  }
}
```

3. **Configure User Roles** (Optional)

Edit `src/data/roles.json` to assign roles to specific users:

```json
{
  "users": {
    "alice": "admin",
    "bob": "member",
    "charlie": "guest"
  }
}
```

## Running the Application

### Single Instance

```bash
npm start
```

### Development Mode (with DevTools)

```bash
npm run dev
```

### Local Testing (Multiple Users)

To test the chat with multiple users on the same computer:

1. **Start the first instance:**
   ```bash
   npm start
   ```

2. **Start additional instances** (in new terminal windows):
   ```bash
   npm start
   ```

3. Each instance will prompt you for a username. Use different usernames for each instance.

4. All instances will connect to the same WebSocket server (localhost:8080) and can chat with each other.

**Note**: The WebSocket server starts automatically with the first instance and handles all connections.

## Usage

### Basic Chat

1. **Enter Username**: When the app launches, enter your desired username
2. **Join Chat**: Click "Join Chat" or press Enter
3. **Send Messages**: Type in the message box and press Enter or click Send
4. **View Users**: See all online users in the left sidebar

### Direct Messages

1. **Open DM**: Click on any username in the left sidebar
2. **Chat Privately**: A DM window will pop up in the bottom-right corner
3. **Multiple DMs**: You can have multiple DM windows open at once
4. **Move Windows**: Drag DM windows by their header to reposition
5. **Close DM**: Click the × button to close a DM window

### Voice Channels

The app includes real-time voice communication using WebRTC:

1. **Join Voice**: Click the "🔇 Join Voice" button to connect to the voice channel
   - Your browser will request microphone permissions
   - You'll be muted by default when joining

2. **Unmute Microphone**: Click "🎤 Muted" to unmute and start talking
   - Button turns green (🎤 Unmuted) when active
   - Your voice will be transmitted to all users in the voice channel

3. **Speaking Indicators**: 
   - When someone speaks, a pulsing microphone icon appears next to their name
   - Muted users show a 🔇 icon, unmuted users show a 🎤 icon

4. **Leave Voice**: Click "🔊 Leave Voice" to disconnect from voice chat

**Note**: Voice uses peer-to-peer WebRTC connections. All users who join voice will automatically connect to each other. For best quality, use headphones to prevent echo.

### User Roles

The app includes three default roles:

- **Admin** (🔴 Red): Full permissions, access to all features
- **Member** (🔵 Blue): Can read, write, and send DMs
- **Guest** (⚪ Gray): Read-only access

Role colors appear next to usernames in the user list and messages.

## Configuration

### Roles & Permissions

Edit `src/data/roles.json`:

```json
{
  "roles": {
    "admin": {
      "name": "Admin",
      "permissions": ["all"],
      "rooms": ["#AlphaLobby"],
      "color": "#ff6b6b"
    },
    "member": {
      "name": "Member",
      "permissions": ["read", "write", "dm"],
      "rooms": ["#AlphaLobby"],
      "color": "#4ecdc4"
    }
  },
  "users": {
    "username": "role"
  }
}
```

### Network Configuration

The app runs locally by default. To enable network access:

1. Edit `config.json` and change `host` to `0.0.0.0`
2. Ensure port 8080 is open on your firewall
3. Other users can connect by changing `host` in their `config.json` to your IP address

**Security Note**: This MVP does not include encryption or authentication beyond usernames. Do not use for sensitive communications.

## Troubleshooting

### "Failed to connect to server"

- Ensure no other application is using port 8080
- Try changing the port in `config.json`
- Check if your firewall is blocking the connection

### "User not found or offline" when sending DM

- The recipient may have disconnected
- Try refreshing the user list by restarting the app

### Multiple instances not connecting

- Ensure the first instance is fully started before launching others
- Check that all instances are using the same port in `config.json`

### Voice chat not working

- **"Failed to access microphone"**: 
  - Grant microphone permissions when prompted by the browser
  - Check your system's privacy/security settings
  - Ensure no other app is using your microphone exclusively
  
- **Can't hear other users**: 
  - Make sure they've joined voice and unmuted their mic
  - Check your system volume and audio output device
  - Try leaving and rejoining the voice channel

- **Echo or feedback**: 
  - Use headphones instead of speakers
  - Ensure other users are also using headphones
  - Keep microphone away from speakers

- **Choppy or laggy audio**:
  - Check your network connection
  - Close bandwidth-heavy applications
  - WebRTC works best on local networks or good internet connections

## Development

### Adding New Features

The codebase is organized for easy extension:

- **UI Components**: Add to `src/ui/`
- **Server Logic**: Extend `src/core/websocketServer.js`
- **Utilities**: Add to `src/utils/`
- **Styling**: Edit `src/ui/styles.css`

### Future Enhancements

The right sidebar is reserved for:
- 📁 File drop and sharing
- 📊 Node statistics and monitoring  
- 💰 Wallet view and transactions

## Distributed Compute Sharing

OurWorld Chat includes a powerful distributed compute sharing system that allows helper nodes to connect to a coordinator and share compute resources.

### Architecture

The system uses a **Coordinator-Agent** architecture:

- **Coordinator** (Main Node): Manages helper nodes, distributes tasks, and collects results
- **Agent** (Helper Node): Connects to coordinator, reports stats, executes tasks

### Setting Up the Coordinator (Main Node)

The coordinator runs automatically with the main application. No additional setup needed!

### Setting Up a Helper Node

To run a helper node that contributes compute power:

1. **Edit `agentConfig.json`**:

```json
{
  "enabled": true,
  "mode": "agent",
  "coordinatorUrl": "ws://COORDINATOR_IP:8080",
  "apiKey": "your-api-key-here",
  "capabilities": {
    "cpu": true,
    "gpu": false,
    "memory": true
  },
  "limits": {
    "maxCPUUsage": 80,
    "maxMemoryUsage": 80
  }
}
```

2. **Get an API Key**:
   - Contact the coordinator admin for an API key
   - Keys are managed in `src/data/apiKeys.json`

3. **Start the Agent**:

```bash
npm start
```

The agent will run in a minimal UI showing status and activity.

### Using the Compute Network

**Creating Tasks** (Admin Only):

1. Open the chat application (coordinator mode)
2. Look at the right sidebar - "Compute Network" panel
3. Select a task type:
   - **CPU Compute**: Intensive mathematical operations
   - **Hash Compute**: Cryptographic hash calculations
   - **Fibonacci**: Recursive Fibonacci calculations
   - **Prime Check**: Find prime numbers in a range
4. Click "Create Task"
5. Watch as helper nodes pick up and execute the task!

**Monitoring**:

- **Network Stats**: See total nodes, active nodes, task counts
- **Helper Nodes List**: View all connected nodes with their status
- **Task Updates**: Real-time updates appear in the chat

### Task Types

#### CPU Compute
```javascript
{
  iterations: 5000000  // Number of compute cycles
}
```

#### Hash Compute
```javascript
{
  input: 'text',
  iterations: 100000,
  algorithm: 'sha256'  // or 'sha512', 'md5'
}
```

#### Fibonacci
```javascript
{
  n: 35  // Calculate fibonacci(n)
}
```

#### Prime Check
```javascript
{
  start: 1,
  end: 100000  // Find primes in range
}
```

### Security

- **API Key Authentication**: Only authorized nodes can connect
- **TLS/HTTPS**: Use secure WebSocket (wss://) in production
- **Permission System**: Define what each node can do
- **Rate Limiting**: Prevent abuse (configure in coordinator)

### Network Configuration

Edit `config.json` for coordinator settings:

```json
{
  "compute": {
    "enabled": true,
    "maxTaskQueueSize": 100,
    "taskTimeout": 60000,
    "heartbeatInterval": 10000,
    "statsUpdateInterval": 5000
  }
}
```

### API Keys Management

Edit `src/data/apiKeys.json` to manage helper node access:

```json
{
  "keys": {
    "alpha-node-key-001": {
      "name": "Helper Node 001",
      "permissions": ["compute", "report"],
      "active": true
    }
  }
}
```

**Permissions**:
- `compute`: Can execute compute tasks
- `report`: Can report stats
- `admin`: Administrative access (use with caution)

### Deployment

**Local Network**:
1. Set `host` to `0.0.0.0` in `config.json`
2. Give helper nodes your local IP address
3. Ensure port 8080 is open

**Internet (Production)**:
1. Deploy coordinator to a server (Render, AWS, etc.)
2. Use HTTPS/WSS for secure communication
3. Configure firewall rules
4. Use strong API keys
5. Consider using a reverse proxy (nginx)

### Monitoring & Troubleshooting

**Helper Node Issues**:
- Check API key is correct
- Verify coordinator URL is reachable
- Ensure network/firewall allows outbound connections
- Check agent.html UI for error messages

**Task Issues**:
- Tasks timeout after 60 seconds by default
- Failed tasks are logged and can be retried
- Check node capabilities match task requirements

**Connection Issues**:
- Nodes send heartbeat every 10 seconds
- Coordinator removes nodes after 30s of no heartbeat
- Agents automatically reconnect on disconnect

## Technical Details

- **Frontend**: HTML, CSS, Vanilla JavaScript
- **Backend**: Node.js with WebSocket (ws library)
- **Desktop Framework**: Electron
- **Architecture**: Client-server with real-time bidirectional communication
- **Compute System**: Coordinator-Agent with WebRTC for peer-to-peer audio

## License

MIT

## Support

For issues, questions, or contributions, please open an issue on the GitHub repository.

---

**Built with ❤️ for decentralized communication**

