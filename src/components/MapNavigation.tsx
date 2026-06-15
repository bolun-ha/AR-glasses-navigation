import { useEffect, useRef, useState } from 'react';
import AMapLoader from '@amap/amap-jsapi-loader';
import { PlaceModel } from '../services/gemini';

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
  hideControls
}: {
  currentLocation: {lat: number, lng: number} | null,
  origin: PlaceModel | null,
  destination: PlaceModel | null,
  waypoints: PlaceModel[],
  searchResults: PlaceModel[],
  simulatedLocation?: {lat: number, lng: number} | null,
  hideControls?: boolean
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
        viewMode: '3D', // Use 3D view
        zoom: 13, // Initialization zoom level
        center: [116.397428, 39.90923], // Initial center (Beijing)
        mapStyle: 'amap://styles/darkblue', // Setup dark mode theme
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

      // Initialize place search plugin
      placeSearchRef.current = new AMap.PlaceSearch({
        pageSize: 5,
        pageIndex: 1,
        extensions: 'all'
      });

      // Wire up the global search function
      globalPlacesSearch = async (query: string, location: {lat: number, lng: number} | null) => {
        return new Promise((resolve) => {
          if (!placeSearchRef.current) return resolve([]);
          
          if (location) {
             placeSearchRef.current.setCity(map.getCity ? map.getCity() : '全国'); 
             placeSearchRef.current.searchNearBy(query, [location.lng, location.lat], 50000, (status: string, result: any) => {
                if (status === 'complete' && result.info === 'OK') {
                  const items = result.poiList.pois.map((poi: any) => ({
                    id: poi.id,
                    displayName: poi.name,
                    address: poi.address,
                    location: { lat: poi.location.lat, lng: poi.location.lng },
                    distanceMeters: poi.distance,
                  }));
                  resolve(items);
                } else {
                  return resolve([]);
                }
             });
          } else {
            placeSearchRef.current.search(query, (status: string, result: any) => {
              if (status === 'complete' && result.info === 'OK') {
                const items = result.poiList.pois.map((poi: any) => ({
                  id: poi.id,
                  displayName: poi.name,
                  address: poi.address,
                  location: { lat: poi.location.lat, lng: poi.location.lng }
                }));
                resolve(items);
              } else {
                return resolve([]);
              }
            });
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
    
    // Automatically use driving if waypoints are set (since Riding doesn't support waypoints natively in key-route api)
    const activeMode = waypoints.length > 0 ? 'driving' : routeMode;

    if (activeMode === 'driving') {
      if (ridingRouteRef.current) {
        ridingRouteRef.current.clear();
      }
      if (!drivingRouteRef.current) return;

      const waypointPositions = waypoints
        .filter(wp => wp && wp.location)
        .map(wp => new AMapRef.current.LngLat(wp.location!.lng, wp.location!.lat));

      console.log('Planning driving route with waypoints:', waypointPositions);

      drivingRouteRef.current.search(
        startPos,
        endPos,
        {
          waypoints: waypointPositions
        },
        (status: string, result: any) => {
          if (status === 'complete') {
            console.log('Driving route updated with waypoints:', result);
          } else {
            console.error('Driving route failed', result);
          }
        }
      );
    } else {
      if (drivingRouteRef.current) {
        drivingRouteRef.current.clear();
      }
      if (!ridingRouteRef.current) return;

      console.log('Planning riding route');

      ridingRouteRef.current.search(startPos, endPos, (status: string, result: any) => {
        if (status === 'complete') {
          console.log('Riding route updated', result);
        } else {
          console.error('Riding route failed', result);
        }
      });
    }
  }, [currentLocation, origin, destination, waypoints, routeMode]);

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
              routeMode === 'riding' && waypoints.length === 0
                ? 'bg-[#EFFF33] text-black shadow-[0_0_15px_rgba(239,255,51,0.3)] font-black'
                : 'text-white/60 hover:text-white hover:bg-white/5 font-bold'
            } ${waypoints.length > 0 ? 'opacity-40 cursor-not-allowed' : ''}`}
            disabled={waypoints.length > 0}
            title={waypoints.length > 0 ? "Riding does not support stopovers" : "Riding route"}
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
