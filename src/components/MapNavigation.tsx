import { useEffect, useRef, useState } from 'react';
import AMapLoader from '@amap/amap-jsapi-loader';
import { PlaceModel } from '../services/gemini';

// Route step data type — maps 1:1 to AMap route step segments
export interface RouteStep {
  text: string;           // Navigation instruction text
  action: 'start' | 'straight' | 'left' | 'right' | 'waypoint' | 'arrive';
  location: { lat: number; lng: number };
  distanceMeters: number; // Distance of this step segment
  timeSeconds: number;    // Time of this step segment
  totalDistanceMeters: number; // Cumulative remaining distance to destination
  totalTimeSeconds: number;    // Cumulative remaining time to destination
}

export interface RouteInfo {
  distanceMeters: number;
  timeSeconds: number;
  steps: RouteStep[];
}

const AMAP_KEY =
  process.env.AMAP_KEY ||
  (import.meta as any).env?.VITE_AMAP_KEY ||
  (globalThis as any).AMAP_KEY ||
  '';

const AMAP_SECURITY_CODE =
  process.env.AMAP_SECURITY_CODE ||
  (import.meta as any).env?.VITE_AMAP_SECURITY_CODE ||
  (globalThis as any).AMAP_SECURITY_CODE ||
  '';

const hasValidKey = Boolean(AMAP_KEY) && AMAP_KEY.length > 15 && !AMAP_KEY.includes('YOUR');

export let globalPlacesSearch: (query: string, location: {lat: number, lng: number} | null) => Promise<PlaceModel[]> = async () => [];

export function MapWrapper({ 
  currentLocation,
  origin,
  destination,
  waypoints,
  searchResults,
  simulatedLocation,
  hideControls,
  onRouteUpdate,
  rerouteTrigger
}: {
  currentLocation: {lat: number, lng: number} | null,
  origin: PlaceModel | null,
  destination: PlaceModel | null,
  waypoints: PlaceModel[],
  searchResults: PlaceModel[],
  simulatedLocation?: {lat: number, lng: number} | null,
  hideControls?: boolean
  onRouteUpdate?: (info: RouteInfo) => void
  rerouteTrigger?: number
}) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const AMapRef = useRef<any>(null);
  
  const markersRef = useRef<any[]>([]);
  const currentLocMarkerRef = useRef<any>(null);
  const drivingRouteRef = useRef<any>(null);
  const ridingRouteRef = useRef<any>(null);
  const placeSearchRef = useRef<any>(null);
  const [routeMode, setRouteMode] = useState<'driving' | 'riding'>('riding');
  
  const [mapError, setMapError] = useState<string | null>(null);

  if (!hasValidKey) {
    return (
      <div className="flex items-center justify-center h-full bg-[#0A0A0A] text-white p-8 overflow-y-auto">
        <div className="text-center max-w-[600px] bg-white/5 p-8 rounded-3xl border border-white/10 shadow-2xl">
          <h2 className="text-2xl font-black uppercase mb-4 text-[#EFFF33] tracking-tighter">AMap API Key Required</h2>
          <p className="mb-4 text-white/70"><strong>Step 1:</strong> Get an API Key and Security Code from <a href="https://console.amap.com/" target="_blank" rel="noopener" className="text-[#EFFF33] underline">高德开放平台</a>.</p>
          <div className="bg-red-500/20 text-red-200 p-4 rounded-xl border border-red-500/30 mb-4 text-sm text-left">
             <strong>CRITICAL FIX FOR "Script error.":</strong><br/>
             1. You MUST create a <strong>Web端(JS API)</strong> key. If you created a "Web服务" (Web Service) key, it will cause a Script Error!<br/>
             2. You MUST set the <strong>Domain Whitelist (域名白名单)</strong> to be <strong>COMPLETELY EMPTY</strong> (allows all) or include <code className="text-[#EFFF33]">*.run.app</code>.
          </div>
          <p className="mb-4 text-white/70"><strong>Step 2:</strong> Add your keys as secrets in AI Studio:</p>
          <ul className="text-left text-sm text-white/60 space-y-2 mb-6">
            <li>Open <strong>Settings</strong> (⚙️ gear icon, <strong>top-right corner</strong>)</li>
            <li>Select <strong>Secrets</strong></li>
            <li>Add <code>AMAP_KEY</code> with your Web Application Key.</li>
            <li>Add <code>AMAP_SECURITY_CODE</code> with your Security Code.</li>
          </ul>
        </div>
      </div>
    );
  }

  // Effect. Initial map loading
  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Set security code if present
    if (AMAP_SECURITY_CODE) {
      (window as any)._AMapSecurityConfig = {
        securityJsCode: AMAP_SECURITY_CODE,
      };
    }

    AMapLoader.load({
      key: AMAP_KEY,
      version: '2.0',
      plugins: ['AMap.PlaceSearch', 'AMap.Driving', 'AMap.Riding', 'AMap.Geolocation'],
    }).then((AMap) => {
      AMapRef.current = AMap;
      
      const map = new AMap.Map(mapContainerRef.current, {
        viewMode: '2D', // Use 2D view for tiny AR map
        zoom: 13, // Initialization zoom level
        center: [116.397428, 39.90923], // Initial center (Beijing)
        mapStyle: 'amap://styles/darkblue', // Setup dark mode theme
        logo: false, // Hide AMap logo in AR mode
      });
      
      mapRef.current = map;

      // Initialize driving route plugin
      drivingRouteRef.current = new AMap.Driving({
        map: map,
        hideMarkers: false, // Let AMap draw start, end, and waypoint markers beautifully
      });

      // Initialize riding route plugin
      ridingRouteRef.current = new AMap.Riding({
        map: map,
        hideMarkers: false, // Let AMap draw start and end markers beautifully
      });

      // Initialize place search plugin (no auto markers — we draw our own)
      placeSearchRef.current = new AMap.PlaceSearch({
        pageSize: 5,
        pageIndex: 1,
        extensions: 'all'
      });
      placeSearchRef.current.setLang('zh');

      // Wire up the global search function
      globalPlacesSearch = async (query: string, location: {lat: number, lng: number} | null) => {
        return new Promise((resolve) => {
          if (!placeSearchRef.current) return resolve([]);
          
          const onComplete = (status: string, result: any) => {
            // Remove auto-generated markers from PlaceSearch (white strips)
            if (result?._instances) {
              result._instances.forEach((markers: any) => {
                if (markers instanceof AMap.Marker) {
                  map.remove(markers);
                }
              });
            }
            // Also check for other AMap auto-generated overlays
            // Some AMap versions put markers in result.poiList.pois[i]._marker
            if (result?.poiList?.pois) {
              result.poiList.pois.forEach((poi: any) => {
                if (poi._marker && poi._marker instanceof AMap.Marker) {
                  map.remove(poi._marker);
                  delete poi._marker;
                }
              });
            }
            if (status === 'complete' && result.info === 'OK') {
              const items = result.poiList.pois.map((poi: any) => ({
                id: poi.id,
                displayName: poi.name,
                address: poi.address,
                location: { lat: poi.location.lat, lng: poi.location.lng },
                distanceMeters: poi.distance,
              }));
              // Aggressive cleanup: remove AMap auto-markers after search
              setTimeout(() => {
                if (!mapRef.current || !AMapRef.current) return;
                const allOverlays = (mapRef.current as any).getAllOverlays && (mapRef.current as any).getAllOverlays('marker');
                if (allOverlays && Array.isArray(allOverlays)) {
                  // Only remove markers that are text-only labels (AMap auto-generated search markers)
                  allOverlays.forEach((m: any) => {
                    if (m instanceof AMapRef.current.Marker) {
                      const content = m.getContent && m.getContent();
                      if (content && typeof content === 'string' && content.includes('<div')) {
                        mapRef.current!.remove(m);
                      }
                    }
                  });
                }
              }, 200);
              resolve(items);
            } else {
              return resolve([]);
            }
          };

          if (location) {
             placeSearchRef.current.setCity(map.getCity ? map.getCity() : '全国'); 
             placeSearchRef.current.searchNearBy(query, [location.lng, location.lat], 50000, onComplete);
          } else {
            placeSearchRef.current.search(query, onComplete);
          }
        });
      };

      if (currentLocation) {
        map.setCenter([currentLocation.lng, currentLocation.lat]);
      }
    }).catch(e => {
      console.error("AMapLoader error:", e);
      let msg = typeof e === "string" ? e : (e.message || "Unknown error");
      if (msg === "Script error." || msg === "Script error") {
        msg = "Script Error: AMap blocked the load. 1) Ensure you created a 'Web端(JS API)' key, NOT 'Web服务'. 2) Ensure Domain Whitelist is completely empty. Note: Changes in AMap console take a few minutes.";
      }
      setMapError(msg);
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.destroy();
        mapRef.current = null;
      }
    };
  }, []);

  // Update current location marker
  useEffect(() => {
    if (!mapRef.current || !AMapRef.current) return;
    
    const activeLoc = simulatedLocation || currentLocation;
    if (!activeLoc) return;
    
    // Smoothly pan to location if navigating or if no destination active
    if (simulatedLocation || (!destination && !currentLocMarkerRef.current)) {
       mapRef.current.setCenter([activeLoc.lng, activeLoc.lat]);
    }

    if (!currentLocMarkerRef.current) {
      // Create a sophisticated DOM marker representing the user
      const content = document.createElement('div');
      content.className = "w-8 h-8 bg-[#EFFF33] rounded-full border-4 border-black shadow-[0_0_20px_rgba(239,255,51,0.6)] flex items-center justify-center";
      const inner = document.createElement('div');
      inner.className = "w-3 h-3 bg-black rounded-full animate-pulse";
      content.appendChild(inner);

      currentLocMarkerRef.current = new AMapRef.current.Marker({
        position: [activeLoc.lng, activeLoc.lat],
        content: content,
        offset: new AMapRef.current.Pixel(-16, -16),
      });
      currentLocMarkerRef.current.setMap(mapRef.current);
    } else {
      currentLocMarkerRef.current.setPosition([activeLoc.lng, activeLoc.lat]);
    }
  }, [currentLocation, simulatedLocation, destination]);

  // Update markers (search results)
  useEffect(() => {
    if (!mapRef.current || !AMapRef.current) return;
    
    // Clear old result markers
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];

    // Add search result markers
    searchResults.forEach((place, index) => {
      if (!place.location) return;

      const content = document.createElement('div');
      content.className = "px-3 py-1 bg-white text-black text-xs font-black uppercase rounded-lg border-2 border-black shadow-lg relative cursor-pointer group";
      content.innerHTML = `0${index + 1}. <span class="group-hover:text-[#EFFF33] transition-colors">${place.displayName}</span>`;
      const arrow = document.createElement('div');
      arrow.className = "absolute -bottom-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-white";
      content.appendChild(arrow);

      const marker = new AMapRef.current.Marker({
        position: [place.location.lng, place.location.lat],
        content: content,
        offset: new AMapRef.current.Pixel(-content.clientWidth / 2, -30),
        title: place.displayName,
      });

      marker.setMap(mapRef.current);
      markersRef.current.push(marker);
    });

  }, [searchResults]);

  // Helper: convert AMap route steps into our RouteStep[] format
  // Splits long segments into finer-grained sub-steps (~200m each) for smoother navigation
  function parseAMapSteps(route: any, destinationName?: string): RouteStep[] {
    if (!route?.steps) return [];
    const result: RouteStep[] = [];
    let totalDist = route.distance || 0;
    let totalTime = route.time || 0;
    let cumDist = totalDist;
    let cumTime = totalTime;

    // Helper: determine action type from instruction text
    const detectAction = (instruction: string, isLast: boolean): RouteStep['action'] => {
      if (isLast) return 'arrive';
      const lower = instruction.toLowerCase();
      if (lower.includes('左') || lower.includes('左转') || lower.includes('向左')) return 'left';
      if (lower.includes('右') || lower.includes('右转') || lower.includes('向右') || lower.includes('右拐')) return 'right';
      if (lower.includes('直')) return 'straight';
      return 'straight';
    };

    // Calculate cumulative distance along a path of LngLat-like points
    const pathDistance = (path: any[]): number => {
      let d = 0;
      for (let i = 1; i < path.length; i++) {
        const p0 = path[i - 1], p1 = path[i];
        // Approximate: 1 degree lat ≈ 111km, 1 degree lng ≈ 111*cos(lat) km
        if (p0 && p1) {
          const lat = (p0.lat + p1.lat) / 2 * Math.PI / 180;
          const dx = (p1.lng - p0.lng) * 111320 * Math.cos(lat);
          const dy = (p1.lat - p0.lat) * 111320;
          d += Math.sqrt(dx * dx + dy * dy);
        }
      }
      return d;
    };

    // Helper: interpolate point at fraction t (0-1) along a path
    const interpolatePath = (path: any[], t: number): { lat: number; lng: number } => {
      if (!path.length) return { lat: 0, lng: 0 };
      if (path.length === 1) return { lat: path[0].lat, lng: path[0].lng };
      
      // Compute cumulative distances
      const dists: number[] = [0];
      for (let i = 1; i < path.length; i++) {
        const p0 = path[i - 1], p1 = path[i];
        const lat = (p0.lat + p1.lat) / 2 * Math.PI / 180;
        const dx = (p1.lng - p0.lng) * 111320 * Math.cos(lat);
        const dy = (p1.lat - p0.lat) * 111320;
        dists.push(dists[i - 1] + Math.sqrt(dx * dx + dy * dy));
      }
      const total = dists[dists.length - 1];
      if (total === 0) return { lat: path[0].lat, lng: path[0].lng };
      
      const target = t * total;
      for (let i = 1; i < dists.length; i++) {
        if (target <= dists[i]) {
          const frac = (target - dists[i - 1]) / (dists[i] - dists[i - 1]);
          return {
            lat: path[i - 1].lat + (path[i].lat - path[i - 1].lat) * frac,
            lng: path[i - 1].lng + (path[i].lng - path[i - 1].lng) * frac,
          };
        }
      }
      return { lat: path[path.length - 1].lat, lng: path[path.length - 1].lng };
    };

    // Add start step
    result.push({
      text: `准备出发。全程预计行驶${(totalDist / 1000).toFixed(1)}公里，大约需要${Math.round(totalTime / 60)}分钟。`,
      action: 'start',
      location: { lat: route.steps[0].start_location.lat, lng: route.steps[0].start_location.lng },
      distanceMeters: totalDist,
      timeSeconds: totalTime,
      totalDistanceMeters: totalDist,
      totalTimeSeconds: totalTime,
    });

    const TARGET_SEGMENT_METERS = 200; // Split into segments of ~200m
    const TARGET_SEGMENT_SECONDS = 15;   // Or ~15 seconds, whichever is smaller

    for (let i = 0; i < route.steps.length; i++) {
      const step = route.steps[i];
      const isLast = i === route.steps.length - 1;
      const stepDist = step.distance || 0;
      const stepTime = step.time || 0;
      const path = step.path || [];
      const cleanText = step.instruction?.replace(/<[^>]*>/g, '') || '';
      const action = detectAction(cleanText, isLast);

      // Determine how many sub-segments to split into
      const numSub = Math.max(1, Math.ceil(Math.min(
        stepDist / TARGET_SEGMENT_METERS,
        stepTime / TARGET_SEGMENT_SECONDS
      )));

      const subDist = stepDist / numSub;
      const subTime = stepTime / numSub;

      for (let s = 0; s < numSub; s++) {
        const t0 = s / numSub;
        const t1 = (s + 1) / numSub;
        const startPoint = interpolatePath(path, t0);
        const endPoint = interpolatePath(path, t1);
        // Use the end point (closest to actual road) instead of midpoint for better GPS matching
        const subLocation = endPoint;

        cumDist -= subDist;
        if (cumDist < 0) cumDist = 0;
        cumTime -= subTime;
        if (cumTime < 0) cumTime = 0;

        // For sub-segments, build a more natural instruction
        let subText = cleanText;
        if (numSub > 1) {
          if (s === 0) {
            subText = `${cleanText}（第1段，约${Math.round(subDist)}米后）`;
          } else if (s === numSub - 1) {
            subText = `${cleanText}（最后一段）`;
          } else {
            subText = `继续行驶${Math.round(subDist)}米`;
          }
        }

        result.push({
          text: subText,
          action: s === numSub - 1 ? action : 'straight',
          location: subLocation,
          distanceMeters: Math.round(subDist),
          timeSeconds: Math.round(subTime),
          totalDistanceMeters: Math.max(cumDist, 0),
          totalTimeSeconds: Math.max(cumTime, 0),
        });
      }
    }

    // Add explicit arrival step
    const lastStep = route.steps[route.steps.length - 1];
    if (lastStep) {
      const endPath = lastStep.path || [];
      const endLoc = endPath[endPath.length - 1] || { lat: 0, lng: 0 };
      result.push({
        text: `您已到达${destinationName || '目的地'}附近。本次导航服务已全部完成。`,
        action: 'arrive',
        location: { lat: endLoc.lat, lng: endLoc.lng },
        distanceMeters: 0,
        timeSeconds: 0,
        totalDistanceMeters: 0,
        totalTimeSeconds: 0,
      });
    }

    return result;
  }

  // Update driving/riding route
  useEffect(() => {
    const activeStart = (origin && origin.location) ? origin.location : currentLocation;
    if (!mapRef.current || !activeStart || !destination || !destination.location) {
      if (drivingRouteRef.current) drivingRouteRef.current.clear();
      if (ridingRouteRef.current) ridingRouteRef.current.clear();
      return;
    }

    const startPos = new AMapRef.current.LngLat(activeStart.lng, activeStart.lat);
    const endPos = new AMapRef.current.LngLat(destination.location.lng, destination.location.lat);
    
    // Always use Driving API for route planning (with policy=5 for riding mode).
    // AMap.Riding is unreliable (not available on all key tiers) and doesn't support waypoints.
    if (drivingRouteRef.current) drivingRouteRef.current.clear();
    if (ridingRouteRef.current) ridingRouteRef.current.clear();

    // Always use Driving API for route planning (with policy=5 bike-friendly when in riding mode).
    // AMap.Riding is unreliable (not available on all API key tiers) and doesn't support waypoints.
    if (drivingRouteRef.current) {
      drivingRouteRef.current.clear();
    }

    if (!drivingRouteRef.current) return;

    const waypointPositions = waypoints
      .filter(wp => wp && wp.location)
      .map(wp => new AMapRef.current.LngLat(wp.location!.lng, wp.location!.lat));

    console.log('Planning route mode:', routeMode, 'with waypoints:', waypointPositions);

    const drivingOptions: any = {
      waypoints: waypointPositions,
    };
    // When in riding mode, use shortest-distance policy + no highways for bike-friendly route
    if (routeMode === 'riding') {
      drivingOptions.policy = 5; // AMap.DrivingPolicy.LEAST_DISTANCE — shortest path, no highways
    }

    drivingRouteRef.current.search(
      startPos,
      endPos,
      drivingOptions,
      (status: string, result: any) => {
        if (status === 'complete') {
          console.log('Driving route updated:', result);
          if (onRouteUpdate && result.routes?.[0]) {
            const route = result.routes[0];
            onRouteUpdate({
              distanceMeters: route.distance || 0,
              timeSeconds: route.time || 0,
              steps: parseAMapSteps(route, destination?.displayName),
            });
          }
          // Fit view to show entire route on map — tight padding for small thumbnail
          if (mapRef.current) {
            // 1) Always resize first so AMap recalculates its viewport
            mapRef.current.resize();
            // 2) Fit to show the whole route
            mapRef.current.setFitView(null, false, [10, 10, 10, 10]);
          }
        } else {
          console.error('Driving route failed:', status, result);
        }
      }
    );
  }, [currentLocation, origin, destination, waypoints, routeMode, rerouteTrigger]);

  // When AR mode toggles (hideControls changes), force map resize + fitView
  // so the route is fully visible in the tiny 110×110 thumbnail
  useEffect(() => {
    if (!mapRef.current || !hideControls) return;
    // Delay to let the DOM finish resizing the map container
    const t1 = setTimeout(() => {
      if (mapRef.current) {
        mapRef.current.resize();
        mapRef.current.setFitView(null, false, [5, 5, 5, 5]);
      }
    }, 50);
    const t2 = setTimeout(() => {
      if (mapRef.current) {
        mapRef.current.resize();
        mapRef.current.setFitView(null, false, [5, 5, 5, 5]);
      }
    }, 300);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [hideControls]);

  // Listen for zoom/fitRoute events from voice commands
  useEffect(() => {
    const handleZoom = (e: Event) => {
      const direction = (e as CustomEvent).detail;
      if (!mapRef.current) return;
      const z = mapRef.current.getZoom() || 13;
      mapRef.current.setZoom(direction === 'in' ? z + 1 : z - 1);
    };
    const handleFitRoute = () => {
      if (!mapRef.current) return;
      mapRef.current.resize();
      mapRef.current.setFitView(null, false, [40, 40, 40, 40]);
    };
    window.addEventListener('map-zoom', handleZoom);
    window.addEventListener('map-fit-route', handleFitRoute);
    return () => {
      window.removeEventListener('map-zoom', handleZoom);
      window.removeEventListener('map-fit-route', handleFitRoute);
    };
  }, []);

  // Listen for routeMode override from voice commands (set via window.__routeModeOverride)
  useEffect(() => {
    const checkOverride = () => {
      const override = (window as any).__routeModeOverride;
      if (override && override !== routeMode) {
        setRouteMode(override);
        (window as any).__routeModeOverride = null;
      }
    };
    checkOverride();
    // Poll for override changes — App.tsx sets it before triggering rerouteTrigger
    const interval = setInterval(checkOverride, 200);
    return () => clearInterval(interval);
  }, [routeMode, rerouteTrigger]);

  return (
    <div className="relative w-full h-full">
      {mapError && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/90 text-white p-8">
          <div className="bg-red-500/10 text-red-100 p-8 rounded-3xl border border-red-500/30 max-w-xl backdrop-blur-xl shadow-2xl">
            <h3 className="text-2xl font-black mb-4 text-red-400 uppercase tracking-tighter">AMap Loading Failed</h3>
            <p className="text-lg opacity-90 mb-4 font-mono truncate">{mapError}</p>
            <div className="space-y-3 text-sm opacity-80 bg-black/50 p-6 rounded-2xl">
               <p><strong>This is an external configuration issue, not a code bug.</strong> To fix this, please check:</p>
               <ol className="list-decimal pl-5 space-y-2">
                 <li>In your <a href="https://console.amap.com/" target="_blank" className="text-[#EFFF33] hover:underline">AMap Console</a>, did you create a <strong>Web端 (JS API)</strong> key? ("Web服务" will not work).</li>
                 <li>Did you set the <strong>Domain Whitelist (域名白名单)</strong> to be completely blank? (Leaving it blank allows all domains).</li>
                 <li>Are you using an <strong>Ad Blocker</strong>? Extensions like uBlock Origin block AMap scripts. Try disabling it for this site.</li>
                 <li>Did you copy the Key and Security Code correctly into AI Studio Secrets?</li>
               </ol>
            </div>
          </div>
        </div>
      )}

      {/* Route Mode Control Overlay */}
      {destination && !hideControls && (
        <div className="absolute top-6 left-6 z-10 flex gap-2 bg-[#141414]/90 border border-white/10 p-1.5 rounded-2xl backdrop-blur-md shadow-2xl">
          <button
            onClick={() => setRouteMode('riding')}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-200 ${
              routeMode === 'riding'
                ? 'bg-[#EFFF33] text-black shadow-[0_0_15px_rgba(239,255,51,0.3)] font-black'
                : 'text-white/60 hover:text-white hover:bg-white/5 font-bold'
            }`}
            title="骑行模式（有途经点时通过驾最短路径模拟）"
          >
            Riding
          </button>
          <button
            onClick={() => setRouteMode('driving')}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-200 ${
              routeMode === 'driving' || waypoints.length > 0
                ? 'bg-[#EFFF33] text-black shadow-[0_0_15px_rgba(239,255,51,0.3)] font-black'
                : 'text-white/60 hover:text-white hover:bg-white/5 font-bold'
            }`}
          >
            Driving {waypoints.length > 0 && `(${waypoints.length} Stops)`}
          </button>
        </div>
      )}
      
      <div ref={mapContainerRef} className="w-full h-full rounded-[40px] overflow-hidden shadow-2xl" />
    </div>
  );
}
