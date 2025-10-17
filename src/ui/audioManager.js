class AudioManager {
  constructor(chatClient) {
    this.chatClient = chatClient;
    this.localStream = null;
    this.peerConnections = new Map(); // username -> RTCPeerConnection
    this.isMuted = true;
    this.audioContext = null;
    this.analyser = null;
    this.speakingThreshold = 0.01;
    this.speakingCheckInterval = null;
    
    // WebRTC configuration
    this.rtcConfig = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };
  }

  async initialize() {
    try {
      // Request microphone access
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      });

      // Mute by default
      this.localStream.getAudioTracks().forEach(track => {
        track.enabled = false;
      });

      // Set up audio analysis for speaking detection
      this.setupAudioAnalysis();

      console.log('Audio initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize audio:', error);
      return false;
    }
  }

  setupAudioAnalysis() {
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = this.audioContext.createMediaStreamSource(this.localStream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.8;
    source.connect(this.analyser);

    // Start checking for speaking
    this.startSpeakingDetection();
  }

  startSpeakingDetection() {
    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    let isSpeaking = false;

    this.speakingCheckInterval = setInterval(() => {
      if (this.isMuted) {
        if (isSpeaking) {
          isSpeaking = false;
          this.chatClient.updateVoiceState({ isSpeaking: false });
        }
        return;
      }

      this.analyser.getByteFrequencyData(dataArray);
      
      // Calculate average volume
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
      }
      const average = sum / bufferLength / 255;

      const nowSpeaking = average > this.speakingThreshold;

      if (nowSpeaking !== isSpeaking) {
        isSpeaking = nowSpeaking;
        this.chatClient.updateVoiceState({ isSpeaking });
      }
    }, 100);
  }

  async toggleMute() {
    if (!this.localStream) {
      const initialized = await this.initialize();
      if (!initialized) return false;
    }

    this.isMuted = !this.isMuted;
    
    // Enable/disable audio tracks
    this.localStream.getAudioTracks().forEach(track => {
      track.enabled = !this.isMuted;
    });

    // Update voice state on server
    this.chatClient.updateVoiceState({ isMuted: this.isMuted, isSpeaking: false });

    console.log(`Microphone ${this.isMuted ? 'muted' : 'unmuted'}`);
    return !this.isMuted;
  }

  async createPeerConnection(username) {
    if (this.peerConnections.has(username)) {
      return this.peerConnections.get(username);
    }

    if (!this.localStream) {
      await this.initialize();
    }

    const pc = new RTCPeerConnection(this.rtcConfig);
    this.peerConnections.set(username, pc);

    // Add local stream tracks
    this.localStream.getTracks().forEach(track => {
      pc.addTrack(track, this.localStream);
    });

    // Handle incoming stream
    pc.ontrack = (event) => {
      console.log(`Received audio stream from ${username}`);
      const remoteAudio = new Audio();
      remoteAudio.srcObject = event.streams[0];
      remoteAudio.play().catch(e => console.error('Error playing audio:', e));
      
      // Store audio element for cleanup
      pc.remoteAudio = remoteAudio;
    };

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.chatClient.send({
          type: 'webrtc_ice',
          targetUsername: username,
          candidate: event.candidate
        });
      }
    };

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      console.log(`Connection state with ${username}: ${pc.connectionState}`);
      
      if (pc.connectionState === 'disconnected' || 
          pc.connectionState === 'failed' || 
          pc.connectionState === 'closed') {
        this.closePeerConnection(username);
      }
    };

    return pc;
  }

  async createOffer(username) {
    const pc = await this.createPeerConnection(username);
    
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      this.chatClient.send({
        type: 'webrtc_offer',
        targetUsername: username,
        offer: offer
      });

      console.log(`Sent offer to ${username}`);
    } catch (error) {
      console.error(`Error creating offer for ${username}:`, error);
    }
  }

  async handleOffer(fromUsername, offer) {
    const pc = await this.createPeerConnection(fromUsername);

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      this.chatClient.send({
        type: 'webrtc_answer',
        targetUsername: fromUsername,
        answer: answer
      });

      console.log(`Sent answer to ${fromUsername}`);
    } catch (error) {
      console.error(`Error handling offer from ${fromUsername}:`, error);
    }
  }

  async handleAnswer(fromUsername, answer) {
    const pc = this.peerConnections.get(fromUsername);
    
    if (!pc) {
      console.error(`No peer connection found for ${fromUsername}`);
      return;
    }

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
      console.log(`Received answer from ${fromUsername}`);
    } catch (error) {
      console.error(`Error handling answer from ${fromUsername}:`, error);
    }
  }

  async handleIceCandidate(fromUsername, candidate) {
    const pc = this.peerConnections.get(fromUsername);
    
    if (!pc) {
      console.error(`No peer connection found for ${fromUsername}`);
      return;
    }

    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.error(`Error adding ICE candidate from ${fromUsername}:`, error);
    }
  }

  closePeerConnection(username) {
    const pc = this.peerConnections.get(username);
    
    if (pc) {
      // Stop remote audio
      if (pc.remoteAudio) {
        pc.remoteAudio.pause();
        pc.remoteAudio.srcObject = null;
      }
      
      pc.close();
      this.peerConnections.delete(username);
      console.log(`Closed connection with ${username}`);
    }
  }

  connectToAllUsers(userList) {
    // Create peer connections with all users except self
    userList.forEach(user => {
      if (user.username !== this.chatClient.username && !this.peerConnections.has(user.username)) {
        // Create offer to new user
        this.createOffer(user.username);
      }
    });
  }

  cleanup() {
    // Stop speaking detection
    if (this.speakingCheckInterval) {
      clearInterval(this.speakingCheckInterval);
    }

    // Close all peer connections
    this.peerConnections.forEach((pc, username) => {
      this.closePeerConnection(username);
    });

    // Stop local stream
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    // Close audio context
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    console.log('Audio manager cleaned up');
  }
}

module.exports = AudioManager;

