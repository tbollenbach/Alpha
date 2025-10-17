# OurWorld Chat

A Discord-like desktop chat application built with Electron and Node.js, featuring real-time messaging, direct messages, and role-based access control.

## Features

✅ **Single Public Room**: #AlphaLobby - A main chat room where all users can communicate

✅ **Real-time Messaging**: WebSocket-based instant messaging

✅ **Direct Messages (DM)**: Click any user to open a private chat window

✅ **Role-Based System**: Three user roles (Admin, Member, Guest) with different permissions

✅ **User Presence**: See who's online in real-time

✅ **Typing Indicators**: See when someone is typing

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
│   │   └── client.js             # Client-side WebSocket logic
│   ├── core/
│   │   └── websocketServer.js    # WebSocket server & message routing
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

## Technical Details

- **Frontend**: HTML, CSS, Vanilla JavaScript
- **Backend**: Node.js with WebSocket (ws library)
- **Desktop Framework**: Electron
- **Architecture**: Client-server with real-time bidirectional communication

## License

MIT

## Support

For issues, questions, or contributions, please open an issue on the GitHub repository.

---

**Built with ❤️ for decentralized communication**

