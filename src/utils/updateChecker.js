const https = require('https');
const fs = require('fs');
const path = require('path');

class UpdateChecker {
  constructor() {
    this.config = this.loadConfig();
    this.currentVersion = this.loadCurrentVersion();
    this.intervalId = null;
  }

  loadConfig() {
    const configPath = path.join(__dirname, '../../config.json');
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }

  loadCurrentVersion() {
    const packagePath = path.join(__dirname, '../../package.json');
    const packageData = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    return packageData.version;
  }

  start() {
    console.log('Update checker started');
    
    // Check immediately on start
    this.checkForUpdates();

    // Then check every 30 minutes (or configured interval)
    this.intervalId = setInterval(() => {
      this.checkForUpdates();
    }, this.config.update.checkInterval);
  }

  checkForUpdates() {
    const repo = this.config.update.githubRepo;
    
    if (!repo || repo === 'yourusername/ourworld-chat') {
      console.log('GitHub repo not configured, skipping update check');
      return;
    }

    const options = {
      hostname: 'api.github.com',
      path: `/repos/${repo}/releases/latest`,
      method: 'GET',
      headers: {
        'User-Agent': 'OurWorld-Chat-App'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const release = JSON.parse(data);
            const latestVersion = release.tag_name.replace('v', '');
            
            if (this.compareVersions(latestVersion, this.currentVersion) > 0) {
              console.log(`New version available: ${latestVersion} (current: ${this.currentVersion})`);
              this.notifyUpdate(latestVersion, release.html_url);
            } else {
              console.log('App is up to date');
            }
          } catch (error) {
            console.error('Error parsing update data:', error);
          }
        } else if (res.statusCode === 404) {
          console.log('No releases found on GitHub');
        } else {
          console.log(`Update check failed with status: ${res.statusCode}`);
        }
      });
    });

    req.on('error', (error) => {
      console.error('Error checking for updates:', error.message);
    });

    req.end();
  }

  compareVersions(v1, v2) {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const part1 = parts1[i] || 0;
      const part2 = parts2[i] || 0;

      if (part1 > part2) return 1;
      if (part1 < part2) return -1;
    }

    return 0;
  }

  notifyUpdate(version, url) {
    // Send notification to renderer process
    // For MVP, just log to console
    console.log(`\n${'='.repeat(50)}`);
    console.log(`🔔 UPDATE AVAILABLE: v${version}`);
    console.log(`Download: ${url}`);
    console.log(`${'='.repeat(50)}\n`);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      console.log('Update checker stopped');
    }
  }
}

module.exports = new UpdateChecker();

