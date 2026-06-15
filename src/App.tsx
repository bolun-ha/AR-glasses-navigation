import React, { useState, useEffect, useRef } from 'react';
import { MapWrapper, globalPlacesSearch } from './components/MapNavigation';
import { PlaceModel, processVoiceCommand } from './services/gemini';
import { speechService } from './services/speech';
import { Mic, MicOff, Settings, Search, X, Navigation, MapPin, Battery, Clock, Timer, Activity, Volume2, Sliders, Heart, Flag, ArrowLeftRight, Lightbulb } from 'lucide-react';

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
  const [navElapsedSeconds, setNavElapsedSeconds] = useState(0);
  
  // Real route data from AMap API (replaces hardcoded 5KM/12MIN)
  const [routeInfo, setRouteInfo] = useState<{distanceMeters: number, timeSeconds: number} | null>(null);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isNavigating) {
      interval = setInterval(() => {
        setNavElapsedSeconds(prev => prev + 1);
      }, 1000);
    } else {
      setNavElapsedSeconds(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isNavigating]);

  // AR Glass Mode States
  const [isARGlassMode, setIsARGlassMode] = useState(false);
  const [arSbsMode, setArSbsMode] = useState(false);
  const [mapOpacity, setMapOpacity] = useState(25); // Default 25% for see-through safety
  const [arThemeColor, setArThemeColor] = useState<'neon-yellow' | 'emerald-green' | 'neon-cyan'>('neon-yellow');
  const [showHUDSettings, setShowHUDSettings] = useState(false);

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
    document.addEventListener('click', handleGlobalClick);
    return () => document.removeEventListener('click', handleGlobalClick);
  }, []);

  const [isListening, setIsListening] = useState(false);
  const [inputText, setInputText] = useState("");
  const [systemMessage, setSystemMessage] = useState("Hello! I am your voice assistant. Try saying 'I want to go to McDonalds'.");
  
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>("");
  const [showSettings, setShowSettings] = useState(false);
  
  const [origin, setOrigin] = useState<PlaceModel | null>(null);
  const [manualOriginQuery, setManualOriginQuery] = useState("");
  const [manualDestQuery, setManualDestQuery] = useState("");
  const [searchType, setSearchType] = useState<'origin' | 'destination'>('destination');

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

    const formatTimer = (totalSecs: number) => {
      const hours = Math.floor(totalSecs / 3600);
      const minutes = Math.floor((totalSecs % 3600) / 60);
      const seconds = totalSecs % 60;
      const pad = (num: number) => String(num).padStart(2, '0');
      if (hours > 0) {
         return `${hours}:${pad(minutes)}:${pad(seconds)}`;
      }
      return `${pad(minutes)}:${pad(seconds)}`;
    };

    const getHUDActionIcon = (action: string) => {
      switch (action) {
        case 'start':
          return <Navigation className="stroke-[2.5] select-none" size={18} />;
        case 'left':
          return (
            <svg className="w-5 h-5 select-none" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          );
        case 'right':
          return (
            <svg className="w-5 h-5 select-none" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          );
        case 'waypoint':
          return <MapPin className="stroke-[2.5] select-none" size={18} />;
        case 'arrive':
          return (
            <svg className="w-5 h-5 select-none" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          );
        default:
          return <Navigation className="rotate-45 stroke-[2.5] select-none" size={18} />;
      }
    };

    return (
      <div className={`w-full max-w-lg mx-auto flex flex-col justify-between h-full py-4 px-6 relative text-left font-mono ${arSbsMode ? 'scale-[0.85]' : ''}`}>
        
        {/* Optical Center Crosshair (Extremely subtle, non-blocking center vision) */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.08]">
          <div className={`w-12 h-12 rounded-full border border-dashed ${
            arThemeColor === 'emerald-green' ? 'border-[#00FF66]' : arThemeColor === 'neon-cyan' ? 'border-[#00E5FF]' : 'border-[#EFFF33]'
          }`}></div>
          <div className={`absolute w-16 h-[1px] ${
            arThemeColor === 'emerald-green' ? 'bg-[#00FF66]' : arThemeColor === 'neon-cyan' ? 'bg-[#00E5FF]' : 'bg-[#EFFF33]'
          }`}></div>
          <div className={`absolute h-16 w-[1px] ${
            arThemeColor === 'emerald-green' ? 'bg-[#00FF66]' : arThemeColor === 'neon-cyan' ? 'bg-[#00E5FF]' : 'bg-[#EFFF33]'
          }`}></div>
        </div>

        {/* TOP STATUS BAR: Time, Stopwatch and System Readings — Emoji-free & Lucide icons */}
        <div className="flex flex-col gap-1 shrink-0 select-none z-20">
          <div className="flex justify-between items-center px-4 py-2 border border-white/10 rounded-xl bg-black/60 relative overflow-hidden backdrop-blur-md">
            <div className="flex items-center gap-2.5">
              <span className={`text-[9px] font-black tracking-widest ${textHex} flex items-center gap-1.5`}>
                <Battery size={11} className="stroke-[2.5]" /> <span>85%</span>
              </span>
              <span className="text-[8px] text-white/30 uppercase font-bold">
                | HDG: {headingDegrees}° {headingText}
              </span>
            </div>
            
            <div className="flex items-center gap-3.5 font-mono text-[10px] font-bold text-white/95">
              <div className="flex items-center gap-1">
                <Clock size={11} className="text-white/40 stroke-[2.5]" />
                <span>{new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Timer size={11} className={`${textHex} stroke-[2.5]`} />
                <span className={textHex}>{formatTimer(navElapsedSeconds)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* UPPER RIGHT FLIGHT DIRECTIVE: Floating Turn Icon Overlay */}
        {currentStep && (
          <div className="absolute top-[4.2rem] right-6 p-2.5 rounded-xl bg-black/60 border border-white/10 text-right select-none pointer-events-none z-20 backdrop-blur-md shadow-[0_4px_12px_rgba(0,0,0,0.5)]">
            <div className="flex items-center gap-2 justify-end">
              <span className="text-[8px] text-white/40 font-bold uppercase tracking-wider">NEXT TURN</span>
              <div className={`p-1.5 rounded-full bg-white/5 border border-white/15 ${textHex}`}>
                {getHUDActionIcon(currentStep.action)}
              </div>
            </div>
            <span className={`text-lg font-black block tracking-tighter ${textHex} font-mono mt-1 leading-none`}>
              {simulatedDistance >= 1000 
                ? `${(simulatedDistance / 1000).toFixed(1)} KM` 
                : `${simulatedDistance} M`
              }
            </span>
            <span className="text-[7.5px] text-white/60 block max-w-[120px] truncate uppercase font-bold mt-1">
              {currentStep.action === 'left' && "准备左转弯"}
              {currentStep.action === 'right' && "准备右转弯"}
              {currentStep.action === 'straight' && "保持直行"}
              {currentStep.action === 'waypoint' && "途径中转点"}
              {currentStep.action === 'arrive' && "抵达目的地"}
              {currentStep.action === 'start' && "沿当前方向出发"}
            </span>
          </div>
        )}

        {/* MAIN HUD CONTENT: Displays dynamic dashboard metrics in the mid-lower section, center stays blank for driving focus */}
        <div className="flex-1 flex flex-col justify-end py-2 relative my-auto">
          {currentStep ? (
            <div className="w-full flex flex-col gap-3.5 mt-auto">
              
              {/* Core Dashboard Row (Telemetry) — Styled beautifully to match actual cycling HUD products */}
              <div className="grid grid-cols-4 gap-3.5 w-full py-3 px-1.5 border border-white/10 bg-[#000000]/65 backdrop-blur-md rounded-xl select-none z-10 shadow-[0_4px_12px_rgba(0,0,0,0.4)]">
                {/* SPD Indicator */}
                <div className="flex flex-col items-center border-r border-white/5">
                  <span className="text-[7.5px] opacity-40 uppercase font-black tracking-wider text-white">SPD (km/h)</span>
                  <span className={`text-2xl font-black font-mono tracking-tighter mt-1 leading-none ${textHex}`}>
                    {isAutoPlaying ? simulatedSpeed : (navStepIndex === 0 ? 0 : Math.round(22 + Math.cos(navElapsedSeconds / 10) * 3))}
                  </span>
                </div>
                
                {/* GRAD Indicator */}
                <div className="flex flex-col items-center border-r border-white/5">
                  <span className="text-[7.5px] opacity-40 uppercase font-black tracking-wider text-white">GRAD (%)</span>
                  <span className={`text-2xl font-black font-mono tracking-tighter mt-1 leading-none ${textHex}`}>
                    {navStepIndex === 0 ? '0' : (navStepIndex % 2 === 0 ? `+${(3 + Math.sin(navElapsedSeconds / 6) * 1.5).toFixed(0)}` : `-${(1 + Math.cos(navElapsedSeconds / 4) * 0.5).toFixed(0)}`)}%
                  </span>
                </div>

                {/* CAD Indicator */}
                <div className="flex flex-col items-center border-r border-white/5">
                  <span className="text-[7.5px] opacity-40 uppercase font-black tracking-wider text-white">CAD (rpm)</span>
                  <span className={`text-2xl font-black font-mono tracking-tighter mt-1 leading-none ${textHex}`}>
                    {navStepIndex === 0 ? '0' : Math.round(82 + Math.sin(navElapsedSeconds / 5) * 4)}
                  </span>
                </div>

                {/* HR Pulse Indicator — Sleek beating stroke icon */}
                <div className="flex flex-col items-center">
                  <span className="text-[7.5px] opacity-40 uppercase font-black tracking-wider text-white flex items-center gap-1 select-none">
                    HR <Heart size={8} className="fill-red-500 stroke-red-500 animate-pulse" />
                  </span>
                  <span className="text-2xl font-black font-mono tracking-tighter mt-1 leading-none text-white">
                    {navStepIndex === 0 ? '72' : Math.round(124 + Math.sin(navElapsedSeconds / 12) * 5)}
                  </span>
                </div>
              </div>

              {/* HUD Subtitle Glassmorphic Box  */}
              <div className="w-full select-none z-10">
                <div className="p-3 rounded-xl bg-black/60 border border-white/5 backdrop-blur-md relative overflow-hidden shadow-[0_4px_12px_rgba(0,0,0,0.5)]">
                  <div className="flex justify-between items-center mb-1">
                    <span className={`text-[8px] font-black uppercase tracking-[0.15em] ${textHex} flex items-center gap-1`}>
                      <Volume2 size={11} className="stroke-[2.5]" /> HUD Speech Guidance
                    </span>
                    <span className="text-[8px] text-white/30 uppercase font-bold font-sans">
                      ROUTE: {origin ? origin.displayName?.slice(0, 8) : "自适应"} ➔ {destination?.displayName?.slice(0, 8) || "目的地"}
                    </span>
                  </div>
                  <p className="text-[11px] font-bold text-white/90 leading-relaxed font-sans mt-0.5">
                    {currentStep.text}
                  </p>
                </div>
              </div>

            </div>
          ) : (
            <div className="w-full flex flex-col items-center justify-center text-center py-6 select-none z-10 bg-black/40 backdrop-blur-md border border-white/5 rounded-2xl">
              <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center animate-bounce ${
                arThemeColor === 'emerald-green' ? 'border-[#00FF66] text-[#00FF66]' : arThemeColor === 'neon-cyan' ? 'border-[#00E5FF] text-[#00E5FF]' : 'border-[#EFFF33] text-[#EFFF33]'
              }`}>
                ▲
              </div>
              <h4 className="text-xs font-bold text-white uppercase mt-4 tracking-widest">
                No Active Guidance
              </h4>
              <p className="text-[9px] text-white/50 uppercase mt-1.5 max-w-[280px]">
                Say "I want to go to Beijing Zoo" or use search to establish routes & launch HUD.
              </p>
            </div>
          )}

          {/* Voice Microphone Standby Panel — High-tech minimalist indicator */}
          <div className="w-full mt-3 flex items-center justify-between border-t border-white/5 pt-2.5 min-h-[30px] select-none z-10">
            <div className="flex items-center gap-2">
              <span className={`text-[8px] font-black uppercase tracking-wider ${textHex} flex items-center gap-1.5`}>
                {isListening ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse shrink-0" />
                    <span>MIC ACTIVE</span>
                  </>
                ) : (
                  <>
                    <span className={`w-1.5 h-1.5 rounded-full opacity-60 shrink-0 ${
                      arThemeColor === 'emerald-green' ? 'bg-[#00FF66]' : arThemeColor === 'neon-cyan' ? 'bg-[#00E5FF]' : 'bg-[#EFFF33]'
                    }`} />
                    <span>HUD STANDBY</span>
                  </>
                )}
              </span>
            </div>

            {isListening ? (
              <div className="flex gap-1 items-center">
                <div className={`w-0.5 h-2 rounded-full animate-bounce ${
                  arThemeColor === 'emerald-green' ? 'bg-[#00FF66]' : arThemeColor === 'neon-cyan' ? 'bg-[#00E5FF]' : 'bg-[#EFFF33]'
                }`} style={{animationDelay: '0ms'}} />
                <div className={`w-0.5 h-4 rounded-full animate-bounce ${
                  arThemeColor === 'emerald-green' ? 'bg-[#00FF66]' : arThemeColor === 'neon-cyan' ? 'bg-[#00E5FF]' : 'bg-[#EFFF33]'
                }`} style={{animationDelay: '100ms'}} />
                <div className={`w-0.5 h-3 rounded-full animate-bounce ${
                  arThemeColor === 'emerald-green' ? 'bg-[#00FF66]' : arThemeColor === 'neon-cyan' ? 'bg-[#00E5FF]' : 'bg-[#EFFF33]'
                }`} style={{animationDelay: '200ms'}} />
                <div className={`w-0.5 h-5 rounded-full animate-bounce ${
                  arThemeColor === 'emerald-green' ? 'bg-[#00FF66]' : arThemeColor === 'neon-cyan' ? 'bg-[#00E5FF]' : 'bg-[#EFFF33]'
                }`} style={{animationDelay: '300ms'}} />
              </div>
            ) : (
              <div className="flex gap-0.5 opacity-25">
                <div className="w-1 h-1 bg-white rounded-full" />
                <div className="w-1 h-1 bg-white rounded-full" />
                <div className="w-1 h-1 bg-white rounded-full" />
              </div>
            )}
          </div>
        </div>

        {/* HUD SETTINGS POPUP overlay nested beautifully inside AR view boundaries */}
        {showHUDSettings && (
          <div 
            className="absolute inset-x-6 bottom-24 p-4 rounded-2xl bg-black/95 border shadow-2xl z-40 pointer-events-auto backdrop-blur-xl flex flex-col gap-3 font-sans transition-all duration-300 animate-in fade-in slide-in-from-bottom-5"
            style={{ 
              borderColor: arThemeColor === 'emerald-green' ? '#00FF6640' : arThemeColor === 'neon-cyan' ? '#00E5FF40' : '#EFFF3340' 
            }}
          >
            <div className="flex justify-between items-center border-b border-white/10 pb-2">
              <span className={`text-[10px] font-black uppercase tracking-[0.15em] ${textHex} flex items-center gap-1.5`}>
                <Sliders size={12} className="stroke-[2]" /> HUD 投射系统配置 (Config)
              </span>
              <button 
                onClick={() => setShowHUDSettings(false)} 
                className="text-white/40 hover:text-white p-1 rounded-full hover:bg-white/5 transition"
              >
                <X size={12} className="stroke-[2.5]" />
              </button>
            </div>
            
            {/* SBS mode */}
            <div className="flex flex-col gap-1 text-left">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={arSbsMode}
                  onChange={(e) => setArSbsMode(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-white/20 bg-transparent text-emerald-500 focus:ring-0 focus:outline-none"
                />
                <span className="text-[10px] uppercase tracking-[0.05em] text-white/80 font-bold">左右双目分屏 (3D SBS Layout)</span>
              </label>
              <span className="text-[9px] text-white/40 pl-6 leading-relaxed">
                {arSbsMode ? "已开启双目立体穿透画面。适用于VR纸盒、双镜头AR头显。" : "单目居中宽屏投影模式。适合大多数AR智能眼镜外接显示。"}
              </span>
            </div>

            {/* Opacity */}
            <div className="flex flex-col gap-1.5 text-left mt-1">
              <div className="flex justify-between items-center text-[10px] text-white/40 uppercase font-black">
                <span>实景地图安全透射度 (Map Opacity)</span>
                <span className={`${textHex} font-mono font-bold`}>{mapOpacity}%</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="100" 
                value={mapOpacity} 
                onChange={(e) => setMapOpacity(Number(e.target.value))}
                className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#EFFF33]"
                style={{
                  accentColor: arThemeColor === 'emerald-green' ? '#00FF66' : arThemeColor === 'neon-cyan' ? '#00E5FF' : '#EFFF33'
                }}
              />
            </div>

            {/* Color Theme */}
            <div className="flex flex-col gap-1 text-left mt-1">
              <span className="text-[10px] text-white/40 uppercase font-black mb-1">HUD 界面投影配色 (System Theme)</span>
              <div className="grid grid-cols-3 gap-2 mt-0.5">
                {[
                  { value: 'neon-yellow', label: '暖橙黄', hex: '#EFFF33' },
                  { value: 'emerald-green', label: '翡翠绿', hex: '#00FF66' },
                  { value: 'neon-cyan', label: '霓虹青', hex: '#00E5FF' }
                ].map(item => (
                  <button 
                    key={item.value}
                    onClick={() => setArThemeColor(item.value as any)}
                    className="text-[10px] font-black py-2 rounded-xl uppercase select-none transition cursor-pointer flex items-center justify-center gap-1.5"
                    style={{
                      backgroundColor: arThemeColor === item.value ? item.hex : 'rgba(255,255,255,0.05)',
                      color: arThemeColor === item.value ? '#000000' : 'rgba(255,255,255,0.6)'
                    }}
                  >
                    <span 
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: arThemeColor === item.value ? '#000000' : item.hex }}
                    />
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* BOTTOM PANEL: Control Buttons */}
        {eye !== 'right' && (
          <div className="w-full shrink-0 pt-2 border-t border-white/10 flex items-center justify-between text-[9px] pointer-events-auto z-20">
            <span className="text-white/40 tracking-wider">EYE-{eye.toUpperCase()}</span>
            
            <div className="flex gap-2">
              <button 
                onClick={() => {
                  setIsARGlassMode(false);
                  setArSbsMode(false);
                  setShowHUDSettings(false);
                }}
                className="px-2.5 py-1.5 border border-white/20 text-white/70 rounded-lg hover:bg-white/10 transition text-[9px] uppercase font-black cursor-pointer"
              >
                退出 (Exit)
              </button>

              <button 
                onClick={() => {
                  setShowHUDSettings(prev => !prev);
                }}
                className="px-2.5 py-1.5 border rounded-lg transition text-[9px] uppercase font-black cursor-pointer flex items-center gap-1"
                style={{
                  color: showHUDSettings ? (arThemeColor === 'emerald-green' ? '#00FF66' : arThemeColor === 'neon-cyan' ? '#00E5FF' : '#EFFF33') : '#ffffffcc',
                  borderColor: showHUDSettings ? (arThemeColor === 'emerald-green' ? '#00FF66' : arThemeColor === 'neon-cyan' ? '#00E5FF' : '#EFFF33') : 'rgba(255,255,255,0.2)',
                  backgroundColor: showHUDSettings ? 'rgba(255,255,255,0.05)' : undefined
                }}
              >
                <Sliders size={10} className="stroke-[2.5]" /> HUD 参数
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
                    className="px-2.5 py-1.5 border border-red-500/20 text-red-400 rounded-lg hover:bg-red-500 hover:text-white transition text-[9px] uppercase font-black cursor-pointer"
                  >
                    结束 (End)
                  </button>
                  {navStepIndex < steps.length - 1 && (
                    <button 
                      onClick={() => setNavStepIndex(prev => prev + 1)}
                      className={`px-2.5 py-1.5 rounded-lg transition text-[9px] uppercase font-black cursor-pointer ${btnBg}`}
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
    
    const start = (origin && origin.location) ? origin.location : (currentLocation || { lat: 39.90872, lng: 116.39748 });
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
    const totalDistKm = routeInfo ? (routeInfo.distanceMeters / 1000).toFixed(1) : "5.0";
    const totalTimeMin = routeInfo ? Math.round(routeInfo.timeSeconds / 60) : 12;
    steps.push({
      text: `准备出发。起点：${origin ? origin.displayName : "当前位置"}，终点：${destination.displayName}。全程预计行驶${totalDistKm}公里，大约需要${totalTimeMin}分钟。请沿当前道路向前行驶。`,
      action: 'start',
      location: start,
      distanceLeftMeters: routeInfo?.distanceMeters || 5000,
      etaLeftMinutes: totalTimeMin,
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
        setShowManualSearch(false);
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

  const handleRouteSearch = async (type: 'origin' | 'destination') => {
    const query = type === 'origin' ? manualOriginQuery : manualSearchQuery;
    if (!query.trim()) return;
    setSearchType(type);
    setSystemMessage(`Searching ${type === 'origin' ? '起点' : '终点'}: "${query}"...`);
    const results = await globalPlacesSearch(query, currentLocation);
    setSearchResults(results);
    setSystemMessage(results.length > 0 ? `已找到候选地址。请在下方列表中选择一个作为${type === 'origin' ? '起点' : '终点'}` : "未找到匹配地址。");
  };

  const handleSwapOriginDest = () => {
    const tempOrig = origin;
    const tempOrigQ = manualOriginQuery;
    setOrigin(destination);
    setManualOriginQuery(manualSearchQuery);
    setDestination(tempOrig);
    setManualSearchQuery(tempOrigQ);
    setManualDestQuery(tempOrigQ);
  };

  const handleManualSearchSubmit = async (e: React.FormEvent) => {
     e.preventDefault();
     handleRouteSearch('destination');
  };

  return (
    <div className="w-full h-screen bg-[#0A0A0A] text-white font-sans flex flex-col overflow-hidden relative">
      {/* Top Status Bar */}
      {!isARGlassMode && (
        <header className="flex justify-between items-center px-4 sm:px-8 py-4 sm:py-6 border-b border-white/10 z-[100] bg-[#0A0A0A] shrink-0 shadow-xl relative">
          <div className="flex flex-col flex-1 min-w-0 pr-4">
            {!isNavigating ? (
              <>
                <span className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-bold mb-1 block truncate font-sans">Current Route</span>
                <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                  <span className="text-xs md:text-sm font-semibold text-white/50 truncate max-w-[150px] shrink-0" title={origin ? origin.displayName : "当前位置"}>
                    {origin ? origin.displayName : "当前位置"}
                  </span>
                  <span className="text-white/30 text-[10px] shrink-0">➔</span>
                  <span className="text-lg md:text-xl font-bold tracking-tight uppercase truncate text-[#EFFF33] max-w-[200px]" title={destination ? destination.displayName : "NO DESTINATION SET"}>
                    {destination ? destination.displayName : "NO DESTINATION SET"}
                  </span>
                  {(destination || origin || waypoints.length > 0) && (
                    <button 
                      onClick={() => {
                        setDestination(null);
                        setOrigin(null);
                        setWaypoints([]);
                        setManualOriginQuery("");
                        setManualSearchQuery("");
                      }}
                      className="text-[10px] font-black tracking-tight text-white/60 hover:text-red-400 border border-white/20 hover:border-red-500/30 bg-white/5 hover:bg-white/10 px-2 px-1 rounded-lg transition uppercase duration-200 cursor-pointer ml-1"
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
              </>
            ) : (
              <div className="flex items-center gap-2 font-sans select-none">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest sm:block hidden">
                  语音引导导航进行中 (Voice Guidance Navigation Active)
                </span>
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest sm:hidden">
                  导航进行中...
                </span>
              </div>
            )}
          </div>
          <div className="flex gap-4 md:gap-8 text-right shrink-0 items-center">
            {!isNavigating && (
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-bold mb-1 block">Waypoints</span>
                <span className="text-xl md:text-2xl font-bold tracking-tight uppercase">{waypoints.length}</span>
              </div>
            )}
            <div className="flex gap-2">
              {!isNavigating && (
                <button 
                  onClick={() => {
                    setShowManualSearch(!showManualSearch);
                    setShowSettings(false);
                  }}
                  className="w-10 h-10 flex items-center justify-center font-black uppercase text-white/40 hover:text-white transition bg-white/5 hover:bg-white/10 rounded-full"
                >
                  <Search size={18} />
                </button>
              )}
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
                            <div className="flex flex-col gap-1">
                              <label className="flex items-center gap-3 cursor-pointer">
                                <input 
                                  type="checkbox" 
                                  checked={arSbsMode}
                                  onChange={(e) => setArSbsMode(e.target.checked)}
                                  className="w-4 h-4 rounded border-[#EFFF33] bg-transparent text-[#EFFF33]"
                                  style={{
                                    accentColor: arThemeColor === 'emerald-green' ? '#00FF66' : arThemeColor === 'neon-cyan' ? '#00E5FF' : '#EFFF33'
                                  }}
                                />
                                <span className="text-[9px] uppercase tracking-[0.1em] text-white/70 font-bold">左右分屏 (3D SBS)</span>
                              </label>
                              <span className="text-[8px] text-white/40 ml-7 leading-relaxed flex items-start gap-1 font-sans select-none">
                                <Lightbulb size={10} className="shrink-0 text-[#EFFF33]" />
                                <span>
                                  {arSbsMode 
                                    ? "已开启 SBS 3D 双目分屏。若看到两个独立画面，请关闭此项并调回单目居中投屏。" 
                                    : "默认单目居中（推荐大多数普通投屏 AR 眼镜，请保持关闭）"
                                  }
                                </span>
                              </span>
                            </div>
  
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
                                style={{
                                  accentColor: arThemeColor === 'emerald-green' ? '#00FF66' : arThemeColor === 'neon-cyan' ? '#00E5FF' : '#EFFF33'
                                }}
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
            <div className="absolute top-full left-0 w-full bg-[#1A1A1A] border-b border-white/10 p-5 shadow-2xl z-50">
               <div className="max-w-3xl mx-auto flex flex-col gap-4">
                  <div className="flex flex-col md:flex-row gap-4 items-end">
                     {/* 起点 (Start / Origin) */}
                     <div className="flex-1 flex flex-col gap-1.5 w-full">
                        <span className="text-[10px] uppercase tracking-[0.2em] text-[#EFFF33] font-black font-sans flex items-center gap-1 select-none">
                          <MapPin size={11} className="text-[#EFFF33]" /> 起点 (Start / Origin)
                        </span>
                        <div className="flex gap-2">
                          <input 
                            type="text"
                            placeholder="输入起点 (默认: 当前位置)..." 
                            value={manualOriginQuery}
                            onChange={e => setManualOriginQuery(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleRouteSearch('origin');
                              }
                            }}
                            className="flex-1 bg-[#0A0A0A] border border-white/20 rounded-xl py-2.5 px-4 text-white focus:outline-none focus:border-[#EFFF33] text-sm"
                          />
                          <button 
                            onClick={() => handleRouteSearch('origin')}
                            className="bg-[#EFFF33]/15 text-[#EFFF33] border border-[#EFFF33]/30 px-4 rounded-xl font-bold text-xs uppercase hover:bg-[#EFFF33]/30 transition shrink-0 cursor-pointer"
                          >
                            搜索起点
                          </button>
                        </div>
                        {origin && (
                          <div className="flex items-center gap-1.5 text-xs text-white/60">
                            <span className="font-bold text-[#EFFF33]">已选起点:</span>
                            <span className="truncate max-w-[200px]">{origin.displayName}</span>
                            <button 
                              onClick={() => { setOrigin(null); setManualOriginQuery(""); }}
                              className="text-red-400 hover:underline cursor-pointer"
                            >
                              [清除]
                            </button>
                          </div>
                        )}
                     </div>
  
                     {/* 终点 (Destination) */}
                     <div className="flex-1 flex flex-col gap-1.5 w-full">
                        <span className="text-[10px] uppercase tracking-[0.2em] text-[#EFFF33] font-black font-sans flex items-center gap-1 select-none">
                          <Flag size={11} className="text-[#00FF66]" /> 终点 (Destination)
                        </span>
                        <div className="flex gap-2">
                          <input 
                            type="text"
                            placeholder="请输入终点..." 
                            value={manualSearchQuery}
                            onChange={e => setManualSearchQuery(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleRouteSearch('destination');
                              }
                            }}
                            className="flex-1 bg-[#0A0A0A] border border-white/20 rounded-xl py-2.5 px-4 text-white focus:outline-none focus:border-[#EFFF33] text-sm"
                          />
                          <button 
                            onClick={() => handleRouteSearch('destination')}
                            className="bg-[#EFFF33] text-black px-4 rounded-xl font-bold text-xs uppercase hover:bg-[#d6e52c] transition shrink-0 cursor-pointer"
                          >
                            搜索终点
                          </button>
                        </div>
                        {destination && (
                          <div className="flex items-center gap-1.5 text-xs text-white/60">
                            <span className="font-bold text-[#00FF66]">已选终点:</span>
                            <span className="truncate max-w-[200px]">{destination.displayName}</span>
                            <button 
                              onClick={e => { e.preventDefault(); setDestination(null); setManualSearchQuery(""); }}
                              className="text-red-400 hover:underline cursor-pointer font-sans"
                            >
                              [清除]
                            </button>
                          </div>
                        )}
                     </div>
                  </div>
  
                  <div className="flex justify-between items-center border-t border-white/5 pt-3 mt-1 text-xs text-white/40 font-sans">
                    <span>提示：在输入框内回车或点击按钮搜索，在下方列表选择即可定位起终点。</span>
                    {(origin || destination) && (
                      <button 
                        onClick={handleSwapOriginDest}
                        className="text-[#EFFF33] hover:underline font-bold uppercase tracking-widest cursor-pointer flex items-center gap-1.5 py-1 px-2 rounded hover:bg-white/5 transition select-none"
                      >
                        <ArrowLeftRight size={11} /> 对调起终点
                      </button>
                    )}
                  </div>
               </div>
            </div>
          )}
        </header>
      )}

      {/* Main Navigation Area */}
      <main className={`flex-1 flex flex-col relative overflow-hidden py-4 ${isARGlassMode ? 'bg-[#000000]' : 'bg-black'}`}>
        
        {/* Map Container */}
        <div 
          className={`absolute transition-all duration-500 ease-in-out ${
            isARGlassMode && isNavigating && !arSbsMode
              ? `bottom-20 right-6 w-[220px] h-[220px] rounded-[24px] border-2 shadow-2xl overflow-hidden pointer-events-auto z-30 ${
                  arThemeColor === 'emerald-green' ? 'border-[#00FF66]/40 shadow-[#00FF66]/10' : arThemeColor === 'neon-cyan' ? 'border-[#00E5FF]/40 shadow-[#00E5FF]/10' : 'border-[#EFFF33]/40 shadow-[#EFFF33]/15'
                }`
              : 'inset-0 z-0'
          }`}
          style={{ opacity: isARGlassMode ? mapOpacity / 100 : 1 }}
        >
           <MapWrapper 
             currentLocation={currentLocation} 
             origin={origin}
             destination={destination}
             waypoints={waypoints}
             searchResults={searchResults}
             simulatedLocation={simulatedLocation} hideControls={isARGlassMode}
             onRouteUpdate={(info) => setRouteInfo(info)}
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
                <div key={res.id} className="flex flex-col sm:flex-row justify-start sm:justify-between sm:items-start bg-white/10 sm:bg-transparent rounded-xl p-3 sm:p-2 border-b border-black/10 gap-3 sm:gap-4 relative group hover:bg-black/5 transition duration-150">
                  <div 
                    onClick={() => { 
                      if (searchType === 'origin') {
                        setOrigin(res);
                      } else {
                        setDestination(res);
                      }
                      setSearchResults([]); 
                    }}
                    className="flex-1 min-w-0 pr-2 cursor-pointer hover:opacity-85"
                    title={searchType === 'origin' ? "点击设为起点" : "点击设为终点"}
                  >
                    <span className="text-xs font-black block opacity-70 mb-0.5">0{i+1}.</span>
                    <span className="text-base sm:text-lg font-black uppercase truncate block leading-tight">{res.displayName}</span>
                    <span className="text-xs font-medium opacity-60 truncate block mt-0.5">{res.address || 'No address'}</span>
                  </div>
                  
                  <div className="flex flex-col sm:items-end gap-2 shrink-0 justify-center">
                    <span className="text-sm sm:text-base font-black italic opacity-60">
                      {res.distanceMeters ? `${res.distanceMeters}m` : ''}
                    </span>
                    <div className="flex gap-1.5 w-full sm:w-auto mt-1 sm:mt-0 opacity-100 flex-wrap justify-end">
                      {searchType === 'origin' ? (
                        <button 
                          onClick={() => { setOrigin(res); setSearchResults([]); }}
                          className="flex-1 sm:flex-none flex items-center justify-center gap-1 bg-black text-white text-[10.5px] uppercase font-bold py-1.5 px-3 rounded-xl hover:bg-black/80 transition cursor-pointer shadow-sm select-none"
                          title="设为起点 / Set as Start Point"
                        >
                           <MapPin size={12} className="shrink-0" /> <span>设为起点</span>
                        </button>
                      ) : (
                        <>
                          <button 
                            onClick={() => { setDestination(res); setSearchResults([]); }}
                            className="flex-1 sm:flex-none flex items-center justify-center gap-1 bg-black text-white text-[10.5px] uppercase font-bold py-1.5 px-3 rounded-xl hover:bg-black/80 transition cursor-pointer shadow-sm select-none"
                            title="设为终点 / Set as Destination"
                          >
                             <Navigation size={12} className="shrink-0" /> <span>设为终点</span>
                          </button>
                          <button 
                            onClick={() => { setWaypoints(prev => [...prev, res]); setSearchResults([]); }}
                            className="flex-1 sm:flex-none flex items-center justify-center gap-1 bg-black text-[#EFFF33] text-[10.5px] uppercase font-bold py-1.5 px-3 rounded-xl hover:bg-black/80 transition cursor-pointer shadow-sm select-none"
                            title="加为途经点 / Add Destination Waypoint"
                          >
                             <MapPin size={12} className="shrink-0 text-[#EFFF33]" /> <span>加为途经</span>
                          </button>
                        </>
                      )}
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
              <h3 className="text-xl font-bold tracking-tight uppercase text-white mt-1 truncate">🏁 {destination.displayName}</h3>
              <p className="text-xs text-white/50 truncate mt-0.5 font-sans">📍 起点: {origin ? origin.displayName : "当前自适应位置"}</p>
            </div>
            
            <div className="grid grid-cols-2 gap-4 border-y border-white/10 py-3.5">
              <div className="flex flex-col">
                <span className="text-[9px] uppercase tracking-[0.1em] text-white/40 font-bold">Total Distance</span>
                <span className="text-base font-mono font-bold text-white uppercase">
                  {routeInfo
                    ? `${(routeInfo.distanceMeters / 1000).toFixed(1)} KM`
                    : waypoints.length > 0
                      ? `${(5.0 + waypoints.length * 1.5).toFixed(1)} KM`
                      : "5.0 KM"}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] uppercase tracking-[0.1em] text-white/40 font-bold">Estimated Time</span>
                <span className="text-base font-mono font-bold text-white uppercase">
                  {routeInfo
                    ? `${Math.round(routeInfo.timeSeconds / 60)} MIN`
                    : waypoints.length > 0
                      ? `${12 + waypoints.length * 4} MIN`
                      : "12 MIN"}
                </span>
              </div>
            </div>
            
            <button 
              onClick={() => {
                setIsNavigating(true);
                setNavStepIndex(0);
                setLastSpokenStepIndex(null);
                setIsAutoPlaying(false); // Default to Real-world GPS/manual mode to prevent auto-scrolling
                setShowManualSearch(false);
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
      {!isARGlassMode && (
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
      )}

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


