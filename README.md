# Eziarr - *Arr Missing Media Manager

Eziarr is a powerful, missing-media manager designed to work alongside your existing *Arr stack (Radarr, Sonarr, Lidarr). When standard indexers fail to find your missing movies, shows, or albums, Eziarr steps in to give you manual and automated tools to hunt them down across alternative sources like Telegram, the Internet Archive, and Open Directories.

## ✨ Key Features

* **Unified Dashboard:** View all your missing media from Radarr, Sonarr, and Lidarr in one clean, filterable interface.
* **The "Hunter" Automations:** A background worker continuously monitors your missing items and periodically triggers automated searches on your indexers to find old releases.
* **Asynchronous Queue:** Downloads are handled by a dedicated background worker, keeping the UI lightning-fast and preventing memory crashes.
* **Deep Search Capabilities:** * **Telegram (MTProto):** Connect your Telegram account to search channels and download large media files directly.
  * **Internet Archive:** Search and download public domain or archived media directly from archive.org.
  * **Open Directories:** Paste an Apache/Nginx directory link, and Eziarr will scan it for video files.
* **Force Grab:** Instantly bypass *Arr quality profiles or stalled queues to force a release to download.
* **Auto-Import:** Eziarr downloads alternative media locally and automatically commands Radarr/Sonarr to import and move the files.

## ⚙️ Configuration & Path Mapping

Eziarr features a built-in Settings UI to manage your setup, view active background tasks, and monitor system logs in real-time.

### The "Docker vs. Host" Problem (Path Translation)
If you run Eziarr in a Docker container (or on PC A), but Radarr/Sonarr are on your host machine (or PC B), they won't agree on where downloaded files live. 

1. Eziarr downloads a movie to `/app/downloads/movie.mkv`.
2. Eziarr tells Radarr to import `/app/downloads/movie.mkv`.
3. Radarr looks at its own hard drive, can't find it, and fails.

**The Fix:**
In the Eziarr Settings UI, configure the **Path Translation**:
* **Eziarr Local Path (Docker Prefix):** `/app/downloads`
* **Arr Remote Path (Host Prefix):** `C:\Imports` (or whatever your shared network folder is mapped to).

Eziarr will seamlessly translate the paths before asking Radarr to import them.

---

### 🔗 Mounting the Share (Cross-Platform)
If your *Arr stack is on a Windows machine but Eziarr is running on a Linux host (like a Docker server), you must mount the Windows network share permanently so Docker has the correct read/write permissions.

**🐧 Linux (Ubuntu/Debian) to Windows (Permanent Auto-Mount):**
First, install the SMB utilities and create a mount point:
\`\`\`bash
sudo apt-get update && sudo apt-get install cifs-utils -y
sudo mkdir -p /mnt/eziarr_imports
\`\`\`

Next, edit your file system table to make the mount permanent and give Docker (`uid=1000`) ownership:
\`\`\`bash
sudo nano /etc/fstab
\`\`\`
Add this line to the bottom (replace IP, ShareName, and credentials):
\`\`\`text
//192.168.1.50/ShareName /mnt/eziarr_imports cifs username=YOUR_WINDOWS_USER,password=YOUR_WINDOWS_PASS,uid=1000,gid=1000,dir_mode=0777,file_mode=0777,nofail,x-systemd.automount 0 0
\`\`\`

Reload the daemon and mount it:
\`\`\`bash
sudo systemctl daemon-reload
sudo mount -a
\`\`\`
Finally, pass `-v /mnt/eziarr_imports:/app/downloads` to your Docker container!

**🍎 macOS to Windows:**
macOS natively supports SMB. Create a mount point and use the native mount command:
\`\`\`bash
mkdir -p ~/eziarr_imports
mount_smbfs //Guest:@192.168.1.50/Eziarr ~/eziarr_imports
\`\`\`

---

## 🚀 Getting Started
1. Configure your `.env` or use the built-in Settings UI.
2. Start the backend server and worker using Docker Compose or PM2.
3. Open the web UI. Eziarr will automatically sync your missing items and start hunting!