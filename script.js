// --- CONFIG ---
const KEY_MAP = {
    'a': 'C4', 'w': 'C#4', 's': 'D4', 'e': 'D#4', 'd': 'E4', 'f': 'F4',
    't': 'F#4', 'g': 'G4', 'y': 'G#4', 'h': 'A4', 'u': 'A#4', 'j': 'B4', 'k': 'C5'
};

const NOTE_FREQS = {
    'C4': 261.63, 'C#4': 277.18, 'D4': 293.66, 'D#4': 311.13, 'E4': 329.63,
    'F4': 349.23, 'F#4': 369.99, 'G4': 392.00, 'G#4': 415.30, 'A4': 440.00,
    'A#4': 466.16, 'B4': 493.88, 'C5': 523.25
};

// --- CLASSES ---

class AudioEngine {
    constructor(app) {
        this.app = app;
        this.ctx = null;
        this.masterGain = null;
        this.micNode = null;
        this.synthBus = null;
        this.recordDest = null;
        this.analyser = null;
        this.initialized = false;
    }

    async init() {
        if (this.initialized) return;
        
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();
        
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.8;
        this.masterGain.connect(this.ctx.destination);

        // Busses
        this.synthBus = this.ctx.createGain();
        this.synthBus.connect(this.masterGain);

        this.recordDest = this.ctx.createMediaStreamDestination();
        this.synthBus.connect(this.recordDest); // Record synth

        // Analyser for VU
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 256;
        
        // Connect sources to Analyser for visualization
        this.synthBus.connect(this.analyser);

        this.initialized = true;
        
        if (this.ctx.state === 'suspended') await this.ctx.resume();
        
        console.log("Audio Engine Ready");
        this.setupMic(); // Async
        this.metricLoop();
    }

    /**
     * Request Microphone access and connect nodes.
     */
    async setupMic() {
        try {
            // Check Permissions first?
            const stream = await navigator.mediaDevices.getUserMedia({ audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false
            }});
            this.micNode = this.ctx.createMediaStreamSource(stream);
            
            // Connect Mic to Record Dest (for recording)
            this.micNode.connect(this.recordDest);
            
            // Connect Mic to Analyser (for VU Meter)
            this.micNode.connect(this.analyser);
            
            console.log("Mic Connected");
        } catch (err) {
            console.error("Mic Error:", err);
            alert("Microphone Access Required for Recording!");
        }
    }

    metricLoop() {
        if (!this.analyser) return;
        const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        const draw = () => {
            requestAnimationFrame(draw);
            this.analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for(let i=0; i<dataArray.length;i++) sum+=dataArray[i];
            const avg = sum / dataArray.length;
            
            // UI Update
            const meter = document.getElementById('vu-meter');
            if (meter) {
                // simple volume based width
                const width = Math.min(100, avg * 1.5);
                meter.style.width = width + '%';
                meter.style.opacity = width > 5 ? 1 : 0.3;
            }
        };
        draw();
    }
}

class Synthesizer {
    constructor(engine) {
        this.engine = engine;
        this.activeOscillators = {};
        this.mode = 'synth'; // 'synth' or 'drums'
    }

    setMode(mode) {
        this.mode = mode;
        // Visual Update of keys? handled by app
    }

    playNote(note) {
        if (!this.engine.initialized) return;
        
        if (this.mode === 'drums') {
            this.playDrum(note);
            this.highlightKey(note, true);
            setTimeout(() => this.highlightKey(note, false), 100);
            return;
        }

        if (this.activeOscillators[note]) return;

        const ctx = this.engine.ctx;
        const freq = NOTE_FREQS[note];

        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, ctx.currentTime);

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.Q.value = 5;
        filter.frequency.setValueAtTime(600, ctx.currentTime);
        filter.frequency.exponentialRampToValueAtTime(4000, ctx.currentTime + 0.1);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.5);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.engine.synthBus);

        osc.start();
        this.activeOscillators[note] = { osc, gain, filter };
        
        this.highlightKey(note, true);
    }

    stopNote(note) {
        if (!this.engine.initialized || this.mode === 'drums') return;
        const active = this.activeOscillators[note];
        if (!active) return;

        const ctx = this.engine.ctx;
        const { osc, gain } = active;

        gain.gain.cancelScheduledValues(ctx.currentTime);
        gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
        osc.stop(ctx.currentTime + 0.1);

        delete this.activeOscillators[note];
        this.highlightKey(note, false);
    }

    playDrum(note) {
        // Simple Mapping
        // C4, C#4, D4...
        // Kick: C4, Snare: D4, Hat: E4...
        const ctx = this.engine.ctx;
        const t = ctx.currentTime;
        
        if (note.includes('C')) { // Kick (Any C)
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.frequency.setValueAtTime(150, t);
            osc.frequency.exponentialRampToValueAtTime(0.01, t + 0.5);
            gain.gain.setValueAtTime(1, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.5);
            osc.connect(gain).connect(this.engine.synthBus);
            osc.start(t);
            osc.stop(t + 0.5);
        } else if (note.includes('D')) { // Snare
             const noise = ctx.createBufferSource();
             const buffer = ctx.createBuffer(1, ctx.sampleRate * 1, ctx.sampleRate);
             const data = buffer.getChannelData(0);
             for(let i=0; i<data.length; i++) data[i] = Math.random() * 2 - 1;
             noise.buffer = buffer;
             
             const filter = ctx.createBiquadFilter();
             filter.type = 'highpass';
             filter.frequency.value = 1000;
             
             const gain = ctx.createGain();
             gain.gain.setValueAtTime(0.8, t);
             gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
             
             noise.connect(filter).connect(gain).connect(this.engine.synthBus);
             noise.start(t);
        } else if (note.includes('E') || note.includes('F')) { // HiHat
             const osc = ctx.createOscillator(); // Square for metallic
             osc.type = 'square';
             osc.frequency.setValueAtTime(800, t); // Metallic clang
             
             // Or noise again
             const noise = ctx.createBufferSource();
             const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate);
             const data = buffer.getChannelData(0);
             for(let i=0; i<data.length; i++) data[i] = Math.random() * 2 - 1;
             noise.buffer = buffer;
             
             const filter = ctx.createBiquadFilter();
             filter.type = 'highpass';
             filter.frequency.value = 5000;
             
             const gain = ctx.createGain();
             gain.gain.setValueAtTime(0.3, t);
             gain.gain.exponentialRampToValueAtTime(0.01, t + 0.05);
             
             noise.connect(filter).connect(gain).connect(this.engine.synthBus);
             noise.start(t);
        }
    }

    highlightKey(note, isActive) {
        const btn = document.querySelector(`button[data-note="${note}"]`);
        if (btn) {
            if (isActive) btn.classList.add('active');
            else btn.classList.remove('active');
        }
    }
}

class Metronome {
    constructor(engine) {
        this.engine = engine;
        this.isPlaying = false;
        this.bpm = 120;
        this.nextNoteTime = 0.0;
        this.timerID = null;
        this.lookahead = 25.0;
        this.scheduleAheadTime = 0.1;
    }
    
    toggle() {
        this.isPlaying = !this.isPlaying;
        if (this.isPlaying) {
            this.engine.ctx.resume();
            this.nextNoteTime = this.engine.ctx.currentTime;
            this.scheduler();
            return true; // Playing
        } else {
            clearTimeout(this.timerID);
            return false; // Stopped
        }
    }
    
    scheduler() {
        while (this.nextNoteTime < this.engine.ctx.currentTime + this.scheduleAheadTime) {
            this.scheduleNote(this.nextNoteTime);
            this.nextNote();
        }
        this.timerID = setTimeout(()=>this.scheduler(), this.lookahead);
    }
    
    scheduleNote(time) {
        const osc = this.engine.ctx.createOscillator();
        const gain = this.engine.ctx.createGain();
        osc.frequency.value = 1000;
        gain.gain.value = 0.5;
        
        osc.connect(gain).connect(this.engine.masterGain); // Metronome goes to Master, NOT record (usually)
        // But if user wants to record CLICK? Let's keep it separate for now (just monitoring).
        
        osc.start(time);
        osc.stop(time + 0.05);
        
        // Visual
        const diff = time - this.engine.ctx.currentTime;
        setTimeout(() => {
            const el = document.getElementById('btn-metronome');
            if (el) {
                el.classList.add('bg-white');
                setTimeout(() => el.classList.remove('bg-white'), 100);
            }
        }, diff * 1000);
    }
    
    nextNote() {
        const secondsPerBeat = 60.0 / this.bpm;
        this.nextNoteTime += secondsPerBeat;
    }
}

class InputManager {
    constructor(app) {
        this.app = app;
        this.midiAccess = null;
    }

    async init() {
        // MIDI Initialization
        if (navigator.requestMIDIAccess) {
            try {
                this.midiAccess = await navigator.requestMIDIAccess();
                this.updateIndicator('midi', true);
                
                this.midiAccess.inputs.forEach(input => {
                    input.onmidimessage = (m) => this.onMIDIMessage(m);
                });
                
                this.midiAccess.onstatechange = (e) => {
                     if (e.port.type === 'input' && e.port.state === 'connected') {
                         e.port.onmidimessage = (m) => this.onMIDIMessage(m);
                     }
                };
            } catch(e) {
                console.log("MIDI Fail", e);
                this.updateIndicator('midi', false);
            }
        }
    }

    /**
     * Update UI indicators for Hardware/Features
     */
    updateIndicator(type, active) {
        const el = document.getElementById(`ind-${type}`);
        if (!el) return;
        if (active) {
            el.classList.remove('bg-gray-800', 'text-gray-600');
            el.classList.add('bg-upsideDown-red', 'text-white');
            
            el.innerText = 'MIDI ON';
            el.style.textShadow = "0 0 5px currentColor";
        } else {
             el.className = "px-4 py-1 rounded-full text-xs font-bold tracking-widest bg-gray-800 text-gray-600";
             el.innerText = 'NO MIDI';
             el.style.textShadow = "none";
        }
    }

    onMIDIMessage(msg) {
        const [status, data1, data2] = msg.data;
        const cmd = status & 0xF0;
        
        if (cmd === 0x90 && data2 > 0) {
            const note = this.midiNoteToName(data1);
            if (note) this.app.synth.playNote(note);
        } else if (cmd === 0x80 || (cmd === 0x90 && data2 === 0)) {
            const note = this.midiNoteToName(data1);
            if (note) this.app.synth.stopNote(note);
        } else if (cmd === 0xB0 && data1 === 64 && data2 > 64) {
            this.app.looper.toggleRecord(this.app.selectedSlot);
        }
    }

    midiNoteToName(midi) {
        const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const octave = Math.floor(midi / 12) - 1;
        const note = names[midi % 12];
        if (midi >= 60 && midi <= 72) return note + octave;
        return null;
    }


}

class LoopStation {
    constructor(app) {
        this.app = app;
        this.slots = [new LoopSlot(0, app), new LoopSlot(1, app), new LoopSlot(2, app)];
    }

    toggleRecord(idx) {
        this.slots.forEach((s, i) => { 
            if (i !== idx && s.state === 'recording') s.stopRecording(); 
        });
        this.slots[idx].toggle();
    }
    
    stopAll() { this.slots.forEach(s => s.stop()); }
    playAll() { this.slots.forEach(s => s.play()); }
}

class LoopSlot {
    constructor(index, app) {
        this.index = index;
        this.app = app;
        this.state = 'empty';
        this.chunks = [];
        this.audioUrl = null;
        this.audioEl = new Audio();
        this.audioEl.loop = true;
        this.gainNode = null;
        
        this.bindUI();
    }

    bindUI() {
        const id = `slot-${this.index + 1}`;
        this.ui = {
            card: document.getElementById(id),
            status: document.querySelector(`#${id} .status-dot`),
            emptyText: document.querySelector(`#${id} .empty-text`),
            slider: document.querySelector(`#${id} input`)
        };

        this.ui.slider.oninput = (e) => {
            this.app.selectSlot(this.index);
            if (this.gainNode) this.gainNode.gain.value = e.target.value;
        };
    }

    toggle() {
        if (this.state === 'recording') this.stopRecording();
        else this.startRecording();
    }

    startRecording() {
        this.chunks = [];
        const stream = this.app.audio.recordDest.stream; 
        // IMPORTANT: recordDest has Mic + Synth connected in Engine
        this.recorder = new MediaRecorder(stream);
        
        this.recorder.ondataavailable = e => this.chunks.push(e.data);
        this.recorder.onstop = () => {
            const blob = new Blob(this.chunks, { type: 'audio/ogg; codecs=opus' });
            this.audioUrl = URL.createObjectURL(blob);
            this.state = 'playing';
            this.updateUI();
            this.play();
        };

        this.recorder.start();
        this.state = 'recording';
        this.updateUI();
    }

    stopRecording() {
        if (this.recorder && this.state === 'recording') this.recorder.stop();
    }

    play() {
        if (!this.audioUrl) return;
        
        if (!this.gainNode) {
            const src = this.app.audio.ctx.createMediaElementSource(this.audioEl);
            this.gainNode = this.app.audio.ctx.createGain();
            this.gainNode.gain.value = this.ui.slider.value;
            src.connect(this.gainNode).connect(this.app.audio.masterGain);
        }
        
        this.audioEl.src = this.audioUrl;
        this.audioEl.currentTime = 0;
        this.audioEl.play().catch(e => console.log("Play failed", e));
        this.state = 'playing';
        this.updateUI();
    }
    
    stop() {
        this.audioEl.pause();
        this.audioEl.currentTime = 0;
        if (this.state !== 'empty') {
            this.state = 'stopped';
            this.updateUI();
        }
    }

    clear() {
        this.stop();
        this.audioUrl = null;
        this.state = 'empty';
        this.updateUI();
    }

    updateUI() {
        const { status, emptyText } = this.ui;
        let color = '#374151';
        let shadow = 'none';
        let text = 'EMPTY';
        let textOp = 1;

        if (this.state === 'recording') {
            color = '#ff0033'; 
            shadow = '0 0 10px #ff0033';
            text = 'RECORDING...';
        } else if (this.state === 'playing') {
            color = '#00ff00';
            shadow = '0 0 10px #00ff00';
            text = '';
            textOp = 0;
        } else if (this.state === 'stopped') {
            color = '#fbbf24';
            text = '';
            textOp = 0;
        }
        
        status.style.backgroundColor = color;
        status.style.boxShadow = shadow;
        emptyText.style.opacity = textOp;
        if(text) emptyText.innerText = text;
    }
}

// --- APP MAIN ---
window.app = {
    audio: null,
    synth: null,
    inputs: null,
    looper: null,
    metronome: null,
    selectedSlot: 0,
    
    async start() {
        try {
            if(this.audio && this.audio.initialized) return;

            const overlay = document.getElementById('start-overlay');
            if (overlay) overlay.classList.add('opacity-0', 'pointer-events-none');
            
            console.log("Starting App...");
            
            this.audio = new AudioEngine(this);
            await this.audio.init();
            
            this.synth = new Synthesizer(this.audio);
            this.metronome = new Metronome(this.audio);
            this.looper = new LoopStation(this);
            this.inputs = new InputManager(this);
            await this.inputs.init();

            this.selectSlot(0);
            this.bindEvents();
            
            console.log("App Started Successfully");
        } catch (e) {
            console.error("App Start Failed:", e);
            alert("Error starting app: " + e.message);
        }
    },

    bindEvents() {
        try {
            document.getElementById('btn-stop').onclick = () => this.looper.stopAll();
            document.getElementById('btn-play').onclick = () => this.looper.playAll();
            document.getElementById('btn-rec').onclick = () => this.looper.toggleRecord(this.selectedSlot);

            // Metronome
            const btnMeta = document.getElementById('btn-metronome');
            if (btnMeta) {
                btnMeta.onclick = (e) => {
                    const playing = this.metronome.toggle();
                    const icon = e.currentTarget.querySelector('i'); // Safe icon check?
                    e.currentTarget.classList.toggle('text-upsideDown-red', playing);
                    if(playing) e.currentTarget.classList.add('animate-pulse');
                    else e.currentTarget.classList.remove('animate-pulse');
                };
            }

            // Drum Toggle
            const btnDrums = document.getElementById('btn-drums');
            if (btnDrums) {
                btnDrums.onclick = (e) => {
                    const isDrums = this.synth.mode === 'synth';
                    this.synth.setMode(isDrums ? 'drums' : 'synth');
                    
                    if (window.lucide) {
                        e.currentTarget.innerHTML = isDrums ? '<i data-lucide="music-2"></i>' : '<i data-lucide="piano"></i>';
                        window.lucide.createIcons();
                    } else {
                        e.currentTarget.innerText = isDrums ? "SYNTH" : "DRUMS";
                    }
                    
                    e.currentTarget.classList.toggle('text-upsideDown-blue');
                };
            }

            // Keys
            const handleKey = (k, down) => {
                if (k === ' ') { 
                    if (down) {
                        // Prevent scroll if needed, though handled by CSS often triggers default
                        this.looper.toggleRecord(this.selectedSlot);
                    }
                    return; 
                }
                if (!KEY_MAP) return;
                const note = KEY_MAP[k];
                if (note) {
                     if (down) this.synth.playNote(note);
                     else this.synth.stopNote(note);
                }
            };

            document.addEventListener('keydown', e => { 
                if (e.repeat) return;
                handleKey(e.key.toLowerCase(), true); 
            });
            document.addEventListener('keyup', e => handleKey(e.key.toLowerCase(), false));
            
            document.querySelectorAll('.piano-key').forEach(btn => {
               const note = btn.dataset.note;
               if (!note) return;
               
               const start = (e) => { 
                   if(e.cancelable) e.preventDefault(); // Safer touch
                   this.synth.playNote(note); 
               };
               const end = (e) => { 
                   if(e.cancelable) e.preventDefault();
                   this.synth.stopNote(note); 
               };
               
               btn.addEventListener('mousedown', start);
               btn.addEventListener('touchstart', start);
               btn.addEventListener('mouseup', end);
               btn.addEventListener('mouseleave', end);
               btn.addEventListener('touchend', end);
            });

            [0, 1, 2].forEach(i => {
                 const el = document.getElementById(`slot-${i+1}`);
                 if (el) el.addEventListener('mousedown', () => this.selectSlot(i));
            });
        } catch(e) {
            console.error("Binding Events Failed:", e);
        }
    },

    selectSlot(index) {
        this.selectedSlot = index;
        document.querySelectorAll('.loop-slot').forEach((el, i) => {
            if (i === index) el.classList.add('selected');
            else el.classList.remove('selected');
        });
    }
};
