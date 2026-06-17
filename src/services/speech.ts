export class SpeechService {
  private synthesis: SpeechSynthesis;
  private voices: SpeechSynthesisVoice[] = [];
  private currentVoice: SpeechSynthesisVoice | null = null;
  private recognition: any = null;

  constructor() {
    this.synthesis = window.speechSynthesis;
    
    // Load voices
    if (this.synthesis.onvoiceschanged !== undefined) {
      this.synthesis.onvoiceschanged = () => this.loadVoices();
    }
    this.loadVoices();

    // Setup speech recognition
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = false;
      this.recognition.interimResults = false;
      // You could map this based on user settings, default to Chinese as the prompt was in Chinese
      this.recognition.lang = 'zh-CN'; 
    }
  }

  private loadVoices() {
    this.voices = this.synthesis.getVoices();
    console.log("Loaded voices:", this.voices.length);
    // Try to find a Chinese voice by default
    this.currentVoice = this.voices.find(v => v.lang.includes('zh')) || this.voices[0] || null;
    if (this.currentVoice) {
      console.log("Selected voice:", this.currentVoice.name);
    }
  }

  getAvailableVoices() {
    if (this.voices.length === 0) {
      this.loadVoices();
    }
    return this.voices;
  }

  setVoice(voiceURI: string) {
    this.currentVoice = this.voices.find(v => v.voiceURI === voiceURI) || this.currentVoice;
  }

  speak(text: string, onEnd?: () => void) {
    console.log("Attempting to speak:", text);
    if (this.synthesis.speaking) {
      console.log("Canceling previous speech");
      this.synthesis.cancel();
    }
    
    const utterance = new SpeechSynthesisUtterance(text);
    if (this.currentVoice) {
      utterance.voice = this.currentVoice;
      console.log("Using voice:", this.currentVoice.name);
    } else {
      console.log("Using default voice");
    }
    
    utterance.onerror = (e) => {
      console.error("Speech synthesis error", e);
      if (onEnd) onEnd();
    };

    utterance.onend = () => {
      console.log("Speech synthesis ended");
      if (onEnd) onEnd();
    };

    // A weird bug in Chrome sometimes causes speech to just not happen and freeze
    // and requires page reload, or we can just pause and resume.
    this.synthesis.speak(utterance);
    
    // Chrome bug workaround: if speech is long, it pauses after 15s. We aren't doing 15s, but we can do resume.
    if (this.synthesis.paused) {
      this.synthesis.resume();
    }
  }

  private _onTranscript?: (text: string) => void;
  private _onError?: (error: string) => void;
  private _continuousMode: boolean = false;

  /** Start listening. In continuous mode, transcripts are delivered via callback.
   *  In single-shot mode (default), returns a Promise. */
  startContinuous(onTranscript: (text: string) => void, onError: (error: string) => void) {
    this._onTranscript = onTranscript;
    this._onError = onError;
    this._continuousMode = true;

    if (!this.recognition) {
      onError("Speech recognition not supported");
      return;
    }

    this.recognition.continuous = true;
    this.recognition.interimResults = false;

    this.recognition.onresult = (event: any) => {
      // Only process final results (isFinal === true)
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          const transcript = result[0].transcript.trim();
          if (transcript && this._onTranscript) {
            this._onTranscript(transcript);
          }
        }
      }
    };

    this.recognition.onerror = (event: any) => {
      if (event.error === 'no-speech') return; // Ignore silence in continuous mode
      if (this._onError) {
        this._onError(event.error === 'not-allowed' ? '麦克风权限被拒绝' : `语音识别错误: ${event.error}`);
      }
    };

    this.recognition.onend = () => {
      // Automatically restart if still in continuous mode
      if (this._continuousMode && this.recognition) {
        try {
          this.recognition.start();
        } catch (e) {
          // Ignore restart errors
        }
      }
    };

    try {
      this.recognition.start();
    } catch (e) {
      if (this._onError) this._onError('启动语音识别失败');
    }
  }

  stopContinuous() {
    this._continuousMode = false;
    this._onTranscript = undefined;
    this._onError = undefined;
    if (this.recognition) {
      this.recognition.continuous = false;
      this.recognition.interimResults = false;
      this.recognition.onresult = null;
      this.recognition.onerror = null;
      this.recognition.onend = null;
      try {
        this.recognition.stop();
      } catch (e) {
        // ignore
      }
    }
  }

  listen(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.recognition) {
        reject(new Error("Speech recognition not supported in this browser. Try Chrome."));
        return;
      }
      
      let resolved = false;

      this.recognition.continuous = false;
      this.recognition.interimResults = false;

      this.recognition.onresult = (event: any) => {
        if (event.results.length > 0 && event.results[0].length > 0) {
           const transcript = event.results[0][0].transcript;
           resolved = true;
           resolve(transcript);
        }
      };

      this.recognition.onerror = (event: any) => {
        resolved = true;
        if (event.error === 'no-speech') {
           reject(new Error('No speech detected. Please try again.'));
        } else if (event.error === 'aborted') {
           reject(new Error('Speech recognition aborted.'));
        } else {
           reject(new Error(event.error === 'not-allowed' ? "Microphone permission denied." : `Speech error: ${event.error}`));
        }
      };

      this.recognition.onend = () => {
        if (!resolved) {
          reject(new Error("Speech recognition ended unexpectedly."));
        }
      };

      try {
        this.recognition.start();
      } catch (e) {
        reject(e);
      }
    });
  }

  stopListening() {
    this.stopContinuous();
  }
}

// Export singleton
export const speechService = new SpeechService();
