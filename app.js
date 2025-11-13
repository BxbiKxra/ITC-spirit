const BANDS = {
  FM: { name: 'FM', min: 87.5, max: 108, step: 0.2, unit: 'MHz' },
  AM: { name: 'AM', min: 520, max: 1710, step: 10, unit: 'kHz' }
};

const CURATED_STATIONS = [
  {
    id: 'bbc-radio-1',
    band: 'FM',
    frequency: 98.8,
    name: 'BBC Radio 1 (UK)',
    stream: 'https://stream.live.vc.bbcmedia.co.uk/bbc_radio_one',
    location: 'London, United Kingdom'
  },
  {
    id: 'kexp-fm',
    band: 'FM',
    frequency: 90.3,
    name: 'KEXP 90.3 FM',
    stream: 'https://live.wostreaming.net/direct/kexp-kexpfm128-ibc1',
    location: 'Seattle, USA'
  },
  {
    id: 'kcrw-fm',
    band: 'FM',
    frequency: 89.9,
    name: 'KCRW 89.9 FM',
    stream: 'https://kcrw.streamguys1.com/kcrw_192k_mp3_on_air',
    location: 'Los Angeles, USA'
  },
  {
    id: 'cbc-music-toronto',
    band: 'FM',
    frequency: 94.1,
    name: 'CBC Music 94.1 FM',
    stream: 'https://cbcmp3.ic.llnwd.net/stream/cbcmp3_cbc_music_toronto',
    location: 'Toronto, Canada'
  },
  {
    id: 'triplej-fm',
    band: 'FM',
    frequency: 99.3,
    name: 'Triple J 99.3 FM',
    stream: 'https://live-radio01.mediahubaustralia.com/2TJW/mp3/',
    location: 'Sydney, Australia'
  },
  {
    id: 'classic-fm-uk',
    band: 'FM',
    frequency: 100,
    name: 'Classic FM 100.0',
    stream: 'https://stream-mz.planetradio.co.uk/classicfmhigh.aac',
    location: 'London, United Kingdom'
  },
  {
    id: 'wor-710',
    band: 'AM',
    frequency: 710,
    name: 'WOR 710 AM',
    stream: 'https://playerservices.streamtheworld.com/api/livestream-redirect/WORAMAAC.aac',
    location: 'New York, USA'
  },
  {
    id: 'wsb-750',
    band: 'AM',
    frequency: 750,
    name: 'WSB 750 AM',
    stream: 'https://playerservices.streamtheworld.com/api/livestream-redirect/WSBAMAAC.aac',
    location: 'Atlanta, USA'
  },
  {
    id: 'wgn-720',
    band: 'AM',
    frequency: 720,
    name: 'WGN 720 AM',
    stream: 'https://playerservices.streamtheworld.com/api/livestream-redirect/WGNAMAAC.aac',
    location: 'Chicago, USA'
  },
  {
    id: 'cfrb-1010',
    band: 'AM',
    frequency: 1010,
    name: 'Newstalk 1010 AM',
    stream: 'https://playerservices.streamtheworld.com/api/livestream-redirect/CFRBAMAAC.aac',
    location: 'Toronto, Canada'
  },
  {
    id: 'kmox-1120',
    band: 'AM',
    frequency: 1120,
    name: 'KMOX 1120 AM',
    stream: 'https://playerservices.streamtheworld.com/api/livestream-redirect/KMOXAMAAC.aac',
    location: 'St. Louis, USA'
  },
  {
    id: 'bbc-world-service',
    band: 'AM',
    frequency: 1540,
    name: 'BBC World Service 1540 AM',
    stream: 'https://stream.live.vc.bbcmedia.co.uk/bbc_world_service',
    location: 'Global'
  }
];

const STATION_THRESHOLD = {
  FM: 0.35,
  AM: 20
};

const STATION_RETRY_DELAY = 7000;

const RADIO_BROWSER_ENDPOINT = 'https://de1.api.radio-browser.info/json/stations/search';
const RADIO_BROWSER_TIMEOUT = 10000;

const SWEEP_MIN = 50;
const SWEEP_MAX = 350;

function hashString(value) {
  if (!value) return 0;
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function toTagArray(tags) {
  if (!tags) return [];
  if (Array.isArray(tags)) {
    return tags
      .map((tag) => (typeof tag === 'string' ? tag.toLowerCase().trim() : ''))
      .filter(Boolean);
  }
  if (typeof tags === 'string') {
    return tags
      .split(',')
      .map((tag) => tag.toLowerCase().trim())
      .filter(Boolean);
  }
  return [];
}

function determineBand(station, fallback = 'FM') {
  if (station && station.band && BANDS[station.band]) {
    return station.band;
  }
  const tags = toTagArray(station?.tags);
  const name = station?.name || '';
  const description = station?.genre || station?.category || '';
  const haystacks = [name, description, ...(Array.isArray(tags) ? tags : [])]
    .join(' ')
    .toLowerCase();

  if (/\b(am|medium\s*wave|mw)\b/.test(haystacks)) {
    return 'AM';
  }
  if (/\b(fm|vhf)\b/.test(haystacks)) {
    return 'FM';
  }

  if (typeof station?.bitrate === 'number' && station.bitrate > 0) {
    if (station.bitrate <= 64) {
      return 'AM';
    }
    if (station.bitrate >= 96) {
      return 'FM';
    }
  }

  return fallback && BANDS[fallback] ? fallback : 'FM';
}

function parseFrequencyHint(source, band) {
  if (!source) return null;
  const matches = String(source).match(/(\d+(?:\.\d+)?)/g);
  if (!matches) return null;
  const bandInfo = BANDS[band];
  for (let i = 0; i < matches.length; i += 1) {
    const value = Number.parseFloat(matches[i]);
    if (!Number.isFinite(value)) continue;
    if (band === 'FM' && value >= bandInfo.min && value <= bandInfo.max) {
      return Number(value.toFixed(1));
    }
    if (band === 'AM' && value >= bandInfo.min && value <= bandInfo.max) {
      return Math.round(value);
    }
  }
  return null;
}

function deriveFrequency(station, band, index = 0) {
  const direct = Number.parseFloat(station?.frequency);
  if (Number.isFinite(direct)) {
    return band === 'FM' ? Number(direct.toFixed(1)) : Math.round(direct);
  }

  const hinted =
    parseFrequencyHint(station?.frequency, band)
    || parseFrequencyHint(station?.name, band)
    || parseFrequencyHint(station?.tags, band);
  if (Number.isFinite(hinted)) {
    return hinted;
  }

  const identifier = station?.stationuuid || station?.id || station?.name || `${band}-${index}`;
  const hash = hashString(`${identifier}-${station?.stream || station?.url}`);
  const bandInfo = BANDS[band];
  const range = bandInfo.max - bandInfo.min;
  const steps = Math.max(1, Math.round(range / bandInfo.step));
  const offset = hash % steps;
  const value = bandInfo.min + offset * bandInfo.step;
  return band === 'FM' ? Number(value.toFixed(1)) : Math.round(value);
}

function resolveLocation(station) {
  if (!station) return '';
  const parts = [];
  const push = (value) => {
    if (value && !parts.includes(value)) {
      parts.push(value);
    }
  };
  push(station.location);
  push(station.city);
  push(station.state);
  push(station.region);
  push(station.country);
  if (station.countrycode && station.countrycode.length <= 3) {
    push(station.countrycode.toUpperCase());
  }
  return parts.filter(Boolean).join(', ');
}

function normaliseStationEntry(station, fallbackBand = 'FM', index = 0) {
  if (!station) return null;
  const stream = station.stream || station.url_resolved || station.url;
  if (!stream) return null;
  const band = determineBand(station, fallbackBand);
  if (!BANDS[band]) return null;
  const idSource = station.stationuuid || station.id || `${band}-${index}-${stream}`;
  const frequency = deriveFrequency(station, band, index);
  const location = resolveLocation(station);

  return {
    id: idSource,
    band,
    frequency,
    name: station.name?.trim() || 'Untitled Station',
    stream,
    location,
    codec: station.codec || station.content_type || '',
    bitrate: station.bitrate || null,
    _normalized: true
  };
}

function buildStationBank(stations = []) {
  const fm = [];
  const am = [];
  const seen = new Set();
  stations.forEach((raw, index) => {
    const entry = raw && raw._normalized ? raw : normaliseStationEntry(raw, raw?.band || 'FM', index);
    if (!entry) return;
    const key = `${entry.band}:${entry.stream}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (entry.band === 'AM') {
      am.push(entry);
    } else {
      fm.push(entry);
    }
  });
  fm.sort((a, b) => a.frequency - b.frequency);
  am.sort((a, b) => a.frequency - b.frequency);
  return {
    FM: fm,
    AM: am,
    total: fm.length + am.length
  };
}

let activeStationBank = buildStationBank(CURATED_STATIONS);
let activeStationMeta = {
  id: 'curated',
  label: 'Curated preset bank',
  total: activeStationBank.total
};

const channelRegistry = new Set();

function registerChannel(channel) {
  channelRegistry.add(channel);
}

function getStationsForBand(bandName) {
  const list = activeStationBank[bandName] || [];
  return list.slice();
}

function setActiveStationBank(stations, meta = {}) {
  const bank = buildStationBank(stations);
  if (!bank.total) {
    throw new Error('No playable stations were returned.');
  }
  activeStationBank = bank;
  activeStationMeta = {
    id: meta.id || 'custom',
    label: meta.label || 'Custom station bank',
    query: meta.query || '',
    total: bank.total,
    fetchedAt: new Date().toISOString(),
    rawCount: typeof meta.rawCount === 'number' ? meta.rawCount : bank.total
  };
  channelRegistry.forEach((channel) => {
    if (typeof channel.refreshStationList === 'function') {
      channel.refreshStationList();
    }
  });
  return activeStationMeta;
}

function getActiveStationMeta() {
  return activeStationMeta;
}

async function queryRadioBrowser({ query = '', countryCode = '', limit = 80 } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RADIO_BROWSER_TIMEOUT);
  try {
    const url = new URL(RADIO_BROWSER_ENDPOINT);
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('hidebroken', 'true');
    url.searchParams.set('order', 'clickcount');
    url.searchParams.set('reverse', 'true');
    if (query) {
      url.searchParams.set('name', query);
      url.searchParams.set('tag', query);
    }
    if (countryCode) {
      url.searchParams.set('countrycode', countryCode.toUpperCase());
    }

    const response = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'ITC-Spirit/1.0 (+agentic spirit scanner)'
      },
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    const stations = data
      .map((station, index) => normaliseStationEntry(station, determineBand(station, 'FM'), index))
      .filter(Boolean);
    const bank = buildStationBank(stations);
    return {
      stations,
      bank,
      rawCount: Array.isArray(data) ? data.length : 0
    };
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Request timed out');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

let audioContext;

function ensureAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
  }
  if (audioContext.state === 'suspended') {
    return audioContext.resume();
  }
  return Promise.resolve();
}

const activationHandler = () => {
  ensureAudioContext().catch((err) => console.error(err));
  window.removeEventListener('pointerdown', activationHandler);
  window.removeEventListener('keydown', activationHandler);
};

window.addEventListener('pointerdown', activationHandler, { once: true });
window.addEventListener('keydown', activationHandler, { once: true });

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function createNoiseBuffer(context, type = 'white') {
  const length = context.sampleRate * 3;
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);

  if (type === 'pink') {
    let b0, b1, b2, b3, b4, b5, b6;
    b0 = b1 = b2 = b3 = b4 = b5 = b6 = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
      b6 = white * 0.115926;
      data[i] = pink * 0.11;
    }
  } else {
    for (let i = 0; i < length; i += 1) {
      data[i] = Math.random() * 2 - 1;
    }
  }
  return buffer;
}

function formatFrequency(value, band) {
  if (band.unit === 'MHz') {
    return `${value.toFixed(1)} MHz`;
  }
  return `${Math.round(value)} kHz`;
}

function mapToFilterFrequency(value, band) {
  return value * (band.unit === 'MHz' ? 1000 : 10);
}

class SweepChannel {
  constructor(context, element, options) {
    this.context = context;
    this.element = element;
    this.band = BANDS.FM;
    this.frequency = this.band.min;
    this.sweepDirection = 1;
    this.temperatureDrift = 0;
    this.sweepRate = 150;
    this.gain = context.createGain();
    this.filter = context.createBiquadFilter();
    this.filter.type = 'bandpass';
    this.filter.frequency.value = mapToFilterFrequency(this.frequency, this.band);
    this.filter.Q.value = 8;
    this.noiseType = 'white';
    this.noiseSource = null;
    this.analyser = context.createAnalyser();
    this.analyser.fftSize = 1024;
    this.waveformArray = new Uint8Array(this.analyser.fftSize);
    this.signalArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.destination = options.destination;
    this.onStationEvent = options.onStationEvent;
    this.availableStations = getStationsForBand(this.band.name);
    this.stationThreshold = STATION_THRESHOLD[this.band.name];
    this.currentStation = null;
    this.pendingStationId = null;
    this.stationCooldowns = new Map();
    this.errorResetTimer = null;
    this.lockNotificationSent = false;

    this.audioElement = new Audio();
    this.audioElement.crossOrigin = 'anonymous';
    this.audioElement.preload = 'none';
    this.audioElement.loop = false;
    this.mediaElement = this.context.createMediaElementSource(this.audioElement);

    this.gain.gain.value = 0.5;
    this.mediaElement.connect(this.filter);
    this.filter.connect(this.gain);
    this.gain.connect(this.analyser);
    this.analyser.connect(this.destination);

    this.ui = this.buildUi();
    this.bindStreamEvents();
    this.updateStationDisplay('scan');
    this.drawWaveform();
    this.drawSignalMeter();
    registerChannel(this);
  }

  buildUi() {
    const sweepRange = this.element.querySelector('.sweep-range');
    const directionButtons = this.element.querySelectorAll('.direction-button');
    const volumeButtons = this.element.querySelectorAll('.volume-button');
    const volumeLabel = this.element.querySelector('.volume-level');
    const frequencyDisplay = this.element.querySelector('.frequency-display');
    const stationDisplay = this.element.querySelector('.station-display');
    const modeSwitch = this.element.querySelectorAll('.mode-switch input[type="radio"]');

    sweepRange.addEventListener('input', (event) => {
      this.setSweepRate(Number(event.target.value));
    });

    directionButtons.forEach((button) => {
      button.addEventListener('click', () => {
        directionButtons.forEach((btn) => btn.classList.remove('active'));
        button.classList.add('active');
        this.sweepDirection = button.dataset.direction === 'reverse' ? -1 : 1;
      });
    });

    volumeButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const adjust = Number(button.dataset.adjust);
        const next = clamp(this.gain.gain.value + adjust / 100, 0, 1);
        this.gain.gain.value = next;
        volumeLabel.textContent = `Volume: ${Math.round(next * 100)}%`;
      });
    });

    modeSwitch.forEach((input) => {
      input.addEventListener('change', () => {
        if (input.checked) {
          this.setBand(BANDS[input.value]);
        }
      });
    });

    return {
      sweepRange,
      volumeLabel,
      frequencyDisplay,
      directionButtons,
      modeSwitch,
      stationDisplay
    };
  }

  bindStreamEvents() {
    this.audioElement.addEventListener('error', (event) => {
      const mediaError = event?.target?.error;
      const message = mediaError?.message || mediaError?.code;
      this.handleStationError(message);
    });

    this.audioElement.addEventListener('playing', () => {
      this.confirmStationLock(this.currentStation);
    });

    this.audioElement.addEventListener('stalled', () => {
      if (this.currentStation) {
        this.updateStationDisplay('buffering', this.currentStation);
      }
    });
  }

  notifyStationEvent(type, station, detail = {}) {
    if (typeof this.onStationEvent !== 'function') return;
    this.onStationEvent({
      type,
      channel: this.element.dataset.channel || '',
      station,
      band: this.band.name,
      ...detail
    });
  }

  updateStationDisplay(state, station = null, message) {
    if (!this.ui.stationDisplay) return;
    const display = this.ui.stationDisplay;
    display.dataset.state = state;
    if (station) {
      display.dataset.band = station.band;
    } else {
      display.dataset.band = this.band.name;
    }

    if (state === 'locked' && station) {
      const freq = formatFrequency(station.frequency, BANDS[station.band]);
      const location = station.location ? ` • ${station.location}` : '';
      display.textContent = `Locked: ${freq} • ${station.name}${location}`;
      return;
    }

    if (state === 'buffering' && station) {
      const freq = formatFrequency(station.frequency, BANDS[station.band]);
      display.textContent = `Buffering ${freq} • ${station.name}`;
      return;
    }

    if (state === 'error') {
      display.textContent = message || 'Station unavailable';
      return;
    }

    if (state === 'armed' && station) {
      const freq = formatFrequency(station.frequency, BANDS[station.band]);
      display.textContent = `Tuning ${freq} • ${station.name}`;
      return;
    }

    display.textContent = message || 'Scanning…';
  }

  handleStationError(error, station = this.currentStation) {
    if (!station) {
      this.updateStationDisplay('error', null, typeof error === 'string' ? error : 'Stream error');
      return;
    }
    const { text: errorText, suppressCooldown } = (() => {
      if (!error) {
        return { text: 'Stream unavailable', suppressCooldown: false };
      }
      const value = typeof error === 'string' ? error : error.message || error.name;
      if (typeof value === 'number') {
        return { text: `Stream error code ${value}`, suppressCooldown: false };
      }
      if (/NotAllowedError/i.test(value)) {
        return { text: 'Playback blocked — tap or press a key to enable audio', suppressCooldown: true };
      }
      return { text: value, suppressCooldown: false };
    })();

    if (!suppressCooldown) {
      this.stationCooldowns.set(station.id, Date.now());
    }
    this.updateStationDisplay('error', station, errorText);
    this.notifyStationEvent('station-error', station, { error: errorText });
    this.releaseStation({ silent: true });
    if (this.errorResetTimer) {
      clearTimeout(this.errorResetTimer);
    }
    this.errorResetTimer = setTimeout(() => {
      this.updateStationDisplay('scan');
      this.errorResetTimer = null;
    }, 2200);
  }

  findNearestStation() {
    if (!this.availableStations.length) return null;
    const threshold = this.stationThreshold;
    let candidate = null;
    let delta = Number.POSITIVE_INFINITY;
    const now = Date.now();

    this.availableStations.forEach((station) => {
      const cooldownAt = this.stationCooldowns.get(station.id);
      if (cooldownAt && now - cooldownAt < STATION_RETRY_DELAY) {
        return;
      }
      const diff = Math.abs(station.frequency - this.frequency);
      if (diff < delta) {
        candidate = station;
        delta = diff;
      }
    });

    if (candidate && delta <= threshold) {
      return candidate;
    }
    return null;
  }

  armStation(station) {
    if (!station) return;
    this.pendingStationId = station.id;
    this.lockNotificationSent = false;
    if (this.audioElement.src !== station.stream) {
      this.audioElement.src = station.stream;
      this.audioElement.load();
    }
    this.updateStationDisplay('armed', station);
    this.notifyStationEvent('station-arming', station);
    const playPromise = this.audioElement.play();
    if (playPromise && typeof playPromise.then === 'function') {
      playPromise
        .then(() => {
          this.confirmStationLock(station);
        })
        .catch((err) => this.handleStationError(err, station));
    } else {
      this.confirmStationLock(station);
    }
  }

  releaseStation({ flush = false, silent = false } = {}) {
    if (this.currentStation && !silent) {
      this.notifyStationEvent('station-lost', this.currentStation);
    }
    this.currentStation = null;
    this.pendingStationId = null;
    this.lockNotificationSent = false;
    if (this.errorResetTimer) {
      clearTimeout(this.errorResetTimer);
      this.errorResetTimer = null;
    }
    this.audioElement.pause();
    if (flush) {
      this.audioElement.removeAttribute('src');
      this.audioElement.load();
    }
    if (!silent) {
      this.updateStationDisplay('scan');
    }
  }

  syncStationLock() {
    const station = this.findNearestStation();
    if (station && (!this.currentStation || this.currentStation.id !== station.id)) {
      this.currentStation = station;
      this.armStation(station);
      return;
    }

    if (!station && (this.currentStation || this.pendingStationId)) {
      this.releaseStation();
    }
  }

  confirmStationLock(station) {
    if (!station || !this.currentStation || station.id !== this.currentStation.id) return;
    if (this.lockNotificationSent) return;
    if (this.pendingStationId && this.pendingStationId !== station.id) return;
    this.lockNotificationSent = true;
    this.pendingStationId = null;
    this.updateStationDisplay('locked', station);
    this.notifyStationEvent('station-locked', station);
  }

  async initNoise(noiseBuffer) {
    if (!audioContext) {
      await ensureAudioContext();
    }
    if (this.noiseSource) {
      try {
        this.noiseSource.stop();
      } catch (err) {
        // ignored
      }
      this.noiseSource.disconnect();
    }
    this.noiseSource = this.context.createBufferSource();
    this.noiseSource.buffer = noiseBuffer;
    this.noiseSource.loop = true;
    this.noiseSource.connect(this.filter);
    if (this.context.state === 'suspended') {
      await this.context.resume();
    }
    this.noiseSource.start();
  }

  setNoiseType(buffer) {
    this.initNoise(buffer).catch((err) => console.error(err));
  }

  setBand(band) {
    if (this.band !== band) {
      this.band = band;
    }
    this.availableStations = getStationsForBand(this.band.name);
    this.stationThreshold = STATION_THRESHOLD[this.band.name];
    this.releaseStation({ flush: true });
    this.frequency = band.min;
    this.filter.Q.value = band.unit === 'MHz' ? 5 : 10;
    this.filter.frequency.value = mapToFilterFrequency(this.frequency, this.band);
    this.ui.frequencyDisplay.textContent = formatFrequency(this.frequency, this.band);
    this.updateStationDisplay('scan');
    this.syncStationLock();
  }

  refreshStationList() {
    this.availableStations = getStationsForBand(this.band.name);
    const stillPresent = this.currentStation
      ? this.availableStations.some((station) => station.id === this.currentStation.id)
      : false;
    if (this.currentStation && !stillPresent) {
      this.releaseStation({ flush: true });
    }
    if (!this.availableStations.length) {
      this.updateStationDisplay('error', null, 'No stations loaded for this band');
      return;
    }
    this.updateStationDisplay('scan');
    this.syncStationLock();
  }

  setTemperatureDrift(drift) {
    this.temperatureDrift = drift;
  }

  setSweepRate(rate) {
    this.sweepRate = clamp(rate, SWEEP_MIN, SWEEP_MAX);
    if (this.sweepTimer) {
      this.startSweep();
    }
  }

  updateFrequency() {
    const driftMultiplier = 1 + this.temperatureDrift * 0.02;
    const step = this.band.step * driftMultiplier;
    this.frequency += step * this.sweepDirection;
    if (this.frequency > this.band.max) {
      this.frequency = this.band.min;
    }
    if (this.frequency < this.band.min) {
      this.frequency = this.band.max;
    }
    this.filter.frequency.value = mapToFilterFrequency(this.frequency, this.band);
    this.ui.frequencyDisplay.textContent = formatFrequency(this.frequency, this.band);
    this.syncStationLock();
  }

  startSweep() {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
    }
    this.syncStationLock();
    this.sweepTimer = setInterval(() => {
      this.updateFrequency();
    }, this.sweepRate);
  }

  drawWaveform() {
    const canvas = this.element.querySelector('.waveform');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const draw = () => {
      requestAnimationFrame(draw);
      this.analyser.getByteTimeDomainData(this.waveformArray);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#6bd1ff';
      ctx.beginPath();
      const sliceWidth = (canvas.width * 1.0) / this.waveformArray.length;
      let x = 0;
      for (let i = 0; i < this.waveformArray.length; i += 1) {
        const v = this.waveformArray[i] / 128.0;
        const y = (v * canvas.height) / 2;
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
        x += sliceWidth;
      }
      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
    };
    draw();
  }

  drawSignalMeter() {
    const bar = this.element.querySelector('.signal-bar');
    if (!bar) return;
    const update = () => {
      requestAnimationFrame(update);
      this.analyser.getByteFrequencyData(this.signalArray);
      const avg = this.signalArray.reduce((sum, value) => sum + value, 0) / this.signalArray.length;
      const normalized = clamp((avg / 255) * 100, 5, 100);
      bar.style.width = `${normalized}%`;
    };
    update();
  }

  getSettings() {
    return {
      band: this.band.name,
      frequency: this.frequency,
      sweepRate: this.sweepRate,
      direction: this.sweepDirection === 1 ? 'forward' : 'reverse',
      volume: this.gain.gain.value
    };
  }
}

class StaticBed {
  constructor(context, destination) {
    this.context = context;
    this.destination = destination;
    this.gain = context.createGain();
    this.gain.gain.value = 0.4;
    this.gain.connect(this.destination);
    this.buffer = createNoiseBuffer(context, 'white');
    this.source = null;
    this.enabled = true;
    this.type = 'white';
  }

  async init() {
    if (this.source) {
      try {
        this.source.stop();
      } catch (err) {
        // ignore
      }
      this.source.disconnect();
    }
    this.source = this.context.createBufferSource();
    this.source.buffer = this.buffer;
    this.source.loop = true;
    this.source.connect(this.gain);
    if (this.context.state === 'suspended') {
      await this.context.resume();
    }
    this.source.start(0);
  }

  async setType(type) {
    this.type = type;
    this.buffer = createNoiseBuffer(this.context, type);
    await this.init();
  }

  setLevel(value) {
    this.gain.gain.value = clamp(value, 0, 1);
  }

  toggle(state) {
    this.enabled = state;
    this.gain.gain.value = state ? this.gain.gain.value || 0.4 : 0;
  }
}

class VoxRecorder {
  constructor() {
    this.supported = typeof window !== 'undefined'
      && 'MediaRecorder' in window
      && navigator.mediaDevices
      && typeof navigator.mediaDevices.getUserMedia === 'function';
    this.stream = null;
    this.mediaRecorder = null;
    this.recordings = [];
    this.isRecording = false;
    this.voxEnabled = false;
    this.thresholdDb = -50;
    this.releaseTimeout = null;
    this.monitoring = false;
    this.audioElement = new Audio();
    this.audioElement.controls = false;
    this.currentBlob = null;
  }

  async init() {
    if (!this.supported) {
      throw new Error('MediaRecorder API is not available in this environment.');
    }
    if (!this.stream) {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(this.stream);
      this.chunks = [];
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.chunks.push(event.data);
        }
      };
      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: 'audio/webm' });
        this.chunks = [];
        this.currentBlob = blob;
        const recording = {
          blob,
          url: URL.createObjectURL(blob),
          createdAt: new Date(),
          settings: this.captureSnapshot()
        };
        this.recordings.push(recording);
        this.onRecordingComplete?.(recording);
      };

      this.context = audioContext || new AudioContext();
      this.source = this.context.createMediaStreamSource(this.stream);
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 2048;
      this.dataArray = new Float32Array(this.analyser.fftSize);
      this.source.connect(this.analyser);
    }
  }

  captureSnapshot() {
    return {
      thresholdDb: this.thresholdDb,
      voxEnabled: this.voxEnabled
    };
  }

  async startManual() {
    if (!this.supported) return;
    await this.init();
    if (this.mediaRecorder && this.mediaRecorder.state === 'inactive') {
      this.mediaRecorder.start();
      this.isRecording = true;
    }
  }

  stopManual() {
    if (!this.supported) return;
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
      this.isRecording = false;
    }
  }

  toggleVox(enabled) {
    if (!this.supported) return;
    this.voxEnabled = enabled;
    if (enabled) {
      this.startMonitoring();
    } else {
      this.stopMonitoring();
    }
  }

  setThreshold(dbValue) {
    this.thresholdDb = dbValue;
  }

  startMonitoring() {
    if (!this.supported) return;
    if (this.monitoring) return;
    this.monitoring = true;
    const detect = async () => {
      if (!this.voxEnabled) {
        this.monitoring = false;
        return;
      }
      if (!this.stream) {
        await this.init();
      }
      this.analyser.getFloatTimeDomainData(this.dataArray);
      let sumSquares = 0;
      for (let i = 0; i < this.dataArray.length; i += 1) {
        sumSquares += this.dataArray[i] * this.dataArray[i];
      }
      const rms = Math.sqrt(sumSquares / this.dataArray.length) || 0.00001;
      const db = 20 * Math.log10(rms);
      if (db > this.thresholdDb) {
        clearTimeout(this.releaseTimeout);
        if (!this.isRecording) {
          await this.startManual();
        }
      } else if (this.isRecording) {
        clearTimeout(this.releaseTimeout);
        this.releaseTimeout = setTimeout(() => {
          this.stopManual();
        }, 1200);
      }
      requestAnimationFrame(detect);
    };
    detect();
  }

  stopMonitoring() {
    this.monitoring = false;
    clearTimeout(this.releaseTimeout);
  }

  playLatest() {
    if (!this.supported) return;
    if (this.currentBlob) {
      this.audioElement.src = URL.createObjectURL(this.currentBlob);
      this.audioElement.play();
    }
  }

  setPlaybackRate(offset) {
    if (!this.supported) return 1;
    const rate = clamp(1 + offset, 0.25, 2);
    this.audioElement.playbackRate = rate;
    return rate;
  }
}

class SessionManager {
  constructor(listElement) {
    this.listElement = listElement;
    this.key = 'itc-session-log';
    this.entries = this.load();
    this.render();
  }

  load() {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return [];
      return JSON.parse(raw);
    } catch (err) {
      console.warn('Failed to parse session log', err);
      return [];
    }
  }

  save() {
    try {
      localStorage.setItem(this.key, JSON.stringify(this.entries));
    } catch (err) {
      console.warn('Unable to persist session log', err);
    }
  }

  add(entry) {
    this.entries.unshift(entry);
    this.save();
    this.render();
  }

  render() {
    if (!this.listElement) return;
    this.listElement.innerHTML = '';
    this.entries.forEach((entry) => {
      const li = document.createElement('li');
      const meta = document.createElement('div');
      meta.innerHTML = `<strong>${entry.timestamp}</strong><br/>Channel 1: ${entry.channels[0].band} @ ${formatFrequency(entry.channels[0].frequency, BANDS[entry.channels[0].band])}<br/>Channel 2: ${entry.channels[1].band} @ ${formatFrequency(entry.channels[1].frequency, BANDS[entry.channels[1].band])}`;
      const settings = document.createElement('div');
      settings.className = 'session-meta';
      settings.textContent = `Temp Drift: ${entry.temperature}°, Static: ${entry.staticLevel}, Noise: ${entry.staticType}, VOX Threshold: ${entry.voxThreshold} dB`;
      li.append(meta, settings);
      this.listElement.appendChild(li);
    });
  }
}

class SpiritScanner {
  constructor() {
    this.channels = [];
    this.temperature = 0;
    this.staticBed = null;
    this.voxRecorder = new VoxRecorder();
    this.sessionManager = new SessionManager(document.querySelector('.session-log'));
    this.statusElement = document.querySelector('.status-message');
    this.statusPanel = document.querySelector('.status-panel');
    this.providerStatusElement = document.getElementById('provider-status');
    this.init();
  }

  setStatus(message, variant = 'info') {
    if (!this.statusElement) return;
    this.statusElement.textContent = message;
    if (this.statusPanel) {
      if (variant === 'info') {
        delete this.statusPanel.dataset.variant;
      } else {
        this.statusPanel.dataset.variant = variant;
      }
    }
  }

  appendStatus(message, variant = 'info') {
    if (!this.statusElement) return;
    const current = this.statusElement.textContent.trim();
    const combined = current ? `${current} ${message}` : message;
    this.statusElement.textContent = combined;
    if (variant === 'warning' && this.statusPanel) {
      this.statusPanel.dataset.variant = 'warning';
    }
  }

  handleStationEvent(event) {
    const channelLabel = event.channel ? `Channel ${event.channel}` : 'Channel';
    if (event.type === 'station-locked' && event.station) {
      const freq = formatFrequency(event.station.frequency, BANDS[event.station.band]);
      this.setStatus(`${channelLabel} locked on ${event.station.name} (${freq})`);
      return;
    }

    if (event.type === 'station-lost') {
      this.setStatus(`${channelLabel} scanning for the next signal.`);
      return;
    }

    if (event.type === 'station-error' && event.station) {
      const freq = formatFrequency(event.station.frequency, BANDS[event.station.band]);
      this.setStatus(
        `${channelLabel} stream issue on ${event.station.name} (${freq}): ${event.error}`,
        'warning'
      );
      return;
    }

    if (event.type === 'station-arming' && event.station) {
      const freq = formatFrequency(event.station.frequency, BANDS[event.station.band]);
      this.setStatus(`${channelLabel} tuning ${event.station.name} (${freq})`);
    }
  }

  async init() {
    await ensureAudioContext();
    this.setStatus(
      'Audio context ready. Sweeps lock onto curated live AM/FM streams and fall back to static texture between stations.'
    );
    this.masterGain = audioContext.createGain();
    this.masterGain.gain.value = 0.9;
    this.masterGain.connect(audioContext.destination);

    this.staticBed = new StaticBed(audioContext, this.masterGain);
    await this.staticBed.init();

    if (!this.voxRecorder.supported) {
      this.appendStatus(
        'Microphone capture or MediaRecorder support is unavailable, so VOX and manual recording controls are disabled.',
        'warning'
      );
    }

    const channelElements = document.querySelectorAll('.channel');
    channelElements.forEach((element) => {
      const channel = new SweepChannel(audioContext, element, {
        destination: this.masterGain,
        onStationEvent: (event) => this.handleStationEvent(event)
      });
      channel.startSweep();
      channel.initNoise(createNoiseBuffer(audioContext, 'white')).catch((err) => console.error(err));
      this.channels.push(channel);
    });

    this.bindProviderControls();
    this.bindTemperatureControls();
    this.bindStaticControls();
    this.bindRecordingControls();
    this.bindSessionControls();
  }

  bindProviderControls() {
    const providerRadios = document.querySelectorAll('input[name="station-provider"]');
    const radioBrowserControls = document.querySelector('.radio-browser-controls');
    const searchButton = document.getElementById('station-search');
    const queryInput = document.getElementById('station-query');
    const countryInput = document.getElementById('station-country');
    const statusElement = this.providerStatusElement;

    if (!providerRadios.length && !radioBrowserControls && !searchButton && !statusElement) {
      return;
    }

    const updateProviderStatus = (message, state = 'info') => {
      if (!statusElement) return;
      statusElement.textContent = message;
      statusElement.dataset.state = state;
    };

    const describeMeta = (meta = getActiveStationMeta()) => {
      if (!statusElement) return;
      const pieces = [];
      if (meta.label) {
        pieces.push(meta.label);
      }
      if (meta.query) {
        pieces.push(`Query: ${meta.query}`);
      }
      pieces.push(`${meta.total} stations`);
      if (meta.rawCount && meta.rawCount !== meta.total) {
        pieces.push(`Filtered from ${meta.rawCount}`);
      }
      updateProviderStatus(pieces.join(' • '), 'ready');
    };

    const ensureCuratedBank = () => {
      const current = getActiveStationMeta();
      if (current.id === 'curated') {
        describeMeta(current);
        return;
      }
      try {
        const meta = setActiveStationBank(CURATED_STATIONS, {
          id: 'curated',
          label: 'Curated preset bank'
        });
        describeMeta(meta);
        this.appendStatus('Curated preset bank active for both channels.');
      } catch (err) {
        updateProviderStatus(`Unable to load curated presets: ${err.message}`, 'error');
      }
    };

    const getSelectedProvider = () => {
      const checked = document.querySelector('input[name="station-provider"]:checked');
      return checked ? checked.value : 'curated';
    };

    const reflectProviderVisibility = () => {
      const selected = getSelectedProvider();
      if (radioBrowserControls) {
        radioBrowserControls.hidden = selected !== 'radio-browser';
      }
      if (selected === 'curated') {
        ensureCuratedBank();
      } else if (selected === 'radio-browser') {
        updateProviderStatus('Enter a query and fetch live stations from Radio Browser.', 'info');
      }
    };

    providerRadios.forEach((radio) => {
      radio.addEventListener('change', reflectProviderVisibility);
    });

    const performSearch = async () => {
      if (getSelectedProvider() !== 'radio-browser') {
        return;
      }
      const query = queryInput?.value.trim() || '';
      const country = (countryInput?.value || '').trim().toUpperCase();
      updateProviderStatus('Requesting stations from Radio Browser…', 'loading');
      if (searchButton) {
        searchButton.disabled = true;
      }
      try {
        const result = await queryRadioBrowser({ query, countryCode: country, limit: 80 });
        if (!result.bank.total) {
          throw new Error('No stations matched the search terms.');
        }
        const meta = setActiveStationBank(result.stations, {
          id: 'radio-browser',
          label: country ? `Radio Browser • ${country}` : 'Radio Browser search',
          query,
          rawCount: result.rawCount
        });
        describeMeta(meta);
        this.setStatus(`Live station bank updated via Radio Browser with ${meta.total} playable streams.`);
      } catch (err) {
        console.error('Radio Browser search failed', err);
        updateProviderStatus(`Radio Browser request failed: ${err.message || err}`, 'error');
        this.appendStatus('Radio Browser lookup failed—restoring curated presets.', 'warning');
        const curatedRadio = document.querySelector('input[name="station-provider"][value="curated"]');
        if (curatedRadio) {
          curatedRadio.checked = true;
        }
        reflectProviderVisibility();
      } finally {
        if (searchButton) {
          searchButton.disabled = false;
        }
      }
    };

    if (searchButton) {
      searchButton.addEventListener('click', (event) => {
        event.preventDefault();
        performSearch();
      });
    }

    if (queryInput) {
      queryInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          performSearch();
        }
      });
    }

    if (countryInput) {
      countryInput.addEventListener('input', () => {
        countryInput.value = countryInput.value.toUpperCase().slice(0, 3);
      });
    }

    describeMeta();
    reflectProviderVisibility();
  }

  bindTemperatureControls() {
    const buttons = document.querySelectorAll('.temp-adjust');
    const display = document.querySelector('.temp-display');
    const reset = document.querySelector('.temp-reset');

    const update = () => {
      display.textContent = `${this.temperature}°`;
      this.channels.forEach((channel) => channel.setTemperatureDrift(this.temperature / 5));
    };

    buttons.forEach((button) => {
      button.addEventListener('click', () => {
        const adjust = Number(button.dataset.adjust);
        this.temperature = clamp(this.temperature + adjust, -5, 5);
        update();
      });
    });

    reset.addEventListener('click', () => {
      this.temperature = 0;
      update();
    });

    update();
  }

  bindStaticControls() {
    const toggle = document.getElementById('static-toggle');
    const level = document.getElementById('static-level');
    const noiseRadios = document.querySelectorAll('input[name="noise-type"]');

    toggle.addEventListener('change', () => {
      const enabled = toggle.checked;
      if (enabled) {
        this.staticBed.setLevel(Number(level.value));
      } else {
        this.staticBed.setLevel(0);
      }
    });

    level.addEventListener('input', () => {
      if (!toggle.checked) return;
      this.staticBed.setLevel(Number(level.value));
    });

    noiseRadios.forEach((radio) => {
      radio.addEventListener('change', () => {
        if (radio.checked) {
          this.staticBed.setType(radio.value).catch((err) => console.error(err));
        }
      });
    });
  }

  bindRecordingControls() {
    const recordBtn = document.getElementById('record');
    const stopBtn = document.getElementById('stop');
    const playBtn = document.getElementById('play');
    const pauseBtn = document.getElementById('pause');
    const rewindBtn = document.getElementById('rewind');
    const forwardBtn = document.getElementById('forward');
    const voxToggle = document.getElementById('vox-toggle');
    const voxThreshold = document.getElementById('vox-threshold');
    const recordingsList = document.querySelector('.recordings-list');
    const speedSlider = document.getElementById('playback-speed');
    const speedLabel = document.querySelector('.speed-label');

    const updateTransportState = (isRecording) => {
      stopBtn.disabled = !isRecording;
      recordBtn.disabled = isRecording;
    };

    const controls = [recordBtn, stopBtn, playBtn, pauseBtn, rewindBtn, forwardBtn, voxToggle];

    if (!this.voxRecorder.supported) {
      controls.forEach((button) => {
        button.disabled = true;
        if (button === voxToggle) {
          button.classList.remove('active');
        }
      });
      speedSlider.disabled = true;
      speedLabel.textContent = 'Unavailable';
      return;
    }

    this.voxRecorder.onRecordingComplete = (recording) => {
      playBtn.disabled = false;
      pauseBtn.disabled = false;
      rewindBtn.disabled = false;
      forwardBtn.disabled = false;
      const li = document.createElement('li');
      const label = document.createElement('span');
      label.textContent = `${recording.createdAt.toLocaleTimeString()} — ${Math.round(recording.blob.size / 1024)}kb`;
      const play = document.createElement('button');
      play.textContent = 'Play';
      play.addEventListener('click', () => {
        const audio = new Audio(recording.url);
        audio.play();
      });
      li.append(label, play);
      recordingsList.prepend(li);
    };

    recordBtn.addEventListener('click', async () => {
      try {
        await this.voxRecorder.startManual();
        updateTransportState(true);
      } catch (err) {
        console.error('Unable to start manual recording', err);
        this.appendStatus('Unable to start recording—check microphone permissions and input routing.', 'warning');
      }
    });

    stopBtn.addEventListener('click', () => {
      this.voxRecorder.stopManual();
      updateTransportState(false);
    });

    playBtn.addEventListener('click', () => {
      this.voxRecorder.playLatest();
    });

    pauseBtn.addEventListener('click', () => {
      this.voxRecorder.audioElement.pause();
    });

    rewindBtn.addEventListener('click', () => {
      this.voxRecorder.audioElement.currentTime = Math.max(0, this.voxRecorder.audioElement.currentTime - 5);
    });

    forwardBtn.addEventListener('click', () => {
      this.voxRecorder.audioElement.currentTime = Math.min(this.voxRecorder.audioElement.duration, this.voxRecorder.audioElement.currentTime + 5);
    });

    voxToggle.addEventListener('click', async () => {
      try {
        await this.voxRecorder.init();
        const enabled = !this.voxRecorder.voxEnabled;
        this.voxRecorder.toggleVox(enabled);
        voxToggle.textContent = enabled ? 'Disable VOX' : 'Enable VOX';
        voxToggle.classList.toggle('active', enabled);
      } catch (err) {
        console.error('Failed to initialise VOX recorder', err);
        this.appendStatus('Microphone access was blocked, so VOX remains disabled.', 'warning');
      }
    });

    voxThreshold.addEventListener('input', () => {
      const value = Number(voxThreshold.value);
      this.voxRecorder.setThreshold(value);
    });

    speedSlider.addEventListener('input', () => {
      const offset = Number(speedSlider.value);
      const rate = this.voxRecorder.setPlaybackRate(offset);
      if (Math.abs(rate - 1) < 0.01) {
        speedLabel.textContent = 'Normal';
      } else {
        speedLabel.textContent = `${rate.toFixed(2)}x`;
      }
    });
  }

  bindSessionControls() {
    const saveButton = document.getElementById('save-session');
    saveButton.addEventListener('click', () => {
      const entry = {
        timestamp: new Date().toLocaleString(),
        channels: this.channels.map((channel) => ({
          band: channel.band === BANDS.FM ? 'FM' : 'AM',
          frequency: channel.frequency,
          sweepRate: channel.sweepRate,
          direction: channel.sweepDirection
        })),
        temperature: this.temperature,
        staticLevel: document.getElementById('static-level').value,
        staticType: document.querySelector('input[name="noise-type"]:checked').value,
        voxThreshold: document.getElementById('vox-threshold').value
      };
      this.sessionManager.add(entry);
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if ('AudioContext' in window || 'webkitAudioContext' in window) {
    new SpiritScanner();
  } else {
    alert('Web Audio API is not supported in this browser.');
  }
});
