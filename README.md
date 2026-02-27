# Eziarr - *Arr Missing Media Manager

Eziarr is a powerful, missing-media manager designed to work alongside your existing *Arr stack (Radarr, Sonarr, Lidarr). When standard indexers fail to find your missing movies, shows, or albums, Eziarr steps in to give you manual and automated tools to hunt them down across alternative sources like Telegram, the Internet Archive, and Open Directories.

## ✨ Key Features

* **Unified Dashboard:** View all your missing media from Radarr, Sonarr, and Lidarr in one clean, filterable interface.
* **The "Hunter" Automations:** A background worker continuously monitors your missing items and periodically triggers automated searches on your indexers to find old releases.
* **Deep Search Capabilities:** * **Telegram (MTProto):** Connect your Telegram account to search channels and download large media files directly.
  * **Internet Archive:** Search and download public domain or archived media directly from archive.org.
  * **Open Directories:** Paste an Apache/Nginx directory link, and Eziarr will scan it for video files.
* **Force Grab:** Instantly bypass *Arr quality profiles or stalled queues to force a release to download.
* **Auto-Import:** Eziarr downloads alternative media locally and automatically commands Radarr/Sonarr to import and move the files.

## ⚙️ Configuration & Path Mapping

Eziarr features a built-in Settings UI to manage your setup. 

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
If your *Arr stack is on a Windows machine but Eziarr is running on a Linux or macOS machine (or Docker host), you need to mount the Windows network share to your local OS first.

**🐧 Linux (Ubuntu/Debian) to Windows:**
First, install the required SMB utilities and create an empty folder for the mount point:
```bash
sudo apt-get update && sudo apt-get install cifs-utils -y
sudo mkdir -p /mnt/eziarr_imports
```

Then, mount your Windows share to Linux (replace the IP 192.168.1.50 and share name Eziarr with your own):
```bash
sudo mount -t cifs //192.168.1.50/Eziarr /mnt/eziarr_imports -o username=Guest,password=,uid=1000,gid=1000,iocharset=utf8
```

**🍎 macOS to Windows:**
macOS natively supports SMB, so no extra installations are needed. Create a mount point and use the native mount command:
```bash
mkdir -p ~/eziarr_imports
mount_smbfs //Guest:@192.168.1.50/Eziarr ~/eziarr_imports
```

(Alternatively, in macOS UI: Open Finder > Go > Connect to Server > Type smb://192.168.1.50/Eziarr)

**Final Docker Step:**
Once mounted to your host OS, simply pass that mounted folder into your Eziarr Docker container as a volume (e.g., -v /mnt/eziarr_imports:/app/downloads).

---

## 🚀 Getting Started
1. Ensure your `.env` contains your *Arr API keys and URLs (or configure them in `utils.js`).
2. Start the backend server and worker.
3. Open the web UI. Eziarr will automatically sync your missing items and start hunting!