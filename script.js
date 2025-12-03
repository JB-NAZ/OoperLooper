// OoperLooper - MIDI Looper with Web Audio API

class OoperLooper {
    constructor() {
        // Audio context
        this.audioContext = null;
        
        // Active oscillators for each note
        this.activeOscillators = new Map();
        
        // Loop recording
        this.isRecording = false;
        this.isPlaying = false;
        this.recordedNotes = [];
        this.recordStartTime = 0;
        this.loopDuration = 0;
        this.playbackTimeouts = [];
        
        // MIDI
        this.midiAccess = null;
        
        // Note frequencies for one octave (C4 to B4)
        this.noteFrequencies = {
            60: 261.63, // C4
            61: 277.18, // C#4
            62: 293.66, // D4
            63: 311.13, // D#4
            64: 329.63, // E4
            65: 349.23, // F4
            66: 369.99, // F#4
            67: 392.00, // G4
            68: 415.30, // G#4
            69: 440.00, // A4
            70: 466.16, // A#4
            71: 493.88  // B4
        };
        
        // Keyboard mapping (computer keyboard to MIDI notes)
        this.keyboardMap = {
            'a': 60, // C
            'w': 61, // C#
            's': 62, // D
            'e': 63, // D#
            'd': 64, // E
            'f': 65, // F
            't': 66, // F#
            'g': 67, // G
            'y': 68, // G#
            'h': 69, // A
            'u': 70, // A#
            'j': 71  // B
        };
        
        this.init();
    }
    
    async init() {
        // Initialize audio context on user interaction
        document.addEventListener('click', () => this.initAudioContext(), { once: true });
        document.addEventListener('keydown', () => this.initAudioContext(), { once: true });
        
        // Setup UI
        this.setupKeyboard();
        this.setupControls();
        this.setupComputerKeyboard();
        
        // Initialize MIDI
        await this.initMIDI();
    }
    
    initAudioContext() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
    }
    
    async initMIDI() {
        const statusIndicator = document.getElementById('statusIndicator');
        const statusText = document.getElementById('statusText');
        
        if (!navigator.requestMIDIAccess) {
            statusText.textContent = 'Web MIDI not supported - use keyboard';
            return;
        }
        
        try {
            this.midiAccess = await navigator.requestMIDIAccess();
            this.setupMIDIInputs();
            
            // Listen for new MIDI devices
            this.midiAccess.onstatechange = () => this.setupMIDIInputs();
            
        } catch (error) {
            console.error('MIDI access denied:', error);
            statusText.textContent = 'MIDI access denied - use keyboard';
        }
    }
    
    setupMIDIInputs() {
        const statusIndicator = document.getElementById('statusIndicator');
        const statusText = document.getElementById('statusText');
        
        const inputs = Array.from(this.midiAccess.inputs.values());
        
        if (inputs.length > 0) {
            statusIndicator.classList.add('connected');
            statusText.textContent = `Connected: ${inputs[0].name}`;
            
            inputs.forEach(input => {
                input.onmidimessage = (event) => this.handleMIDIMessage(event);
            });
        } else {
            statusIndicator.classList.remove('connected');
            statusText.textContent = 'No MIDI device - use keyboard';
        }
    }
    
    handleMIDIMessage(event) {
        const [status, note, velocity] = event.data;
        const command = status & 0xf0;
        
        // Note on (144) or Note off (128)
        if (command === 144 && velocity > 0) {
            // Note on
            if (this.noteFrequencies[note]) {
                this.playNote(note, velocity);
            }
        } else if (command === 128 || (command === 144 && velocity === 0)) {
            // Note off
            if (this.noteFrequencies[note]) {
                this.stopNote(note);
            }
        }
    }
    
    setupKeyboard() {
        const keys = document.querySelectorAll('.key');
        
        keys.forEach(key => {
            const note = parseInt(key.dataset.note);
            
            key.addEventListener('mousedown', (e) => {
                e.preventDefault();
                this.initAudioContext();
                this.playNote(note, 100);
            });
            
            key.addEventListener('mouseup', () => {
                this.stopNote(note);
            });
            
            key.addEventListener('mouseleave', () => {
                this.stopNote(note);
            });
            
            // Touch support
            key.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.initAudioContext();
                this.playNote(note, 100);
            });
            
            key.addEventListener('touchend', () => {
                this.stopNote(note);
            });
        });
    }
    
    setupComputerKeyboard() {
        const pressedKeys = new Set();
        
        document.addEventListener('keydown', (e) => {
            if (e.repeat) return;
            
            const note = this.keyboardMap[e.key.toLowerCase()];
            if (note && !pressedKeys.has(e.key.toLowerCase())) {
                pressedKeys.add(e.key.toLowerCase());
                this.initAudioContext();
                this.playNote(note, 100);
            }
        });
        
        document.addEventListener('keyup', (e) => {
            const note = this.keyboardMap[e.key.toLowerCase()];
            if (note) {
                pressedKeys.delete(e.key.toLowerCase());
                this.stopNote(note);
            }
        });
    }
    
    setupControls() {
        document.getElementById('recordBtn').addEventListener('click', () => this.toggleRecord());
        document.getElementById('playBtn').addEventListener('click', () => this.togglePlay());
        document.getElementById('stopBtn').addEventListener('click', () => this.stop());
        document.getElementById('clearBtn').addEventListener('click', () => this.clear());
    }
    
    playNote(note, velocity) {
        this.initAudioContext();
        
        // Stop existing note if playing
        if (this.activeOscillators.has(note)) {
            this.stopNote(note);
        }
        
        const frequency = this.noteFrequencies[note];
        if (!frequency) return;
        
        // Create oscillator with rich sound
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        const filter = this.audioContext.createBiquadFilter();
        
        // Sawtooth wave for a richer sound
        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
        
        // Low-pass filter
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(2000, this.audioContext.currentTime);
        filter.Q.setValueAtTime(1, this.audioContext.currentTime);
        
        // Volume based on velocity
        const volume = (velocity / 127) * 0.3;
        gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(volume, this.audioContext.currentTime + 0.01);
        
        // Connect nodes
        oscillator.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        oscillator.start();
        
        // Store for later stopping
        this.activeOscillators.set(note, { oscillator, gainNode });
        
        // Visual feedback
        const keyElement = document.querySelector(`.key[data-note="${note}"]`);
        if (keyElement) {
            keyElement.classList.add('active');
        }
        
        // Record note if recording
        if (this.isRecording) {
            const timestamp = Date.now() - this.recordStartTime;
            this.recordedNotes.push({
                note,
                velocity,
                timestamp,
                type: 'noteOn'
            });
            this.updateNoteCount();
        }
    }
    
    stopNote(note) {
        const noteData = this.activeOscillators.get(note);
        if (noteData) {
            const { oscillator, gainNode } = noteData;
            
            // Fade out
            gainNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 0.1);
            
            // Stop after fade
            setTimeout(() => {
                oscillator.stop();
                oscillator.disconnect();
            }, 100);
            
            this.activeOscillators.delete(note);
        }
        
        // Visual feedback
        const keyElement = document.querySelector(`.key[data-note="${note}"]`);
        if (keyElement) {
            keyElement.classList.remove('active');
        }
        
        // Record note off if recording
        if (this.isRecording) {
            const timestamp = Date.now() - this.recordStartTime;
            this.recordedNotes.push({
                note,
                timestamp,
                type: 'noteOff'
            });
        }
    }
    
    toggleRecord() {
        const recordBtn = document.getElementById('recordBtn');
        const loopStatus = document.getElementById('loopStatus');
        
        if (this.isRecording) {
            // Stop recording
            this.isRecording = false;
            this.loopDuration = Date.now() - this.recordStartTime;
            recordBtn.classList.remove('recording');
            loopStatus.textContent = `Loop: ${(this.loopDuration / 1000).toFixed(1)}s`;
        } else {
            // Start recording
            this.stop();
            this.recordedNotes = [];
            this.isRecording = true;
            this.recordStartTime = Date.now();
            recordBtn.classList.add('recording');
            loopStatus.textContent = 'Recording...';
            this.updateNoteCount();
        }
    }
    
    togglePlay() {
        if (this.isPlaying) {
            this.stopPlayback();
        } else {
            this.startPlayback();
        }
    }
    
    startPlayback() {
        if (this.recordedNotes.length === 0 || this.loopDuration === 0) {
            document.getElementById('loopStatus').textContent = 'Nothing to play';
            return;
        }
        
        this.isPlaying = true;
        document.getElementById('playBtn').classList.add('playing');
        document.getElementById('loopStatus').textContent = 'Playing...';
        
        this.playLoop();
    }
    
    playLoop() {
        if (!this.isPlaying) return;
        
        // Schedule all notes in the loop
        this.recordedNotes.forEach(event => {
            const timeout = setTimeout(() => {
                if (!this.isPlaying) return;
                
                if (event.type === 'noteOn') {
                    this.playNote(event.note, event.velocity);
                } else {
                    this.stopNote(event.note);
                }
            }, event.timestamp);
            
            this.playbackTimeouts.push(timeout);
        });
        
        // Schedule next loop
        const loopTimeout = setTimeout(() => {
            if (this.isPlaying) {
                this.playLoop();
            }
        }, this.loopDuration);
        
        this.playbackTimeouts.push(loopTimeout);
    }
    
    stopPlayback() {
        this.isPlaying = false;
        document.getElementById('playBtn').classList.remove('playing');
        
        // Clear all scheduled timeouts
        this.playbackTimeouts.forEach(timeout => clearTimeout(timeout));
        this.playbackTimeouts = [];
        
        // Stop all active notes
        this.activeOscillators.forEach((_, note) => {
            this.stopNote(note);
        });
        
        if (this.recordedNotes.length > 0) {
            document.getElementById('loopStatus').textContent = `Loop: ${(this.loopDuration / 1000).toFixed(1)}s`;
        } else {
            document.getElementById('loopStatus').textContent = 'Ready';
        }
    }
    
    stop() {
        if (this.isRecording) {
            this.toggleRecord();
        }
        this.stopPlayback();
    }
    
    clear() {
        this.stop();
        this.recordedNotes = [];
        this.loopDuration = 0;
        document.getElementById('loopStatus').textContent = 'Ready';
        this.updateNoteCount();
    }
    
    updateNoteCount() {
        const noteOnCount = this.recordedNotes.filter(e => e.type === 'noteOn').length;
        document.getElementById('noteCount').textContent = `Notes: ${noteOnCount}`;
    }
}

// Initialize the looper
const looper = new OoperLooper();
