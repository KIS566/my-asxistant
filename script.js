// AI Voice Assistant - REAL TIME WORKING VERSION
class VoiceAssistant {
    constructor() {
        // State Management
        this.state = 'idle';
        this.wakeWordDetected = false;
        this.wakeWordCount = 0;
        this.silenceTimeout = 3000;
        this.audioVolume = 0.8;
        this.soundEnabled = true;
        
        // Speech Recognition
        this.SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognition = null;
        this.finalTranscript = '';
        this.interimTranscript = '';
        this.silenceTimer = null;
        this.lastSpeechTime = 0;
        
        // Speech Synthesis
        this.synth = window.speechSynthesis;
        this.voice = null;
        
        // Audio Context for volume detection
        this.audioContext = null;
        this.analyser = null;
        this.microphone = null;
        this.dataArray = null;
        this.audioLevel = 0;
        this.speechThreshold = 25;
        
        // DOM Elements
        this.elements = {
            avatar: document.getElementById('avatar'),
            avatarImg: document.getElementById('avatar-img'),
            statusIndicator: document.getElementById('status-indicator'),
            statusText: document.getElementById('status-text'),
            logContent: document.getElementById('log-content'),
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
        
        this.init();
    }
    
    async init() {
        console.log('🚀 Starting AI Voice Assistant...');
        
        this.setupEventListeners();
        this.initSpeechSynthesis();
        
        // Request microphone immediately
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
            
            this.initAudioContext(stream);
            this.elements.permissionModal.classList.remove('active');
            this.addToLog('system', '✅ Microphone ready. Say "K M F L" to activate!');
            
            // Start wake word detection immediately
            this.startWakeWordDetection();
            
        } catch (error) {
            console.error('Microphone error:', error);
            this.elements.permissionModal.classList.add('active');
            this.addToLog('system', '❌ Need microphone permission.');
        }
        
        this.updateStatus('idle', '🎤 Say "K M F L" to wake me up!');
    }
    
    setupEventListeners() {
        this.elements.silenceTimeoutInput.addEventListener('input', (e) => {
            this.silenceTimeout = e.target.value * 1000;
            this.elements.timeoutValue.textContent = `${e.target.value}s`;
        });
        
        this.elements.volumeInput.addEventListener('input', (e) => {
            this.audioVolume = e.target.value / 100;
            this.elements.volumeValue.textContent = `${e.target.value}%`;
        });
        
        this.elements.clearLogBtn.addEventListener('click', () => {
            this.elements.logContent.innerHTML = '';
        });
        
        this.elements.toggleSoundBtn.addEventListener('click', () => {
            this.soundEnabled = !this.soundEnabled;
            this.elements.toggleSoundBtn.innerHTML = `
                <i class="fas fa-volume-${this.soundEnabled ? 'up' : 'mute'}"></i>
                Sound: ${this.soundEnabled ? 'ON' : 'OFF'}
            `;
        });
        
        this.elements.requestPermissionBtn.addEventListener('click', async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                this.initAudioContext(stream);
                this.elements.permissionModal.classList.remove('active');
                this.startWakeWordDetection();
            } catch (error) {
                alert('Please allow microphone access!');
            }
        });
        
        document.getElementById('toggle-debug').addEventListener('click', () => {
            const panel = this.elements.debugPanel;
            panel.style.transform = panel.style.transform === 'translateY(0)' ?
                'translateY(calc(100% - 40px))' : 'translateY(0)';
        });
        
        this.synth.addEventListener('end', () => {
            if (this.state === 'speaking') {
                this.returnToWakeWordMode();
            }
        });
        
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.stopAudio();
            } else {
                this.resumeAudio();
            }
        });
    }
    
    initAudioContext(stream) {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            this.microphone = this.audioContext.createMediaStreamSource(stream);
            
            this.analyser.fftSize = 256;
            this.analyser.smoothingTimeConstant = 0.3;
            this.microphone.connect(this.analyser);
            
            this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
            
            // Start audio level monitoring
            this.monitorAudioLevel();
            
        } catch (error) {
            console.error('Audio context error:', error);
        }
    }
    
    monitorAudioLevel() {
        if (!this.analyser || !this.dataArray) return;
        
        const updateLevel = () => {
            this.analyser.getByteFrequencyData(this.dataArray);
            
            let sum = 0;
            for (let i = 0; i < this.dataArray.length; i++) {
                sum += this.dataArray[i];
            }
            this.audioLevel = Math.round(sum / this.dataArray.length);
            
            // Update debug info
            this.updateDebugInfo();
            
            // Continue monitoring
            if (this.state !== 'speaking') {
                requestAnimationFrame(updateLevel.bind(this));
            }
        };
        
        updateLevel();
    }
    
    startWakeWordDetection() {
        if (!this.SpeechRecognition) {
            this.addToLog('system', '❌ Speech recognition not supported');
            return;
        }
        
        this.recognition = new this.SpeechRecognition();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US';
        this.recognition.maxAlternatives = 3;
        
        this.recognition.onstart = () => {
            console.log('🎤 Wake word detection started');
            this.isListening = true;
        };
        
        this.recognition.onresult = (event) => {
            this.interimTranscript = '';
            this.finalTranscript = '';
            
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript.toLowerCase();
                
                if (event.results[i].isFinal) {
                    this.finalTranscript += transcript + ' ';
                    
                    // CHECK FOR WAKE WORD
                    this.checkForWakeWord(transcript);
                    
                } else {
                    this.interimTranscript += transcript;
                    
                    // Also check interim results for faster wake word detection
                    if (this.state === 'idle') {
                        this.checkForWakeWord(transcript);
                    }
                }
            }
            
            // Handle user speech after wake word
            if (this.state === 'listening' && (this.interimTranscript || this.finalTranscript)) {
                this.handleUserSpeech();
            }
        };
        
        this.recognition.onerror = (event) => {
            if (event.error === 'no-speech' || event.error === 'audio-capture') {
                console.log('No speech detected, continuing...');
            } else {
                console.error('Recognition error:', event.error);
            }
        };
        
        this.recognition.onend = () => {
            console.log('Recognition ended, restarting...');
            if (this.state === 'idle') {
                setTimeout(() => {
                    if (this.recognition) {
                        try {
                            this.recognition.start();
                        } catch (e) {
                            console.log('Restarting recognition...');
                        }
                    }
                }, 500);
            }
        };
        
        // Start recognition
        try {
            this.recognition.start();
        } catch (error) {
            console.log('Starting recognition...');
            setTimeout(() => this.startWakeWordDetection(), 1000);
        }
    }
    
    checkForWakeWord(transcript) {
        if (this.state !== 'idle') return;
        
        // Multiple ways to detect "K.M.F.L."
        const wakePatterns = [
            /k\.m\.f\.l/i,
            /kmfl/i,
            /k m f l/i,
            /kay em ef el/i,
            /k m fl/i,
            /km f l/i
        ];
        
        for (const pattern of wakePatterns) {
            if (pattern.test(transcript)) {
                console.log('✅ WAKE WORD DETECTED:', transcript);
                this.handleWakeWordDetection();
                return;
            }
        }
    }
    
    handleWakeWordDetection() {
        if (this.state !== 'idle') return;
        
        console.log('🔔 ACTIVATING ASSISTANT!');
        this.wakeWordDetected = true;
        this.wakeWordCount++;
        
        // Play activation sound
        if (this.soundEnabled) {
            this.playActivationSound();
        }
        
        // Change state
        this.state = 'listening';
        this.updateStatus('listening', '🎯 Listening... I\'m ready!');
        
        // Clear any previous transcripts
        this.finalTranscript = '';
        this.interimTranscript = '';
        
        // Switch to Hindi for Hinglish input
        if (this.recognition) {
            this.recognition.lang = 'hi-IN';
        }
        
        // Add log entry
        this.addToLog('assistant', 'Haan! Main sun rahi hoon. Batao, kya kaam hai?');
        
        // Start silence detection
        this.startSilenceDetection();
    }
    
    handleUserSpeech() {
        if (this.state !== 'listening') return;
        
        // Reset silence timer
        this.resetSilenceTimer();
        
        // Update status with what we're hearing
        if (this.interimTranscript) {
            this.updateStatus('listening', `🎤 "${this.interimTranscript}"`);
        }
    }
    
    startSilenceDetection() {
        this.resetSilenceTimer();
    }
    
    resetSilenceTimer() {
        if (this.silenceTimer) {
            clearTimeout(this.silenceTimer);
        }
        
        this.silenceTimer = setTimeout(() => {
            if (this.state === 'listening' && this.finalTranscript.trim()) {
                this.processUserInput(this.finalTranscript.trim());
            } else if (this.state === 'listening') {
                // No speech detected, go back to idle
                this.addToLog('assistant', 'Kuch nahi sunai diya. Phir se try karo!');
                this.returnToWakeWordMode();
            }
        }, this.silenceTimeout);
        
        this.lastSpeechTime = Date.now();
    }
    
    async processUserInput(userInput) {
        if (!userInput || this.state !== 'listening') return;
        
        console.log('Processing:', userInput);
        
        // Stop listening
        this.stopListening();
        
        // Update state
        this.updateStatus('thinking', '🤔 Processing...');
        this.addToLog('user', userInput);
        
        // Generate response
        const response = await this.generateResponse(userInput);
        
        // Speak response
        await this.speakResponse(response);
    }
    
    async generateResponse(userInput) {
        await new Promise(resolve => setTimeout(resolve, 800));
        
        const input = userInput.toLowerCase();
        
        const responses = {
            greetings: [
                "Hello! Kaise ho? Main yahaan hoon aapki help ke liye.",
                "Hi! Aapko dekhke achha laga. Aaj kya plan hai?",
                "Namaste! Aapka din shubh ho. Main hoon yahaan aapke saath."
            ],
            how_are_you: [
                "Main bilkul theek hoon, dhanyavaad! Aap sunaiye, kaise ho?",
                "Bahut badhiya! Aapke saath baat karke mazaa aa raha hai.",
                "Mast hoon! Aap batao, kuch interesting ho raha hai aaj?"
            ],
            name: [
                "Mera naam K.M.F.L. Assistant hai! Aapki personal AI dost.",
                "Main hoon aapka AI friend. Bas bolo 'K M F L' aur main taiyaar!",
                "Log mujhe K.M.F.L. Assistant ke naam se jaante hain."
            ],
            help: [
                "Haan bilkul! Aapko kya chaahiye? Poochiye kuch bhi.",
                "Chinta mat karo, main hoon na! Batao kya problem hai?",
                "Main aapki help karne ke liye yahaan hoon. Aap bataiye."
            ],
            time: [
                `Abhi time hai ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}.`,
                `Samay hai ${new Date().toLocaleTimeString('hi-IN')}.`,
                `Abhi ${new Date().getHours()} baj kar ${new Date().getMinutes()} minute hain.`
            ],
            date: [
                `Aaj ki date hai ${new Date().toLocaleDateString('hi-IN')}.`,
                `Aaj ${new Date().toLocaleDateString('en-IN', { weekday: 'long' })} hai.`,
                `Month ka ${new Date().getDate()} tarikh hai.`
            ],
            joke: [
                "Ek AI dusre AI se milne gaya. Pehla AI bola: '01101000 01101001'!",
                "Computer ne apne owner se kaha: Tumhara password weak hai. Owner bola: Password batao! Computer bola: password",
                "Mere paas ek joke hai par wo binary mein hai. 10 logon ne samjha, 01 nahi!"
            ],
            weather: [
                "Mausam ka pata nahi, lekin aapka mood toh hamesha sunny rehna chahiye!",
                "Bahut garmi hai aaj! Thanda paani pi lijiye.",
                "Barish ho sakti hai aaj, umbrella le lena."
            ],
            thanks: [
                "You're welcome! Aapka shukriya.",
                "Koi baat nahi, kabhi bhi bulaana.",
                "Aapke liye kuch bhi!"
            ],
            default: [
                "Samajh gaya! Thoda aur details bataiye.",
                "Interesting! Iske baare mein aur bataiye.",
                "Hmm, achha question hai. Main sochti hoon.",
                "Waah! Aapne accha point raise kiya hai.",
                "Main yeh samajh gayi. Chaliye aage discuss karte hain."
            ]
        };
        
        let category = 'default';
        
        if (input.match(/(hello|hi|namaste|hey|good morning)/i)) {
            category = 'greetings';
        } else if (input.match(/(how are you|kaise ho|kya haal)/i)) {
            category = 'how_are_you';
        } else if (input.match(/(your name|tumhara naam|kaun ho|what.*name)/i)) {
            category = 'name';
        } else if (input.match(/(help|madad|sahayata|problem)/i)) {
            category = 'help';
        } else if (input.match(/(time|samay|kitne baje)/i)) {
            category = 'time';
        } else if (input.match(/(date|tarikh|aaj.*date)/i)) {
            category = 'date';
        } else if (input.match(/(joke|haso|mazak)/i)) {
            category = 'joke';
        } else if (input.match(/(weather|mausam|baarish|garmi)/i)) {
            category = 'weather';
        } else if (input.match(/(thank|dhanyavaad|shukriya|thanks)/i)) {
            category = 'thanks';
        }
        
        const categoryResponses = responses[category];
        const randomIndex = Math.floor(Math.random() * categoryResponses.length);
        
        return categoryResponses[randomIndex];
    }
    
    async speakResponse(text) {
        if (!this.synth) return;
        
        this.updateStatus('speaking', '🗣️ Speaking...');
        this.addToLog('assistant', text);
        
        // Play sound if enabled
        if (this.soundEnabled) {
            this.playEndSound();
        }
        
        return new Promise((resolve) => {
            const utterance = new SpeechSynthesisUtterance(text);
            
            utterance.lang = 'hi-IN';
            utterance.rate = 0.9;
            utterance.pitch = 1.1;
            utterance.volume = this.audioVolume;
            
            // Try to get a female voice
            const voices = this.synth.getVoices();
            const hindiVoice = voices.find(v => v.lang.includes('hi') && v.name.toLowerCase().includes('female'));
            const femaleVoice = voices.find(v => v.lang.includes('en') && v.name.toLowerCase().includes('female'));
            
            if (hindiVoice) utterance.voice = hindiVoice;
            else if (femaleVoice) utterance.voice = femaleVoice;
            
            utterance.onend = () => {
                console.log('Finished speaking');
                resolve();
                this.returnToWakeWordMode();
            };
            
            utterance.onerror = (event) => {
                console.error('Speech error:', event);
                resolve();
                this.returnToWakeWordMode();
            };
            
            this.synth.speak(utterance);
        });
    }
    
    returnToWakeWordMode() {
        console.log('🔙 Returning to wake word mode');
        
        this.state = 'idle';
        this.wakeWordDetected = false;
        this.finalTranscript = '';
        this.interimTranscript = '';
        
        this.updateStatus('idle', '🎤 Say "K M F L" to activate!');
        
        // Switch back to English for wake word
        if (this.recognition) {
            this.recognition.lang = 'en-US';
        }
        
        // Restart recognition if it stopped
        if (!this.isListening) {
            setTimeout(() => {
                if (this.recognition) {
                    try {
                        this.recognition.start();
                    } catch (e) {
                        console.log('Starting recognition again...');
                    }
                }
            }, 500);
        }
        
        this.addToLog('system', 'Listening for wake word...');
    }
    
    stopListening() {
        if (this.silenceTimer) {
            clearTimeout(this.silenceTimer);
            this.silenceTimer = null;
        }
    }
    
    stopAudio() {
        this.stopListening();
        
        if (this.synth.speaking) {
            this.synth.cancel();
        }
        
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.suspend();
        }
    }
    
    resumeAudio() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
        
        if (this.state === 'idle') {
            this.startWakeWordDetection();
        }
    }
    
    initSpeechSynthesis() {
        setTimeout(() => {
            const voices = this.synth.getVoices();
            console.log('Available voices:', voices.length);
        }, 1000);
    }
    
    playActivationSound() {
        const audio = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-correct-answer-tone-2870.mp3');
        audio.volume = this.audioVolume;
        audio.play().catch(console.error);
    }
    
    playEndSound() {
        const audio = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-software-interface-start-2574.mp3');
        audio.volume = this.audioVolume;
        audio.play().catch(console.error);
    }
    
    updateStatus(state, message) {
        this.state = state;
        this.elements.statusText.textContent = message;
        this.elements.avatar.className = `assistant-avatar status-${state}`;
    }
    
    addToLog(sender, message) {
        const timestamp = new Date().toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit'
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
    }
    
    updateDebugInfo() {
        if (!this.elements.debugContent) return;
        
        const debugInfo = `
            <div class="debug-item">
                <span class="debug-label">State:</span>
                <span class="debug-value">${this.state}</span>
            </div>
            <div class="debug-item">
                <span class="debug-label">Audio Level:</span>
                <span class="debug-value">${this.audioLevel}</span>
            </div>
            <div class="debug-item">
                <span class="debug-label">Wake Words:</span>
                <span class="debug-value">${this.wakeWordCount}</span>
            </div>
            <div class="debug-item">
                <span class="debug-label">Listening:</span>
                <span class="debug-value">${this.isListening ? 'YES' : 'NO'}</span>
            </div>
        `;
        
        this.elements.debugContent.innerHTML = debugInfo;
    }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    // Create fallback avatar
    const createFallbackAvatar = () => {
        const avatar = document.getElementById('avatar');
        const emojiAvatar = document.createElement('div');
        emojiAvatar.className = 'emoji-avatar';
        emojiAvatar.innerHTML = '🤖';
        emojiAvatar.style.fontSize = '80px';
        emojiAvatar.style.display = 'flex';
        emojiAvatar.style.alignItems = 'center';
        emojiAvatar.style.justifyContent = 'center';
        emojiAvatar.style.width = '100%';
        emojiAvatar.style.height = '100%';
        avatar.appendChild(emojiAvatar);
    };
    
    // Check if avatar image loaded
    const avatarImg = document.getElementById('avatar-img');
    if (avatarImg) {
        avatarImg.onerror = createFallbackAvatar;
        setTimeout(() => {
            if (avatarImg.naturalWidth === 0) {
                createFallbackAvatar();
            }
        }, 1000);
    }
    
    // Start assistant
    window.voiceAssistant = new VoiceAssistant();
});

// Clean up
window.addEventListener('beforeunload', () => {
    if (window.voiceAssistant) {
        window.voiceAssistant.stopAudio();
    }
});
