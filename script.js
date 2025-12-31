// AI Voice Assistant - Main Application
class VoiceAssistant {
    constructor() {
        // State Management
        this.state = 'idle'; // idle, listening, thinking, speaking
        this.wakeWordDetected = false;
        this.wakeWordCount = 0;
        this.silenceTimeout = 3000; // 3 seconds default
        this.audioVolume = 0.8;
        this.soundEnabled = true;
        
        // Audio Processing
        this.audioContext = null;
        this.analyser = null;
        this.microphone = null;
        this.audioDataArray = null;
        this.silenceCounter = 0;
        this.audioLevel = 0;
        
        // Speech Recognition
        this.SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognition = null;
        this.isListening = false;
        
        // Speech Synthesis
        this.synth = window.speechSynthesis;
        this.voice = null;
        
        // Conversation History
        this.conversationHistory = [];
        
        // DOM Elements
        this.elements = {
            avatar: document.getElementById('avatar'),
            avatarImg: document.getElementById('avatar-img'),
            statusIndicator: document.getElementById('status-indicator'),
            statusText: document.getElementById('status-text'),
            logContent: document.getElementById('log-content'),
            conversationLog: document.getElementById('conversation-log'),
            silenceTimeoutInput: document.getElementById('silence-timeout'),
            timeoutValue: document.getElementById('timeout-value'),
            volumeInput: document.getElementById('volume'),
            volumeValue: document.getElementById('volume-value'),
            clearLogBtn: document.getElementById('clear-log'),
            toggleSoundBtn: document.getElementById('toggle-sound'),
            permissionModal: document.getElementById('permission-modal'),
            requestPermissionBtn: document.getElementById('request-permission'),
            debugPanel: document.getElementById('debug-panel'),
            debugContent: document.getElementById('debug-content')
        };
        
        // Initialize the application
        this.init();
    }
    
    // Initialize the application
    async init() {
        console.log('🚀 Initializing AI Voice Assistant...');
        
        // Set up event listeners
        this.setupEventListeners();
        
        // Initialize speech synthesis
        this.initSpeechSynthesis();
        
        // Request microphone permission
        await this.requestMicrophonePermission();
        
        // Initialize wake word detection
        this.initWakeWordDetection();
        
        // Update UI
        this.updateStatus('idle', 'Waiting for wake word: "K.M.F.L."');
        
        // Start debug updates
        this.startDebugUpdates();
        
        // Add initial log message
        this.addToLog('system', 'Assistant initialized and ready. Say "K.M.F.L." to start.');
    }
    
    // Set up all event listeners
    setupEventListeners() {
        // Silence timeout control
        this.elements.silenceTimeoutInput.addEventListener('input', (e) => {
            this.silenceTimeout = e.target.value * 1000;
            this.elements.timeoutValue.textContent = `${e.target.value}s`;
        });
        
        // Volume control
        this.elements.volumeInput.addEventListener('input', (e) => {
            this.audioVolume = e.target.value / 100;
            this.elements.volumeValue.textContent = `${e.target.value}%`;
        });
        
        // Clear log button
        this.elements.clearLogBtn.addEventListener('click', () => {
            this.elements.logContent.innerHTML = '';
            this.conversationHistory = [];
        });
        
        // Toggle sound button
        this.elements.toggleSoundBtn.addEventListener('click', () => {
            this.soundEnabled = !this.soundEnabled;
            this.elements.toggleSoundBtn.innerHTML = `
                <i class="fas fa-volume-${this.soundEnabled ? 'up' : 'mute'}"></i>
                Sound: ${this.soundEnabled ? 'ON' : 'OFF'}
            `;
        });
        
        // Request permission button
        this.elements.requestPermissionBtn.addEventListener('click', () => {
            this.requestMicrophonePermission();
        });
        
        // Debug panel toggle
        document.getElementById('toggle-debug').addEventListener('click', () => {
            this.elements.debugPanel.style.transform = 
                this.elements.debugPanel.style.transform === 'translateY(0)' ?
                'translateY(calc(100% - 40px))' : 'translateY(0)';
        });
        
        // Handle speech synthesis end
        this.synth.addEventListener('end', () => {
            if (this.state === 'speaking') {
                this.returnToWakeWordMode();
            }
        });
        
        // Handle page visibility change
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.stopAllAudioProcessing();
            } else {
                this.resumeAudioProcessing();
            }
        });
    }
    
    // Request microphone permission
    async requestMicrophonePermission() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
            
            // Initialize audio context
            this.initAudioContext(stream);
            
            // Hide permission modal
            this.elements.permissionModal.classList.remove('active');
            
            this.addToLog('system', 'Microphone access granted. Listening for wake word...');
            
        } catch (error) {
            console.error('Microphone permission error:', error);
            this.elements.permissionModal.classList.add('active');
            this.addToLog('system', 'Microphone permission required. Please allow access.');
        }
    }
    
    // Initialize Audio Context for wake word detection
    initAudioContext(stream) {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            this.microphone = this.audioContext.createMediaStreamSource(stream);
            
            // Configure analyser
            this.analyser.fftSize = 2048;
            this.analyser.smoothingTimeConstant = 0.8;
            this.microphone.connect(this.analyser);
            
            // Create data array for analysis
            this.audioDataArray = new Uint8Array(this.analyser.frequencyBinCount);
            
            // Start audio processing for wake word detection
            this.processAudioForWakeWord();
            
        } catch (error) {
            console.error('Audio context initialization error:', error);
            this.addToLog('system', 'Audio processing initialization failed.');
        }
    }
    
    // Initialize wake word detection
    initWakeWordDetection() {
        if (!this.SpeechRecognition) {
            this.addToLog('system', 'Speech recognition not supported in this browser.');
            return;
        }
        
        this.recognition = new this.SpeechRecognition();
        this.recognition.continuous = false;
        this.recognition.interimResults = false;
        this.recognition.lang = 'en-US';
        
        this.recognition.onstart = () => {
            console.log('🎤 Speech recognition started');
        };
        
        this.recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript.toLowerCase().trim();
            console.log('Recognized:', transcript);
            
            // Check for wake word
            if (transcript.includes('k.m.f.l') || transcript.includes('kmfl')) {
                this.handleWakeWordDetection();
            }
        };
        
        this.recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            
            // Restart recognition on error (except user aborted)
            if (event.error !== 'aborted') {
                setTimeout(() => this.startWakeWordRecognition(), 1000);
            }
        };
        
        this.recognition.onend = () => {
            if (this.state === 'idle' && !this.wakeWordDetected) {
                this.startWakeWordRecognition();
            }
        };
        
        // Start wake word recognition
        this.startWakeWordRecognition();
    }
    
    // Start listening for wake word
    startWakeWordRecognition() {
        if (this.recognition && this.state === 'idle') {
            try {
                this.recognition.start();
                this.isListening = true;
            } catch (error) {
                console.log('Restarting speech recognition...');
                setTimeout(() => this.startWakeWordRecognition(), 1000);
            }
        }
    }
    
    // Process audio for wake word detection (alternative method)
    processAudioForWakeWord() {
        if (!this.analyser || !this.audioDataArray) return;
        
        const processAudio = () => {
            // Get audio data
            this.analyser.getByteFrequencyData(this.audioDataArray);
            
            // Calculate average volume
            let sum = 0;
            for (let i = 0; i < this.audioDataArray.length; i++) {
                sum += this.audioDataArray[i];
            }
            this.audioLevel = Math.round(sum / this.audioDataArray.length);
            
            // Visual feedback for audio level (optional)
            this.updateDebugInfo();
            
            // Continue processing
            if (this.state === 'idle') {
                requestAnimationFrame(processAudio);
            }
        };
        
        processAudio();
    }
    
    // Handle wake word detection
    handleWakeWordDetection() {
        if (this.state !== 'idle') return;
        
        console.log('🔔 Wake word detected!');
        this.wakeWordDetected = true;
        this.wakeWordCount++;
        
        // Play wake sound
        if (this.soundEnabled) {
            this.playSound('wake');
        }
        
        // Update UI
        this.updateStatus('listening', 'Listening... I\'m all ears!');
        this.addToLog('assistant', 'Haan, batao! Main sun rahi hoon.');
        
        // Start listening for user input
        this.startUserInputListening();
    }
    
    // Start listening for user input after wake word
    startUserInputListening() {
        if (!this.SpeechRecognition) return;
        
        // Configure recognition for user input
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = 'hi-IN'; // Hindi language for Hinglish
        
        let finalTranscript = '';
        let silenceStartTime = null;
        let isProcessing = false;
        
        this.recognition.onresult = (event) => {
            let interimTranscript = '';
            
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                
                if (event.results[i].isFinal) {
                    finalTranscript += transcript + ' ';
                    silenceStartTime = null;
                } else {
                    interimTranscript += transcript;
                    
                    // Reset silence timer when there's speech
                    silenceStartTime = Date.now();
                }
            }
            
            // Update UI with interim results
            if (interimTranscript) {
                this.updateStatus('listening', `Listening: "${interimTranscript}"`);
            }
            
            // Check for silence
            if (silenceStartTime && Date.now() - silenceStartTime > 1000) {
                this.checkSilenceTimeout(finalTranscript);
            }
        };
        
        this.recognition.onend = () => {
            if (this.state === 'listening' && !isProcessing) {
                this.recognition.start();
            }
        };
        
        // Start recognition
        try {
            this.recognition.start();
            this.isListening = true;
            
            // Start silence detection
            this.startSilenceDetection(finalTranscript);
            
        } catch (error) {
            console.error('Failed to start user input listening:', error);
        }
    }
    
    // Start silence detection
    startSilenceDetection(finalTranscript) {
        let lastSpeechTime = Date.now();
        let checkInterval = null;
        
        const checkSilence = () => {
            const now = Date.now();
            const silenceDuration = now - lastSpeechTime;
            
            // Update silence counter for debug
            this.silenceCounter = Math.floor(silenceDuration / 1000);
            
            if (silenceDuration >= this.silenceTimeout && finalTranscript.trim()) {
                clearInterval(checkInterval);
                this.processUserInput(finalTranscript.trim());
            }
        };
        
        // Reset timer on any audio activity
        const resetTimer = () => {
            lastSpeechTime = Date.now();
        };
        
        // Monitor audio level for activity
        const monitorAudio = () => {
            if (this.audioLevel > 20) { // Threshold for speech detection
                resetTimer();
            }
        };
        
        // Combine both methods
        checkInterval = setInterval(() => {
            checkSilence();
            monitorAudio();
        }, 100);
    }
    
    // Check silence timeout
    checkSilenceTimeout(transcript) {
        if (transcript.trim() && this.state === 'listening') {
            this.processUserInput(transcript.trim());
        }
    }
    
    // Process user input
    async processUserInput(userInput) {
        if (!userInput || this.state !== 'listening') return;
        
        console.log('Processing user input:', userInput);
        
        // Stop listening
        this.stopListening();
        
        // Update state
        this.updateStatus('thinking', 'Thinking... Let me process that.');
        
        // Add user message to log
        this.addToLog('user', userInput);
        
        // Generate AI response
        const response = await this.generateResponse(userInput);
        
        // Speak response
        await this.speakResponse(response);
    }
    
    // Generate AI response
    async generateResponse(userInput) {
        // Simulate thinking delay
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Convert input to lowercase for easier matching
        const input = userInput.toLowerCase();
        
        // Common greetings and questions with Hinglish responses
        const responses = {
            greetings: [
                "Hello! Kaise ho? Main aapki assistant hoon. Aap mujhse kuch bhi pooch sakte ho.",
                "Hi there! Main yahaan hoon aapki help karne ke liye. Bataiye, kya chaahiye?",
                "Namaste! Aaj aapka din kaisa chal raha hai? Main hoon yahaan aapke saath."
            ],
            how_are_you: [
                "Main bilkul theek hoon, dhanyavaad poochne ke liye! Aap sunaiye, aap kaise ho?",
                "Mazaa aa raha hai aapki help karke. Aap batao, kya naya seekh rahe ho?",
                "Bahut badhiya! Aapke saath baat karke achha lag raha hai."
            ],
            name: [
                "Mera naam K.M.F.L. Assistant hai! Aap mujhe apni friend samajh sakte ho.",
                "Main hoon aapki AI dost. Aap bas bulao 'K.M.F.L.' aur main taiyaar hoon!",
                "Mujhe log 'K.M.F.L.' ke naam se jaante hain. Simple sa naam hai, samajhne mein aasaan."
            ],
            help: [
                "Haan bilkul! Main aapki kaise help kar sakti hoon? Aap poochiye kuch bhi.",
                "Chinta mat karo, main hoon na! Bataiye aapko kya chaahiye?",
                "Good question! Main aapko information, motivation, ya phir bas baat-cheet kar sakti hoon."
            ],
            motivation: [
                "Aap bahut achha kar rahe ho! Keep going, ek din aap zaroor successful honge.",
                "Yaad rakhiye, har difficult time ek lesson lekar aata hai. Aap strong ho!",
                "Mere hisaab se aapmein bahut potential hai. Bas thoda sa confidence chahiye!"
            ],
            thanks: [
                "You're welcome! Aapka shukriya mujhe bahut khushi deta hai.",
                "Koi baat nahi, main hoon hi aapki help ke liye. Kabhi bhi bulaana.",
                "Dhanyavaad kehne ke liye shukriya! Aapke saath baat karke mazaa aaya."
            ],
            time: [
                `Abhi time hai ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}. Plan your day wisely!`,
                `Samay hai ${new Date().toLocaleTimeString('hi-IN')}. Thoda break le lijiye agar thak gaye hain.`,
                "Time ki value samajhna important hai. Ek minute bhi waste mat kijiye!"
            ],
            weather: [
                "Maine suna hai aaj mausam bahut achha hai! Bahar jaake thodi fresh air le aaiye.",
                "Weather ke baare mein main exact bata nahi sakti, par aap Google check kar sakte ho.",
                "Mausam chahe kaisa bhi ho, aapka mood toh hamesha bright rahana chahiye!"
            ],
            default: [
                "Interesting question! Main thoda soch kar bataati hoon.",
                "Waah, aapne accha question poocha! Main aapki help karne ki koshish karti hoon.",
                "Samajh gaya. Thoda detailed bataiye, taki main aapko better help kar saku.",
                "Hmm, let me think about this. Aapka perspective bhi interesting hai!",
                "Good question! Iske baare mein hum thoda aur discuss kar sakte hain.",
                "Main yeh samajh gayi ki aap kya keh rahe ho. Chaliye aage baat karte hain."
            ]
        };
        
        // Determine response category
        let category = 'default';
        
        if (input.match(/(hello|hi|namaste|hey)/i)) {
            category = 'greetings';
        } else if (input.match(/(how are you|kaise ho|kya haal)/i)) {
            category = 'how_are_you';
        } else if (input.match(/(your name|tumhara naam|kaun ho)/i)) {
            category = 'name';
        } else if (input.match(/(help|madad|sahayata)/i)) {
            category = 'help';
        } else if (input.match(/(motivation|motivate|hosla)/i)) {
            category = 'motivation';
        } else if (input.match(/(thank you|dhanyavaad|shukriya)/i)) {
            category = 'thanks';
        } else if (input.match(/(time|samay|kitne baje)/i)) {
            category = 'time';
        } else if (input.match(/(weather|mausam|baarish)/i)) {
            category = 'weather';
        }
        
        // Get random response from category
        const categoryResponses = responses[category];
        const randomIndex = Math.floor(Math.random() * categoryResponses.length);
        
        return categoryResponses[randomIndex];
    }
    
    // Speak response
    async speakResponse(text) {
        if (!this.synth) return;
        
        // Update state
        this.updateStatus('speaking', 'Speaking...');
        this.addToLog('assistant', text);
        
        // Play sound if enabled
        if (this.soundEnabled) {
            this.playSound('end');
        }
        
        // Create utterance
        const utterance = new SpeechSynthesisUtterance(text);
        
        // Configure voice (Hindi+English friendly)
        utterance.lang = 'hi-IN';
        utterance.rate = 0.9; // Slightly slower for clarity
        utterance.pitch = 1.1; // Slightly higher pitch for friendly voice
        utterance.volume = this.audioVolume;
        
        // Speak
        this.synth.speak(utterance);
        
        // Handle utterance events
        utterance.onend = () => {
            if (this.state === 'speaking') {
                this.returnToWakeWordMode();
            }
        };
        
        utterance.onerror = (event) => {
            console.error('Speech synthesis error:', event);
            this.returnToWakeWordMode();
        };
    }
    
    // Return to wake word listening mode
    returnToWakeWordMode() {
        // Reset state
        this.state = 'idle';
        this.wakeWordDetected = false;
        
        // Update UI
        this.updateStatus('idle', 'Waiting for wake word: "K.M.F.L."');
        
        // Reset speech recognition for wake word
        if (this.recognition) {
            this.recognition.continuous = false;
            this.recognition.interimResults = false;
            this.recognition.lang = 'en-US';
        }
        
        // Restart wake word detection
        this.startWakeWordRecognition();
        
        this.addToLog('system', 'Back to listening for wake word...');
    }
    
    // Stop listening
    stopListening() {
        if (this.recognition && this.isListening) {
            try {
                this.recognition.stop();
                this.isListening = false;
            } catch (error) {
                console.log('Already stopped listening');
            }
        }
    }
    
    // Stop all audio processing
    stopAllAudioProcessing() {
        this.stopListening();
        
        if (this.synth.speaking) {
            this.synth.cancel();
        }
        
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.suspend();
        }
    }
    
    // Resume audio processing
    resumeAudioProcessing() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
        
        if (this.state === 'idle') {
            this.startWakeWordRecognition();
        }
    }
    
    // Initialize speech synthesis
    initSpeechSynthesis() {
        // Wait for voices to load
        this.synth.onvoiceschanged = () => {
            const voices = this.synth.getVoices();
            
            // Try to find a Hindi or Indian English female voice
            this.voice = voices.find(voice => 
                voice.lang.includes('hi') || 
                voice.lang.includes('IN') ||
                voice.name.toLowerCase().includes('hindi')
            ) || voices.find(voice => 
                voice.lang.includes('en') && 
                voice.name.toLowerCase().includes('female')
            ) || voices[0];
            
            console.log('Selected voice:', this.voice ? this.voice.name : 'default');
        };
        
        // Trigger voices loaded
        setTimeout(() => {
            if (this.synth.getVoices().length > 0) {
                this.synth.onvoiceschanged();
            }
        }, 1000);
    }
    
    // Play sound effect
    playSound(type) {
        const sound = document.getElementById(`${type}-sound`);
        if (sound) {
            sound.volume = this.audioVolume;
            sound.currentTime = 0;
            sound.play().catch(console.error);
        }
    }
    
    // Update UI status
    updateStatus(state, message) {
        this.state = state;
        
        // Update status text
        this.elements.statusText.textContent = message;
        
        // Update status indicator
        this.elements.avatar.className = `assistant-avatar status-${state}`;
        
        // Update avatar image (you can replace with your own images)
        const avatarImages = {
            idle: 'assets/idle.png',
            listening: 'assets/listening.png',
            thinking: 'assets/thinking.png',
            speaking: 'assets/speaking.png'
        };
        
        // For demo purposes, we'll use emoji as fallback
        if (!document.getElementById('avatar-img').src.includes('assets/')) {
            const emojiMap = {
                idle: '😴',
                listening: '👂',
                thinking: '🤔',
                speaking: '🗣️'
            };
            this.elements.statusText.textContent = `${emojiMap[state]} ${message}`;
        }
    }
    
    // Add message to log
    addToLog(sender, message) {
        const timestamp = new Date().toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit',
            second: '2-digit'
        });
        
        const messageElement = document.createElement('div');
        messageElement.className = `message message-${sender}`;
        messageElement.innerHTML = `
            <div class="message-header">
                <div class="message-sender">
                    ${sender === 'user' ? '👤 You' : 
                      sender === 'assistant' ? '🤖 Assistant' : '⚙️ System'}
                </div>
                <div class="message-time">${timestamp}</div>
            </div>
            <div class="message-content">${message}</div>
        `;
        
        this.elements.logContent.appendChild(messageElement);
        this.elements.logContent.scrollTop = this.elements.logContent.scrollHeight;
        
        // Store in history
        this.conversationHistory.push({
            sender,
            message,
            timestamp: new Date().toISOString()
        });
        
        // Keep only last 50 messages
        if (this.conversationHistory.length > 50) {
            this.conversationHistory.shift();
        }
    }
    
    // Update debug information
    updateDebugInfo() {
        if (!this.elements.debugContent) return;
        
        const debugInfo = `
            <div class="debug-item">
                <span class="debug-label">Wake Word Detected:</span>
                <span class="debug-value">${this.wakeWordCount}</span>
            </div>
            <div class="debug-item">
                <span class="debug-label">Current State:</span>
                <span class="debug-value">${this.state}</span>
            </div>
            <div class="debug-item">
                <span class="debug-label">Audio Level:</span>
                <span class="debug-value">${this.audioLevel}</span>
            </div>
            <div class="debug-item">
                <span class="debug-label">Silence Counter:</span>
                <span class="debug-value">${this.silenceCounter}s</span>
            </div>
            <div class="debug-item">
                <span class="debug-label">Microphone:</span>
                <span class="debug-value">${this.isListening ? 'ON' : 'OFF'}</span>
            </div>
            <div class="debug-item">
                <span class="debug-label">Sound Enabled:</span>
                <span class="debug-value">${this.soundEnabled ? 'YES' : 'NO'}</span>
            </div>
        `;
        
        this.elements.debugContent.innerHTML = debugInfo;
    }
    
    // Start debug updates
    startDebugUpdates() {
        setInterval(() => this.updateDebugInfo(), 500);
    }
}

// Initialize application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Create and initialize the voice assistant
    window.voiceAssistant = new VoiceAssistant();
    
    // Add some sample avatars if images don't exist
    setTimeout(() => {
        const avatarImg = document.getElementById('avatar-img');
        if (avatarImg.naturalWidth === 0) {
            // Create fallback avatar with emoji
            avatarImg.style.display = 'none';
            const avatarContainer = document.getElementById('avatar');
            const emojiAvatar = document.createElement('div');
            emojiAvatar.className = 'emoji-avatar';
            emojiAvatar.innerHTML = '🤖';
            emojiAvatar.style.fontSize = '80px';
            emojiAvatar.style.display = 'flex';
            emojiAvatar.style.alignItems = 'center';
            emojiAvatar.style.justifyContent = 'center';
            emojiAvatar.style.width = '100%';
            emojiAvatar.style.height = '100%';
            avatarContainer.appendChild(emojiAvatar);
        }
    }, 2000);
});

// Handle beforeunload to clean up
window.addEventListener('beforeunload', () => {
    if (window.voiceAssistant) {
        window.voiceAssistant.stopAllAudioProcessing();
    }
});
