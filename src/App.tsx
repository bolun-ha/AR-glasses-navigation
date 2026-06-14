import React, { useState, useEffect, useRef } from 'react';
import { MapWrapper, globalPlacesSearch } from './components/MapNavigation';
import { PlaceModel, processVoiceCommand } from './services/gemini';
import { speechService } from './services/speech';
import { Mic, MicOff, Settings, Search, X, Navigation, MapPin } from 'lucide-react';

export default function App() {
  const [currentLocation, setCurrentLocation] = useState<{lat: number, lng: number} | null>(null);
  const [destination, setDestination] = useState<PlaceModel | null>(null);
  const [waypoints, setWaypoints] = useState<PlaceModel[]>([]);
  const [searchResults, setSearchResults] = useState<PlaceModel[]>([]);
  const searchResultsRef = useRef<PlaceModel[]>([]);
  
  // Navigation & Hud Simulation States
  const [isNavigating, setIsNavigating] = useState(false);
  const [navStepIndex, setNavStepIndex] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false); // Default false - real-time stepping
  const [lastSpokenStepIndex, setLastSpokenStepIndex] = useState<number | null>(null);
  const [simulatedLocation, setSimulatedLocation] = useState<{lat: number, lng: number} | null>(null);
  const [simulatedSpeed, setSimulatedSpeed] = useState<number>(0);
  const [simulatedETA, setSimulatedETA] = useState<number>(0); 
  const [simulatedDistance, setSimulatedDistance] = useState<number>(0); 

  // AR Glass Mode States
  const [isARGlassMode, setIsARGlassMode] = useState(false);
  const [arSbsMode, setArSbsMode] = useState(false);
  const [mapOpacity, setMapOpacity] = useState(25); // Default 25% for see-through safety
  const [arThemeColor, setArThemeColor] = useState<'neon-yellow' | 'emerald-green' | 'neon-cyan'>('neon-yellow');

  // Dynamic color utility helper for AR glass modes
  const getThemeColorClass = (type: 'text' | 'bg' | 'border' | 'fill' | 'stroke' | 'bg-only' | 'text-only') => {
    const isGreen = isARGlassMode && arThemeColor === 'emerald-green';
    const isCyan = isARGlassMode && arThemeColor === 'neon-cyan';

    if (isGreen) {
      if (type === 'text') return 'text-[#00FF66]';
      if (type === 'text-only') return 'text-[#00FF66]';
      if (type === 'bg') return 'bg-[#00FF66] text-black';
      if (type === 'bg-only') return 'bg-[#00FF66]';
      if (type === 'border') return 'border-[#00FF66]';
      if (type === 'fill') return 'fill-[#00FF66]';
      if (type === 'stroke') return 'stroke-[#00FF66]';
    } else if (isCyan) {
      if (type === 'text') return 'text-[#00E5FF]';
      if (type === 'text-only') return 'text-[#00E5FF]';
      if (type === 'bg') return 'bg-[#00E5FF] text-black';
      if (type === 'bg-only') return 'bg-[#00E5FF]';
      if (type === 'border') return 'border-[#00E5FF]';
      if (type === 'fill') return 'fill-[#00E5FF]';
      if (type === 'stroke') return 'stroke-[#00E5FF]';
    }

    // Default neon-yellow
    if (type === 'text') return 'text-[#EFFF33]';
    if (type === 'text-only') return 'text-[#EFFF33]';
    if (type === 'bg') return 'bg-[#EFFF33] text-black';
    if (type === 'bg-only') return 'bg-[#EFFF33]';
    if (type === 'border') return 'border-[#EFFF33]';
    if (type === 'fill') return 'fill-[#EFFF33]';
    if (type === 'stroke') return 'stroke-[#EFFF33]';
    return '';
  }; 

  // Fast-sync current searchResults to ref
  useEffect(() => {
    searchResultsRef.current = searchResults;
  }, [searchResults]);

  // Clear voice assistant system message whenever the user clicks any button or clickable control
  const [clickedAnyButton, setClickedAnyButton] = useState(false);

  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target && 
        (target.closest('button') || 
         target.closest('[role="button"]') || 
         target.closest('input[type="submit"]') || 
         target.closest('input[type="button"]') ||
         target.tagName === 'BUTTON')
      ) {
        setSystemMessage("");
        setClickedAnyButton(true);
      }
    };
    document.addEventListener('click', handleGlobalClick, { capture: true });
    return () => document.removeEventListener('click', handleGlobalClick, { capture: true });
  }, []);

  const [isListening, setIsListening] = useState(false);
  const [inputText, setInputText] = useState("");
  const [systemMessage, setSystemMessage] = useState("Hello! I am your voice assistant. Try saying 'I want to go to McDonalds'.");
  
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>("");
  const [showSettings, setShowSettings] = useState(false);
  
  const [manualSearchQuery, setManualSearchQuery] = useState("");
  const [showManualSearch, setShowManualSearch] = useState(false);
  const [continuousMode, setContinuousMode] = useState(true); // Auto-intercom enabled by default
  const continuousModeRef = useRef(continuousMode);
  const isListeningRef = useRef(isListening);

  useEffect(() => {
    continuousModeRef.current = continuousMode;
  }, [continuousMode]);

  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  useEffect(() => {
    if (navigator.geolocation) {
      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          setCurrentLocation({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude
          });
        },
        (err) => console.error("Geolocation error:", err),
        { enableHighAccuracy: true }
      );
      return () => navigator.geolocation.clearWatch(watchId);
    }
  }, []);

  useEffect(() => {
    // Check available voices periodically since they load async
    const interval = setInterval(() => {
      const available = speechService.getAvailableVoices();
      if (available.length > 0 && voices.length === 0) {
        setVoices(available);
        const zhVoice = available.find(v => v.lang.includes('zh'));
        if (zhVoice) {
           setSelectedVoiceURI(zhVoice.voiceURI);
        } else {
           setSelectedVoiceURI(available[0].voiceURI);
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [voices]);

  const handleVoiceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const uri = e.target.value;
    setSelectedVoiceURI(uri);
    speechService.setVoice(uri);
  };

  // Renders professional, high-vibe Sci-Fi Head-Up Display for AR glasses
  const renderARHUD = (eye: 'left' | 'right' | 'mono') => {
    const steps = generateNavSteps();
    const currentStep = isNavigating && steps[navStepIndex] ? steps[navStepIndex] : null;

    // Calculate heading compass tape (we simulate actual degrees shifting subtly)
    const headingDegrees = isNavigating ? (70 + navStepIndex * 35) % 360 : 330;
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const headingText = directions[Math.round(((headingDegrees % 360) / 45)) % 8];

    // Determine theme accent strings
    let glowColor = 'shadow-[0_0_20px_rgba(239,255,51,0.25)]';
    let textHex = 'text-[#EFFF33]';
    let bgHex = 'bg-[#EFFF33]/15 border-[#EFFF33]/30';
    let btnBg = 'bg-[#EFFF33] text-black hover:bg-[#d6e52c]';

    if (arThemeColor === 'emerald-green') {
      textHex = 'text-[#00FF66]';
      bgHex = 'bg-[#00FF66]/15 border-[#00FF66]/30';
      btnBg = 'bg-[#00FF66] text-black hover:bg-[#00dd55]';
    } else if (arThemeColor === 'neon-cyan') {
      textHex = 'text-[#00E5FF]';
      bgHex = 'bg-[#00E5FF]/15 border-[#00E5FF]/30';
      btnBg = 'bg-[#00E5FF] text-black hover:bg-[#00ccd8]';
    }

    return (
      <div className={`w-full max-w-lg mx-auto flex flex-col justify-between h-full py-6 px-8 relative text-left font-mono ${arSbsMode ? 'scale-[0.9]' : ''}`}>
        
        {/* Dynamic Calibration Target / Optical Sight Center */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
          <div className={`w-8 h-8 rounded-full border-2 border-dashed ${
            arThemeColor === 'emerald-green' ? 'border-[#00FF66]' : arThemeColor === 'neon-cyan' ? 'border-[#00E5FF]' : 'border-[#EFFF33]'
          }`}></div>
          <div className={`absolute w-12 h-[1px] ${
            arThemeColor === 'emerald-green' ? 'bg-[#00FF66]' : arThemeColor === 'neon-cyan' ? 'bg-[#00E5FF]' : 'bg-[#EFFF33]'
          }`}></div>
          <div className={`absolute h-12 w-[1px] ${
            arThemeColor === 'emerald-green' ? 'bg-[#00FF66]' : arThemeColor === 'neon-cyan' ? 'bg-[#00E5FF]' : 'bg-[#EFFF33]'
          }`}></div>
        </div>

        {/* TOP: Compass Heading Indicator Grid */}
        <div className="flex flex-col gap-2 shrink-0 select-none">
          <div className="flex justify-between items-center px-4 py-2 border-b border-white/10 relative overflow-hidden bg-black/40">
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-black tracking-widest ${textHex}`}>
                SYS: ACTIVE
              </span>
              <span className="text-[8px] text-white/30 uppercase">
                | LNDSCP VIEW-HUD
              </span>
            </div>
            
            <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-white/90">
              <span className="text-white/40">HDG:</span>
              <span className={textHex}>{headingDegrees}° {headingText}</span>
            </div>
          </div>
        </div>

        {/* CENTER: Principal Nav Arrow or Listening Status Waves */}
        <div className="flex-1 flex flex-col justify-center items-center py-4 relative my-auto">
          {currentStep ? (
            <div className="w-full flex flex-col gap-3">
              {/* Speed & Action alignment layout */}
              <div className="grid grid-cols-12 gap-4 items-center">
                
                {/* Symbol center */}
                <div className="col-span-4 flex justify-center">
                  <div className={`w-20 h-20 rounded-full border flex items-center justify-center animate-pulse ${
                    arThemeColor === 'emerald-green' ? 'border-[#00FF66]/20 bg-[#00FF66]/5' : arThemeColor === 'neon-cyan' ? 'border-[#00E5FF]/20 bg-[#00E5FF]/5' : 'border-[#EFFF33]/20 bg-[#EFFF33]/5'
                  }`}>
                    <div className="scale-125">
                      {getActionIcon(currentStep.action)}
                    </div>
                  </div>
                </div>

                {/* Tactile Readings */}
                <div className="col-span-8 flex flex-col pl-4 border-l border-white/10">
                  <div className="flex items-baseline gap-1 select-none">
                    <span className="text-4xl font-extrabold font-mono text-white tracking-tighter">
                      {isAutoPlaying ? simulatedSpeed : (navStepIndex === 0 ? 0 : Math.round(20 + Math.random() * 15))}
                    </span>
                    <span className={`text-xs font-black uppercase ${textHex}`}>KM/H</span>
                  </div>
                  <span className="text-[9px] text-white/40 uppercase tracking-widest font-bold">Spatial Velocity</span>

                  <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-white/5">
                    <div>
                      <span className="text-[8px] text-white/30 block uppercase font-bold">REMAINNG</span>
                      <span className="text-xs font-bold text-white font-mono">
                        {simulatedDistance >= 1000 
                          ? `${(simulatedDistance / 1000).toFixed(1)} KM` 
                          : `${simulatedDistance} M`
                        }
                      </span>
                    </div>
                    <div>
                      <span className="text-[8px] text-white/30 block uppercase font-bold">ETA CONT</span>
                      <span className={`text-xs font-bold font-mono ${textHex}`}>{simulatedETA} MIN</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Guidance Display */}
              <div className={`p-4 border-l-4 rounded-r-xl bg-black/70 backdrop-blur-md relative overflow-hidden ${
                arThemeColor === 'emerald-green' ? 'border-[#00FF66] bg-[#00FF66]/5' : arThemeColor === 'neon-cyan' ? 'border-[#00E5FF] bg-[#00E5FF]/5' : 'border-[#EFFF33] bg-[#EFFF33]/5'
              }`}>
                <div className={`absolute top-0 right-0 w-2 h-2 border-t border-r ${
                  arThemeColor === 'emerald-green' ? 'border-[#00FF66]/40' : arThemeColor === 'neon-cyan' ? 'border-[#00E5FF]/40' : 'border-[#EFFF33]/40'
                }`} />
                <div className={`absolute bottom-0 right-0 w-2 h-2 border-b border-r ${
                  arThemeColor === 'emerald-green' ? 'border-[#00FF66]/40' : arThemeColor === 'neon-cyan' ? 'border-[#00E5FF]/40' : 'border-[#EFFF33]/40'
                }`} />
                
                <span className={`text-[8px] font-black uppercase tracking-[0.2em] select-none block ${textHex}`}>
                  HOLO-SPEECH GUIDANCE
                </span>
                <p className="text-xs font-bold text-white/95 leading-relaxed mt-1 overflow-y-auto max-h-24">
                  {currentStep.text}
                </p>
              </div>
            </div>
          ) : (
            <div className="w-full flex flex-col items-center justify-center text-center py-6">
              <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center animate-bounce ${
                arThemeColor === 'emerald-green' ? 'border-[#00FF66] text-[#00FF66]' : arThemeColor === 'neon-cyan' ? 'border-[#00E5FF] text-[#00E5FF]' : 'border-[#EFFF33] text-[#EFFF33]'
              }`}>
                ▲
              </div>
              <h4 className="text-xs font-bold text-white uppercase mt-4 tracking-widest">
                No Active Guidance
              </h4>
              <p className="text-[9px] text-white/50 uppercase mt-1 max-w-[280px]">
                Say "I want to go to Beijing Zoo" or use search to establish routes & launch HUD.
              </p>
            </div>
          )}

          {/* Voice interactive visual waveform */}
          <div className="w-full mt-4 flex items-center justify-between border-t border-white/5 pt-3 min-h-[44px]">
            <div className="flex items-center gap-2">
              <span className={`text-[8px] font-black uppercase tracking-wider ${textHex}`}>
                {isListening ? "🎤 MIC LISTENING..." : "🎙️ IDLE STANDBY"}
              </span>
            </div>

            {isListening ? (
              <div className="flex gap-1.5 items-center">
                <div className={`w-1 h-3 rounded-full animate-bounce ${
                  arThemeColor === 'emerald-green' ? 'bg-[#00FF66]' : arThemeColor === 'neon-cyan' ? 'bg-[#00E5FF]' : 'bg-[#EFFF33]'
                }`} style={{animationDelay: '0ms'}} />
                <div className={`w-1 h-6 rounded-full animate-bounce ${
                  arThemeColor === 'emerald-green' ? 'bg-[#00FF66]' : arThemeColor === 'neon-cyan' ? 'bg-[#00E5FF]' : 'bg-[#EFFF33]'
                }`} style={{animationDelay: '100ms'}} />
                <div className={`w-1 h-5 rounded-full animate-bounce ${
                  arThemeColor === 'emerald-green' ? 'bg-[#00FF66]' : arThemeColor === 'neon-cyan' ? 'bg-[#00E5FF]' : 'bg-[#EFFF33]'
                }`} style={{animationDelay: '200ms'}} />
                <div className={`w-1 h-8 rounded-full animate-bounce ${
                  arThemeColor === 'emerald-green' ? 'bg-[#00FF66]' : arThemeColor === 'neon-cyan' ? 'bg-[#00E5FF]' : 'bg-[#EFFF33]'
                }`} style={{animationDelay: '300ms'}} />
              </div>
            ) : (
              <div className="flex gap-1 opacity-25">
                <div className="w-1 h-1 bg-white rounded-full" />
                <div className="w-1 h-1 bg-white rounded-full" />
                <div className="w-1 h-1 bg-white rounded-full" />
              </div>
            )}
          </div>
        </div>

        {/* BOTTOM STEP: Interactive triggers */}
        {eye !== 'right' && (
          <div className="w-full shrink-0 pt-2 border-t border-white/10 flex items-center justify-between text-[9px] pointer-events-auto">
            <span className="text-white/40 tracking-wider">EYE-{eye.toUpperCase()}</span>
            
            <div className="flex gap-2">
              <button 
                onClick={() => {
                  setIsARGlassMode(false);
                  setArSbsMode(false);
                }}
                className="px-2.5 py-1.5 border border-white/20 text-white/70 rounded-lg hover:bg-white/10 transition text-[9px] uppercase font-black"
              >
                退出 (Exit)
              </button>

              {isNavigating && (
                <>
                  <button 
                    onClick={() => {
                      setIsNavigating(false);
                      setIsAutoPlaying(false);
                      setNavStepIndex(0);
                      speechService.speak("Spatial HUD mode ended.");
                    }}
                    className="px-2.5 py-1.5 border border-red-500/20 text-red-400 rounded-lg hover:bg-red-500 hover:text-white transition text-[9px] uppercase font-black"
                  >
                    结束 (End)
                  </button>
                  {navStepIndex < steps.length - 1 && (
                    <button 
                      onClick={() => setNavStepIndex(prev => prev + 1)}
                      className={`px-2.5 py-1.5 rounded-lg transition text-[9px] uppercase font-black ${btnBg}`}
                    >
                      下一站 (Next)
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        )}
        
        {eye === 'right' && (
          <div className="w-full shrink-0 pt-2 border-t border-white/10 flex items-center justify-between text-[9px] text-white/40">
            <span>EYE-RIGHT (SBS SLAVE CODE)</span>
            <span>AUTO-SYNC ACTIVE</span>
          </div>
        )}
      </div>
    );
  };

  const handleSpeak = (text: string) => {
    setSystemMessage(text);
    speechService.speak(text, () => {
      // Auto-restart listening if continuous mode is on and not already listening
      if (continuousModeRef.current) {
        setTimeout(() => {
          if (!isListeningRef.current) {
            toggleListening();
          }
        }, 300); // short delay to ensure TTS has fully yielded
      }
    });
  };

  // Dynamic navigation simulation step generator
  const generateNavSteps = () => {
    if (!destination) return [];
    
    const start = currentLocation || { lat: 39.90872, lng: 116.39748 };
    const end = destination.location || { lat: 39.91125, lng: 116.41162 };
    
    type SimStep = {
      text: string;
      action: 'start' | 'straight' | 'left' | 'right' | 'waypoint' | 'arrive';
      location: { lat: number; lng: number };
      distanceLeftMeters: number;
      etaLeftMinutes: number;
      speed: number;
    };
    
    const steps: SimStep[] = [];
    
    // Step 0: Start
    steps.push({
      text: `准备出发。起点：当前位置，终点：${destination.displayName}。全程预计行驶5公里，大约需要12分钟。请沿当前道路向前行驶。`,
      action: 'start',
      location: start,
      distanceLeftMeters: 5000,
      etaLeftMinutes: 12,
      speed: 0
    });

    // Add waypoints
    waypoints.forEach((wp, index) => {
      const wpLoc = wp.location || { 
        lat: start.lat + (end.lat - start.lat) * 0.4, 
        lng: start.lng + (end.lng - start.lng) * 0.4 
      };
      steps.push({
        text: `前方300米左转，准备经过途经点：${wp.displayName}。`,
        action: 'left',
        location: { 
          lat: start.lat + (wpLoc.lat - start.lat) * 0.6, 
          lng: start.lng + (wpLoc.lng - start.lng) * 0.6 
        },
        distanceLeftMeters: Math.round(3500 / (index + 1)),
        etaLeftMinutes: Math.round(9 / (index + 1)),
        speed: 48
      });

      steps.push({
        text: `已到达途经点：${wp.displayName}。打卡打卡，即将前往最终目的地：${destination.displayName}。`,
        action: 'waypoint',
        location: wpLoc,
        distanceLeftMeters: Math.round(1800 / (index + 1)),
        etaLeftMinutes: Math.round(6 / (index + 1)),
        speed: 25
      });
    });

    // Step pre-arrival
    const preArrival = {
      lat: start.lat + (end.lat - start.lat) * 0.85,
      lng: start.lng + (end.lng - start.lng) * 0.85
    };
    steps.push({
      text: `前方200米右转，进入主路行驶。`,
      action: 'right',
      location: preArrival,
      distanceLeftMeters: 600,
      etaLeftMinutes: 2,
      speed: 55
    });

    // Step 100%: Arrival
    steps.push({
      text: `您已到达目的地：${destination.displayName}附近。本次语音导航服务已全部完成。辛苦了，再见！`,
      action: 'arrive',
      location: end,
      distanceLeftMeters: 0,
      etaLeftMinutes: 0,
      speed: 0
    });

    return steps;
  };

  // Nav guidance speech effect & location translation driver
  useEffect(() => {
    if (!isNavigating || !destination) {
      setSimulatedLocation(null);
      return;
    }

    const steps = generateNavSteps();
    if (steps.length === 0) return;

    const currentStep = steps[navStepIndex];
    if (!currentStep) return;

    // Apply simulation HUD attributes
    setSimulatedLocation(currentStep.location);
    setSimulatedSpeed(currentStep.speed);
    setSimulatedETA(currentStep.etaLeftMinutes);
    setSimulatedDistance(currentStep.distanceLeftMeters);

    // Speak guidance text: ONLY if we haven't spoken this step yet in this nav session
    if (lastSpokenStepIndex !== navStepIndex) {
      handleSpeak(currentStep.text);
      setLastSpokenStepIndex(navStepIndex);
    }

    // Auto-advancing simulator is active only when isAutoPlaying is true
    if (isAutoPlaying) {
      const timer = setTimeout(() => {
        if (navStepIndex < steps.length - 1) {
          setNavStepIndex(prev => prev + 1);
        } else {
          setIsNavigating(false);
          setIsAutoPlaying(false);
          setNavStepIndex(0);
          handleSpeak("您已到达目的地，智能语音导航已圆满结束。");
        }
      }, 15000); // 15 seconds allows the tts audio to naturally finish

      return () => {
        clearTimeout(timer);
      };
    }
  }, [isNavigating, navStepIndex, isAutoPlaying, lastSpokenStepIndex]);

  // Real GPS positioning updates drive automated step progression
  useEffect(() => {
    if (!isNavigating || isAutoPlaying || !currentLocation || !destination) return;

    const steps = generateNavSteps();
    if (steps.length === 0) return;

    // See if the user has reached/approached the next step's geographic coordinate
    const nextIdx = navStepIndex + 1;
    if (nextIdx < steps.length) {
      const nextStep = steps[nextIdx];
      const dist = getDistance(
        currentLocation.lat,
        currentLocation.lng,
        nextStep.location.lat,
        nextStep.location.lng
      );
      // Auto-step if the user gets within 45 meters of the next coordinate
      if (dist < 45) {
        setNavStepIndex(nextIdx);
      }
    }
  }, [currentLocation, isNavigating, isAutoPlaying, navStepIndex]);

  const executeCommand = async (text: string) => {
    if (!text.trim()) return;
    setSystemMessage(`Processing: "${text}"...`);

    const voiceCmd = text.toLowerCase();
    
    // Voice command handlers for AR Glass Mode controls
    const isEnableAR = voiceCmd.includes("ar") || voiceCmd.includes("眼镜模式") || voiceCmd.includes("ar模式") || voiceCmd.includes("眼镜 开启") || voiceCmd.includes("开启眼镜");
    const isDisableAR = voiceCmd.includes("退出ar") || voiceCmd.includes("关闭ar") || voiceCmd.includes("退出眼镜") || voiceCmd.includes("关闭眼镜") || voiceCmd.includes("普通模式");
    const isEnable3D = voiceCmd.includes("双目") || voiceCmd.includes("分屏") || voiceCmd.includes("3d模式") || voiceCmd.includes("开启3d") || voiceCmd.includes("左右分屏");
    const isDisable3D = voiceCmd.includes("单目") || voiceCmd.includes("全屏") || voiceCmd.includes("关闭3d") || voiceCmd.includes("单屏模式");
    
    if (isEnableAR) {
      setIsARGlassMode(true);
      handleSpeak("已为您开启AR空间眼镜导航模式。高色温全黑景深透射模式已就绪。");
      return;
    }
    
    if (isDisableAR) {
      setIsARGlassMode(false);
      setArSbsMode(false);
      handleSpeak("已退出AR眼镜模式，返回普通地图导航模式。");
      return;
    }
    
    if (isEnable3D) {
      setIsARGlassMode(true); // make sure AR mode is active too
      setArSbsMode(true);
      handleSpeak("已启用双目左右分屏3D模式。请开启AR眼镜的Side-by-Side 3D显示功能。");
      return;
    }
    
    if (isDisable3D) {
      setArSbsMode(false);
      handleSpeak("已切回单目全屏HUD透光模式。");
      return;
    }

    if (voiceCmd.includes("绿色") || voiceCmd.includes("绿宝石")) {
      setArThemeColor('emerald-green');
      handleSpeak("已为您切换至翡翠绿战机巡航主题色。");
      return;
    }
    if (voiceCmd.includes("蓝色") || voiceCmd.includes("青色") || voiceCmd.includes("科幻")) {
      setArThemeColor('neon-cyan');
      handleSpeak("已为您切换至霓虹青深海极客主题色。");
      return;
    }
    if (voiceCmd.includes("黄色") || voiceCmd.includes("经典")) {
      setArThemeColor('neon-yellow');
      handleSpeak("已为您切换至经典高亮度暖橙主题色。");
      return;
    }

    const isStartNav = voiceCmd.includes("导航") && (voiceCmd.includes("开始") || voiceCmd.includes("启动") || voiceCmd.includes("开启"));
    const isStopNav = voiceCmd.includes("导航") && (voiceCmd.includes("结束") || voiceCmd.includes("停止") || voiceCmd.includes("退出") || voiceCmd.includes("关闭") || voiceCmd.includes("停"));

    if (isStartNav) {
      if (destination) {
        setSystemMessage("正在开启语音导航模式...");
        setIsNavigating(true);
        setNavStepIndex(0);
        setLastSpokenStepIndex(null); // Reset voice step marker to allow immediate speaking
        setIsAutoPlaying(false); // Default to live real-time GPS tracking drive
        return;
      } else {
        handleSpeak("您还没有选择目的地。请先说‘我想去颐和园’或手动搜索，然后再对我说‘开始导航’。");
        return;
      }
    }

    if (isStopNav) {
      if (isNavigating) {
        setIsNavigating(false);
        setIsAutoPlaying(false);
        setNavStepIndex(0);
        setLastSpokenStepIndex(null);
        handleSpeak("已为您结束语音导航，返回地图浏览。");
        return;
      } else {
        handleSpeak("当前并没有开启导航。");
        return;
      }
    }
    
    // Convert current location to string roughly
    const locStr = currentLocation ? `${currentLocation.lat.toFixed(5)}, ${currentLocation.lng.toFixed(5)}` : "Unknown";
    
    await processVoiceCommand(
      text,
      locStr,
      destination ? destination.displayName : null,
      {
        onSearchNearby: async (query) => {
          const results = await globalPlacesSearch(query, currentLocation);
          searchResultsRef.current = results; // Set immediately so follow-up tool calls can use it
          setSearchResults(results);
          return results;
        },
        onSetDestination: (placeId, name) => {
          const p = searchResultsRef.current.find(r => r.id === placeId);
          if (p) {
            setDestination(p);
          } else {
             // fallback
             setDestination({ id: placeId, displayName: name, address: '' });
          }
          // Always completely clear search results once destination is decided to avoid double popups
          setSearchResults([]);
          searchResultsRef.current = [];
        },
        onAddWaypoint: (placeId, name) => {
          const p = searchResultsRef.current.find(r => r.id === placeId);
          if (p) {
            setWaypoints(prev => [...prev, p]);
          } else {
            setWaypoints(prev => [...prev, { id: placeId, displayName: name, address: '' }]);
          }
          // Always clear search results once waypoint is added
          setSearchResults([]);
          searchResultsRef.current = [];
        },
        onSelectOption: () => {}
      },
      handleSpeak
    );
  };

  const toggleListening = async () => {
    try {
      if (!isListeningRef.current) {
        // Request microphone permission explicitly to ensure it works across browsers/iframes
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          // Stop immediately, we just needed the permission granted
          stream.getTracks().forEach(track => track.stop());
        } catch (mediaErr) {
          console.warn("Microphone permission prompt failed or denied:", mediaErr);
        }
        
        setIsListening(true);
        setSystemMessage("Listening (Speak now)...");
        // Wait for speech
        const text = await speechService.listen();
        setIsListening(false);
        setInputText(text);
        executeCommand(text);
      } else {
        speechService.stopListening();
        setIsListening(false);
        setSystemMessage("Stopped listening.");
      }
    } catch (err: any) {
      console.error(err);
      setIsListening(false);
      if (err.message && err.message.includes('aborted')) {
         setSystemMessage("Stopped listening.");
      } else {
         setSystemMessage(err.message || "Speech recognition stopped or failed.");
      }
      
      // Auto-restart even on error if it's "no-speech" or similar?
      // Actually better to just let it stop on error so we don't loop infinitely on mic denied.
    }
  };

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeCommand(inputText);
    setInputText("");
  };

  const handleManualSearchSubmit = async (e: React.FormEvent) => {
     e.preventDefault();
     if (!manualSearchQuery.trim()) return;
     setSystemMessage(`Searching for "${manualSearchQuery}"...`);
     setShowManualSearch(false);
     const results = await globalPlacesSearch(manualSearchQuery, currentLocation);
     setSearchResults(results);
     setSystemMessage(results.length > 0 ? "Ask to select or click a result." : "No results found.");
  };

  return (
    <div className="w-full h-screen bg-[#0A0A0A] text-white font-sans flex flex-col overflow-hidden relative">
      {/* Top Status Bar */}
      <header className="flex justify-between items-center px-4 sm:px-8 py-4 sm:py-6 border-b border-white/10 z-10 bg-[#0A0A0A] shrink-0 shadow-xl relative">
        <div className="flex flex-col flex-1 min-w-0 pr-4">
          <span className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-bold mb-1 block truncate font-sans">Current Route</span>
          <div className="flex items-center gap-3">
            <span className="text-xl md:text-2xl font-bold tracking-tight uppercase truncate text-[#EFFF33]" title={destination ? destination.displayName : "NO DESTINATION SET"}>
              {destination ? destination.displayName : "NO DESTINATION SET"}
            </span>
            {(destination || waypoints.length > 0) && (
              <button 
                onClick={() => {
                  setDestination(null);
                  setWaypoints([]);
                }}
                className="text-[10px] font-black tracking-tight text-white/60 hover:text-red-400 border border-white/20 hover:border-red-500/30 bg-white/5 hover:bg-white/10 px-2.5 py-1 rounded-lg transition uppercase duration-200 cursor-pointer"
              >
                Reset
              </button>
            )}
          </div>
          {waypoints.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              <span className="text-[9px] uppercase tracking-[0.15em] text-[#EFFF33]/70 font-bold flex items-center shrink-0">Stopovers:</span>
              {waypoints.map((wp, i) => (
                <div key={`${wp.id}-${i}`} className="flex items-center gap-1.5 bg-white/5 border border-white/10 px-2.5 py-1 rounded-full text-[10px] uppercase font-bold text-white/80">
                  <span className="text-[#EFFF33]">{i + 1}</span>
                  <span className="truncate max-w-[100px]">{wp.displayName}</span>
                  <button 
                    onClick={() => setWaypoints(prev => prev.filter((_, idx) => idx !== i))}
                    className="hover:text-red-400 text-white/30 transition-colors cursor-pointer"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-4 md:gap-8 text-right shrink-0 items-center">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-bold mb-1 block">Waypoints</span>
            <span className="text-xl md:text-2xl font-bold tracking-tight uppercase">{waypoints.length}</span>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => {
                setShowManualSearch(!showManualSearch);
                setShowSettings(false);
              }}
              className="w-10 h-10 flex items-center justify-center font-black uppercase text-white/40 hover:text-white transition bg-white/5 hover:bg-white/10 rounded-full"
            >
              <Search size={18} />
            </button>
            <div className="relative">
               <button 
                 onClick={() => {
                   setShowSettings(!showSettings);
                   setShowManualSearch(false);
                 }} 
                 className="w-10 h-10 flex items-center justify-center font-black uppercase text-white/40 hover:text-white transition bg-white/5 hover:bg-white/10 rounded-full"
               >
                 <Settings size={18} />
               </button>
               {showSettings && (
                 <div className="absolute top-14 right-0 w-64 bg-[#1A1A1A] p-4 rounded-xl border border-white/10 shadow-2xl z-50 text-left">
                    <label className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-bold mb-3 block">Voice Style</label>
                    <select 
                      value={selectedVoiceURI} 
                      onChange={handleVoiceChange}
                      className="w-full bg-[#0A0A0A] text-white text-sm border border-white/10 rounded-lg p-3 focus:ring-1 focus:ring-[#EFFF33] focus:outline-none uppercase font-bold mb-4"
                    >
                      {voices.map(v => (
                        <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>
                      ))}
                    </select>

                    <label className="flex items-center gap-3 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={continuousMode}
                        onChange={(e) => setContinuousMode(e.target.checked)}
                        className="w-4 h-4 rounded border-white/20 bg-transparent text-[#EFFF33] focus:ring-[#EFFF33]"
                      />
                      <span className="text-[10px] uppercase tracking-[0.2em] text-white/80 font-bold">Continuous Conversation</span>
                    </label>

                    {/* AR Glass Controls */}
                    <div className="border-t border-white/10 mt-4 pt-4 flex flex-col gap-3 font-sans">
                      <span className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-bold block">AR眼镜投射设置</span>
                      
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={isARGlassMode}
                          onChange={(e) => {
                            setIsARGlassMode(e.target.checked);
                            if (e.target.checked) setMapOpacity(25);
                          }}
                          className="w-4 h-4 rounded border-white/20 bg-transparent text-emerald-500 focus:ring-emerald-500"
                        />
                        <span className="text-[10px] uppercase tracking-[0.15em] text-white/80 font-bold">开启 AR 空间 HUD</span>
                      </label>

                      {isARGlassMode && (
                        <div className="flex flex-col gap-2.5 bg-black/60 p-2.5 rounded-lg border border-white/5">
                          <label className="flex items-center gap-3 cursor-pointer">
                            <input 
                              type="checkbox" 
                              checked={arSbsMode}
                              onChange={(e) => setArSbsMode(e.target.checked)}
                              className="w-4 h-4 rounded border-[#EFFF33] bg-transparent text-[#EFFF33]"
                            />
                            <span className="text-[9px] uppercase tracking-[0.1em] text-white/70 font-bold">左右分屏 (3D SBS)</span>
                          </label>

                          <div className="flex flex-col gap-1 mt-1">
                            <div className="flex justify-between items-center text-[9px] text-white/40 uppercase font-bold">
                              <span>地图像差 / 透明度</span>
                              <span className="text-white font-mono">{mapOpacity}%</span>
                            </div>
                            <input 
                              type="range" 
                              min="0" 
                              max="100" 
                              value={mapOpacity} 
                              onChange={(e) => setMapOpacity(Number(e.target.value))}
                              className="w-full accent-[#EFFF33]"
                            />
                          </div>

                          <div className="flex flex-col gap-1 mt-1">
                            <span className="text-[9px] text-white/40 uppercase font-bold">HUD 投影主题色</span>
                            <div className="grid grid-cols-3 gap-1 mt-1">
                              <button 
                                onClick={() => setArThemeColor('neon-yellow')}
                                className={`text-[9px] font-black py-1 rounded transition max-w-full truncate ${arThemeColor === 'neon-yellow' ? 'bg-[#EFFF33] text-black' : 'bg-white/5 text-white/60'}`}
                              >
                                暖橙黄
                              </button>
                              <button 
                                onClick={() => setArThemeColor('emerald-green')}
                                className={`text-[9px] font-black py-1 rounded transition max-w-full truncate ${arThemeColor === 'emerald-green' ? 'bg-[#00FF66] text-black' : 'bg-white/5 text-white/60'}`}
                              >
                                翡翠绿
                              </button>
                              <button 
                                onClick={() => setArThemeColor('neon-cyan')}
                                className={`text-[9px] font-black py-1 rounded transition max-w-full truncate ${arThemeColor === 'neon-cyan' ? 'bg-[#00E5FF] text-black' : 'bg-white/5 text-white/60'}`}
                              >
                                霓虹青
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                 </div>
               )}
            </div>
          </div>
        </div>

        {/* Manual Search Modal/Dropdown */}
        {showManualSearch && (
          <div className="absolute top-full left-0 w-full bg-[#1A1A1A] border-b border-white/10 p-4 shadow-2xl z-50">
             <form onSubmit={handleManualSearchSubmit} className="max-w-3xl mx-auto relative flex gap-4">
                <input 
                  type="text"
                  autoFocus
                  placeholder="ENTER LOCATION TO SEARCH..." 
                  value={manualSearchQuery}
                  onChange={e => setManualSearchQuery(e.target.value)}
                  className="flex-1 bg-[#0A0A0A] border border-white/20 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-[#EFFF33]"
                />
                <button type="submit" className="bg-[#EFFF33] text-black px-6 rounded-xl font-bold uppercase tracking-tight hover:bg-[#d6e52c] transition">Search</button>
             </form>
          </div>
        )}
      </header>

      {/* Main Navigation Area */}
      <main className={`flex-1 flex flex-col relative overflow-hidden py-4 ${isARGlassMode ? 'bg-[#000000]' : 'bg-black'}`}>
        
        {/* Map Container */}
        <div 
          className="absolute inset-0 z-0 transition-opacity duration-300"
          style={{ opacity: isARGlassMode ? mapOpacity / 100 : 1 }}
        >
           <MapWrapper 
             currentLocation={currentLocation} 
             destination={destination}
             waypoints={waypoints}
             searchResults={searchResults}
             simulatedLocation={simulatedLocation}
           />
        </div>

        {isARGlassMode ? (
          <div className="absolute inset-0 z-10 flex h-full w-full pointer-events-none">
            {arSbsMode ? (
              <div className="grid grid-cols-2 w-full h-full divide-x divide-white/10 bg-[#000000]/40">
                <div className="relative h-full flex flex-col justify-center items-center overflow-hidden">
                  {renderARHUD('left')}
                </div>
                <div className="relative h-full flex flex-col justify-center items-center overflow-hidden">
                  {renderARHUD('right')}
                </div>
              </div>
            ) : (
              <div className="relative w-full h-full flex flex-col justify-center items-center bg-[#000000]/20">
                {renderARHUD('mono')}
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Massive Directional Overlay (Non-blocking) */}
        {!showManualSearch && !destination && searchResults.length === 0 && !clickedAnyButton && (
          <div className="px-8 pt-8 flex flex-col justify-start z-10 pointer-events-none drop-shadow-[0_4px_20px_rgba(0,0,0,0.8)]">
            <div className="text-[70px] sm:text-[100px] md:text-[140px] font-black leading-[0.8] tracking-tighter uppercase text-white">
              VOICE<span className="text-[#EFFF33]">NAV</span>
            </div>
          </div>
        )}

        {/* Search Results Overlay */}
        {searchResults.length > 0 && (
          <div className="absolute bottom-12 right-0 w-80 sm:w-[500px] bg-[#EFFF33] text-black p-4 sm:p-6 rounded-l-[30px] transform shadow-2xl z-10 flex flex-col max-h-[60vh]">
            <div className="flex justify-between items-center mb-4 shrink-0">
              <span className="text-[10px] uppercase tracking-[0.2em] font-black opacity-50">Ask or Click to Select</span>
              <button onClick={() => setSearchResults([])} className="hover:bg-black/10 p-1 rounded-full"><X size={16}/></button>
            </div>
            
            <div className="space-y-3 overflow-y-auto pr-2 pb-2">
              {searchResults.slice(0, 5).map((res, i) => (
                <div key={res.id} className="flex flex-col sm:flex-row justify-start sm:justify-between sm:items-start bg-white/20 sm:bg-transparent rounded-xl sm:rounded-none p-3 sm:p-0 border-b-0 sm:border-b border-black/10 gap-3 sm:gap-4 relative group">
                  <div className="flex-1 min-w-0 pr-2">
                    <span className="text-xs font-black block opacity-70 mb-0.5">0{i+1}.</span>
                    <span className="text-base sm:text-lg font-black uppercase truncate block leading-tight">{res.displayName}</span>
                    <span className="text-xs font-medium opacity-60 truncate block mt-0.5">{res.address || 'No address'}</span>
                  </div>
                  
                  <div className="flex flex-col sm:items-end gap-2 shrink-0">
                    <span className="text-sm sm:text-base font-black italic opacity-60">
                      {res.distanceMeters ? `${res.distanceMeters}m` : ''}
                    </span>
                    <div className="flex gap-2 w-full sm:w-auto mt-2 sm:mt-0 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => { setWaypoints(prev => [...prev, res]); setSearchResults([]); }}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-1 bg-black text-[#EFFF33] text-[10px] uppercase font-bold py-1.5 px-2 rounded-lg hover:bg-black/80"
                        title="Add Waypoint"
                      >
                         <MapPin size={12} /> <span className="sm:hidden">Waypoint</span>
                      </button>
                      <button 
                        onClick={() => { setDestination(res); setSearchResults([]); }}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-1 bg-black text-white text-[10px] uppercase font-bold py-1.5 px-2 rounded-lg hover:bg-black/80"
                        title="Set Destination"
                      >
                         <Navigation size={12} /> <span className="sm:hidden">Navigate</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Start Navigation Launcher Card */}
        {destination && !isNavigating && searchResults.length === 0 && (
          <div className="absolute bottom-6 left-6 z-20 w-80 sm:w-96 bg-[#141414]/95 border border-white/10 p-6 rounded-[30px] shadow-[0_20px_50px_rgba(0,0,0,0.8)] backdrop-blur-md flex flex-col gap-4">
            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-[0.2em] text-[#EFFF33] font-black">Route Prepared</span>
              <h3 className="text-xl font-bold tracking-tight uppercase text-white mt-1 truncate">{destination.displayName}</h3>
              <p className="text-xs text-white/50 truncate mt-0.5">{destination.address || "Start point: Your location"}</p>
            </div>
            
            <div className="grid grid-cols-2 gap-4 border-y border-white/10 py-3.5">
              <div className="flex flex-col">
                <span className="text-[9px] uppercase tracking-[0.1em] text-white/40 font-bold">Total Distance</span>
                <span className="text-base font-mono font-bold text-white uppercase">{waypoints.length > 0 ? `${(5.0 + waypoints.length * 1.5).toFixed(1)} KM` : "5.0 KM"}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] uppercase tracking-[0.1em] text-white/40 font-bold">Estimated Time</span>
                <span className="text-base font-mono font-bold text-white uppercase">{waypoints.length > 0 ? `${12 + waypoints.length * 4} MIN` : "12 MIN"}</span>
              </div>
            </div>
            
            <button 
              onClick={() => {
                setIsNavigating(true);
                setNavStepIndex(0);
                setLastSpokenStepIndex(null);
                setIsAutoPlaying(false); // Default to Real-world GPS/manual mode to prevent auto-scrolling
              }}
              className="w-full bg-[#EFFF33] text-black font-black uppercase text-xs tracking-wider py-4 rounded-xl hover:bg-[#d6e52c] transition duration-200 flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(239,255,51,0.2)] focus:outline-none cursor-pointer"
            >
              <Navigation size={14} className="fill-black stroke-black" />
              开始语音导航 (START NAV)
            </button>
          </div>
        )}

        {/* Cockpit HUD navigation simulation overlay */}
        {isNavigating && (() => {
          const steps = generateNavSteps();
          const currentStep = steps[navStepIndex];
          if (!currentStep) return null;
          return (
            <div className="absolute left-6 bottom-6 z-20 w-[340px] sm:w-[400px] bg-black/90 border border-white/15 p-6 rounded-[30px] shadow-[0_25px_60px_rgba(0,0,0,0.9)] backdrop-blur-lg flex flex-col gap-5 text-left">
              {/* Speedometer & action heading */}
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shadow-inner">
                    {getActionIcon(currentStep.action)}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-[#EFFF33] font-black">Next Action</span>
                    <span className="text-lg font-black uppercase tracking-tight text-white mt-0.5">
                      {currentStep.action === 'start' && '准备出发'}
                      {currentStep.action === 'left' && '向左转弯'}
                      {currentStep.action === 'right' && '向右转弯'}
                      {currentStep.action === 'waypoint' && '到达途经点'}
                      {currentStep.action === 'arrive' && '抵达终点'}
                      {currentStep.action === 'straight' && '直行'}
                    </span>
                  </div>
                </div>
                
                <div className="flex flex-col items-end">
                  <div className="text-3xl font-black font-mono text-white tracking-tighter leading-none flex items-baseline select-none">
                    {isAutoPlaying ? simulatedSpeed : (navStepIndex === 0 ? 0 : Math.round(15 + Math.random() * 20))}
                    <span className="text-[10px] font-bold text-white/40 ml-1">KM/H</span>
                  </div>
                  <span className="text-[8px] font-bold uppercase text-white/30 tracking-widest mt-1">Realtime Speed</span>
                </div>
              </div>

              {/* Instructions summary */}
              <div className="bg-white/5 border border-white/5 p-4 rounded-2xl">
                <span className="text-[9px] uppercase tracking-[0.15em] text-[#EFFF33] font-bold select-none">Voice Guidance</span>
                <p className="text-sm font-bold text-white/90 leading-relaxed mt-1.5 font-sans">
                  {currentStep.text}
                </p>
              </div>

              {/* Drive Mode Control Overlay */}
              <div className="flex items-center justify-between bg-white/5 border border-white/10 p-3.5 rounded-2xl">
                <div className="flex flex-col">
                  <span className="text-[9px] uppercase tracking-[0.1em] text-white/40 font-bold">Drive Mode</span>
                  <span className="text-[11px] font-bold text-white uppercase mt-0.5 flex items-center gap-1.5">
                    {isAutoPlaying ? "🚌 模拟巡航 (Auto Sim)" : "📍 实时定位 (Real GPS)"}
                  </span>
                </div>
                <button
                  onClick={() => setIsAutoPlaying(prev => !prev)}
                  className={`px-3 py-1.5 rounded-xl text-[10px] uppercase font-black tracking-wider transition ${
                    isAutoPlaying 
                      ? 'bg-[#EFFF33] text-black hover:bg-[#d6e52c]' 
                      : 'bg-white/10 hover:bg-white/20 text-white'
                  }`}
                >
                  {isAutoPlaying ? "暂停模拟" : "模拟行驶"}
                </button>
              </div>

              {/* Travel parameters */}
              <div className="grid grid-cols-2 gap-4 border-b border-white/10 pb-4">
                <div className="flex flex-col">
                  <span className="text-[9px] uppercase tracking-[0.1em] text-white/40 font-bold">Remaining Dist.</span>
                  <span className="text-xl font-mono font-black text-white mt-0.5">
                    {simulatedDistance >= 1000 
                      ? `${(simulatedDistance / 1000).toFixed(1)} KM` 
                      : `${simulatedDistance} M`
                    }
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] uppercase tracking-[0.1em] text-white/40 font-bold">ETA Countdown</span>
                  <span className="text-xl font-mono font-black text-[#EFFF33] mt-0.5">
                    {simulatedETA} MIN
                  </span>
                </div>
              </div>

              {/* Manual navigation progress stepping */}
              <div className="flex items-center justify-between gap-3 pt-1">
                <div className="flex gap-1.5">
                  {steps.map((_, idx) => (
                    <div 
                      key={idx} 
                      className={`h-1.5 rounded-full transition-all duration-300 ${
                        idx === navStepIndex 
                          ? 'w-6 bg-[#EFFF33]' 
                          : idx < navStepIndex 
                            ? 'w-2 bg-white/40' 
                            : 'w-2 bg-white/10'
                      }`}
                    />
                  ))}
                </div>

                <div className="flex gap-2">
                  <button 
                    onClick={() => {
                      setIsNavigating(false);
                      setIsAutoPlaying(false);
                      setNavStepIndex(0);
                      speechService.speak("导航已结束。您也可以继续浏览其他路线。");
                    }}
                    className="px-4 py-2 border border-red-500/20 text-red-400 hover:text-white hover:bg-red-500 hover:border-red-500 rounded-xl text-[10px] uppercase font-black tracking-wider transition cursor-pointer"
                  >
                    结束 (END)
                  </button>
                  {navStepIndex < steps.length - 1 && (
                    <button 
                      onClick={() => setNavStepIndex(prev => prev + 1)}
                      className="px-4 py-2 bg-[#EFFF33] text-black hover:bg-[#d6e52c] rounded-xl text-[10px] uppercase font-black tracking-wider transition cursor-pointer"
                    >
                      下一站 (NEXT)
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })()}
          </>
        )}
      </main>

      {/* Bottom Interaction Bar */}
      <footer className="h-24 bg-[#141414] border-t border-white/5 flex items-center px-4 sm:px-8 gap-4 sm:gap-6 z-10 shrink-0 shadow-[0_-10px_30px_rgba(0,0,0,0.5)]">
        {/* Voice Indicator */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 flex-1 min-w-0">
          <div className="flex items-center gap-4">
            <button 
              onClick={toggleListening}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-all border shrink-0 ${
                isListening 
                  ? 'bg-[#EFFF33] text-black border-[#EFFF33] shadow-[0_0_20px_rgba(239,255,51,0.3)] animate-pulse' 
                  : 'bg-transparent text-white border-white/20 hover:bg-white/10'
              }`}
            >
              {isListening ? <Mic size={20} className="stroke-[3]" /> : <MicOff size={20} />}
            </button>

            {isListening ? (
              <div className="flex gap-1 items-center h-8">
                <div className="w-1.5 h-4 bg-[#EFFF33] rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
                <div className="w-1.5 h-8 bg-[#EFFF33] rounded-full animate-bounce" style={{animationDelay: '100ms'}}></div>
                <div className="w-1.5 h-6 bg-[#EFFF33] rounded-full animate-bounce" style={{animationDelay: '200ms'}}></div>
                <div className="w-1.5 h-10 bg-[#EFFF33] rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div>
              </div>
            ) : (
              <div className="flex gap-1 items-center h-8 opacity-20">
                <div className="w-1.5 h-2 bg-white rounded-full"></div>
                <div className="w-1.5 h-2 bg-white rounded-full"></div>
                <div className="w-1.5 h-2 bg-white rounded-full"></div>
                <div className="w-1.5 h-2 bg-white rounded-full"></div>
              </div>
            )}
          </div>

          <span className="hidden sm:block text-[10px] font-black uppercase text-white/40 tracking-[0.2em] truncate break-all max-w-[200px] md:max-w-md">
            {systemMessage}
          </span>
        </div>

        {/* Quick Text Input */}
        <form onSubmit={handleTextSubmit} className="relative w-48 sm:w-64 md:w-96 shrink-0 hidden lg:block">
          <input 
            type="text" 
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            placeholder="TYPE COMMAND..." 
            className="w-full bg-white/5 border border-white/10 rounded-full py-3 px-6 text-sm font-bold uppercase tracking-tight focus:outline-none focus:border-[#EFFF33] text-white placeholder-white/20"
          />
          <button type="submit" className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-white/50 hover:text-[#EFFF33] uppercase tracking-widest transition">Enter</button>
        </form>

        {/* System Settings / AI Status */}
        <div className="flex items-center gap-3 ml-auto shrink-0">
          <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-black uppercase border border-white/20">
            AI
          </div>
          <div className="hidden md:flex flex-col">
            <span className="text-[10px] font-black uppercase text-white/40 tracking-tighter">Voice Style</span>
            <span className="text-[10px] font-bold text-[#EFFF33] uppercase max-w-[100px] truncate">
               {selectedVoiceURI ? voices.find(v => v.voiceURI === selectedVoiceURI)?.name || 'DYNAMIC' : 'DYNAMIC ASSISTANT'}
            </span>
          </div>
        </div>
      </footer>

      {/* Visual Background Accents */}
      <div className="absolute inset-0 pointer-events-none opacity-5 z-[-1] overflow-hidden">
        <div className="absolute top-0 right-0 text-[300px] md:text-[400px] font-black -translate-y-1/2 translate-x-1/2 leading-none">NAV</div>
        <div className="absolute bottom-0 left-0 text-[300px] md:text-[400px] font-black translate-y-1/2 -translate-x-1/2 leading-none">01</div>
      </div>
    </div>
  );
}

// Action icon resolver for HUD
const getActionIcon = (action: string) => {
  switch (action) {
    case 'start':
      return <Navigation className="text-[#EFFF33] stroke-[2.5]" size={28} />;
    case 'left':
      return (
        <svg className="w-7 h-7 text-[#EFFF33]" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
      );
    case 'right':
      return (
        <svg className="w-7 h-7 text-[#EFFF33]" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
        </svg>
      );
    case 'waypoint':
      return <MapPin className="text-[#EFFF33] stroke-[2.5]" size={28} />;
    case 'arrive':
      return (
        <svg className="w-7 h-7 text-[#EFFF33]" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 21v-16m0 0V5a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5m-2 2h2m0 0h12" />
        </svg>
      );
    default:
      return <Navigation className="text-[#EFFF33] rotate-45 stroke-[2.5]" size={28} />;
  }
};

// Distance calculation utility (Haversine formula) in meters
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3; // Earth's radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) *
    Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // returns distance in meters
}


