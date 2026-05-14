// ============================
// UTILITY FUNCTIONS
// ============================

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function resolveUrl(base, relative) {
  try {
    return new URL(relative, base).href;
  } catch {
    return relative;
  }
}

function formatBandwidth(bw) {
  if (bw >= 1000000) {
    return (bw / 1000000).toFixed(2) + " Mbps";
  }
  if (bw >= 1000) {
    return (bw / 1000).toFixed(0) + " Kbps";
  }
  return bw + " bps";
}

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = (seconds % 60).toFixed(1);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function decodeCodec(codec) {
  const c = codec.trim().toLowerCase();
  // H.264 / AVC
  if (c.startsWith("avc1.") || c.startsWith("avc3.")) {
    const profiles = { "42": "Baseline", "4d": "Main", "58": "Extended", "64": "High", "6e": "High 10", "7a": "High 4:2:2", "f4": "High 4:4:4 Pred" };
    const hex = c.split(".")[1] || "";
    const profileHex = hex.substring(0, 2);
    const levelHex = hex.substring(4, 6);
    const profile = profiles[profileHex] || "";
    const level = levelHex ? (parseInt(levelHex, 16) / 10).toFixed(1).replace(/\.0$/, "") : "";
    return "H.264" + (profile ? " " + profile : "") + (level ? " L" + level : "");
  }
  // H.265 / HEVC
  if (c.startsWith("hvc1.") || c.startsWith("hev1.")) {
    const parts = c.split(".");
    const tier = parts[1] === "2" ? "Main 10" : "Main";
    const rawLevel = parts[3] || "";
    const level = rawLevel ? (rawLevel.toUpperCase().startsWith("L") ? rawLevel.toUpperCase() : "L" + rawLevel) : "";
    return "H.265 " + tier + (level ? " " + level : "");
  }
  // AV1
  if (c.startsWith("av01.")) {
    const parts = c.split(".");
    const profiles = { "0": "Main", "1": "High", "2": "Professional" };
    const profile = profiles[parts[1]] || "";
    const level = parts[2] || "";
    return "AV1" + (profile ? " " + profile : "") + (level ? " L" + level : "");
  }
  // VP9
  if (c.startsWith("vp09.") || c === "vp9") return "VP9";
  // AAC
  if (c === "mp4a.40.2") return "AAC-LC";
  if (c === "mp4a.40.5") return "HE-AAC (v1)";
  if (c === "mp4a.40.29") return "HE-AAC v2";
  if (c === "mp4a.40.34") return "MP3";
  if (c === "mp4a.67") return "AAC-LC";
  if (c.startsWith("mp4a.40.")) return "AAC";
  if (c.startsWith("mp4a.")) return "MPEG-4 Audio";
  // AC-3 / EC-3
  if (c === "ac-3") return "Dolby AC-3";
  if (c === "ec-3") return "Dolby EC-3 (E-AC-3)";
  // Dolby Vision
  if (c.startsWith("dvh1.") || c.startsWith("dvhe.")) return "Dolby Vision";
  // Opus
  if (c === "opus") return "Opus";
  // FLAC
  if (c === "flac") return "FLAC";
  // WebVTT
  if (c === "wvtt") return "WebVTT";
  // STPP
  if (c.startsWith("stpp")) return "TTML";
  return codec.trim();
}

function isValidUrl(str) {
  try {
    const url = new URL(str);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

// ============================
// DRM / PSSH DECODERS
// ============================

function identifyDRM(keyformat) {
  if (!keyformat) return { name: "AES-128", system: "aes-128" };
  const kf = keyformat.toLowerCase();
  if (kf === "identity") return { name: "AES-128 (Clear Key)", system: "aes-128" };
  if (kf.includes("edef8ba9-79d6-4ace-a3c8-27dcd51d21ed")) return { name: "Widevine", system: "widevine" };
  if (kf.includes("9a04f079-9840-4286-ab92-e65be0885f95")) return { name: "PlayReady", system: "playready" };
  if (kf === "com.apple.streamingkeydelivery") return { name: "FairPlay", system: "fairplay" };
  if (kf === "com.microsoft.playready") return { name: "PlayReady", system: "playready" };
  if (kf.includes("clearkey")) return { name: "ClearKey", system: "clearkey" };
  return { name: keyformat, system: "unknown" };
}

function formatUUID(bytes) {
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
}

function formatPlayReadyGUID(bytes) {
  if (bytes.length < 16) return formatUUID(bytes);
  const swap = new Uint8Array(16);
  swap[0] = bytes[3]; swap[1] = bytes[2]; swap[2] = bytes[1]; swap[3] = bytes[0];
  swap[4] = bytes[5]; swap[5] = bytes[4];
  swap[6] = bytes[7]; swap[7] = bytes[6];
  for (let i = 8; i < 16; i++) swap[i] = bytes[i];
  return formatUUID(swap);
}

function readVarint(data, offset) {
  let value = 0;
  let shift = 0;
  while (offset < data.length) {
    const byte = data[offset];
    offset++;
    value |= (byte & 0x7F) << shift;
    if ((byte & 0x80) === 0) return { value, offset };
    shift += 7;
    if (shift > 35) return null;
  }
  return null;
}

function decodePSSH(base64String) {
  try {
    const binaryStr = atob(base64String);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

    if (bytes.length < 32) return { error: "Too short to be a valid PSSH box" };

    const type = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]);
    if (type !== 'pssh') return { error: "Not a PSSH box (type: " + type + ")" };

    const version = bytes[8];
    const systemId = formatUUID(bytes.slice(12, 28));

    let offset = 28;
    const keyIds = [];

    if (version >= 1 && offset + 4 <= bytes.length) {
      const keyIdCount = (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
      offset += 4;
      for (let i = 0; i < keyIdCount && offset + 16 <= bytes.length; i++) {
        keyIds.push(formatUUID(bytes.slice(offset, offset + 16)));
        offset += 16;
      }
    }

    let dataSize = 0;
    let data = null;
    if (offset + 4 <= bytes.length) {
      dataSize = (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
      offset += 4;
      if (dataSize > 0 && offset + dataSize <= bytes.length) {
        data = bytes.slice(offset, offset + dataSize);
      }
    }

    const drmNames = {
      "edef8ba9-79d6-4ace-a3c8-27dcd51d21ed": "Widevine",
      "9a04f079-9840-4286-ab92-e65be0885f95": "PlayReady",
      "94ce86fb-07ff-4f43-adb8-93d2fa968ca2": "FairPlay",
      "1077efec-c0b2-4d02-ace3-3c1e52e2fb4b": "W3C Common (ClearKey)",
      "e2719d58-a985-b3c9-781a-b030af78d30e": "ClearKey"
    };

    const result = { version, systemId, keyIds, dataSize, drmName: drmNames[systemId] || "Unknown" };

    if (data) {
      if (systemId === "9a04f079-9840-4286-ab92-e65be0885f95") {
        result.playreadyData = decodePlayReadyObject(data);
      }
      if (systemId === "edef8ba9-79d6-4ace-a3c8-27dcd51d21ed") {
        result.widevineData = decodeWidevineInitData(data);
      }
    }

    return result;
  } catch (e) {
    return { error: "Failed to decode PSSH: " + e.message };
  }
}

function decodePlayReadyObject(data) {
  try {
    const result = {};
    const recordCount = data[4] | (data[5] << 8);
    let offset = 6;

    for (let i = 0; i < recordCount && offset + 4 <= data.length; i++) {
      const recordType = data[offset] | (data[offset + 1] << 8);
      const recordLen = data[offset + 2] | (data[offset + 3] << 8);
      offset += 4;

      if (recordType === 1 && recordLen > 0 && offset + recordLen <= data.length) {
        const xmlBytes = data.slice(offset, offset + recordLen);
        let xml = '';
        for (let j = 0; j < xmlBytes.length - 1; j += 2) {
          xml += String.fromCharCode(xmlBytes[j] | (xmlBytes[j + 1] << 8));
        }
        result.headerXml = xml;

        const laMatch = xml.match(/<LA_URL>(.*?)<\/LA_URL>/i);
        if (laMatch) result.laUrl = laMatch[1];

        const kidMatches = xml.match(/KID="([^"]+)"/gi);
        if (kidMatches) {
          result.keyIds = kidMatches.map(m => {
            const kid = m.match(/KID="([^"]+)"/i)[1];
            try {
              const kidBytes = atob(kid);
              const arr = new Uint8Array(kidBytes.length);
              for (let k = 0; k < kidBytes.length; k++) arr[k] = kidBytes.charCodeAt(k);
              return formatPlayReadyGUID(arr);
            } catch { return kid; }
          });
        }

        const algMatch = xml.match(/<ALGID>(.*?)<\/ALGID>/i);
        if (algMatch) result.algorithm = algMatch[1];

        const checkMatch = xml.match(/<CHECKSUM>(.*?)<\/CHECKSUM>/i);
        if (checkMatch) result.checksum = checkMatch[1];
      }

      offset += recordLen;
    }

    return result;
  } catch (e) {
    return { error: e.message };
  }
}

function decodeWidevineInitData(data) {
  try {
    const result = { keyIds: [], provider: '', contentId: '' };
    let offset = 0;

    while (offset < data.length) {
      const tag = readVarint(data, offset);
      if (!tag) break;
      offset = tag.offset;
      const fieldNumber = tag.value >> 3;
      const wireType = tag.value & 0x7;

      if (wireType === 0) {
        const val = readVarint(data, offset);
        if (!val) break;
        offset = val.offset;
        if (fieldNumber === 1) result.algorithm = val.value;
        if (fieldNumber === 8) {
          const s = val.value;
          result.protectionScheme = String.fromCharCode((s >> 24) & 0xFF, (s >> 16) & 0xFF, (s >> 8) & 0xFF, s & 0xFF);
        }
      } else if (wireType === 2) {
        const len = readVarint(data, offset);
        if (!len) break;
        offset = len.offset;
        const fieldData = data.slice(offset, offset + len.value);
        offset += len.value;

        if (fieldNumber === 2) {
          const hex = Array.from(fieldData).map(b => b.toString(16).padStart(2, '0')).join('');
          if (hex.length === 32) {
            result.keyIds.push(hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20));
          } else {
            result.keyIds.push(hex);
          }
        } else if (fieldNumber === 3) {
          result.provider = new TextDecoder().decode(fieldData);
        } else if (fieldNumber === 4) {
          try {
            result.contentId = new TextDecoder('utf-8', { fatal: true }).decode(fieldData);
          } catch {
            result.contentId = Array.from(fieldData).map(b => b.toString(16).padStart(2, '0')).join('');
          }
        }
      } else {
        break;
      }
    }

    return result;
  } catch (e) {
    return { error: e.message };
  }
}

function tryDecodePSSHFromURI(uri) {
  if (!uri) return null;
  // Widevine/PlayReady URIs in HLS often use data: or base64 PSSH
  // Format: data:text/plain;base64,AAAA... or just base64
  let base64 = null;
  if (uri.startsWith("data:")) {
    const match = uri.match(/base64,(.+)/);
    if (match) base64 = match[1];
  } else if (uri.match(/^[A-Za-z0-9+/=]{20,}$/)) {
    base64 = uri;
  }
  if (!base64) return null;
  const decoded = decodePSSH(base64);
  if (decoded && !decoded.error) {
    decoded._rawBase64 = base64;
    return decoded;
  }
  return null;
}

function getHttpErrorMessage(status, statusText) {
  const errors = {
    400: "400 Bad Request — The server could not understand the request. The URL may be malformed.",
    401: "401 Unauthorized — Authentication is required. You may need a valid token or login credentials.",
    403: "403 Forbidden — Access denied. The server understood the request but refuses to authorize it. Check if you need authentication or if the resource is restricted.",
    404: "404 Not Found — The manifest file was not found at this URL. Verify the URL is correct and the file exists on the server.",
    405: "405 Method Not Allowed — The HTTP method is not allowed for this resource.",
    408: "408 Request Timeout — The server timed out waiting for the request.",
    410: "410 Gone — The resource has been permanently removed from the server.",
    429: "429 Too Many Requests — Rate limited. Wait a moment and try again.",
    500: "500 Internal Server Error — The server encountered an unexpected condition.",
    502: "502 Bad Gateway — The server received an invalid response from an upstream server.",
    503: "503 Service Unavailable — The server is temporarily down for maintenance or overloaded.",
    504: "504 Gateway Timeout — The upstream server did not respond in time."
  };
  return errors[status] || `HTTP ${status}: ${statusText}`;
}

function getFetchErrorMessage(error) {
  const msg = error.message || "";
  if (msg === "Failed to fetch") {
    return "Network Error — The request was blocked. Common causes:\n• CORS policy is blocking cross-origin requests\n• DNS resolution failed (domain not found)\n• Server is unreachable or offline\n• SSL/TLS certificate error\n• Browser extension blocking the request";
  }
  if (msg.includes("NetworkError")) {
    return "Network Error — Could not establish a connection to the server.";
  }
  if (msg.includes("AbortError")) {
    return "Request Aborted — The request was cancelled before completion.";
  }
  if (msg.includes("TypeError")) {
    return "Type Error — Invalid request. The URL format may be incorrect.";
  }
  return msg;
}

function showToast(message) {
  let toast = document.querySelector(".toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2000);
}

function showError(msg) {
  // Show inline error
  const el = document.getElementById("errorMessage");
  el.textContent = msg;
  el.style.display = "block";

  // Show modal popup
  let overlay = document.getElementById("errorModal");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "errorModal";
    overlay.className = "modal-overlay";
    overlay.innerHTML = '<div class="modal-box">' +
      '<div class="modal-header"><span class="modal-icon">⚠️</span><span class="modal-title">Error</span></div>' +
      '<div class="modal-body" id="errorModalBody"></div>' +
      '<button class="modal-close-btn" id="errorModalClose">Dismiss</button>' +
      '</div>';
    document.body.appendChild(overlay);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeErrorModal();
    });
    document.getElementById("errorModalClose").addEventListener("click", closeErrorModal);
  }
  document.getElementById("errorModalBody").textContent = msg;
  overlay.classList.add("show");
  document.body.style.overflow = "hidden";
}

function closeErrorModal() {
  const overlay = document.getElementById("errorModal");
  if (overlay) {
    overlay.classList.remove("show");
    document.body.style.overflow = "";
  }
}

function clearError() {
  const el = document.getElementById("errorMessage");
  el.textContent = "";
  el.style.display = "none";
  closeErrorModal();
}

function showLoading(show) {
  document.getElementById("loadingIndicator").style.display = show ? "flex" : "none";
}

// ============================
// HISTORY MANAGEMENT
// ============================

const HISTORY_KEY = "hls_manifest_history";
const MAX_HISTORY = 10;

function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  } catch {
    return [];
  }
}

function addToHistory(url) {
  let history = getHistory();
  history = history.filter(u => u !== url);
  history.unshift(url);
  if (history.length > MAX_HISTORY) history = history.slice(0, MAX_HISTORY);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  renderHistory();
}

function clearHistory() {
  localStorage.removeItem(HISTORY_KEY);
  renderHistory();
}

function renderHistory() {
  const history = getHistory();
  const container = document.getElementById("historyContainer");
  const list = document.getElementById("historyList");

  if (history.length === 0) {
    container.style.display = "none";
    return;
  }

  container.style.display = "block";
  list.innerHTML = "";

  history.forEach(url => {
    const btn = document.createElement("button");
    btn.className = "history-item";
    // Show filename portion for readability
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split("/").filter(Boolean);
      btn.textContent = pathParts.length > 0 ? pathParts[pathParts.length - 1] : url;
    } catch {
      btn.textContent = url.length > 40 ? "..." + url.slice(-37) : url;
    }
    btn.title = url;
    btn.addEventListener("click", () => {
      document.getElementById("manifestUrl").value = url;
      loadManifestFromUrl();
    });
    list.appendChild(btn);
  });

  const clearBtn = document.createElement("button");
  clearBtn.className = "history-clear";
  clearBtn.textContent = "Clear";
  clearBtn.addEventListener("click", clearHistory);
  list.appendChild(clearBtn);
}

// ============================
// THEME MANAGEMENT
// ============================

function initTheme() {
  const saved = localStorage.getItem("hls_theme") || "dark";
  document.documentElement.setAttribute("data-theme", saved === "light" ? "light" : "");
  updateThemeIcon(saved);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme");
  const next = current === "light" ? "" : "light";
  document.documentElement.setAttribute("data-theme", next);
  const theme = next === "light" ? "light" : "dark";
  localStorage.setItem("hls_theme", theme);
  updateThemeIcon(theme);
}

function updateThemeIcon(theme) {
  const btn = document.getElementById("themeToggle");
  btn.textContent = theme === "light" ? "🌙" : "☀️";
}

// ============================
// MANIFEST PARSER (Modular)
// ============================

function parseManifest(manifest, baseUrl) {
  const lines = manifest.split(/\r?\n/);
  const result = {
    playlistType: "Unknown",
    version: null,
    variants: 0,
    videoVariants: 0,
    audioVariants: 0,
    segments: 0,
    targetDuration: null,
    mediaSequence: null,
    totalDuration: 0,
    resolutions: [],
    codecs: [],
    childPlaylists: [],
    mediaTracks: [],
    subtitleTracks: [],
    ccTracks: [],
    closedCaptionsAttr: null,
    encryption: null,
    encryptionEntries: [],   // all EXT-X-KEY / EXT-X-SESSION-KEY entries
    discontinuities: 0,
    hasEndList: false,
    streamType: null, // live, vod, event
    maxBandwidth: 0,
    minBandwidth: Infinity,
    segmentDurations: [],
    segmentUrls: [],
    variantDetails: [],
    iframeStreams: [],
    iframesOnly: false,
    mediaContentType: null, // video, audio, subtitle — detected from segments
    initSegment: null,       // #EXT-X-MAP
    programDateTime: null,   // #EXT-X-PROGRAM-DATE-TIME (first occurrence)
    programDateTimes: [],    // all PDT values
    byteRanges: [],          // #EXT-X-BYTERANGE entries
    startOffset: null,       // #EXT-X-START
    independentSegments: false,
    // Low-Latency HLS (LL-HLS)
    serverControl: null,     // #EXT-X-SERVER-CONTROL
    partInf: null,           // #EXT-X-PART-INF
    parts: [],               // #EXT-X-PART entries
    preloadHints: [],        // #EXT-X-PRELOAD-HINT entries
    skip: null,              // #EXT-X-SKIP
    isLowLatency: false,
    // New features
    dateRanges: [],          // #EXT-X-DATERANGE entries
    sessionData: [],         // #EXT-X-SESSION-DATA entries
    discontinuitySequence: null, // #EXT-X-DISCONTINUITY-SEQUENCE
    gapCount: 0,             // #EXT-X-GAP count
    warnings: []
  };

  let currentExtInf = null;
  let currentByteRange = null;
  let currentGap = false;

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) return;

    // VERSION
    if (line.startsWith("#EXT-X-VERSION:")) {
      result.version = line.split(":")[1].trim();
    }

    // PLAYLIST TYPE TAG
    if (line.startsWith("#EXT-X-PLAYLIST-TYPE:")) {
      const type = line.split(":")[1].trim().toUpperCase();
      if (type === "VOD") result.streamType = "VOD";
      else if (type === "EVENT") result.streamType = "EVENT";
    }

    // ENDLIST
    if (line === "#EXT-X-ENDLIST") {
      result.hasEndList = true;
    }

    // TARGET DURATION
    if (line.startsWith("#EXT-X-TARGETDURATION:")) {
      result.targetDuration = line.split(":")[1].trim();
    }

    // MEDIA SEQUENCE
    if (line.startsWith("#EXT-X-MEDIA-SEQUENCE:")) {
      result.mediaSequence = line.split(":")[1].trim();
    }

    // DISCONTINUITY
    if (line === "#EXT-X-DISCONTINUITY") {
      result.discontinuities++;
    }

    // DISCONTINUITY-SEQUENCE
    if (line.startsWith("#EXT-X-DISCONTINUITY-SEQUENCE:")) {
      result.discontinuitySequence = parseInt(line.split(":")[1].trim());
    }

    // GAP
    if (line === "#EXT-X-GAP") {
      result.gapCount++;
      currentGap = true;
    }

    // ENCRYPTION
    if (line.startsWith("#EXT-X-KEY:") || line.startsWith("#EXT-X-SESSION-KEY:")) {
      const isSession = line.startsWith("#EXT-X-SESSION-KEY:");
      const methodMatch = line.match(/METHOD=([^,]+)/);
      if (methodMatch && methodMatch[1] !== "NONE") {
        const uriMatch = line.match(/URI="([^"]+)"/);
        const keyformatMatch = line.match(/KEYFORMAT="([^"]+)"/);
        const keyformatVersionsMatch = line.match(/KEYFORMATVERSIONS="([^"]+)"/);
        const ivMatch = line.match(/IV=0x([0-9a-fA-F]+)/);

        const entry = {
          method: methodMatch[1],
          uri: uriMatch ? uriMatch[1] : null,
          keyformat: keyformatMatch ? keyformatMatch[1] : null,
          keyformatVersions: keyformatVersionsMatch ? keyformatVersionsMatch[1] : null,
          iv: ivMatch ? ivMatch[1] : null,
          isSessionKey: isSession,
          drm: identifyDRM(keyformatMatch ? keyformatMatch[1] : null),
          psshDecoded: null
        };

        // Try to decode PSSH from URI (Widevine/PlayReady use base64 PSSH in URI)
        if (entry.uri) {
          entry.psshDecoded = tryDecodePSSHFromURI(entry.uri);
        }

        result.encryptionEntries.push(entry);

        // Keep backward compat — set first encryption entry
        if (!result.encryption) {
          result.encryption = entry;
        }
      }
    }

    // MEDIA TRACKS (audio, subtitles, etc.)
    if (line.startsWith("#EXT-X-MEDIA:")) {
      const track = {};
      const typeMatch = line.match(/TYPE=([^,]+)/);
      const nameMatch = line.match(/NAME="([^"]+)"/);
      const langMatch = line.match(/LANGUAGE="([^"]+)"/);
      const defaultMatch = line.match(/DEFAULT=(YES|NO)/);
      const groupMatch = line.match(/GROUP-ID="([^"]+)"/);
      const uriMatch = line.match(/URI="([^"]+)"/);

      const instreamMatch = line.match(/INSTREAM-ID="([^"]+)"/);
      const forcedMatch = line.match(/FORCED=(YES|NO)/);
      const charsMatch = line.match(/CHARACTERISTICS="([^"]+)"/);
      const channelsMatch = line.match(/CHANNELS="([^"]+)"/);
      const autoselectMatch = line.match(/AUTOSELECT=(YES|NO)/);

      if (typeMatch) track.type = typeMatch[1];
      if (nameMatch) track.name = nameMatch[1];
      if (langMatch) track.language = langMatch[1];
      if (defaultMatch) track.default = defaultMatch[1] === "YES";
      if (autoselectMatch) track.autoselect = autoselectMatch[1] === "YES";
      if (groupMatch) track.groupId = groupMatch[1];
      if (uriMatch) track.uri = resolveUrl(baseUrl, uriMatch[1]);
      if (instreamMatch) track.instreamId = instreamMatch[1];
      if (forcedMatch) track.forced = forcedMatch[1] === "YES";
      if (charsMatch) track.characteristics = charsMatch[1];
      if (channelsMatch) track.channels = channelsMatch[1];

      result.mediaTracks.push(track);

      // Categorize into subtitles vs closed captions
      if (track.type === "SUBTITLES") {
        track.delivery = track.uri ? "Out-of-band (Sidecar)" : "Unknown";
        result.subtitleTracks.push(track);
      } else if (track.type === "CLOSED-CAPTIONS") {
        track.delivery = "In-band (CEA-608/708)";
        result.ccTracks.push(track);
      }
    }

    // VARIANT STREAMS
    if (line.startsWith("#EXT-X-STREAM-INF:")) {
      result.variants++;
      result.playlistType = "Master Playlist";

      const variant = { raw: line };

      // BANDWIDTH
      const bwMatch = line.match(/BANDWIDTH=(\d+)/);
      if (bwMatch) {
        const bw = parseInt(bwMatch[1]);
        variant.bandwidth = bw;
        result.maxBandwidth = Math.max(result.maxBandwidth, bw);
        result.minBandwidth = Math.min(result.minBandwidth, bw);
      }

      // AVERAGE BANDWIDTH
      const avgBwMatch = line.match(/AVERAGE-BANDWIDTH=(\d+)/);
      if (avgBwMatch) variant.avgBandwidth = parseInt(avgBwMatch[1]);

      // RESOLUTION
      const resMatch = line.match(/RESOLUTION=(\d+x\d+)/);
      if (resMatch) {
        variant.resolution = resMatch[1];
        result.resolutions.push(resMatch[1]);
        result.videoVariants++;
      } else {
        result.audioVariants++;
      }

      // CODECS
      const codecMatch = line.match(/CODECS="([^"]+)"/);
      if (codecMatch) {
        variant.codecs = codecMatch[1];
        codecMatch[1].split(",").forEach(codec => {
          codec = codec.trim();
          if (!result.codecs.includes(codec)) {
            result.codecs.push(codec);
          }
        });
      }

      // FRAME RATE
      const frMatch = line.match(/FRAME-RATE=([\d.]+)/);
      if (frMatch) variant.frameRate = parseFloat(frMatch[1]);

      // CLOSED-CAPTIONS attribute
      const ccAttrMatch = line.match(/CLOSED-CAPTIONS=(?:"([^"]+)"|([^,]+))/);
      if (ccAttrMatch) {
        result.closedCaptionsAttr = ccAttrMatch[1] || ccAttrMatch[2];
      }

      // AUDIO group reference
      const audioGroupMatch = line.match(/AUDIO="([^"]+)"/);
      if (audioGroupMatch) variant.audioGroup = audioGroupMatch[1];

      // SUBTITLES group reference
      const subsGroupMatch = line.match(/SUBTITLES="([^"]+)"/);
      if (subsGroupMatch) variant.subtitlesGroup = subsGroupMatch[1];

      // VIDEO group reference
      const videoGroupMatch = line.match(/VIDEO="([^"]+)"/);
      if (videoGroupMatch) variant.videoGroup = videoGroupMatch[1];

      // HDCP-LEVEL
      const hdcpMatch = line.match(/HDCP-LEVEL=([^,]+)/);
      if (hdcpMatch) variant.hdcpLevel = hdcpMatch[1];

      // VIDEO-RANGE (SDR, PQ, HLG)
      const videoRangeMatch = line.match(/VIDEO-RANGE=([^,]+)/);
      if (videoRangeMatch) variant.videoRange = videoRangeMatch[1];

      // CHILD PLAYLIST URL
      const nextLine = lines[index + 1];
      if (nextLine && nextLine.trim() && !nextLine.trim().startsWith("#")) {
        const childUrl = nextLine.trim();
        variant.url = resolveUrl(baseUrl, childUrl);
        variant.rawUrl = childUrl;
        result.childPlaylists.push({
          raw: childUrl,
          url: variant.url,
          bandwidth: variant.bandwidth,
          resolution: variant.resolution,
          codecs: variant.codecs
        });
      }

      result.variantDetails.push(variant);
    }

    // I-FRAME STREAM (master playlist)
    if (line.startsWith("#EXT-X-I-FRAME-STREAM-INF:")) {
      result.playlistType = "Master Playlist";
      const iframe = {};

      const bwMatch = line.match(/BANDWIDTH=(\d+)/);
      if (bwMatch) iframe.bandwidth = parseInt(bwMatch[1]);

      const resMatch = line.match(/RESOLUTION=(\d+x\d+)/);
      if (resMatch) iframe.resolution = resMatch[1];

      const codecMatch = line.match(/CODECS="([^"]+)"/);
      if (codecMatch) iframe.codecs = codecMatch[1];

      const uriMatch = line.match(/URI="([^"]+)"/);
      if (uriMatch) iframe.uri = resolveUrl(baseUrl, uriMatch[1]);
      if (uriMatch) iframe.rawUri = uriMatch[1];

      const hdcpMatch = line.match(/HDCP-LEVEL=([^,]+)/);
      if (hdcpMatch) iframe.hdcpLevel = hdcpMatch[1];

      result.iframeStreams.push(iframe);
    }

    // I-FRAMES-ONLY (media playlist)
    if (line === "#EXT-X-I-FRAMES-ONLY") {
      result.iframesOnly = true;
    }

    // INIT SEGMENT MAP
    if (line.startsWith("#EXT-X-MAP:")) {
      const uriMatch = line.match(/URI="([^"]+)"/);
      const byterangeMatch = line.match(/BYTERANGE="([^"]+)"/);
      result.initSegment = {
        uri: uriMatch ? resolveUrl(baseUrl, uriMatch[1]) : null,
        rawUri: uriMatch ? uriMatch[1] : null,
        byterange: byterangeMatch ? byterangeMatch[1] : null
      };
    }

    // PROGRAM-DATE-TIME
    if (line.startsWith("#EXT-X-PROGRAM-DATE-TIME:")) {
      const pdt = line.substring("#EXT-X-PROGRAM-DATE-TIME:".length).trim();
      result.programDateTimes.push(pdt);
      if (!result.programDateTime) result.programDateTime = pdt;
    }

    // BYTERANGE
    if (line.startsWith("#EXT-X-BYTERANGE:")) {
      currentByteRange = line.substring("#EXT-X-BYTERANGE:".length).trim();
    }

    // START
    if (line.startsWith("#EXT-X-START:")) {
      const offsetMatch = line.match(/TIME-OFFSET=([-\d.]+)/);
      const preciseMatch = line.match(/PRECISE=(YES|NO)/);
      result.startOffset = {
        timeOffset: offsetMatch ? parseFloat(offsetMatch[1]) : 0,
        precise: preciseMatch ? preciseMatch[1] === "YES" : false
      };
    }

    // INDEPENDENT-SEGMENTS
    if (line === "#EXT-X-INDEPENDENT-SEGMENTS") {
      result.independentSegments = true;
    }

    // LL-HLS: EXT-X-SERVER-CONTROL
    if (line.startsWith("#EXT-X-SERVER-CONTROL:")) {
      const sc = {};
      const canBlock = line.match(/CAN-BLOCK-RELOAD=(YES|NO)/);
      const canSkip = line.match(/CAN-SKIP-UNTIL=([\d.]+)/);
      const canSkipDR = line.match(/CAN-SKIP-DATERANGES=(YES|NO)/);
      const holdBack = line.match(/HOLD-BACK=([\d.]+)/);
      const partHoldBack = line.match(/PART-HOLD-BACK=([\d.]+)/);
      if (canBlock) sc.canBlockReload = canBlock[1] === "YES";
      if (canSkip) sc.canSkipUntil = parseFloat(canSkip[1]);
      if (canSkipDR) sc.canSkipDateranges = canSkipDR[1] === "YES";
      if (holdBack) sc.holdBack = parseFloat(holdBack[1]);
      if (partHoldBack) sc.partHoldBack = parseFloat(partHoldBack[1]);
      result.serverControl = sc;
      result.isLowLatency = true;
    }

    // LL-HLS: EXT-X-PART-INF
    if (line.startsWith("#EXT-X-PART-INF:")) {
      const ptMatch = line.match(/PART-TARGET=([\d.]+)/);
      result.partInf = { partTarget: ptMatch ? parseFloat(ptMatch[1]) : null };
      result.isLowLatency = true;
    }

    // LL-HLS: EXT-X-PART
    if (line.startsWith("#EXT-X-PART:")) {
      const part = {};
      const durMatch = line.match(/DURATION=([\d.]+)/);
      const uriMatch = line.match(/URI="([^"]+)"/);
      const indMatch = line.match(/INDEPENDENT=(YES|NO)/);
      const gapMatch = line.match(/GAP=(YES|NO)/);
      const brMatch = line.match(/BYTERANGE="([^"]+)"/);
      if (durMatch) part.duration = parseFloat(durMatch[1]);
      if (uriMatch) part.uri = resolveUrl(baseUrl, uriMatch[1]);
      if (uriMatch) part.rawUri = uriMatch[1];
      if (indMatch) part.independent = indMatch[1] === "YES";
      if (gapMatch) part.gap = gapMatch[1] === "YES";
      if (brMatch) part.byteRange = brMatch[1];
      result.parts.push(part);
      result.isLowLatency = true;
    }

    // LL-HLS: EXT-X-PRELOAD-HINT
    if (line.startsWith("#EXT-X-PRELOAD-HINT:")) {
      const hint = {};
      const typeMatch = line.match(/TYPE=([^,]+)/);
      const uriMatch = line.match(/URI="([^"]+)"/);
      const startMatch = line.match(/BYTERANGE-START=(\d+)/);
      const lenMatch = line.match(/BYTERANGE-LENGTH=(\d+)/);
      if (typeMatch) hint.type = typeMatch[1];
      if (uriMatch) hint.uri = resolveUrl(baseUrl, uriMatch[1]);
      if (uriMatch) hint.rawUri = uriMatch[1];
      if (startMatch) hint.byterangeStart = parseInt(startMatch[1]);
      if (lenMatch) hint.byterangeLength = parseInt(lenMatch[1]);
      result.preloadHints.push(hint);
      result.isLowLatency = true;
    }

    // LL-HLS: EXT-X-SKIP
    if (line.startsWith("#EXT-X-SKIP:")) {
      const skipped = line.match(/SKIPPED-SEGMENTS=(\d+)/);
      const removedDR = line.match(/RECENTLY-REMOVED-DATERANGES="([^"]+)"/);
      result.skip = {
        skippedSegments: skipped ? parseInt(skipped[1]) : 0,
        recentlyRemovedDateranges: removedDR ? removedDR[1] : null
      };
    }

    // EXT-X-DATERANGE (timed metadata / SCTE-35)
    if (line.startsWith("#EXT-X-DATERANGE:")) {
      const dr = {};
      const drId = line.match(/ID="([^"]+)"/);
      const drClass = line.match(/CLASS="([^"]+)"/);
      const drStart = line.match(/START-DATE="([^"]+)"/);
      const drEnd = line.match(/END-DATE="([^"]+)"/);
      const drDur = line.match(/DURATION=([\d.]+)/);
      const drPlanned = line.match(/PLANNED-DURATION=([\d.]+)/);
      const drScte35Out = line.match(/SCTE35-OUT=0x([0-9a-fA-F]+)/i);
      const drScte35In = line.match(/SCTE35-IN=0x([0-9a-fA-F]+)/i);
      const drScte35Cmd = line.match(/SCTE35-CMD=0x([0-9a-fA-F]+)/i);
      const drEndOnNext = line.match(/END-ON-NEXT=(YES|NO)/);
      if (drId) dr.id = drId[1];
      if (drClass) dr.class = drClass[1];
      if (drStart) dr.startDate = drStart[1];
      if (drEnd) dr.endDate = drEnd[1];
      if (drDur) dr.duration = parseFloat(drDur[1]);
      if (drPlanned) dr.plannedDuration = parseFloat(drPlanned[1]);
      if (drScte35Out) dr.scte35Out = drScte35Out[1];
      if (drScte35In) dr.scte35In = drScte35In[1];
      if (drScte35Cmd) dr.scte35Cmd = drScte35Cmd[1];
      if (drEndOnNext) dr.endOnNext = drEndOnNext[1] === "YES";
      dr.raw = line;
      result.dateRanges.push(dr);
    }

    // EXT-X-SESSION-DATA (master playlist)
    if (line.startsWith("#EXT-X-SESSION-DATA:")) {
      const sd = {};
      const sdId = line.match(/DATA-ID="([^"]+)"/);
      const sdValue = line.match(/VALUE="([^"]+)"/);
      const sdUri = line.match(/URI="([^"]+)"/);
      const sdLang = line.match(/LANGUAGE="([^"]+)"/);
      if (sdId) sd.dataId = sdId[1];
      if (sdValue) sd.value = sdValue[1];
      if (sdUri) sd.uri = sdUri[1];
      if (sdLang) sd.language = sdLang[1];
      result.sessionData.push(sd);
    }

    // EXTINF (segment duration)
    if (line.startsWith("#EXTINF:")) {
      const durationMatch = line.match(/#EXTINF:([\d.]+)/);
      if (durationMatch) {
        currentExtInf = parseFloat(durationMatch[1]);
      }
    }

    // MEDIA SEGMENTS — match lines that look like segment URLs (not tags)
    if (!line.startsWith("#") && line.length > 0) {
      const lowerLine = line.toLowerCase();
      const isSegment =
        lowerLine.endsWith(".ts") ||
        lowerLine.endsWith(".m4s") ||
        lowerLine.endsWith(".mp4") ||
        lowerLine.endsWith(".aac") ||
        lowerLine.endsWith(".vtt") ||
        lowerLine.match(/\.(ts|m4s|mp4|aac|vtt)(\?[^\s]*)$/) ||
        (currentExtInf !== null); // if preceded by #EXTINF, it's a segment

      if (isSegment && result.playlistType !== "Master Playlist") {
        result.segments++;
        if (result.playlistType === "Unknown") {
          result.playlistType = "Media Playlist";
        }
        const resolvedSegUrl = resolveUrl(baseUrl, line);
        result.segmentUrls.push({
          index: result.segments,
          url: resolvedSegUrl,
          rawPath: line,
          duration: currentExtInf,
          byteRange: currentByteRange || null,
          gap: currentGap
        });
        if (currentByteRange) {
          result.byteRanges.push({ segment: result.segments, range: currentByteRange });
        }
        if (currentExtInf !== null) {
          result.totalDuration += currentExtInf;
          result.segmentDurations.push(currentExtInf);
        }
        // Detect media content type from segment extensions
        if (!result.mediaContentType) {
          const extMatch = lowerLine.match(/\.(vtt)(\?|$)/);
          if (extMatch) {
            result.mediaContentType = "Subtitle";
          } else {
            const aacMatch = lowerLine.match(/\.(aac)(\?|$)/);
            if (aacMatch) result.mediaContentType = "Audio";
          }
        }
      }
      currentExtInf = null;
      currentByteRange = null;
      currentGap = false;
    }
  });

  // Determine stream type
  if (result.playlistType === "Media Playlist") {
    if (result.streamType === null) {
      result.streamType = result.hasEndList ? "VOD" : "LIVE";
    }
    // If no content type detected from extensions, try to infer
    if (!result.mediaContentType) {
      // Check if loaded from a known track type
      if (window._lastLoadedTrackType) {
        result.mediaContentType = window._lastLoadedTrackType;
        window._lastLoadedTrackType = null;
      } else {
        result.mediaContentType = "Video";
      }
    }
  }

  if (result.minBandwidth === Infinity) result.minBandwidth = 0;

  // Validation warnings
  if (!manifest.trim().startsWith("#EXTM3U")) {
    result.warnings.push("Missing #EXTM3U header — this may not be a valid HLS manifest.");
  }
  if (result.playlistType === "Media Playlist" && result.targetDuration) {
    const td = parseFloat(result.targetDuration);
    const overDuration = result.segmentDurations.filter(d => d > td + 0.5);
    if (overDuration.length > 0) {
      result.warnings.push(overDuration.length + " segment(s) exceed TARGETDURATION of " + td + "s (max: " + Math.max(...overDuration).toFixed(3) + "s).");
    }
  }
  if (result.playlistType === "Media Playlist" && !result.version) {
    result.warnings.push("No #EXT-X-VERSION tag found — default version 1 assumed.");
  }
  if (result.playlistType === "Media Playlist" && result.segments === 0) {
    result.warnings.push("Media playlist contains no segments.");
  }
  if (result.playlistType === "Master Playlist" && result.variants === 0) {
    result.warnings.push("Master playlist contains no variant streams.");
  }

  return result;
}

// ============================
// SEGMENT DURATION CHART
// ============================

function drawDurationChart(canvas, durations, targetDuration) {
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);

  const isDark = !document.documentElement.getAttribute("data-theme");
  const textColor = isDark ? "#8b8fa3" : "#5a5e73";
  const barColor = isDark ? "rgba(91, 141, 239, 0.6)" : "rgba(74, 114, 212, 0.6)";
  const barOverColor = isDark ? "rgba(239, 68, 68, 0.6)" : "rgba(220, 38, 38, 0.6)";
  const gridColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
  const targetColor = isDark ? "rgba(251, 191, 36, 0.7)" : "rgba(180, 83, 9, 0.7)";

  const padLeft = 45, padRight = 10, padTop = 10, padBottom = 30;
  const chartW = w - padLeft - padRight;
  const chartH = h - padTop - padBottom;

  const maxD = Math.max(...durations, targetDuration || 0) * 1.1;
  const barW = Math.max(1, Math.min(12, (chartW / durations.length) - 1));
  const gap = (chartW - barW * durations.length) / (durations.length + 1);

  // Grid lines
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 1;
  const gridSteps = 4;
  ctx.font = "10px Inter, sans-serif";
  ctx.fillStyle = textColor;
  ctx.textAlign = "right";
  for (let i = 0; i <= gridSteps; i++) {
    const y = padTop + chartH - (chartH * i / gridSteps);
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(w - padRight, y);
    ctx.stroke();
    ctx.fillText((maxD * i / gridSteps).toFixed(1) + "s", padLeft - 6, y + 3);
  }

  // Target duration line
  if (targetDuration && targetDuration > 0) {
    const ty = padTop + chartH - (chartH * targetDuration / maxD);
    ctx.strokeStyle = targetColor;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padLeft, ty);
    ctx.lineTo(w - padRight, ty);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = targetColor;
    ctx.textAlign = "left";
    ctx.fillText("Target: " + targetDuration + "s", padLeft + 4, ty - 5);
  }

  // Bars
  durations.forEach((d, i) => {
    const x = padLeft + gap + i * (barW + gap);
    const barH = (d / maxD) * chartH;
    const y = padTop + chartH - barH;
    const isOver = targetDuration && d > targetDuration + 0.5;
    ctx.fillStyle = isOver ? barOverColor : barColor;
    ctx.fillRect(x, y, barW, barH);
  });

  // X-axis label
  ctx.fillStyle = textColor;
  ctx.textAlign = "center";
  ctx.font = "10px Inter, sans-serif";
  ctx.fillText("Segments (" + durations.length + ")", w / 2, h - 4);
}

// ============================
// RAW MANIFEST RENDERER
// ============================

function renderRawManifest(manifest, preserveState) {
  const viewer = document.getElementById("rawViewer");
  const content = document.getElementById("rawContent");
  viewer.style.display = "block";
  if (!preserveState) {
    rawCollapsed = true;
    content.style.display = "none";
    document.getElementById("toggleRawBtn").textContent = "▶";
  } else {
    content.style.display = rawCollapsed ? "none" : "block";
    document.getElementById("toggleRawBtn").textContent = rawCollapsed ? "▶" : "▼";
  }

  const lines = manifest.split(/\r?\n/);
  content.innerHTML = "";

  lines.forEach((line, i) => {
    const lineEl = document.createElement("div");

    const numSpan = document.createElement("span");
    numSpan.className = "line-num";
    numSpan.textContent = i + 1;
    lineEl.appendChild(numSpan);

    const textSpan = document.createElement("span");
    const trimmed = line.trim();
    if (trimmed.startsWith("#EXT")) {
      textSpan.className = "tag-line";
    } else if (trimmed && !trimmed.startsWith("#")) {
      textSpan.className = "url-line";
    } else if (trimmed.startsWith("#")) {
      textSpan.className = "comment-line";
    }
    textSpan.textContent = line;
    lineEl.appendChild(textSpan);

    content.appendChild(lineEl);
  });
}

// ============================
// COLLAPSIBLE SECTION HELPER
// ============================

// Track section expand/collapse states across re-renders
const _expandedSections = {};

function createCollapsibleSection(titleText, count, startCollapsed) {
  const section = document.createElement("div");
  section.className = "media-tracks collapsible-section";

  const header = document.createElement("div");
  header.className = "section-header";

  const arrow = document.createElement("span");
  arrow.className = "section-arrow";

  const title = document.createElement("h2");
  title.textContent = titleText;

  // Use saved state if available, otherwise use default
  let collapsed = (titleText in _expandedSections) ? !_expandedSections[titleText] : startCollapsed;
  arrow.textContent = collapsed ? "▶" : "▼";
  header.appendChild(arrow);
  header.appendChild(title);

  if (count !== undefined && count !== null) {
    const badge = document.createElement("span");
    badge.className = "section-count";
    badge.textContent = count;
    header.appendChild(badge);
  }

  section.appendChild(header);

  const body = document.createElement("div");
  body.className = "section-body";
  if (collapsed) body.style.display = "none";
  section.appendChild(body);

  header.addEventListener("click", () => {
    const isCollapsed = body.style.display === "none";
    body.style.display = isCollapsed ? "block" : "none";
    arrow.textContent = isCollapsed ? "▼" : "▶";
    _expandedSections[titleText] = isCollapsed; // true = now expanded
  });

  return { section, body };
}

// ============================
// COMPACT TABLE RENDERERS
// ============================

function createTableActions(td, url, trackType, onLoadClick) {
  if (!url) return;
  const wrap = document.createElement("div");
  wrap.className = "table-action-group";

  const loadBtn = document.createElement("button");
  loadBtn.className = "table-load-btn";
  loadBtn.textContent = "▶ Load";
  loadBtn.title = url;
  loadBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    onLoadClick(url, trackType);
  });
  wrap.appendChild(loadBtn);

  const copyBtn = document.createElement("button");
  copyBtn.className = "table-copy-btn";
  copyBtn.textContent = "📋";
  copyBtn.title = "Copy URL: " + url;
  copyBtn.setAttribute("aria-label", "Copy URL");
  copyBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(url).then(() => {
      copyBtn.textContent = "✓";
      setTimeout(() => { copyBtn.textContent = "📋"; }, 1200);
    });
  });
  wrap.appendChild(copyBtn);

  td.appendChild(wrap);
}

function renderAudioVariantTable(parent, variants, onLoadClick) {
  const wrapper = document.createElement("div");
  wrapper.className = "variant-table-wrapper";
  const table = document.createElement("table");
  table.className = "variant-table";

  const thead = document.createElement("thead");
  thead.innerHTML = "<tr><th>Type</th><th>Bandwidth</th><th>Codecs</th><th>Action</th></tr>";
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  variants.forEach(v => {
    const tr = document.createElement("tr");

    const tdType = document.createElement("td");
    tdType.innerHTML = '<span class="track-type track-type-audio" style="margin-right:6px">AUDIO</span>Audio-Only';
    tr.appendChild(tdType);

    const tdBw = document.createElement("td");
    tdBw.className = "table-bandwidth";
    tdBw.textContent = v.bandwidth ? formatBandwidth(v.bandwidth) : "—";
    tr.appendChild(tdBw);

    const tdCodec = document.createElement("td");
    if (v.codecs) {
      const decoded = decodeCodec(v.codecs);
      const span = document.createElement("span");
      span.className = "table-codec";
      span.textContent = decoded !== v.codecs ? v.codecs + " (" + decoded + ")" : v.codecs;
      tdCodec.appendChild(span);
    } else {
      tdCodec.textContent = "—";
    }
    tr.appendChild(tdCodec);

    const tdAction = document.createElement("td");
    createTableActions(tdAction, v.url, "AUDIO", onLoadClick);
    tr.appendChild(tdAction);

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  wrapper.appendChild(table);
  parent.appendChild(wrapper);
}

function renderVariantTable(parent, variants, onLoadClick) {
  const wrapper = document.createElement("div");
  wrapper.className = "variant-table-wrapper";
  const table = document.createElement("table");
  table.className = "variant-table";

  // Detect which optional columns have data
  const hasHdcp = variants.some(v => v.raw && /HDCP-LEVEL=/.test(v.raw));
  const hasVideoRange = variants.some(v => v.raw && /VIDEO-RANGE=/.test(v.raw));
  const hasSubs = variants.some(v => v.raw && /SUBTITLES="/.test(v.raw));

  let headerHtml = "<tr><th>Resolution</th><th>Bandwidth</th><th>Codecs</th><th>Audio</th>";
  if (hasSubs) headerHtml += "<th>Subtitles</th>";
  if (hasVideoRange) headerHtml += "<th>Video Range</th>";
  if (hasHdcp) headerHtml += "<th>HDCP</th>";
  headerHtml += "<th>Action</th></tr>";

  const thead = document.createElement("thead");
  thead.innerHTML = headerHtml;
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  variants.forEach(v => {
    const tr = document.createElement("tr");

    const tdRes = document.createElement("td");
    tdRes.textContent = v.resolution || "—";
    tr.appendChild(tdRes);

    const tdBw = document.createElement("td");
    tdBw.textContent = v.bandwidth ? formatBandwidth(v.bandwidth) : "—";
    tr.appendChild(tdBw);

    const tdCodec = document.createElement("td");
    if (v.codecs) {
      const decoded = v.codecs.split(",").map(c => decodeCodec(c.trim())).join(", ");
      const codecSpan = document.createElement("span");
      codecSpan.className = "table-codec";
      codecSpan.textContent = decoded !== v.codecs ? v.codecs + " (" + decoded + ")" : v.codecs;
      tdCodec.appendChild(codecSpan);
    } else {
      tdCodec.textContent = "—";
    }
    tr.appendChild(tdCodec);

    const tdAudio = document.createElement("td");
    // Extract AUDIO group from raw variant line
    const audioMatch = v.raw ? v.raw.match(/AUDIO="([^"]+)"/) : null;
    tdAudio.textContent = audioMatch ? audioMatch[1] : "—";
    tr.appendChild(tdAudio);

    if (hasSubs) {
      const tdSubs = document.createElement("td");
      const subsMatch = v.raw ? v.raw.match(/SUBTITLES="([^"]+)"/) : null;
      tdSubs.textContent = subsMatch ? subsMatch[1] : "—";
      tr.appendChild(tdSubs);
    }

    if (hasVideoRange) {
      const tdVr = document.createElement("td");
      const vrMatch = v.raw ? v.raw.match(/VIDEO-RANGE=([^,]+)/) : null;
      tdVr.textContent = vrMatch ? vrMatch[1] : "—";
      tr.appendChild(tdVr);
    }

    if (hasHdcp) {
      const tdHdcp = document.createElement("td");
      const hdcpMatch = v.raw ? v.raw.match(/HDCP-LEVEL=([^,]+)/) : null;
      tdHdcp.textContent = hdcpMatch ? hdcpMatch[1] : "—";
      tr.appendChild(tdHdcp);
    }

    const tdAction = document.createElement("td");
    createTableActions(tdAction, v.url, "VIDEO", onLoadClick);
    tr.appendChild(tdAction);

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  wrapper.appendChild(table);
  parent.appendChild(wrapper);
}

function renderAudioTable(parent, tracks, onLoadClick) {
  const table = document.createElement("table");
  table.className = "variant-table";

  const thead = document.createElement("thead");
  thead.innerHTML = "<tr><th>Name</th><th>Language</th><th>Group</th><th>Channels</th><th>Default</th><th>Autoselect</th><th>Action</th></tr>";
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  tracks.forEach(t => {
    const tr = document.createElement("tr");

    const tdName = document.createElement("td");
    tdName.innerHTML = '<span class="track-type track-type-audio" style="margin-right:8px">AUDIO</span>' + escapeHtml(t.name || "Unnamed");
    tr.appendChild(tdName);

    const tdLang = document.createElement("td");
    tdLang.textContent = t.language || "—";
    tr.appendChild(tdLang);

    const tdGroup = document.createElement("td");
    tdGroup.textContent = t.groupId || "—";
    tr.appendChild(tdGroup);

    const tdCh = document.createElement("td");
    tdCh.textContent = t.channels || "—";
    tr.appendChild(tdCh);

    const tdDef = document.createElement("td");
    tdDef.textContent = t.default ? "Yes" : "No";
    tr.appendChild(tdDef);

    const tdAuto = document.createElement("td");
    tdAuto.textContent = t.autoselect !== undefined ? (t.autoselect ? "Yes" : "No") : "—";
    tr.appendChild(tdAuto);

    const tdAction = document.createElement("td");
    createTableActions(tdAction, t.uri, "AUDIO", onLoadClick);
    tr.appendChild(tdAction);

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  parent.appendChild(table);
}

function renderIframeTable(parent, iframes, onLoadClick) {
  const table = document.createElement("table");
  table.className = "variant-table";

  const thead = document.createElement("thead");
  thead.innerHTML = "<tr><th>Resolution</th><th>Bandwidth</th><th>Codecs</th><th>HDCP</th><th>Action</th></tr>";
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  iframes.forEach(iframe => {
    const tr = document.createElement("tr");

    const tdRes = document.createElement("td");
    tdRes.textContent = iframe.resolution || "—";
    tr.appendChild(tdRes);

    const tdBw = document.createElement("td");
    tdBw.textContent = iframe.bandwidth ? formatBandwidth(iframe.bandwidth) : "—";
    tr.appendChild(tdBw);

    const tdCodec = document.createElement("td");
    tdCodec.textContent = iframe.codecs || "—";
    tr.appendChild(tdCodec);

    const tdHdcp = document.createElement("td");
    tdHdcp.textContent = iframe.hdcpLevel || "—";
    tr.appendChild(tdHdcp);

    const tdAction = document.createElement("td");
    createTableActions(tdAction, iframe.uri, "VIDEO", onLoadClick);
    tr.appendChild(tdAction);

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  parent.appendChild(table);
}

// ============================
// SECTION JUMP NAV
// ============================

function renderJumpNav(outputEl, sections) {
  const nav = document.createElement("div");
  nav.className = "jump-nav";

  sections.forEach(s => {
    const btn = document.createElement("button");
    btn.className = "jump-nav-item";
    btn.textContent = s.label;
    btn.addEventListener("click", () => {
      s.el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    nav.appendChild(btn);
  });

  outputEl.insertBefore(nav, outputEl.firstChild);
}

// ============================
// RESULTS RENDERER
// ============================

function renderResults(data) {
  const outputEl = document.getElementById("output");
  outputEl.innerHTML = "";

  // Show copy/export buttons
  document.getElementById("copyResultsBtn").style.display = "inline-block";
  document.getElementById("exportJsonBtn").style.display = "inline-block";

  // Store data for export
  window._lastAnalysis = data;

  // Back navigation button
  if (navStack.length > 0) {
    const backBar = document.createElement("div");
    backBar.className = "nav-back-bar";
    const backBtn = document.createElement("button");
    backBtn.className = "nav-back-btn";
    backBtn.textContent = "← Back to Master";
    backBtn.addEventListener("click", goBackNav);
    backBar.appendChild(backBtn);
    const breadcrumb = document.createElement("span");
    breadcrumb.className = "nav-breadcrumb";
    breadcrumb.textContent = navStack.length === 1 ? "Master → Media" : "Master → ... → Media (depth " + navStack.length + ")";
    backBar.appendChild(breadcrumb);
    outputEl.appendChild(backBar);
  }

  // PLAYLIST TYPE + STREAM TYPE
  let typeLabel = escapeHtml(data.playlistType);
  if (data.streamType) {
    const badgeClass = data.streamType === "LIVE" ? "badge-live" :
      data.streamType === "VOD" ? "badge-vod" : "badge-event";
    typeLabel += ` <span class="badge ${badgeClass}">${escapeHtml(data.streamType)}</span>`;
  }
  if (data.encryption) {
    typeLabel += ` <span class="badge badge-encrypted">🔒 ${escapeHtml(data.encryption.method)}</span>`;
  }
  if (data.isLowLatency) {
    typeLabel += ' <span class="badge badge-ll">⚡ LL-HLS</span>';
  }

  appendStat(outputEl, "Playlist Type", typeLabel, true);

  if (data.version) {
    appendStat(outputEl, "HLS Version", escapeHtml(data.version));
  }

  // WARNINGS — show near top for visibility
  if (data.warnings.length > 0) {
    const { section, body } = createCollapsibleSection("Warnings", data.warnings.length, false);
    section.classList.add("warning-section");
    data.warnings.forEach(w => {
      const wDiv = document.createElement("div");
      wDiv.className = "warning-item";
      wDiv.textContent = "⚠ " + w;
      body.appendChild(wDiv);
    });
    outputEl.appendChild(section);
  }

  // MASTER PLAYLIST
  if (data.playlistType === "Master Playlist") {
    const jumpSections = [];

    // Stats grid
    const grid = document.createElement("div");
    grid.className = "stat-grid";

    appendStatToGrid(grid, "Total Variants", data.variants);
    appendStatToGrid(grid, "Video Variants", data.videoVariants);
    appendStatToGrid(grid, "Audio Variants", data.audioVariants);
    appendStatToGrid(grid, "Highest Bandwidth", formatBandwidth(data.maxBandwidth));
    appendStatToGrid(grid, "Lowest Bandwidth", formatBandwidth(data.minBandwidth));
    outputEl.appendChild(grid);

    // Resolutions
    if (data.resolutions.length > 0) {
      const resStat = createStat("Resolutions");
      const tagContainer = document.createElement("div");
      tagContainer.style.marginTop = "8px";
      const uniqueRes = [...new Set(data.resolutions)];
      uniqueRes.forEach(r => {
        const tag = document.createElement("span");
        tag.className = "resolution-tag";
        tag.textContent = r;
        tagContainer.appendChild(tag);
      });
      resStat.appendChild(tagContainer);
      outputEl.appendChild(resStat);
    }

    // Codecs
    if (data.codecs.length > 0) {
      const codecStat = createStat("Codecs");
      const tagContainer = document.createElement("div");
      tagContainer.style.marginTop = "8px";
      data.codecs.forEach(c => {
        const tag = document.createElement("span");
        tag.className = "codec-tag";
        const decoded = decodeCodec(c);
        tag.textContent = decoded !== c ? c + " (" + decoded + ")" : c;
        tag.title = decoded;
        tagContainer.appendChild(tag);
      });
      codecStat.appendChild(tagContainer);
      outputEl.appendChild(codecStat);
    }

    // Split child playlists into video (has resolution) and audio-only variants
    const videoChildPlaylists = [];
    const audioChildPlaylists = [];
    data.childPlaylists.forEach((child, i) => {
      const variant = data.variantDetails[i] || {};
      const entry = { ...child, raw: variant.raw, url: child.url };
      if (child.resolution) {
        videoChildPlaylists.push(entry);
      } else {
        audioChildPlaylists.push(entry);
      }
    });

    // Video Variant Playlists — compact table
    if (videoChildPlaylists.length > 0) {
      const { section, body } = createCollapsibleSection(
        "Video Variant Playlists", videoChildPlaylists.length, videoChildPlaylists.length > 10
      );
      renderVariantTable(body, videoChildPlaylists, loadChildPlaylist);
      outputEl.appendChild(section);
      jumpSections.push({ label: "Video (" + videoChildPlaylists.length + ")", el: section });
    }

    // I-Frame Playlists — compact table
    if (data.iframeStreams.length > 0) {
      const { section, body } = createCollapsibleSection(
        "I-Frame Playlists (Trick Play)", data.iframeStreams.length, false
      );
      renderIframeTable(body, data.iframeStreams, loadChildPlaylist);
      outputEl.appendChild(section);
      jumpSections.push({ label: "I-Frames (" + data.iframeStreams.length + ")", el: section });
    }

    // Audio-only Variant Playlists (EXT-X-STREAM-INF without RESOLUTION)
    if (audioChildPlaylists.length > 0) {
      const { section, body } = createCollapsibleSection(
        "Audio-Only Variant Playlists", audioChildPlaylists.length, false
      );
      renderAudioVariantTable(body, audioChildPlaylists, loadChildPlaylist);
      outputEl.appendChild(section);
      jumpSections.push({ label: "Audio Variants (" + audioChildPlaylists.length + ")", el: section });
    }

    // Audio Tracks (from EXT-X-MEDIA) — compact table
    const audioTracks = data.mediaTracks.filter(t => t.type === "AUDIO");
    if (audioTracks.length > 0) {
      const { section, body } = createCollapsibleSection(
        "Audio Tracks", audioTracks.length, false
      );
      renderAudioTable(body, audioTracks, loadChildPlaylist);
      outputEl.appendChild(section);
      jumpSections.push({ label: "Audio (" + audioTracks.length + ")", el: section });
    }

    // Subtitles & Closed Captions
    const ccCount = data.subtitleTracks.length + data.ccTracks.length;
    if (ccCount > 0 || data.closedCaptionsAttr) {
      const { section, body } = createCollapsibleSection(
        "Subtitles & Closed Captions", ccCount || null, false
      );
      section.classList.add("cc-section");

      if (data.closedCaptionsAttr) {
        const attrDiv = document.createElement("div");
        attrDiv.className = "stat";
        const strong = document.createElement("strong");
        strong.textContent = "CLOSED-CAPTIONS attribute";
        attrDiv.appendChild(strong);
        const val = document.createElement("span");
        val.className = "stat-value";
        if (data.closedCaptionsAttr === "NONE") {
          val.textContent = "NONE \u2014 No closed captions available";
        } else {
          val.textContent = 'Group: "' + data.closedCaptionsAttr + '"';
        }
        attrDiv.appendChild(val);
        body.appendChild(attrDiv);
      }

      if (data.ccTracks.length > 0) {
        const subTitle = document.createElement("h3");
        subTitle.className = "cc-subtitle";
        subTitle.textContent = "In-band Closed Captions (CEA-608/708)";
        body.appendChild(subTitle);
        data.ccTracks.forEach(track => renderTrackItem(body, track, true));
      }

      if (data.subtitleTracks.length > 0) {
        const subTitle = document.createElement("h3");
        subTitle.className = "cc-subtitle";
        subTitle.textContent = "Out-of-band Subtitles (Sidecar WebVTT)";
        body.appendChild(subTitle);
        data.subtitleTracks.forEach(track => renderTrackItem(body, track, true));
      }

      if (data.subtitleTracks.length === 0 && data.ccTracks.length === 0 && data.closedCaptionsAttr && data.closedCaptionsAttr !== "NONE") {
        const note = document.createElement("div");
        note.className = "track-details";
        note.textContent = "CC group referenced but no #EXT-X-MEDIA TYPE=CLOSED-CAPTIONS tracks found in manifest.";
        body.appendChild(note);
      }

      outputEl.appendChild(section);
      jumpSections.push({ label: "CC/Subs (" + ccCount + ")", el: section });
    }

    // Other Media Tracks
    const otherTracks = data.mediaTracks.filter(t => t.type !== "AUDIO" && t.type !== "SUBTITLES" && t.type !== "CLOSED-CAPTIONS");
    if (otherTracks.length > 0) {
      const { section, body } = createCollapsibleSection(
        "Other Media Tracks", otherTracks.length, true
      );
      otherTracks.forEach(track => renderTrackItem(body, track));
      outputEl.appendChild(section);
      jumpSections.push({ label: "Other (" + otherTracks.length + ")", el: section });
    }

    // Render jump nav at the top
    if (jumpSections.length > 0) {
      renderJumpNav(outputEl, jumpSections);
    }
  }

  // MEDIA PLAYLIST
  else if (data.playlistType === "Media Playlist") {
    // Show media content type badge
    if (data.mediaContentType) {
      const badgeClass = data.mediaContentType === "Audio" ? "badge-audio" :
        data.mediaContentType === "Subtitle" ? "badge-subtitle" : "badge-video";
      let contentLabel = `<span class="badge ${badgeClass}">${escapeHtml(data.mediaContentType)} Playlist</span>`;
      if (data.iframesOnly) {
        contentLabel += ' <span class="badge badge-iframe">I-Frames Only</span>';
      }
      appendStat(outputEl, "Content Type", contentLabel, true);
    }

    const grid = document.createElement("div");
    grid.className = "stat-grid";

    appendStatToGrid(grid, "Segments", data.segments);
    if (data.targetDuration) appendStatToGrid(grid, "Target Duration", data.targetDuration + "s");
    if (data.mediaSequence !== null) appendStatToGrid(grid, "Media Sequence", data.mediaSequence);
    if (data.totalDuration > 0) appendStatToGrid(grid, "Total Duration", formatDuration(data.totalDuration));
    if (data.discontinuities > 0) appendStatToGrid(grid, "Discontinuities", data.discontinuities);
    if (data.discontinuitySequence !== null) appendStatToGrid(grid, "Discontinuity Sequence", data.discontinuitySequence);
    if (data.gapCount > 0) appendStatToGrid(grid, "Gap Segments", data.gapCount);
    outputEl.appendChild(grid);

    // Segment duration stats
    if (data.segmentDurations.length > 0) {
      const avg = data.totalDuration / data.segmentDurations.length;
      const min = Math.min(...data.segmentDurations);
      const max = Math.max(...data.segmentDurations);

      const dGrid = document.createElement("div");
      dGrid.className = "stat-grid";
      appendStatToGrid(dGrid, "Avg Segment Duration", avg.toFixed(2) + "s");
      appendStatToGrid(dGrid, "Min Segment Duration", min.toFixed(2) + "s");
      appendStatToGrid(dGrid, "Max Segment Duration", max.toFixed(2) + "s");
      outputEl.appendChild(dGrid);
    }

    // Encryption / DRM info
    if (data.encryptionEntries.length > 0) {
      const { section, body } = createCollapsibleSection(
        "Encryption / DRM", data.encryptionEntries.length, false
      );

      data.encryptionEntries.forEach(entry => {
        const item = document.createElement("div");
        item.className = "track-item";

        const typeBadge = document.createElement("span");
        typeBadge.className = "track-type track-type-drm";
        typeBadge.textContent = entry.drm.name;
        item.appendChild(typeBadge);

        if (entry.isSessionKey) {
          const sessionBadge = document.createElement("span");
          sessionBadge.className = "track-type";
          sessionBadge.style.marginLeft = "4px";
          sessionBadge.textContent = "SESSION";
          item.appendChild(sessionBadge);
        }

        const nameSpan = document.createElement("span");
        nameSpan.className = "track-name";
        nameSpan.textContent = entry.method;
        item.appendChild(nameSpan);

        const details = [];
        if (entry.keyformat) details.push("KeyFormat: " + entry.keyformat);
        if (entry.keyformatVersions) details.push("Versions: " + entry.keyformatVersions);
        if (entry.iv) details.push("IV: 0x" + entry.iv);
        if (entry.uri && !entry.psshDecoded) details.push("URI: " + entry.uri);

        if (details.length > 0) {
          const detailDiv = document.createElement("div");
          detailDiv.className = "track-details";
          detailDiv.textContent = details.join(" · ");
          item.appendChild(detailDiv);
        }

        // Key URI with copy button
        if (entry.uri) {
          const uriRow = document.createElement("div");
          uriRow.className = "track-details";
          uriRow.style.display = "flex";
          uriRow.style.alignItems = "center";
          uriRow.style.gap = "8px";
          uriRow.style.marginTop = "6px";
          const uriLabel = document.createElement("span");
          uriLabel.style.fontWeight = "600";
          uriLabel.style.flexShrink = "0";
          uriLabel.textContent = "Key URI:";
          uriRow.appendChild(uriLabel);
          const uriVal = document.createElement("span");
          uriVal.style.flex = "1";
          uriVal.style.wordBreak = "break-all";
          uriVal.style.fontFamily = "'JetBrains Mono', monospace";
          uriVal.style.fontSize = "11px";
          uriVal.textContent = entry.uri;
          uriRow.appendChild(uriVal);
          const copyBtn = document.createElement("button");
          copyBtn.className = "table-copy-btn";
          copyBtn.textContent = "📋";
          copyBtn.title = "Copy Key URI";
          copyBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(entry.uri).then(() => {
              copyBtn.textContent = "✓";
              setTimeout(() => { copyBtn.textContent = "📋"; }, 1200);
            });
          });
          uriRow.appendChild(copyBtn);
          item.appendChild(uriRow);
        }

        // Decoded PSSH panel
        if (entry.psshDecoded && !entry.psshDecoded.error) {
          const decoded = entry.psshDecoded;
          const decodeToggle = document.createElement("button");
          decodeToggle.className = "decode-toggle-btn";
          decodeToggle.textContent = "🔓 Decode PSSH";
          item.appendChild(decodeToggle);

          const decodeBody = document.createElement("div");
          decodeBody.className = "decoded-pssh-body";
          decodeBody.style.display = "none";

          const rows = [];
          rows.push(["PSSH Version", "v" + decoded.version]);
          rows.push(["System ID", decoded.systemId + " (" + decoded.drmName + ")"]);
          rows.push(["Data Size", decoded.dataSize + " bytes"]);

          if (decoded.keyIds.length > 0) {
            rows.push(["Key IDs (" + decoded.keyIds.length + ")", decoded.keyIds.join("\n")]);
          }

          if (decoded.playreadyData) {
            const pr = decoded.playreadyData;
            if (pr.laUrl) rows.push(["PlayReady License URL", pr.laUrl]);
            if (pr.algorithm) rows.push(["Algorithm", pr.algorithm]);
            if (pr.keyIds && pr.keyIds.length > 0) rows.push(["PlayReady Key IDs", pr.keyIds.join("\n")]);
            if (pr.checksum) rows.push(["Checksum", pr.checksum]);
            if (pr.headerXml) {
              const xmlBtn = document.createElement("button");
              xmlBtn.className = "decode-toggle-btn decode-xml-btn";
              xmlBtn.textContent = "📄 Show PlayReady Header XML";
              const xmlPre = document.createElement("pre");
              xmlPre.className = "decoded-xml";
              xmlPre.style.display = "none";
              xmlPre.textContent = pr.headerXml.replace(/></g, '>\n<');
              xmlBtn.addEventListener("click", () => {
                const showing = xmlPre.style.display !== "none";
                xmlPre.style.display = showing ? "none" : "block";
                xmlBtn.textContent = showing ? "📄 Show PlayReady Header XML" : "📄 Hide PlayReady Header XML";
              });
              decodeBody.appendChild(xmlBtn);
              decodeBody.appendChild(xmlPre);
            }
          }

          if (decoded.widevineData) {
            const wv = decoded.widevineData;
            if (wv.provider) rows.push(["Widevine Provider", wv.provider]);
            if (wv.contentId) rows.push(["Content ID", wv.contentId]);
            if (wv.protectionScheme) rows.push(["Protection Scheme", wv.protectionScheme]);
            if (wv.keyIds && wv.keyIds.length > 0) rows.push(["Widevine Key IDs", wv.keyIds.join("\n")]);
          }

          const table = document.createElement("table");
          table.className = "decoded-table";
          rows.forEach(([label, value]) => {
            const tr = document.createElement("tr");
            const tdLabel = document.createElement("td");
            tdLabel.className = "decoded-label";
            tdLabel.textContent = label;
            tr.appendChild(tdLabel);
            const tdValue = document.createElement("td");
            tdValue.className = "decoded-value";

            if (label.includes("Key ID") || label === "System ID" || label.includes("License URL") || label === "Content ID") {
              const wrap = document.createElement("div");
              wrap.style.display = "flex";
              wrap.style.alignItems = "flex-start";
              wrap.style.gap = "8px";
              const valSpan = document.createElement("span");
              valSpan.textContent = value;
              valSpan.style.flex = "1";
              wrap.appendChild(valSpan);
              const cpBtn = document.createElement("button");
              cpBtn.className = "table-copy-btn";
              cpBtn.textContent = "📋";
              cpBtn.title = "Copy " + label;
              cpBtn.addEventListener("click", (ev) => {
                ev.stopPropagation();
                navigator.clipboard.writeText(value).then(() => {
                  cpBtn.textContent = "✓";
                  setTimeout(() => { cpBtn.textContent = "📋"; }, 1200);
                });
              });
              wrap.appendChild(cpBtn);
              tdValue.appendChild(wrap);
            } else {
              tdValue.textContent = value;
            }

            tr.appendChild(tdValue);
            table.appendChild(tr);
          });

          decodeBody.insertBefore(table, decodeBody.firstChild);

          // Raw PSSH base64
          if (decoded._rawBase64) {
            const rawBtn = document.createElement("button");
            rawBtn.className = "decode-toggle-btn decode-xml-btn";
            rawBtn.textContent = "🔑 Show Raw PSSH (Base64)";
            const rawPre = document.createElement("pre");
            rawPre.className = "decoded-xml";
            rawPre.style.display = "none";
            rawPre.textContent = decoded._rawBase64;
            rawBtn.addEventListener("click", () => {
              const showing = rawPre.style.display !== "none";
              rawPre.style.display = showing ? "none" : "block";
              rawBtn.textContent = showing ? "🔑 Show Raw PSSH (Base64)" : "🔑 Hide Raw PSSH (Base64)";
            });
            decodeBody.appendChild(rawBtn);
            decodeBody.appendChild(rawPre);
          }

          const decodePanel = document.createElement("div");
          decodePanel.className = "decoded-pssh-panel";
          decodePanel.appendChild(decodeBody);
          item.appendChild(decodePanel);

          decodeToggle.addEventListener("click", () => {
            const showing = decodeBody.style.display !== "none";
            decodeBody.style.display = showing ? "none" : "block";
            decodeToggle.textContent = showing ? "🔓 Decode PSSH" : "🔒 Hide Decoded PSSH";
          });
        }

        body.appendChild(item);
      });

      outputEl.appendChild(section);
    } else if (data.encryption) {
      // Fallback for simple encryption without parsed entries
      appendStat(outputEl, "Encryption", escapeHtml(data.encryption.method) +
        (data.encryption.uri ? " — Key URI: " + escapeHtml(data.encryption.uri) : ""));
    }

    // Segment URLs table with pagination
    if (data.segmentUrls.length > 0) {
      const { section, body } = createCollapsibleSection(
        "Segment URLs", data.segmentUrls.length, data.segmentUrls.length > 20
      );

      const PAGE_SIZE = 100;
      let currentPage = 0;
      const totalPages = Math.ceil(data.segmentUrls.length / PAGE_SIZE);

      const wrapper = document.createElement("div");
      wrapper.className = "variant-table-wrapper";

      const table = document.createElement("table");
      table.className = "variant-table segment-url-table";

      const hasGaps = data.gapCount > 0;
      const thead = document.createElement("thead");
      thead.innerHTML = "<tr><th>#</th><th>Duration</th>" + (hasGaps ? "<th>Gap</th>" : "") + "<th>URL / Path</th><th>Action</th></tr>";
      table.appendChild(thead);

      const tbody = document.createElement("tbody");
      table.appendChild(tbody);
      wrapper.appendChild(table);
      body.appendChild(wrapper);

      function renderSegmentPage(page) {
        tbody.innerHTML = "";
        const start = page * PAGE_SIZE;
        const end = Math.min(start + PAGE_SIZE, data.segmentUrls.length);
        for (let si = start; si < end; si++) {
          const seg = data.segmentUrls[si];
          const tr = document.createElement("tr");
          if (seg.gap) tr.className = "seg-gap-row";

          const tdIdx = document.createElement("td");
          tdIdx.className = "seg-index";
          tdIdx.textContent = seg.index;
          tr.appendChild(tdIdx);

          const tdDur = document.createElement("td");
          tdDur.className = "table-bandwidth";
          tdDur.textContent = seg.duration !== null ? seg.duration.toFixed(3) + "s" : "—";
          tr.appendChild(tdDur);

          if (hasGaps) {
            const tdGap = document.createElement("td");
            tdGap.textContent = seg.gap ? "⚠ GAP" : "";
            tdGap.style.color = seg.gap ? "var(--color-warning, #f59e0b)" : "";
            tr.appendChild(tdGap);
          }

          const tdUrl = document.createElement("td");
          tdUrl.className = "seg-url-cell";
          const pathSpan = document.createElement("span");
          pathSpan.className = "seg-raw-path";
          pathSpan.textContent = seg.rawPath;
          pathSpan.title = seg.url;
          tdUrl.appendChild(pathSpan);
          tr.appendChild(tdUrl);

          const tdAction = document.createElement("td");
          const copyBtn = document.createElement("button");
          copyBtn.className = "table-load-btn";
          copyBtn.textContent = "Copy URL";
          copyBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(seg.url).then(() => {
              copyBtn.textContent = "Copied!";
              setTimeout(() => { copyBtn.textContent = "Copy URL"; }, 1500);
            });
          });
          tdAction.appendChild(copyBtn);
          tr.appendChild(tdAction);

          tbody.appendChild(tr);
        }
        if (pageInfo) pageInfo.textContent = "Showing " + (start + 1) + "–" + end + " of " + data.segmentUrls.length;
      }

      // Pagination controls (only if needed)
      let pageInfo = null;
      if (totalPages > 1) {
        const pagDiv = document.createElement("div");
        pagDiv.className = "seg-pagination";

        const prevBtn = document.createElement("button");
        prevBtn.className = "table-load-btn";
        prevBtn.textContent = "◀ Prev";
        prevBtn.addEventListener("click", () => {
          if (currentPage > 0) { currentPage--; renderSegmentPage(currentPage); updatePagBtns(); }
        });
        pagDiv.appendChild(prevBtn);

        pageInfo = document.createElement("span");
        pageInfo.className = "seg-page-info";
        pagDiv.appendChild(pageInfo);

        const nextBtn = document.createElement("button");
        nextBtn.className = "table-load-btn";
        nextBtn.textContent = "Next ▶";
        nextBtn.addEventListener("click", () => {
          if (currentPage < totalPages - 1) { currentPage++; renderSegmentPage(currentPage); updatePagBtns(); }
        });
        pagDiv.appendChild(nextBtn);

        function updatePagBtns() {
          prevBtn.disabled = currentPage === 0;
          nextBtn.disabled = currentPage >= totalPages - 1;
        }

        body.appendChild(pagDiv);
        updatePagBtns();
      }

      renderSegmentPage(0);

      // Copy All URLs button
      const copyAllDiv = document.createElement("div");
      copyAllDiv.className = "seg-copy-all";
      const copyAllBtn = document.createElement("button");
      copyAllBtn.className = "track-uri-link";
      copyAllBtn.textContent = "Copy All URLs";
      copyAllBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const allUrls = data.segmentUrls.map(s => s.url).join("\n");
        navigator.clipboard.writeText(allUrls).then(() => {
          copyAllBtn.textContent = "Copied All!";
          setTimeout(() => { copyAllBtn.textContent = "Copy All URLs"; }, 1500);
        });
      });
      copyAllDiv.appendChild(copyAllBtn);
      body.appendChild(copyAllDiv);

      outputEl.appendChild(section);
    }
  }

  // UNKNOWN
  else {
    appendStat(outputEl, "Status", "Unable to determine playlist type");
  }

  // COMMON SECTIONS — shown for both master and media playlists

  // Independent Segments
  if (data.independentSegments) {
    appendStat(outputEl, "Independent Segments", "Yes — each segment can be decoded independently");
  }

  // Start Offset
  if (data.startOffset) {
    appendStat(outputEl, "Start Offset", data.startOffset.timeOffset + "s" + (data.startOffset.precise ? " (precise)" : ""));
  }

  // Init Segment (EXT-X-MAP)
  if (data.initSegment) {
    const mapInfo = "URI: " + escapeHtml(data.initSegment.rawUri || "—") +
      (data.initSegment.byterange ? " · Byterange: " + escapeHtml(data.initSegment.byterange) : "");
    appendStat(outputEl, "Init Segment (EXT-X-MAP)", mapInfo, true);
  }

  // Program Date-Time
  if (data.programDateTime) {
    let pdtValue = escapeHtml(data.programDateTime);
    if (data.programDateTimes.length > 1) {
      pdtValue += ' <span class="badge badge-vod">' + data.programDateTimes.length + ' total</span>';
    }
    appendStat(outputEl, "Program Date-Time", pdtValue, true);
  }

  // Byte Ranges
  if (data.byteRanges.length > 0) {
    appendStat(outputEl, "Byte-Range Segments", data.byteRanges.length + " segment(s) use byte-range addressing");
  }

  // Low-Latency HLS (LL-HLS)
  if (data.isLowLatency || data.serverControl || data.partInf || data.parts.length > 0 || data.preloadHints.length > 0) {
    const { section, body } = createCollapsibleSection(
      "Low-Latency HLS (LL-HLS)", null, false
    );
    section.classList.add("ll-hls-section");

    // LL-HLS badge on the type label
    const llBadge = document.createElement("span");
    llBadge.className = "badge badge-ll";
    llBadge.textContent = "⚡ Low-Latency";
    section.querySelector(".section-header").appendChild(llBadge);

    // Server Control
    if (data.serverControl) {
      const sc = data.serverControl;
      const scTitle = document.createElement("h3");
      scTitle.className = "cc-subtitle";
      scTitle.textContent = "Server Control (EXT-X-SERVER-CONTROL)";
      body.appendChild(scTitle);

      const scGrid = document.createElement("div");
      scGrid.className = "stat-grid";
      if (sc.canBlockReload !== undefined) appendStatToGrid(scGrid, "CAN-BLOCK-RELOAD", sc.canBlockReload ? "YES" : "NO");
      if (sc.canSkipUntil !== undefined) appendStatToGrid(scGrid, "CAN-SKIP-UNTIL", sc.canSkipUntil + "s");
      if (sc.canSkipDateranges !== undefined) appendStatToGrid(scGrid, "CAN-SKIP-DATERANGES", sc.canSkipDateranges ? "YES" : "NO");
      if (sc.holdBack !== undefined) appendStatToGrid(scGrid, "HOLD-BACK", sc.holdBack + "s");
      if (sc.partHoldBack !== undefined) appendStatToGrid(scGrid, "PART-HOLD-BACK", sc.partHoldBack + "s");
      body.appendChild(scGrid);
    }

    // Part Info
    if (data.partInf) {
      const piTitle = document.createElement("h3");
      piTitle.className = "cc-subtitle";
      piTitle.textContent = "Part Info (EXT-X-PART-INF)";
      body.appendChild(piTitle);

      const piGrid = document.createElement("div");
      piGrid.className = "stat-grid";
      if (data.partInf.partTarget !== null) appendStatToGrid(piGrid, "PART-TARGET", data.partInf.partTarget + "s");
      body.appendChild(piGrid);
    }

    // Partial Segments summary
    if (data.parts.length > 0) {
      const partTitle = document.createElement("h3");
      partTitle.className = "cc-subtitle";
      partTitle.textContent = "Partial Segments (EXT-X-PART)";
      body.appendChild(partTitle);

      const partGrid = document.createElement("div");
      partGrid.className = "stat-grid";
      appendStatToGrid(partGrid, "Total Parts", data.parts.length);
      const indParts = data.parts.filter(p => p.independent).length;
      if (indParts > 0) appendStatToGrid(partGrid, "Independent Parts", indParts);
      const gapParts = data.parts.filter(p => p.gap).length;
      if (gapParts > 0) appendStatToGrid(partGrid, "Gap Parts", gapParts);
      const partDurations = data.parts.filter(p => p.duration).map(p => p.duration);
      if (partDurations.length > 0) {
        const avgP = partDurations.reduce((a, b) => a + b, 0) / partDurations.length;
        appendStatToGrid(partGrid, "Avg Part Duration", avgP.toFixed(3) + "s");
        appendStatToGrid(partGrid, "Min Part Duration", Math.min(...partDurations).toFixed(3) + "s");
        appendStatToGrid(partGrid, "Max Part Duration", Math.max(...partDurations).toFixed(3) + "s");
      }
      body.appendChild(partGrid);

      // Collapsible parts table
      const partsTableWrap = document.createElement("div");
      partsTableWrap.className = "ll-parts-table-wrap";
      const togglePartsBtn = document.createElement("button");
      togglePartsBtn.className = "decode-toggle-btn";
      togglePartsBtn.textContent = "📋 Show All Parts (" + data.parts.length + ")";
      const partsTableDiv = document.createElement("div");
      partsTableDiv.style.display = "none";

      const pWrapper = document.createElement("div");
      pWrapper.className = "variant-table-wrapper";
      const pTable = document.createElement("table");
      pTable.className = "variant-table segment-url-table";
      const pThead = document.createElement("thead");
      pThead.innerHTML = "<tr><th>#</th><th>Duration</th><th>Independent</th><th>URI</th></tr>";
      pTable.appendChild(pThead);
      const pTbody = document.createElement("tbody");
      data.parts.forEach((part, i) => {
        const tr = document.createElement("tr");
        const tdIdx = document.createElement("td");
        tdIdx.className = "seg-index";
        tdIdx.textContent = i + 1;
        tr.appendChild(tdIdx);
        const tdDur = document.createElement("td");
        tdDur.className = "table-bandwidth";
        tdDur.textContent = part.duration ? part.duration.toFixed(3) + "s" : "—";
        tr.appendChild(tdDur);
        const tdInd = document.createElement("td");
        tdInd.textContent = part.independent ? "✓" : "—";
        tdInd.style.textAlign = "center";
        tr.appendChild(tdInd);
        const tdUri = document.createElement("td");
        tdUri.className = "seg-url-cell";
        const pathSpan = document.createElement("span");
        pathSpan.className = "seg-raw-path";
        pathSpan.textContent = part.rawUri || "—";
        pathSpan.title = part.uri || "";
        tdUri.appendChild(pathSpan);
        tr.appendChild(tdUri);
        pTbody.appendChild(tr);
      });
      pTable.appendChild(pTbody);
      pWrapper.appendChild(pTable);
      partsTableDiv.appendChild(pWrapper);

      togglePartsBtn.addEventListener("click", () => {
        const showing = partsTableDiv.style.display !== "none";
        partsTableDiv.style.display = showing ? "none" : "block";
        togglePartsBtn.textContent = showing
          ? "📋 Show All Parts (" + data.parts.length + ")"
          : "📋 Hide Parts";
      });
      partsTableWrap.appendChild(togglePartsBtn);
      partsTableWrap.appendChild(partsTableDiv);
      body.appendChild(partsTableWrap);
    }

    // Preload Hints
    if (data.preloadHints.length > 0) {
      const phTitle = document.createElement("h3");
      phTitle.className = "cc-subtitle";
      phTitle.textContent = "Preload Hints (EXT-X-PRELOAD-HINT)";
      body.appendChild(phTitle);

      data.preloadHints.forEach(hint => {
        const item = document.createElement("div");
        item.className = "track-item";

        const typeBadge = document.createElement("span");
        typeBadge.className = "track-type track-type-ll";
        typeBadge.textContent = hint.type || "HINT";
        item.appendChild(typeBadge);

        const details = [];
        if (hint.rawUri) details.push(hint.rawUri);
        if (hint.byterangeStart !== undefined) details.push("Start: " + hint.byterangeStart);
        if (hint.byterangeLength !== undefined) details.push("Length: " + hint.byterangeLength);

        const detailDiv = document.createElement("div");
        detailDiv.className = "track-details";
        detailDiv.textContent = details.join(" · ");
        item.appendChild(detailDiv);

        body.appendChild(item);
      });
    }

    // Skip
    if (data.skip) {
      const skipTitle = document.createElement("h3");
      skipTitle.className = "cc-subtitle";
      skipTitle.textContent = "Playlist Delta Updates (EXT-X-SKIP)";
      body.appendChild(skipTitle);

      const skipGrid = document.createElement("div");
      skipGrid.className = "stat-grid";
      appendStatToGrid(skipGrid, "Skipped Segments", data.skip.skippedSegments);
      if (data.skip.recentlyRemovedDateranges) {
        appendStatToGrid(skipGrid, "Removed DateRanges", data.skip.recentlyRemovedDateranges);
      }
      body.appendChild(skipGrid);
    }

    outputEl.appendChild(section);
  }

  // Segment Duration Chart
  if (data.segmentDurations.length > 2) {
    const { section, body } = createCollapsibleSection("Segment Duration Chart", null, false);
    const canvas = document.createElement("canvas");
    canvas.className = "duration-chart";
    body.appendChild(canvas);
    outputEl.appendChild(section);

    const td = data.targetDuration ? parseFloat(data.targetDuration) : null;
    // Draw after layout
    requestAnimationFrame(() => drawDurationChart(canvas, data.segmentDurations, td));

    // Redraw on section toggle in case it was collapsed
    section.querySelector(".section-header").addEventListener("click", () => {
      setTimeout(() => {
        if (body.style.display !== "none") {
          drawDurationChart(canvas, data.segmentDurations, td);
        }
      }, 50);
    });
  }

  // DateRanges (timed metadata / SCTE-35)
  if (data.dateRanges.length > 0) {
    const { section, body } = createCollapsibleSection(
      "Timed Metadata (EXT-X-DATERANGE)", data.dateRanges.length, false
    );

    const drWrapper = document.createElement("div");
    drWrapper.className = "variant-table-wrapper";
    const drTable = document.createElement("table");
    drTable.className = "variant-table";
    const drThead = document.createElement("thead");
    drThead.innerHTML = "<tr><th>ID</th><th>Start Date</th><th>Duration</th><th>SCTE-35</th><th>Class</th></tr>";
    drTable.appendChild(drThead);
    const drTbody = document.createElement("tbody");
    data.dateRanges.forEach(dr => {
      const tr = document.createElement("tr");

      const tdId = document.createElement("td");
      tdId.textContent = dr.id || "—";
      tr.appendChild(tdId);

      const tdStart = document.createElement("td");
      tdStart.textContent = dr.startDate || "—";
      tr.appendChild(tdStart);

      const tdDur = document.createElement("td");
      tdDur.textContent = dr.duration ? dr.duration + "s" : (dr.plannedDuration ? dr.plannedDuration + "s (planned)" : "—");
      tr.appendChild(tdDur);

      const tdScte = document.createElement("td");
      if (dr.scte35Out) {
        tdScte.innerHTML = '<span class="badge badge-live" style="font-size:10px">OUT</span>';
      } else if (dr.scte35In) {
        tdScte.innerHTML = '<span class="badge badge-vod" style="font-size:10px">IN</span>';
      } else if (dr.scte35Cmd) {
        tdScte.innerHTML = '<span class="badge badge-event" style="font-size:10px">CMD</span>';
      } else {
        tdScte.textContent = "—";
      }
      tr.appendChild(tdScte);

      const tdClass = document.createElement("td");
      tdClass.textContent = dr.class || "—";
      tr.appendChild(tdClass);

      drTbody.appendChild(tr);
    });
    drTable.appendChild(drTbody);
    drWrapper.appendChild(drTable);
    body.appendChild(drWrapper);

    outputEl.appendChild(section);
  }

  // Session Data (EXT-X-SESSION-DATA)
  if (data.sessionData.length > 0) {
    const { section, body } = createCollapsibleSection(
      "Session Data (EXT-X-SESSION-DATA)", data.sessionData.length, false
    );

    const sdWrapper = document.createElement("div");
    sdWrapper.className = "variant-table-wrapper";
    const sdTable = document.createElement("table");
    sdTable.className = "variant-table";
    const sdThead = document.createElement("thead");
    sdThead.innerHTML = "<tr><th>DATA-ID</th><th>Value</th><th>Language</th><th>URI</th></tr>";
    sdTable.appendChild(sdThead);
    const sdTbody = document.createElement("tbody");
    data.sessionData.forEach(sd => {
      const tr = document.createElement("tr");
      const tdId = document.createElement("td");
      tdId.textContent = sd.dataId || "—";
      tr.appendChild(tdId);
      const tdVal = document.createElement("td");
      tdVal.textContent = sd.value || "—";
      tr.appendChild(tdVal);
      const tdLang = document.createElement("td");
      tdLang.textContent = sd.language || "—";
      tr.appendChild(tdLang);
      const tdUri = document.createElement("td");
      tdUri.textContent = sd.uri || "—";
      tr.appendChild(tdUri);
      sdTbody.appendChild(tr);
    });
    sdTable.appendChild(sdTbody);
    sdWrapper.appendChild(sdTable);
    body.appendChild(sdWrapper);

    outputEl.appendChild(section);
  }
}

function renderTrackItem(parent, track, showDelivery) {
  const item = document.createElement("div");
  item.className = "track-item";

  // Type badge
  const typeSpan = document.createElement("span");
  typeSpan.className = "track-type";
  if (track.type === "VIDEO") typeSpan.className += " track-type-video";
  else if (track.type === "AUDIO") typeSpan.className += " track-type-audio";
  else if (track.type === "SUBTITLES") typeSpan.className += " track-type-sub";
  else if (track.type === "CLOSED-CAPTIONS") typeSpan.className += " track-type-cc";
  else if (track.type === "I-FRAME") typeSpan.className += " track-type-iframe";
  typeSpan.textContent = track.type || "UNKNOWN";
  item.appendChild(typeSpan);

  // Name
  const nameSpan = document.createElement("span");
  nameSpan.className = "track-name";
  nameSpan.textContent = track.name || "Unnamed";
  item.appendChild(nameSpan);

  // Detail tags
  const details = [];
  if (track.resolution) details.push(track.resolution);
  if (track.bandwidth) details.push(formatBandwidth(track.bandwidth));
  if (track.codecs) details.push(track.codecs);
  if (track.hdcpLevel) details.push("HDCP: " + track.hdcpLevel);
  if (track.language) details.push("Language: " + track.language);
  if (track.groupId) details.push("Group: " + track.groupId);
  if (track.instreamId) details.push("Instream-ID: " + track.instreamId);
  if (track.default) details.push("Default");
  if (track.forced) details.push("Forced");
  if (showDelivery && track.delivery) details.push(track.delivery);
  if (track.characteristics) details.push("Characteristics: " + track.characteristics);

  if (details.length > 0) {
    const detailDiv = document.createElement("div");
    detailDiv.className = "track-details";
    detailDiv.textContent = details.join(" · ");
    item.appendChild(detailDiv);
  }

  // Load playlist button
  if (track.uri) {
    const uriDiv = document.createElement("div");
    uriDiv.className = "track-uri";
    const link = document.createElement("button");
    link.className = "track-uri-link";
    link.textContent = "▶ Load Playlist";
    link.addEventListener("click", (e) => {
      e.stopPropagation();
      loadChildPlaylist(track.uri, track.type);
    });
    uriDiv.appendChild(link);
    const urlSpan = document.createElement("span");
    urlSpan.className = "track-uri-path";
    urlSpan.textContent = track.uri;
    uriDiv.appendChild(urlSpan);
    item.appendChild(uriDiv);
  }

  parent.appendChild(item);
}

function createStat(label) {
  const div = document.createElement("div");
  div.className = "stat";
  const strong = document.createElement("strong");
  strong.textContent = label;
  div.appendChild(strong);
  return div;
}

function appendStat(parent, label, value, isHtml) {
  const div = document.createElement("div");
  div.className = "stat";
  const strong = document.createElement("strong");
  strong.textContent = label;
  div.appendChild(strong);
  const valSpan = document.createElement("span");
  valSpan.className = "stat-value";
  if (isHtml) {
    valSpan.innerHTML = value;
  } else {
    valSpan.textContent = value;
  }
  div.appendChild(valSpan);
  parent.appendChild(div);
}

function appendStatToGrid(grid, label, value) {
  const div = document.createElement("div");
  div.className = "stat";
  const strong = document.createElement("strong");
  strong.textContent = label;
  div.appendChild(strong);
  const valSpan = document.createElement("span");
  valSpan.className = "stat-value";
  valSpan.textContent = value;
  div.appendChild(valSpan);
  grid.appendChild(div);
}

// ============================
// FETCH & ANALYZE
// ============================

async function loadManifestFromUrl() {
  const urlInput = document.getElementById("manifestUrl");
  const url = urlInput.value.trim();
  clearError();

  if (!url) {
    showError("Please enter a manifest URL.");
    return;
  }

  if (!isValidUrl(url)) {
    showError("Please enter a valid HTTP or HTTPS URL.");
    return;
  }

  // Clear nav stack when loading fresh URL
  navStack.length = 0;
  showLoading(true);

  try {
    const response = await fetch(url);
    if (!response.ok) {
      showError(getHttpErrorMessage(response.status, response.statusText) + "\n\nURL: " + url);
      return;
    }
    const text = await response.text();
    document.getElementById("manifestInput").value = text;
    addToHistory(url);
    autoRefreshCount = 0;
    lastManifestText = text;
    analyzeManifest(url);
  } catch (error) {
    console.error(error);
    showError(getFetchErrorMessage(error) + "\n\nURL: " + url);
  } finally {
    showLoading(false);
  }
}

async function loadChildPlaylist(url, trackType) {
  clearError();
  showLoading(true);

  // Save current state to nav stack before navigating
  const currentManifest = document.getElementById("manifestInput").value;
  const currentUrl = document.getElementById("manifestUrl").value;
  if (currentManifest.trim()) {
    navStack.push({ manifest: currentManifest, url: currentUrl });
  }

  // Map track type for display in media playlist
  if (trackType) {
    const typeMap = { "VIDEO": "Video", "AUDIO": "Audio", "SUBTITLES": "Subtitle", "CLOSED-CAPTIONS": "Closed Captions" };
    window._lastLoadedTrackType = typeMap[trackType] || trackType;
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      showError(getHttpErrorMessage(response.status, response.statusText) + "\n\nURL: " + url);
      navStack.pop(); // Restore stack on failure
      return;
    }
    const text = await response.text();
    document.getElementById("manifestInput").value = text;
    document.getElementById("manifestUrl").value = url;
    addToHistory(url);
    analyzeManifest(url);
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    console.error(error);
    showError(getFetchErrorMessage(error) + "\n\nURL: " + url);
    navStack.pop(); // Restore stack on failure
  } finally {
    showLoading(false);
    if (!document.getElementById("manifestInput").value) {
      window._lastLoadedTrackType = null;
    }
  }
}

function goBackNav() {
  if (navStack.length === 0) return;
  stopAutoRefresh();
  const prev = navStack.pop();
  document.getElementById("manifestInput").value = prev.manifest;
  document.getElementById("manifestUrl").value = prev.url;
  analyzeManifest(prev.url);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function analyzeManifest(baseUrl) {
  clearError();
  const manifestInput = document.getElementById("manifestInput");
  const manifest = manifestInput.value;

  if (!baseUrl) {
    baseUrl = document.getElementById("manifestUrl").value.trim() || "";
  }

  if (!manifest.trim()) {
    showError("Please paste, upload, or load a manifest first.");
    return;
  }

  const isAutoRefreshing = autoRefreshTimer !== null;
  // Stop timer without resetting count during auto-refresh
  if (autoRefreshTimer) { clearInterval(autoRefreshTimer); autoRefreshTimer = null; }
  const data = parseManifest(manifest, baseUrl);
  renderRawManifest(manifest, isAutoRefreshing);
  renderResults(data);

  // Auto-refresh for live/event media playlists loaded from URL
  if ((data.streamType === "LIVE" || data.streamType === "EVENT") && baseUrl && isValidUrl(baseUrl)) {
    if (data.targetDuration) {
      autoRefreshInterval = Math.max(2000, parseFloat(data.targetDuration) * 1000);
    }
    autoRefreshStreamType = data.streamType;
    startAutoRefresh(baseUrl);
  } else {
    // Not live/event or no URL — fully stop
    autoRefreshCount = 0;
    const badge = document.getElementById("autoRefreshBadge");
    if (badge) badge.style.display = "none";
  }
}

// ============================
// COPY & EXPORT
// ============================

function copyRawManifest() {
  const manifest = document.getElementById("manifestInput").value;
  navigator.clipboard.writeText(manifest).then(() => showToast("Raw manifest copied!"));
}

function copyResults() {
  const output = document.getElementById("output");
  navigator.clipboard.writeText(output.innerText).then(() => showToast("Results copied!"));
}

function exportJson() {
  if (!window._lastAnalysis) return;
  const data = { ...window._lastAnalysis };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "hls-analysis.json";
  a.click();
  URL.revokeObjectURL(url);
  showToast("JSON exported!");
}

// ============================
// RAW VIEWER TOGGLE
// ============================

let rawCollapsed = true;

function toggleRawViewer() {
  rawCollapsed = !rawCollapsed;
  document.getElementById("rawContent").style.display = rawCollapsed ? "none" : "block";
  document.getElementById("toggleRawBtn").textContent = rawCollapsed ? "▶" : "▼";
}

// ============================
// AUTO-REFRESH FOR LIVE
// ============================

let autoRefreshTimer = null;
let autoRefreshInterval = 5000;
let autoRefreshCount = 0;
let lastManifestText = "";

// Navigation stack for back button
const navStack = [];
let autoRefreshStreamType = "LIVE";

function startAutoRefresh(url) {
  if (autoRefreshTimer) { clearInterval(autoRefreshTimer); autoRefreshTimer = null; }
  const badge = document.getElementById("autoRefreshBadge");
  if (badge) {
    badge.style.display = "inline-flex";
    updateRefreshBadge();
  }
  autoRefreshTimer = setInterval(async () => {
    try {
      const response = await fetch(url);
      if (!response.ok) return;
      const text = await response.text();
      const changed = text !== lastManifestText;
      autoRefreshCount++;
      lastManifestText = text;
      document.getElementById("manifestInput").value = text;
      analyzeManifest(url);
      updateRefreshBadge(changed);
      const outputEl = document.getElementById("output");
      outputEl.classList.remove("refresh-flash", "refresh-flash-subtle");
      void outputEl.offsetWidth;
      outputEl.classList.add(changed ? "refresh-flash" : "refresh-flash-subtle");
      setTimeout(() => outputEl.classList.remove("refresh-flash", "refresh-flash-subtle"), 600);
    } catch (err) {
      console.warn("Auto-refresh failed:", err.message);
    }
  }, autoRefreshInterval);
}

function updateRefreshBadge(changed) {
  const badge = document.getElementById("autoRefreshBadge");
  if (!badge) return;
  const now = new Date();
  const time = now.toLocaleTimeString();
  const countText = autoRefreshCount > 0 ? " · #" + autoRefreshCount : "";
  const timeText = autoRefreshCount > 0 ? " · " + time : "";
  const changeText = autoRefreshCount > 0 ? (changed ? " · ✓ Updated" : " · ✓ Fetched") : "";
  badge.innerHTML = '<span class="auto-refresh-dot"></span> ' + autoRefreshStreamType + countText + timeText + changeText;
}

function stopAutoRefresh() {
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer);
    autoRefreshTimer = null;
  }
  autoRefreshCount = 0;
  const badge = document.getElementById("autoRefreshBadge");
  if (badge) badge.style.display = "none";
}

// ============================
// INIT — Wire up all event listeners
// ============================

document.addEventListener("DOMContentLoaded", () => {
  // File input
  document.getElementById("fileInput").addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      document.getElementById("manifestInput").value = e.target.result;
      showToast("File loaded: " + file.name);
    };
    reader.readAsText(file);
  });

  // Buttons
  document.getElementById("loadUrlBtn").addEventListener("click", loadManifestFromUrl);
  document.getElementById("analyzeBtn").addEventListener("click", () => {
    // Clear URL when analyzing pasted content to avoid wrong base URL
    const urlInput = document.getElementById("manifestUrl");
    const manifestInput = document.getElementById("manifestInput");
    if (manifestInput.value.trim() && !urlInput.value.trim()) {
      // Pasted content with no URL — fine
    }
    navStack.length = 0;
    analyzeManifest();
  });
  document.getElementById("themeToggle").addEventListener("click", toggleTheme);
  document.getElementById("copyRawBtn").addEventListener("click", copyRawManifest);
  document.getElementById("toggleRawBtn").addEventListener("click", toggleRawViewer);
  document.getElementById("copyResultsBtn").addEventListener("click", copyResults);
  document.getElementById("exportJsonBtn").addEventListener("click", exportJson);

  // Auto-refresh badge click to stop
  document.getElementById("autoRefreshBadge").addEventListener("click", () => {
    stopAutoRefresh();
    showToast("Auto-refresh stopped");
  });

  // Keyboard: Enter in URL input triggers load
  document.getElementById("manifestUrl").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      loadManifestFromUrl();
    }
  });

  // Keyboard: Escape closes error modal
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeErrorModal();
  });

  // Drag and drop
  const dropZone = document.getElementById("dropZone");
  dropZone.addEventListener("click", (e) => {
    if (e.target.tagName !== "LABEL") document.getElementById("fileInput").click();
  });
  ["dragenter", "dragover"].forEach(evt => {
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add("drag-over");
    });
  });
  ["dragleave", "drop"].forEach(evt => {
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove("drag-over");
    });
  });
  dropZone.addEventListener("drop", (e) => {
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      document.getElementById("manifestInput").value = ev.target.result;
      showToast("File loaded: " + file.name);
    };
    reader.readAsText(file);
  });

  // Init theme & history
  initTheme();
  renderHistory();
});