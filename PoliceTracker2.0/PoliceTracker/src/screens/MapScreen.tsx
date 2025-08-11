import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Dimensions,
  ActivityIndicator,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { getPoliceAlerts, getAllPoliceAlerts, getPoliceAlertsByState, getPoliceHeatmapData, getSimpleHeatmapData, getPoliceAlertsCount, getPoliceAlertsByBounds } from '../services/supabase';

import { PoliceAlert } from '../types';

const { width, height } = Dimensions.get('window');

export default function MapScreen() {
  const [policeAlerts, setPoliceAlerts] = useState<PoliceAlert[]>([]);
  const [stateAlerts, setStateAlerts] = useState<any[]>([]);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [heatmapPoints, setHeatmapPoints] = useState<any[]>([]);
  const [routeModalVisible, setRouteModalVisible] = useState(false);
  const [startLocation, setStartLocation] = useState('My Location');
  const [endLocation, setEndLocation] = useState('');
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeData, setRouteData] = useState<any>(null);
  const [startSuggestions, setStartSuggestions] = useState<string[]>([]);
  const [endSuggestions, setEndSuggestions] = useState<string[]>([]);
  const [showStartSuggestions, setShowStartSuggestions] = useState(false);
  const [showEndSuggestions, setShowEndSuggestions] = useState(false);
  const [searchModalVisible, setSearchModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchSuggestions, setSearchSuggestions] = useState<string[]>([]);
  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false);
  const [showIndividualAlerts, setShowIndividualAlerts] = useState(false);
  const [currentMapBounds, setCurrentMapBounds] = useState<{
    north: number;
    south: number;
    east: number;
    west: number;
  } | null>(null);
  const [databaseAlertCount, setDatabaseAlertCount] = useState<number>(0);
  const [alertFilter, setAlertFilter] = useState<'all' | 'police_hiding'>('all');
  const [allAlerts, setAllAlerts] = useState<PoliceAlert[]>([]); // cache of last viewport fetch
  const [mapBounds, setMapBounds] = useState<{ north: number; south: number; east: number; west: number } | null>(null);
  const [fetchedAreas, setFetchedAreas] = useState<Array<{ north: number; south: number; east: number; west: number }>>([]);
  const [lastZoom, setLastZoom] = useState<number | null>(null);
  const [isFetchingViewport, setIsFetchingViewport] = useState(false);
  const alertCacheRef = React.useRef<Map<string, PoliceAlert>>(new Map());
  const MAX_ALERTS_TO_RENDER = 3000;
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [currentViewMode, setCurrentViewMode] = useState<'alerts' | 'heatmap'>('alerts');
  const [savedMapPosition, setSavedMapPosition] = useState<{center: {lat: number, lng: number}, zoom: number} | null>(null);
  const [timeFilter, setTimeFilter] = useState<'24h' | '7d' | '30d'>('24h');
  const [showTimeFilterDropdown, setShowTimeFilterDropdown] = useState(false);

  useEffect(() => {
    loadData();
    getUserLocation();
  }, []);

  const getUserLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const location = await Location.getCurrentPositionAsync({});
        setUserLocation({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });
      }
    } catch (error) {
      // Silently handle location error
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Try to fetch heatmap data with timeout handling
      let heatmapData;
      try {
        console.log('Fetching heatmap data...');
        heatmapData = await getPoliceHeatmapData();
        setHeatmapPoints(heatmapData?.heatmap_points || []);
        console.log('Heatmap data loaded successfully');
      } catch (error) {
        console.warn('Heatmap data fetch failed, trying simple fallback:', error);
        try {
          heatmapData = await getSimpleHeatmapData();
          setHeatmapPoints(heatmapData?.heatmap_points || []);
          console.log('Simple heatmap data loaded successfully');
        } catch (fallbackError) {
          console.warn('Simple heatmap also failed, continuing without heatmap:', fallbackError);
          setHeatmapPoints([]);
        }
      }
      
      // Initial data: do not fetch entire dataset; wait for viewport to request
      setAllAlerts([]);
      setPoliceAlerts([]);

      // Get the total count from database for comparison
      try {
        const totalCount = await getPoliceAlertsCount();
        setDatabaseAlertCount(totalCount);
        console.log(`Database contains ${totalCount} total police alerts`);
      } catch (error) {
        console.warn('Failed to get database count:', error);
      }
      // State aggregation can be fetched separately when needed; skip heavy fallbacks
    } catch (error) {
      console.error('Error loading data:', error);
      Alert.alert('Error', 'Failed to load police alerts');
    } finally {
      setLoading(false);
    }
  };

  // Debounced viewport fetch
  const viewportFetchTimeout = React.useRef<NodeJS.Timeout | null>(null);
  const isHiddenSubtype = (subtype?: string | null) => {
    if (!subtype) return false;
    const s = String(subtype).trim().toUpperCase();
    return s === 'POLICE_HIDING' || s === 'HIDDEN_POLICE' || s === 'POLICE_TRAP' || s === 'SPEED_TRAP';
  };
  const expandBounds = (bounds: { north: number; south: number; east: number; west: number }, factor: number) => {
    const latSpan = Math.max(0.0001, bounds.north - bounds.south);
    const lngSpan = Math.max(0.0001, bounds.east - bounds.west);
    const extraLat = (latSpan * (factor - 1)) / 2;
    const extraLng = (lngSpan * (factor - 1)) / 2;
    return {
      north: bounds.north + extraLat,
      south: bounds.south - extraLat,
      east: bounds.east + extraLng,
      west: bounds.west - extraLng,
    };
  };

  const containsBounds = (outer: { north: number; south: number; east: number; west: number }, inner: { north: number; south: number; east: number; west: number }) => {
    return outer.north >= inner.north && outer.south <= inner.south && outer.east >= inner.east && outer.west <= inner.west;
  };

  const anyAreaContains = (areas: Array<{ north: number; south: number; east: number; west: number }>, inner: { north: number; south: number; east: number; west: number }) => {
    return areas.some(a => containsBounds(a, inner));
  };

  const fetchAlertsForBounds = React.useCallback((bounds: { north: number; south: number; east: number; west: number }, opts?: { forceSubtype?: 'ALL' | 'POLICE_HIDING'; forceTimeFrame?: '24h' | '7d' | '30d' }) => {
    if (viewportFetchTimeout.current) clearTimeout(viewportFetchTimeout.current);
    viewportFetchTimeout.current = setTimeout(async () => {
      try {
        setIsFetchingViewport(true);
        setMapBounds(bounds);
        // Expand fetch radius based on current zoom (larger expansion when zoomed in)
        let factor = 1.5;
        if (lastZoom !== null) {
          if (lastZoom >= 15) factor = 4;
          else if (lastZoom >= 13) factor = 3;
          else if (lastZoom >= 11) factor = 2;
          else factor = 1.5;
        }
        const expanded = expandBounds(bounds, factor);
        const now = new Date();
        let cutoffDate: Date;
        const timeSel = opts?.forceTimeFrame ?? timeFilter;
        switch (timeSel) {
          case '7d':
            cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
          case '30d':
            cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
          default:
            cutoffDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        }
        const sinceIso = cutoffDate.toISOString();
        const cutoffTimeMs = cutoffDate.getTime();
        // Fetch without subtype server-side to avoid mismatch; filter client-side
        const alerts = await getPoliceAlertsByBounds(expanded, { sinceIso, limit: 3000, subtype: 'ALL' });
        // Merge into cache
        const cache = alertCacheRef.current;
        // Evict cache entries outside current expanded bounds or older than cutoff to keep cache consistent with filter
        for (const [key, val] of cache.entries()) {
          const ts = Date.parse(val.publish_datetime_utc);
          const inBounds = val.latitude >= expanded.south && val.latitude <= expanded.north && val.longitude >= expanded.west && val.longitude <= expanded.east;
          if (Number.isNaN(ts) || ts < cutoffTimeMs || !inBounds) {
            cache.delete(key);
          }
        }
        alerts.forEach(a => cache.set((a as any).id || (a as any).alert_id, a));
        // Build render set from cache filtered to current expanded
        const renderAlerts: PoliceAlert[] = [];
        for (const a of cache.values()) {
          if (
            a.latitude >= expanded.south && a.latitude <= expanded.north &&
            a.longitude >= expanded.west && a.longitude <= expanded.east
          ) {
            // time window filter already applied in fetch; subtype filtered here if needed
            const wantHidden = (opts?.forceSubtype ?? (alertFilter === 'police_hiding' ? 'POLICE_HIDING' : 'ALL')) === 'POLICE_HIDING';
            const aTime = Date.parse(a.publish_datetime_utc);
            const withinTime = !Number.isNaN(aTime) && aTime >= cutoffTimeMs;
            if (withinTime && (!wantHidden || isHiddenSubtype(a.subtype))) {
              renderAlerts.push(a);
            }
            if (renderAlerts.length >= MAX_ALERTS_TO_RENDER) break;
          }
        }
        setAllAlerts(renderAlerts);
        setPoliceAlerts(renderAlerts);
        setFetchedAreas(prev => [...prev, expanded].slice(-12)); // keep last 12 areas

        // Push to WebView without rebuilding HTML
        if (webViewRef.current) {
          const individualAlertsData = renderAlerts.map((alert: PoliceAlert) => ({
            lat: alert.latitude,
            lng: alert.longitude,
            reliability: alert.alert_reliability,
            confidence: alert.alert_confidence || 0,
            thumbsUp: alert.num_thumbs_up || 0,
            description: alert.description || 'Police Alert',
            timestamp: alert.publish_datetime_utc,
            state: alert.state,
            city: alert.city,
            subtype: alert.subtype
          }));
          webViewRef.current.postMessage(JSON.stringify({
            type: 'updateAlertsData',
            alerts: individualAlertsData,
            saveMapPosition: true
          }));
          webViewRef.current.postMessage(JSON.stringify({
            type: 'updateHeatmapData',
            alerts: individualAlertsData
          }));
        }
      } catch (e) {
        console.warn('Viewport fetch failed', e);
      } finally {
        setIsFetchingViewport(false);
      }
    }, 250);
  }, [alertFilter, timeFilter]);

  const getAddressSuggestions = async (query: string, isStart: boolean) => {
    if (query.length < 3) {
      if (isStart) {
        setStartSuggestions([]);
        setShowStartSuggestions(false);
      } else {
        setEndSuggestions([]);
        setShowEndSuggestions(false);
      }
      return;
    }

    try {
      const googleMapsApiKey = 'AIzaSyBEftn_87WiK5VgBcMKXzVV8oKfunswejA';
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(query)}&types=address&key=${googleMapsApiKey}`
      );
      
      if (response.ok) {
        const data = await response.json();
        const suggestions = data.predictions?.map((pred: any) => pred.description) || [];
        
        if (isStart) {
          setStartSuggestions(suggestions);
          setShowStartSuggestions(true);
        } else {
          setEndSuggestions(suggestions);
          setShowEndSuggestions(true);
        }
      }
    } catch (error) {
      console.log('Error fetching address suggestions:', error);
    }
  };

  const handleStartLocationChange = (text: string) => {
    setStartLocation(text);
    if (text.length >= 3) {
    getAddressSuggestions(text, true);
    } else {
      setStartSuggestions([]);
      setShowStartSuggestions(false);
    }
  };

  const handleEndLocationChange = (text: string) => {
    setEndLocation(text);
    getAddressSuggestions(text, false);
  };

  const selectStartSuggestion = (suggestion: string) => {
    setStartLocation(suggestion);
    setStartSuggestions([]);
    setShowStartSuggestions(false);
  };

  const handleSearchQueryChange = (text: string) => {
    setSearchQuery(text);
    if (text.length >= 3) {
      getSearchSuggestions(text);
    } else {
      setSearchSuggestions([]);
      setShowSearchSuggestions(false);
    }
  };

  const getSearchSuggestions = async (query: string) => {
    try {
      const googleMapsApiKey = 'AIzaSyBEftn_87WiK5VgBcMKXzVV8oKfunswejA';
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(query)}&types=address&key=${googleMapsApiKey}`
      );
      
      if (response.ok) {
        const data = await response.json();
        const suggestions = data.predictions?.map((pred: any) => pred.description) || [];
        setSearchSuggestions(suggestions);
        setShowSearchSuggestions(true);
      }
    } catch (error) {
      console.log('Error fetching search suggestions:', error);
    }
  };

  const selectSearchSuggestion = (suggestion: string) => {
    setSearchQuery(suggestion);
    setSearchSuggestions([]);
    setShowSearchSuggestions(false);
  };

  const performSearch = async () => {
    if (!searchQuery.trim()) {
      Alert.alert('Error', 'Please enter an address to search');
      return;
    }

    try {
      const googleMapsApiKey = 'AIzaSyBEftn_87WiK5VgBcMKXzVV8oKfunswejA';
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(searchQuery.trim())}&key=${googleMapsApiKey}`
      );
      
      if (response.ok) {
        const data = await response.json();
        if (data.results && data.results.length > 0) {
          const location = data.results[0].geometry.location;
          if (webViewRef.current) {
            webViewRef.current.postMessage(JSON.stringify({
              type: 'zoomToLocation',
              lat: location.lat,
              lng: location.lng
            }));
          }
          setSearchModalVisible(false);
          setSearchQuery('');
        } else {
          Alert.alert('Error', 'Location not found. Please try a different address.');
        }
      } else {
        Alert.alert('Error', 'Failed to find location. Please try again.');
      }
    } catch (error) {
      console.error('Geocoding error:', error);
      Alert.alert('Error', 'Failed to find location. Please try again.');
    }
  };

  const selectEndSuggestion = (suggestion: string) => {
    setEndLocation(suggestion);
    setEndSuggestions([]);
    setShowEndSuggestions(false);
  };

  const planRoute = async () => {
    if (!endLocation.trim()) {
      Alert.alert('Error', 'Please enter an end location');
      return;
    }

    setRouteLoading(true);
    try {
      // Use Google Directions API to get route
      const googleMapsApiKey = 'AIzaSyBEftn_87WiK5VgBcMKXzVV8oKfunswejA';
      
      // Handle "My Location" case
      let origin = startLocation;
      if (startLocation === 'My Location' && userLocation) {
        origin = `${userLocation.latitude},${userLocation.longitude}`;
      }
      
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(endLocation)}&key=${googleMapsApiKey}`
      );
      
      if (response.ok) {
        const data = await response.json();
        console.log('Route API response:', data); // Debug log
        
        if (data.routes && data.routes.length > 0) {
          setRouteData(data);
          
          // Send route data to WebView with the full response
          if (webViewRef.current) {
            webViewRef.current.postMessage(JSON.stringify({
              type: 'showRoute',
              route: data.routes[0],
              fullResponse: data
            }));
          }
          
          setRouteModalVisible(false);
        } else {
          Alert.alert('Error', 'No route found between these locations');
        }
      } else {
        const errorData = await response.text();
        console.log('Route API error:', errorData); // Debug log
        Alert.alert('Error', 'Failed to get route directions');
      }
    } catch (error) {
      console.log('Route planning error:', error); // Debug log
      Alert.alert('Error', 'Failed to plan route');
    } finally {
      setRouteLoading(false);
    }
  };

  const clearRoute = () => {
    setRouteData(null);
    if (webViewRef.current) {
      webViewRef.current.postMessage(JSON.stringify({
        type: 'clearRoute'
      }));
    }
  };

  const toggleIndividualAlerts = () => {
    const newState = !showIndividualAlerts;
    setShowIndividualAlerts(newState);
    
    if (webViewRef.current) {
      webViewRef.current.postMessage(JSON.stringify({
        type: 'toggleIndividualAlerts',
        show: newState
      }));
    }
  };

  const toggleFilterDropdown = () => {
    setShowFilterDropdown(!showFilterDropdown);
  };

  const selectFilter = (filter: 'all' | 'police_hiding') => {
    setAlertFilter(filter);
    setShowFilterDropdown(false);
    
    // Calculate the cutoff date based on the current time filter
    const now = new Date();
    let cutoffDate: Date;
    
    switch (timeFilter) {
      case '24h':
        cutoffDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        cutoffDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }
    
    // If we have map bounds, refetch for viewport; otherwise filter cache
    if (mapBounds) {
      fetchAlertsForBounds(mapBounds, { forceSubtype: filter === 'police_hiding' ? 'POLICE_HIDING' : 'ALL' });
    } else {
      const timeFilteredAlerts = allAlerts.filter(alert => {
        const alertDate = new Date(alert.publish_datetime_utc);
        return alertDate >= cutoffDate;
      });
      const filteredAlerts = filter === 'police_hiding' 
        ? timeFilteredAlerts.filter(alert => alert.subtype === 'POLICE_HIDING')
        : timeFilteredAlerts;
      setPoliceAlerts(filteredAlerts);
      if (webViewRef.current) {
        const individualAlertsData = filteredAlerts.map((alert: PoliceAlert) => ({
          lat: alert.latitude,
          lng: alert.longitude,
          reliability: alert.alert_reliability,
          confidence: alert.alert_confidence || 0,
          thumbsUp: alert.num_thumbs_up || 0,
          description: alert.description || 'Police Alert',
          timestamp: alert.publish_datetime_utc,
          state: alert.state,
          city: alert.city,
          subtype: alert.subtype
        }));
        webViewRef.current.postMessage(JSON.stringify({
          type: 'updateAlertsData',
          alerts: individualAlertsData,
          saveMapPosition: true
        }));
        webViewRef.current.postMessage(JSON.stringify({
          type: 'updateHeatmapData',
          alerts: individualAlertsData
        }));
      }
    }
  };

  const selectTimeFilter = (timeFrame: '24h' | '7d' | '30d') => {
    setTimeFilter(timeFrame);
    setShowTimeFilterDropdown(false);
    
    // Calculate the cutoff date based on the selected time frame
    const now = new Date();
    let cutoffDate: Date;
    
    switch (timeFrame) {
      case '24h':
        cutoffDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        cutoffDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }
    
    if (mapBounds) {
      // Clear coverage for new window and refetch fresh
      setFetchedAreas([]);
      fetchAlertsForBounds(mapBounds, { forceTimeFrame: timeFrame, forceSubtype: alertFilter === 'police_hiding' ? 'POLICE_HIDING' : 'ALL' });
    } else {
      const timeFilteredAlerts = allAlerts.filter(alert => {
        const alertDate = new Date(alert.publish_datetime_utc);
        return alertDate >= cutoffDate;
      });
      const filteredAlerts = alertFilter === 'police_hiding' 
        ? timeFilteredAlerts.filter(alert => alert.subtype === 'POLICE_HIDING')
        : timeFilteredAlerts;
      setPoliceAlerts(filteredAlerts);
      if (webViewRef.current) {
        const individualAlertsData = filteredAlerts.map((alert: PoliceAlert) => ({
          lat: alert.latitude,
          lng: alert.longitude,
          reliability: alert.alert_reliability,
          confidence: alert.alert_confidence || 0,
          thumbsUp: alert.num_thumbs_up || 0,
          description: alert.description || 'Police Alert',
          timestamp: alert.publish_datetime_utc,
          state: alert.state,
          city: alert.city,
          subtype: alert.subtype
        }));
        webViewRef.current.postMessage(JSON.stringify({
          type: 'updateAlertsData',
          alerts: individualAlertsData,
          saveMapPosition: true
        }));
        webViewRef.current.postMessage(JSON.stringify({
          type: 'updateHeatmapData',
          alerts: individualAlertsData
        }));
      }
    }
  };

  const webViewRef = React.useRef<WebView>(null);

  // Static base HTML; data is fed via postMessage to avoid reloads on state changes
  const createBaseMapHTML = () => {
    const googleMapsApiKey = 'AIzaSyBEftn_87WiK5VgBcMKXzVV8oKfunswejA';
    // Use saved position if available, otherwise use user location or default
    const center = savedMapPosition?.center 
      ? { latitude: savedMapPosition.center.lat, longitude: savedMapPosition.center.lng }
      : (userLocation || { latitude: 39.8283, longitude: -98.5795 });
    const initialZoom = savedMapPosition?.zoom || 12;

    // Start with empty data; RN will feed data via postMessage
    const individualAlertsData: any[] = [];

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
          <script src="https://maps.googleapis.com/maps/api/js?key=${googleMapsApiKey}&libraries=visualization,geometry"></script>
          <script>
            // Store the initial view mode from React Native
            const initialViewMode = '${currentViewMode}';
          </script>
          <style>
            html {
              -webkit-text-size-adjust: 100%;
              -ms-text-size-adjust: 100%;
              text-size-adjust: 100%;
              -webkit-touch-callout: none;
              -webkit-user-select: none;
              -khtml-user-select: none;
              -moz-user-select: none;
              -ms-user-select: none;
              user-select: none;
              touch-action: manipulation;
            }
            
            body { 
              margin: 0; 
              padding: 0; 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
              padding-top: env(safe-area-inset-top, 44px);
              -webkit-text-size-adjust: 100%;
              -ms-text-size-adjust: 100%;
              text-size-adjust: 100%;
              touch-action: manipulation;
              -webkit-touch-callout: none;
              -webkit-user-select: none;
              -khtml-user-select: none;
              -moz-user-select: none;
              -ms-user-select: none;
              user-select: none;
            }
            #map { width: 100vw; height: 100vh; }
            
            /* Prevent zoom on all interactive elements */
            button, .compass-button, .filter-button, .time-filter-button, .toggle-button,
            .filter-dropdown, .time-filter-dropdown, .filter-option, .time-filter-option {
              -webkit-touch-callout: none !important;
              -webkit-user-select: none !important;
              -khtml-user-select: none !important;
              -moz-user-select: none !important;
              -ms-user-select: none !important;
              user-select: none !important;
              touch-action: manipulation !important;
              -webkit-text-size-adjust: none !important;
              -ms-text-size-adjust: none !important;
              text-size-adjust: none !important;
              -webkit-transform: translateZ(0);
              transform: translateZ(0);
            }
            
            /* Hide Google Maps zoom controls completely */
            .gmnoprint, .gm-style-cc, .gm-style > div:first-child > div:last-child {
              display: none !important;
            }
            
            /* Hide specific zoom control elements */
            .gm-control-active, .gm-fullscreen-control, .gm-zoom-control {
              display: none !important;
            }
            
            /* Hide any Google Maps controls */
            [title*="Zoom"], [title*="zoom"] {
              display: none !important;
            }
            
            /* Allow info windows to show */
            .gm-style-iw, .gm-style-iw-c {
              display: block !important;
            }
            
            /* Legend styles - premium design */
            .legend {
              position: absolute;
              left: 12px;
              top: 70px;
              background: rgba(255, 255, 255, 0.95);
              padding: 12px;
              border-radius: 12px;
              box-shadow: 0 4px 20px rgba(0,0,0,0.1);
              z-index: 1000;
              pointer-events: none;
              backdrop-filter: blur(10px);
              border: 1px solid rgba(255, 255, 255, 0.2);
            }
            
            .legend h4 {
              margin: 0 0 12px 0;
              font-size: 13px;
              color: #1a1a2e;
              text-align: center;
              font-weight: 600;
              letter-spacing: 0.5px;
            }
            
            .legend-content {
              display: flex;
              align-items: stretch;
              gap: 12px;
            }
            
            .legend-gradient {
              width: 12px;
              height: 120px;
              background: linear-gradient(to bottom, #00BFFF, #00FF00, #FFFF00, #FF8C00, #FF4500, #FF0000);
              border-radius: 6px;
              border: 1px solid rgba(0,0,0,0.1);
              flex-shrink: 0;
              box-shadow: inset 0 2px 4px rgba(0,0,0,0.1);
            }
            
            .legend-categories {
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              font-size: 11px;
              color: #4b5563;
              height: 120px;
              padding: 2px 0;
            }
            
            .legend-category {
              line-height: 1.3;
              font-weight: 500;
            }
            
            .legend-dots {
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              gap: 8px;
              margin-right: 12px;
            }
            
            .legend-dot {
              width: 12px;
              height: 12px;
              border-radius: 50%;
              border: 2px solid rgba(255, 255, 255, 0.8);
              box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            }
            
            .legend-dot.low {
              background-color: #00BFFF;
            }
            
            .legend-dot.medium {
              background-color: #00FF00;
            }
            
            .legend-dot.high {
              background-color: #FFFF00;
            }
            
            .legend-dot.very-high {
              background-color: #FF8C00;
            }
            
            .legend-dot.extreme {
              background-color: #FF0000;
            }
            
            .legend-simple {
              display: flex;
              align-items: center;
              gap: 8px;
            }
            
            .legend-single-dot {
              width: 12px;
              height: 12px;
              border-radius: 50%;
              background-color: #00BFFF;
              border: 2px solid #0080FF;
              opacity: 0.6;
            }
            
            .legend-single-text {
              font-size: 12px;
              color: #4b5563;
              font-weight: 500;
            }
            
            /* Compass button styles - premium */
            .compass-button {
              position: absolute;
              bottom: 20px;
              right: 12px;
              width: 44px;
              height: 44px;
              background: rgba(255, 255, 255, 0.95);
              border-radius: 12px;
              box-shadow: 0 4px 20px rgba(0,0,0,0.1);
              z-index: 1000;
              display: flex;
              align-items: center;
              justify-content: center;
              cursor: pointer;
              border: none;
              font-size: 20px;
              color: #6366f1;
              transition: all 0.3s ease;
              backdrop-filter: blur(10px);
              border: 1px solid rgba(255, 255, 255, 0.2);
              -webkit-touch-callout: none;
              -webkit-user-select: none;
              -khtml-user-select: none;
              -moz-user-select: none;
              -ms-user-select: none;
              user-select: none;
              touch-action: manipulation;
              -webkit-text-size-adjust: none;
              -ms-text-size-adjust: none;
              text-size-adjust: none;
            }
            
            .compass-button:hover {
              background: rgba(255, 255, 255, 1);
              transform: scale(1.05);
              box-shadow: 0 6px 25px rgba(0,0,0,0.15);
            }
            
            .compass-button:active {
              transform: scale(0.95);
            }
            
            /* Filter button styles - premium */
            .filter-container {
              position: absolute;
              top: 130px;
              right: 12px;
              z-index: 1000;
            }
            
            .filter-button {
              width: 44px;
              height: 44px;
              background: rgba(255, 255, 255, 0.95);
              border-radius: 12px;
              box-shadow: 0 4px 20px rgba(0,0,0,0.1);
              display: flex;
              align-items: center;
              justify-content: center;
              cursor: pointer;
              border: none;
              font-size: 20px;
              color: #6366f1;
              transition: all 0.3s ease;
              backdrop-filter: blur(10px);
              border: 1px solid rgba(255, 255, 255, 0.2);
              -webkit-touch-callout: none;
              -webkit-user-select: none;
              -khtml-user-select: none;
              -moz-user-select: none;
              -ms-user-select: none;
              user-select: none;
              touch-action: manipulation;
              -webkit-text-size-adjust: none;
              -ms-text-size-adjust: none;
              text-size-adjust: none;
            }
            
            .filter-button:hover {
              background: rgba(255, 255, 255, 1);
              transform: scale(1.05);
              box-shadow: 0 6px 25px rgba(0,0,0,0.15);
            }
            
            .filter-button:active {
              transform: scale(0.95);
            }
            
            /* Filter dropdown styles */
            .filter-dropdown {
              position: absolute;
              top: 52px;
              right: 0;
              background: rgba(255, 255, 255, 0.95);
              border-radius: 12px;
              box-shadow: 0 4px 20px rgba(0,0,0,0.1);
              backdrop-filter: blur(10px);
              border: 1px solid rgba(255, 255, 255, 0.2);
              min-width: 160px;
              display: none;
              overflow: hidden;
            }
            
            .filter-dropdown.show {
              display: block;
            }
            
            .filter-option {
              padding: 12px 16px;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: space-between;
              transition: background-color 0.2s ease;
              border-bottom: 1px solid rgba(0,0,0,0.05);
            }
            
            .filter-option:last-child {
              border-bottom: none;
            }
            
            .filter-option:hover {
              background: rgba(99, 102, 241, 0.1);
            }
            
            .filter-option span {
              font-size: 14px;
              color: #1a1a2e;
              font-weight: 500;
            }
            
            .filter-check {
              color: #6366f1;
              font-weight: bold;
              font-size: 16px;
            }
            
            /* Time Filter Button Styles */
            .time-filter-container {
              position: absolute;
              top: 190px; /* Positioned below filter button */
              right: 12px;
              z-index: 1000;
              transition: top 0.3s ease;
            }
            
            /* Time filter button moved down state */
            .time-filter-container.moved-down {
              top: 288px;
            }
            
            .time-filter-button {
              width: 44px;
              height: 44px;
              background: rgba(255, 255, 255, 0.95);
              border: none;
              border-radius: 12px;
              box-shadow: 0 4px 20px rgba(0,0,0,0.1);
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: center;
              color: #1a1a2e;
              transition: all 0.2s ease;
              backdrop-filter: blur(10px);
              border: 1px solid rgba(255, 255, 255, 0.2);
              -webkit-touch-callout: none;
              -webkit-user-select: none;
              -khtml-user-select: none;
              -moz-user-select: none;
              -ms-user-select: none;
              user-select: none;
              touch-action: manipulation;
              -webkit-text-size-adjust: none;
              -ms-text-size-adjust: none;
              text-size-adjust: none;
            }
            
            .time-filter-button:hover {
              background: rgba(255, 255, 255, 1);
              transform: translateY(-1px);
              box-shadow: 0 6px 25px rgba(0,0,0,0.15);
            }
            
            .time-filter-button:active {
              transform: translateY(0);
              box-shadow: 0 2px 15px rgba(0,0,0,0.1);
            }
            
            .time-filter-dropdown {
              position: absolute;
              top: 100%;
              right: 0;
              margin-top: 8px;
              background: rgba(255, 255, 255, 0.95);
              border-radius: 12px;
              box-shadow: 0 8px 32px rgba(0,0,0,0.1);
              backdrop-filter: blur(10px);
              border: 1px solid rgba(255, 255, 255, 0.2);
              display: none;
              min-width: 160px;
              overflow: hidden;
            }
            
            .time-filter-dropdown.show {
              display: block;
            }
            
            .time-filter-option {
              padding: 12px 16px;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: space-between;
              transition: background-color 0.2s ease;
              border-bottom: 1px solid rgba(0,0,0,0.05);
            }
            
            .time-filter-option:last-child {
              border-bottom: none;
            }
            
            .time-filter-option:hover {
              background: rgba(99, 102, 241, 0.1);
            }
            
            .time-filter-option span {
              font-size: 14px;
              color: #1a1a2e;
              font-weight: 500;
            }
            
            .time-filter-check {
              color: #6366f1;
              font-weight: bold;
              font-size: 16px;
            }
            
            /* Toggle button styles - premium */
            .toggle-button {
              position: absolute;
              top: 70px;
              right: 12px;
              background: rgba(255, 255, 255, 0.95);
              border-radius: 12px;
              box-shadow: 0 4px 20px rgba(0,0,0,0.1);
              z-index: 1000;
              display: flex;
              align-items: center;
              justify-content: center;
              cursor: pointer;
              border: none;
              padding: 8px 16px;
              font-size: 13px;
              font-weight: 600;
              color: #6366f1;
              transition: all 0.3s ease;
              backdrop-filter: blur(10px);
              border: 1px solid rgba(255, 255, 255, 0.2);
              min-width: 60px;
              -webkit-touch-callout: none;
              -webkit-user-select: none;
              -khtml-user-select: none;
              -moz-user-select: none;
              -ms-user-select: none;
              user-select: none;
              touch-action: manipulation;
              -webkit-text-size-adjust: none;
              -ms-text-size-adjust: none;
              text-size-adjust: none;
            }
            
            .toggle-button:hover {
              background: rgba(255, 255, 255, 1);
              transform: scale(1.02);
              box-shadow: 0 6px 25px rgba(0,0,0,0.15);
            }
            
            .toggle-button.active {
              background: #6366f1;
              color: white;
            }
            
            /* Route info panel - premium */
            .route-info {
              position: absolute;
              bottom: 80px;
              left: 12px;
              right: 12px;
              background: rgba(255, 255, 255, 0.95);
              padding: 16px;
              border-radius: 16px;
              box-shadow: 0 4px 20px rgba(0,0,0,0.1);
              z-index: 1000;
              display: none;
              backdrop-filter: blur(10px);
              border: 1px solid rgba(255, 255, 255, 0.2);
            }
            
            .route-info.show {
              display: block;
            }
            
            .route-info h4 {
              margin: 0 0 12px 0;
              font-size: 16px;
              color: #1a1a2e;
              font-weight: 600;
            }
            
            .route-stats {
              display: flex;
              justify-content: space-between;
              font-size: 13px;
              color: #4b5563;
              font-weight: 500;
            }
          </style>
        </head>
        <body>
          <div id="map"></div>
          
          <!-- Legend - premium design -->
          <div class="legend" id="legend">
            <h4 id="legendTitle">Police Activity</h4>
            <div class="legend-content" id="legendContent">
              <div class="legend-gradient"></div>
              <div class="legend-categories">
                <div class="legend-category">Low</div>
                <div class="legend-category">Medium</div>
                <div class="legend-category">High</div>
                <div class="legend-category">Very High</div>
                <div class="legend-category">Extreme</div>
              </div>
            </div>
          </div>
          
          <!-- Toggle Button -->
          <button id="toggleButton" class="toggle-button" onclick="toggleView()">
            Heatmap
          </button>
          
          <!-- Compass Button -->
          <button class="compass-button" onclick="recenterToUserLocation()" title="Recenter to your location">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none"/>
              <line x1="12" y1="2" x2="12" y2="6" stroke="currentColor" stroke-width="2"/>
              <line x1="12" y1="18" x2="12" y2="22" stroke="currentColor" stroke-width="2"/>
              <line x1="2" y1="12" x2="6" y2="12" stroke="currentColor" stroke-width="2"/>
              <line x1="18" y1="12" x2="22" y2="12" stroke="currentColor" stroke-width="2"/>
              <circle cx="12" cy="12" r="2" fill="currentColor"/>
            </svg>
          </button>
          
          <!-- Filter Button -->
          <div class="filter-container">
            <button class="filter-button" onclick="toggleFilterDropdown()" title="Filter alerts">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" fill="currentColor"/>
              </svg>
            </button>
            
            <!-- Filter Dropdown -->
            <div id="filterDropdown" class="filter-dropdown">
              <div class="filter-option" onclick="selectFilter('all')">
                <span>All Alerts</span>
                <div class="filter-check" id="check-all">✓</div>
              </div>
                          <div class="filter-option" onclick="selectFilter('police_hiding')">
              <span>Hidden Police</span>
              <div class="filter-check" id="check-police-hiding"></div>
            </div>
            </div>
          </div>
          
          <!-- Time Filter Button -->
          <div class="time-filter-container">
            <button class="time-filter-button" onclick="toggleTimeFilterDropdown()" title="Filter by time">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none"/>
                <polyline points="12,6 12,12 16,14" stroke="currentColor" stroke-width="2" fill="none"/>
              </svg>
            </button>
            
            <!-- Time Filter Dropdown -->
            <div id="timeFilterDropdown" class="time-filter-dropdown">
              <div class="time-filter-option" onclick="selectTimeFilter('24h')">
                <span>Past 24 Hours</span>
                <div class="time-filter-check" id="check-24h">✓</div>
              </div>
              <div class="time-filter-option" onclick="selectTimeFilter('7d')">
                <span>Past 7 Days</span>
                <div class="time-filter-check" id="check-7d"></div>
              </div>
              <div class="time-filter-option" onclick="selectTimeFilter('30d')">
                <span>Past 30 Days</span>
                <div class="time-filter-check" id="check-30d"></div>
              </div>
            </div>
          </div>
          
          <!-- Route Info Panel -->
          <div id="routeInfo" class="route-info">
            <h4>Route Analysis</h4>
            <div class="route-stats">
              <span id="routeDistance">Distance: --</span>
              <span id="routeDuration">Duration: --</span>
              <span id="hotspotCount">Hotspots: --</span>
            </div>
          </div>
          
           <script>
            let map;
            let heatmap;
            let directionsService;
            let directionsRenderer;
            let routePolyline;
            let routeMarkers = [];
            let routeHotspots = [];
            let userLocationPin = null; // Pin marker for user location
            let userLocation = { lat: ${center.latitude}, lng: ${center.longitude} };
            let individualCircles = [];
            let currentViewMode = '${currentViewMode}'; // Track current view mode
            let individualAlertsData = ${JSON.stringify(individualAlertsData)};
            
            function getBoundsObject() {
              const b = map.getBounds();
              if (!b) return null;
              const ne = b.getNorthEast();
              const sw = b.getSouthWest();
              return { north: ne.lat(), south: sw.lat(), east: ne.lng(), west: sw.lng() };
            }

            function initMap() {
              map = new google.maps.Map(document.getElementById('map'), {
                zoom: ${initialZoom},
                center: { lat: ${center.latitude}, lng: ${center.longitude} },
                mapTypeId: 'roadmap',
                gestureHandling: 'greedy',
                              zoomControl: false,
                mapTypeControl: false,
                streetViewControl: false,
                fullscreenControl: false,
              scaleControl: false,
              rotateControl: false,
              overviewMapControl: false,
                styles: [
                  { elementType: 'geometry', stylers: [{ color: '#f2f3f5' }] },
                  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
                  { elementType: 'labels.text.fill', stylers: [{ color: '#1d1d1f' }] },
                  { elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff' }] },
                  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#e5e5e7' }] },
                  { featureType: 'administrative.land_parcel', elementType: 'labels.text.fill', stylers: [{ color: '#86868b' }] },
                  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#c2e4cb' }] },
                  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#a8dab5' }] },
                  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#a8dab5' }] },
                  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#0f5132' }] },
                  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
                  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#f2f3f5' }] },
                  { featureType: 'road.arterial', elementType: 'labels.text.fill', stylers: [{ color: '#1d1d1f' }] },
                  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#e5e5e7' }] },
                  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#1d1d1f' }] },
                  { featureType: 'road.local', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
                  { featureType: 'road.local', elementType: 'labels.text.fill', stylers: [{ color: '#86868b' }] },
                  { featureType: 'transit.line', elementType: 'geometry', stylers: [{ color: '#e5e5e7' }] },
                  { featureType: 'transit.station', elementType: 'geometry', stylers: [{ color: '#d1ecf1' }] },
                  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#9cc0fa' }] },
                  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#1976d2' }] }
                ]
              });
              
              // Create weighted data points for heatmap
              const weightedHeatmapData = [];
              
              // Create heatmap with dynamic radius based on zoom
              heatmap = new google.maps.visualization.HeatmapLayer({
                data: weightedHeatmapData,
                map: map,
                radius: 20, // Start with smaller radius for individual dots
                opacity: 0.8, // Back to original opacity
                dissipating: true,
                gradient: [
                  'rgba(0, 191, 255, 0)',     // Bright blue (low)
                  'rgba(0, 255, 0, 0.3)',     // Bright green
                  'rgba(255, 255, 0, 0.5)',   // Bright yellow
                  'rgba(255, 140, 0, 0.7)',   // Bright orange
                  'rgba(255, 69, 0, 0.8)',    // Bright red-orange
                  'rgba(255, 0, 0, 1)'        // Bright red (high)
                ]
              });
              
              // Add zoom listener to adjust heatmap radius dynamically
              google.maps.event.addListener(map, 'zoom_changed', function() {
                const zoom = map.getZoom();
                let newRadius;
                
                if (zoom >= 15) {
                  // Very zoomed in: show individual dots
                  newRadius = 15;
                } else if (zoom >= 12) {
                  // Medium zoom: small clusters
                  newRadius = 25;
                } else if (zoom >= 9) {
                  // Medium zoom out: larger clusters
                  newRadius = 40;
                } else if (zoom >= 6) {
                  // Zoomed out: large clusters
                  newRadius = 60;
                } else {
                  // Very zoomed out: maximum clustering
                  newRadius = 80;
                }
                
                heatmap.setOptions({ radius: newRadius });
              });
              
              directionsService = new google.maps.DirectionsService();
              directionsRenderer = new google.maps.DirectionsRenderer({
                suppressMarkers: true,
                polylineOptions: {
                  strokeColor: '#4285F4',
                  strokeWeight: 5,
                  strokeOpacity: 0.9
                }
              });
              directionsRenderer.setMap(map);
              
              // User location marker removed - no longer showing blue circle
              
              // Notify React Native of bounds after idle
              google.maps.event.addListener(map, 'idle', function() {
                const b = getBoundsObject();
                if (b && window.ReactNativeWebView) {
                  window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'boundsChanged', bounds: b, zoom: map.getZoom() }));
                }
              });

              // Listen for messages from React Native
              window.addEventListener('message', function(event) {
                try {
                  const data = JSON.parse(event.data);
                  console.log('WebView received message:', data); // Debug log
                  
                  if (data.type === 'zoomToLocation') {
                    map.setCenter({ lat: data.lat, lng: data.lng });
                    map.setZoom(12);
                  } else if (data.type === 'showRoute') {
                    console.log('Showing route:', data.route); // Debug log
                    showRoute(data.route);
                  } else if (data.type === 'clearRoute') {
                    clearRouteDisplay();
                  // updateUserLocation handler removed - no longer needed
                  } else if (data.type === 'recenterToLocation') {
                    // Recenter map to user location with higher zoom
                    map.setCenter({ lat: data.lat, lng: data.lng });
                    map.setZoom(16); // Increased zoom level to see street details
                    
                    // Remove existing pin if any
                    if (userLocationPin) {
                      userLocationPin.setMap(null);
                    }
                    
                    // Drop a pin at user location
                    userLocationPin = new google.maps.Marker({
                      position: { lat: data.lat, lng: data.lng },
                      map: map,
                      // Using default marker for better visibility
                      title: 'Your Location',
                      zIndex: 1000 // Ensure pin appears above other elements
                    });
                    
                    console.log('Pin created at:', data.lat, data.lng); // Debug log
                    
                    // Add a subtle animation effect
                    const button = document.querySelector('.compass-button');
                    if (button) {
                      button.style.transform = 'scale(0.9)';
                      setTimeout(() => {
                        button.style.transform = 'scale(1)';
                      }, 150);
                    }
                  } else if (data.type === 'toggleIndividualAlerts') {
                    toggleIndividualAlerts(data.show);
                  } else if (data.type === 'updateHeatmapData') {
                    // Update heatmap with new data
                    if (heatmap) {
                      const newHeatmapData = data.alerts.map(alert => ({
                        location: new google.maps.LatLng(alert.lat, alert.lng),
                        weight: Math.min((alert.reliability || 50) / 100, 1)
                      }));
                      heatmap.setData(newHeatmapData);
                    }
                  } else if (data.type === 'updateAlertsData') {
                    // Update individual alerts data for click handlers
                    individualAlertsData = data.alerts;
                    
                    // If currently showing individual circles, update them
                    if (currentViewMode === 'alerts') {
                      // Clear existing circles and recreate with new data
                      hideIndividualCircles();
                      showIndividualCircles();
                    }
                  }
                } catch (e) {
                  console.log('Error parsing message:', e);
                }
              });
            }
            

            
            function showIndividualCircles() {
              // Hide heatmap
              heatmap.setMap(null);
              
              // Clear existing circles
              hideIndividualCircles();
              
              // Create individual circles for each police alert
              individualAlertsData.forEach((alert, index) => {
                const point = { lat: alert.lat, lng: alert.lng };
                const reliability = alert.reliability || 0;
                const intensity = Math.min(reliability / 100, 1); // Normalize reliability to 0-1
                
                const circle = new google.maps.Circle({
                  strokeColor: getCircleBorderColor(intensity),
                  strokeOpacity: 0.8,
                  strokeWeight: 2,
                  fillColor: getCircleFillColor(intensity),
                  fillOpacity: 0.6,
                  map: map,
                  center: point,
                  radius: 25, // reduced to 25% of original (was 100m)
                  zIndex: 1
                });
                
                // Add click listener for info
                circle.addListener('click', function() {
                  const isHidden = alert.subtype === 'POLICE_HIDING';
                  const alertType = isHidden ? 'Hidden Police Alert' : 'Police Alert';
                  const typeColor = isHidden ? '#FF6B35' : '#333';
                  const typeIcon = isHidden ? '🚨' : '👮';
                  
                  const infoWindow = new google.maps.InfoWindow({
                    content: \`
                      <div style="padding: 8px; max-width: 250px;">
                        <h4 style="margin: 0 0 4px 0; color: \${typeColor};">
                          \${typeIcon} \${alertType}
                        </h4>
                        <p style="margin: 0; font-size: 12px; color: #666;">
                          <strong>Description:</strong> \${alert.description}<br>
                          <strong>Type:</strong> \${isHidden ? 'Hidden Police' : 'General Police Activity'}<br>
                          <strong>Reliability:</strong> \${reliability}%<br>
                          <strong>Confidence:</strong> \${alert.confidence}%<br>
                          <strong>Thumbs Up:</strong> \${alert.thumbsUp}<br>
                          <strong>Location:</strong> \${alert.state}, \${alert.city || 'Unknown'}<br>
                          <strong>Time:</strong> \${new Date(alert.timestamp).toLocaleString()}
                        </p>
                      </div>
                    \`
                  });
                  infoWindow.setPosition(point);
                  infoWindow.open(map);
                });
                
                individualCircles.push(circle);
              });
            }
            
            function hideIndividualCircles() {
              individualCircles.forEach(circle => {
                circle.setMap(null);
              });
              individualCircles = [];
            }
            
            function showHeatmap() {
              heatmap.setMap(map);
            }
            
            function hideHeatmap() {
              heatmap.setMap(null);
            }
            
            function getCircleFillColor(intensity) {
              if (intensity <= 0.2) return '#00BFFF'; // Bright blue
              if (intensity <= 0.4) return '#00FF00'; // Bright green
              if (intensity <= 0.6) return '#FFFF00'; // Bright yellow
              if (intensity <= 0.8) return '#FF8C00'; // Bright orange
              if (intensity <= 0.9) return '#FF4500'; // Bright red-orange
              return '#FF0000'; // Bright red
            }
            
            function getCircleBorderColor(intensity) {
              if (intensity <= 0.2) return '#0080FF'; // Bright blue border
              if (intensity <= 0.4) return '#00CC00'; // Bright green border
              if (intensity <= 0.6) return '#FFD700'; // Bright yellow border
              if (intensity <= 0.8) return '#FF6600'; // Bright orange border
              if (intensity <= 0.9) return '#FF3300'; // Bright red-orange border
              return '#CC0000'; // Bright red border
            }
            
            function getActivityLevel(intensity) {
              if (intensity <= 0.2) return 'Low';
              if (intensity <= 0.4) return 'Medium';
              if (intensity <= 0.6) return 'High';
              if (intensity <= 0.8) return 'Very High';
              if (intensity <= 0.9) return 'High';
              return 'Extreme';
            }
            

            
            function recenterToUserLocation() {
              // Get the current user location from React Native
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'getUserLocation'
              }));
            }
            
            function toggleFilterDropdown() {
              const dropdown = document.getElementById('filterDropdown');
              const timeFilterContainer = document.querySelector('.time-filter-container');
              dropdown.classList.toggle('show');
              
              // Move time filter button down when filter dropdown is open
              if (dropdown.classList.contains('show')) {
                timeFilterContainer.classList.add('moved-down');
              } else {
                timeFilterContainer.classList.remove('moved-down');
              }
            }
            
            function selectFilter(filter) {
              // Update checkmarks
              document.getElementById('check-all').textContent = filter === 'all' ? '✓' : '';
              document.getElementById('check-police-hiding').textContent = filter === 'police_hiding' ? '✓' : '';
              
              // Close dropdown and move time filter button back up
              const dropdown = document.getElementById('filterDropdown');
              const timeFilterContainer = document.querySelector('.time-filter-container');
              dropdown.classList.remove('show');
              timeFilterContainer.classList.remove('moved-down');
              
              // Send message to React Native
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'filterChanged',
                filter: filter
              }));
            }
            
            function toggleTimeFilterDropdown() {
              const dropdown = document.getElementById('timeFilterDropdown');
              dropdown.classList.toggle('show');
            }
            
            function selectTimeFilter(timeFrame) {
              // Update checkmarks
              document.getElementById('check-24h').textContent = timeFrame === '24h' ? '✓' : '';
              document.getElementById('check-7d').textContent = timeFrame === '7d' ? '✓' : '';
              document.getElementById('check-30d').textContent = timeFrame === '30d' ? '✓' : '';
              
              // Close dropdown
              document.getElementById('timeFilterDropdown').classList.remove('show');
              
              // Send message to React Native
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'timeFilterChanged',
                timeFrame: timeFrame
              }));
              // Persist current map position so RN can preserve view
              const currentCenter = map.getCenter();
              const currentZoom = map.getZoom();
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'saveMapPosition',
                mapPosition: {
                  center: { lat: currentCenter.lat(), lng: currentCenter.lng() },
                  zoom: currentZoom
                }
              }));
            }
            
            function updateLegendForHeatmap() {
              const legendTitle = document.getElementById('legendTitle');
              const legendContent = document.getElementById('legendContent');
              
              legendTitle.textContent = 'Police Activity';
              legendContent.innerHTML = \`
                <div class="legend-gradient"></div>
                <div class="legend-categories">
                  <div class="legend-category">Low</div>
                  <div class="legend-category">Medium</div>
                  <div class="legend-category">High</div>
                  <div class="legend-category">Very High</div>
                  <div class="legend-category">Extreme</div>
                </div>
              \`;
            }
            
            function updateLegendForAlerts() {
              const legendTitle = document.getElementById('legendTitle');
              const legendContent = document.getElementById('legendContent');
              
              legendTitle.textContent = 'Police Reports';
              legendContent.innerHTML = \`
                <div class="legend-simple">
                  <div class="legend-single-dot"></div>
                  <div class="legend-single-text">= 1 police report</div>
                </div>
              \`;
            }
            
            // Listen for messages from React Native
            window.addEventListener('message', function(event) {
              if (event.data && typeof event.data === 'string') {
                try {
                  const data = JSON.parse(event.data);
                  if (data.type === 'updateAlertsData') {
                    // Update the individual alerts data without changing view mode
                    individualAlertsData = data.alerts;
                    
                    // If saveMapPosition flag is true, save current map position
                    if (data.saveMapPosition) {
                      const currentCenter = map.getCenter();
                      const currentZoom = map.getZoom();
                      const mapPosition = {
                        center: { lat: currentCenter.lat(), lng: currentCenter.lng() },
                        zoom: currentZoom
                      };
                      
                      // Send map position back to React Native
                      window.ReactNativeWebView.postMessage(JSON.stringify({
                        type: 'saveMapPosition',
                        mapPosition: mapPosition
                      }));
                    }
                    
                    // If currently in alerts mode, update the circles
                    if (document.getElementById('toggleButton').textContent === 'Heatmap') {
                      updateIndividualAlerts();
                    }
                  }
                } catch (error) {
                  console.error('Error parsing message:', error);
                }
              }
            });
            
            function updateIndividualAlerts() {
              // Store current map view state
              const currentCenter = map.getCenter();
              const currentZoom = map.getZoom();
              const currentBounds = map.getBounds();
              
              // Clear existing individual circles
              individualCircles.forEach(circle => circle.setMap(null));
              individualCircles = [];
              
              // Add new circles based on filtered data
              individualAlertsData.forEach(alert => {
                const circle = new google.maps.Circle({
                  strokeColor: '#FF0000',
                  strokeOpacity: 0.8,
                  strokeWeight: 2,
                  fillColor: getAlertColor(alert.reliability),
                  fillOpacity: 0.35,
                  map: map,
                  center: { lat: alert.lat, lng: alert.lng },
                  radius: 50, // reduced to 25% of original (was 200m)
                  clickable: true
                });
                
                // Add click listener
                circle.addListener('click', function() {
                  const infoWindow = new google.maps.InfoWindow({
                    content: \`
                      <div style="padding: 8px; max-width: 200px;">
                        <h4 style="margin: 0 0 8px 0; color: #1a1a2e;">Police Alert</h4>
                        <p style="margin: 4px 0; font-size: 12px;"><strong>Location:</strong> \${alert.city}, \${alert.state}</p>
                        <p style="margin: 4px 0; font-size: 12px;"><strong>Reliability:</strong> \${alert.reliability}%</p>
                        <p style="margin: 4px 0; font-size: 12px;"><strong>Confidence:</strong> \${alert.confidence}%</p>
                        <p style="margin: 4px 0; font-size: 12px;"><strong>Thumbs Up:</strong> \${alert.thumbsUp}</p>
                        <p style="margin: 4px 0; font-size: 12px;"><strong>Time:</strong> \${new Date(alert.timestamp).toLocaleString()}</p>
                        \${alert.description ? \`<p style="margin: 4px 0; font-size: 12px;"><strong>Description:</strong> \${alert.description}</p>\` : ''}
                      </div>
                    \`
                  });
                  infoWindow.open(map, circle);
                });
                
                individualCircles.push(circle);
              });
              
              // Restore map view state
              if (currentCenter && currentZoom) {
                map.setCenter(currentCenter);
                map.setZoom(currentZoom);
              }
            }
            
            // updateUserLocation function removed - no longer needed
            
            function showRoute(route) {
              console.log('showRoute called with:', route); // Debug log
              
              // Clear previous route
              clearRouteDisplay();
              
              try {
                // Display the route using the directions renderer
                const directionsRequest = {
                  origin: route.legs[0].start_address,
                  destination: route.legs[0].end_address,
                  travelMode: google.maps.TravelMode.DRIVING
                };
                
                directionsService.route(directionsRequest, function(result, status) {
                  if (status === 'OK') {
                    console.log('Directions service result:', result);
                    directionsRenderer.setDirections(result);
                    
                    // Add start and end markers
                    const startMarker = new google.maps.Marker({
                      position: route.legs[0].start_location,
                      map: map,
                      icon: {
                        path: google.maps.SymbolPath.CIRCLE,
                        scale: 8,
                        fillColor: '#4CAF50',
                        fillOpacity: 1,
                        strokeColor: '#fff',
                        strokeWeight: 2
                      },
                      title: 'Start'
                    });
                    
                    const endMarker = new google.maps.Marker({
                      position: route.legs[0].end_location,
                      map: map,
                      icon: {
                        path: google.maps.SymbolPath.CIRCLE,
                        scale: 8,
                        fillColor: '#F44336',
                        fillOpacity: 1,
                        strokeColor: '#fff',
                        strokeWeight: 2
                      },
                      title: 'End'
                    });
                    
                    routeMarkers.push(startMarker, endMarker);
                    
                    // Analyze route for police hotspots
                    analyzeRouteForHotspots(route);
                    
                    // Update route info panel
                    updateRouteInfo(route);
                    
                    // Fit map to show entire route
                    const bounds = new google.maps.LatLngBounds();
                    route.overview_path.forEach(point => bounds.extend(point));
                    map.fitBounds(bounds);
                  } else {
                    console.error('Directions request failed due to ' + status);
                    // Fallback: try to draw route manually using overview_path
                    drawRouteManually(route);
                  }
                });
              } catch (error) {
                console.error('Error in showRoute:', error);
                // Fallback: try to draw route manually
                drawRouteManually(route);
              }
            }
            
            function drawRouteManually(route) {
              console.log('Drawing route manually using overview_path');
              
              // Create a polyline using the overview_path
              const routePath = route.overview_path.map(point => ({
                lat: point.lat(),
                lng: point.lng()
              }));
              
              const routePolyline = new google.maps.Polyline({
                path: routePath,
                geodesic: true,
                strokeColor: '#4285F4',
                strokeOpacity: 0.9,
                strokeWeight: 5,
                map: map
              });
              
              // Add start and end markers
              const startMarker = new google.maps.Marker({
                position: route.legs[0].start_location,
                map: map,
                icon: {
                  path: google.maps.SymbolPath.CIRCLE,
                  scale: 8,
                  fillColor: '#4CAF50',
                  fillOpacity: 1,
                  strokeColor: '#fff',
                  strokeWeight: 2
                },
                title: 'Start'
              });
              
              const endMarker = new google.maps.Marker({
                position: route.legs[0].end_location,
                map: map,
                icon: {
                  path: google.maps.SymbolPath.CIRCLE,
                  scale: 8,
                  fillColor: '#F44336',
                  fillOpacity: 1,
                  strokeColor: '#fff',
                  strokeWeight: 2
                },
                title: 'End'
              });
              
              routeMarkers.push(startMarker, endMarker);
              
              // Analyze route for police hotspots
              analyzeRouteForHotspots(route);
              
              // Update route info panel
              updateRouteInfo(route);
              
              // Fit map to show entire route
              const bounds = new google.maps.LatLngBounds();
              route.overview_path.forEach(point => bounds.extend(point));
              map.fitBounds(bounds);
            }
            
            function analyzeRouteForHotspots(route) {
              const routePath = route.overview_path;
              const hotspotRadius = 1000; // 1km radius
              let hotspotCount = 0;
              
              // Get heatmap data points
               const heatmapData = individualAlertsData.map(a => new google.maps.LatLng(a.lat, a.lng));
              
              // Check each point along the route
              for (let i = 0; i < routePath.length; i += 5) { // Sample every 5th point
                const routePoint = routePath[i];
                
                // Find nearby police activity
                heatmapData.forEach(heatmapPoint => {
                  const distance = google.maps.geometry.spherical.computeDistanceBetween(
                    routePoint, 
                    heatmapPoint
                  );
                  
                  if (distance <= hotspotRadius) {
                    // Create hotspot marker
                    const hotspotMarker = new google.maps.Marker({
                      position: heatmapPoint,
                      map: map,
                      icon: {
                        path: google.maps.SymbolPath.CIRCLE,
                        scale: 6,
                        fillColor: '#FF9800',
                        fillOpacity: 0.8,
                        strokeColor: '#fff',
                        strokeWeight: 1
                      },
                      title: 'Police Hotspot'
                    });
                    
                    routeHotspots.push(hotspotMarker);
                    hotspotCount++;
                  }
                });
              }
              
              // Update hotspot count in info panel
              document.getElementById('hotspotCount').textContent = 'Hotspots: ' + hotspotCount;
            }
            
            function clearRouteDisplay() {
              // Clear route from directions renderer
              directionsRenderer.setDirections({ routes: [] });
              
              // Clear any manual polylines
              if (routePolyline) {
                routePolyline.setMap(null);
                routePolyline = null;
              }
              
              // Clear markers
              routeMarkers.forEach(marker => marker.setMap(null));
              routeMarkers = [];
              
              // Clear hotspots
              routeHotspots.forEach(marker => marker.setMap(null));
              routeHotspots = [];
              
              // Hide route info
              document.getElementById('routeInfo').classList.remove('show');
            }
            
            function updateRouteInfo(route) {
              const leg = route.legs[0];
              document.getElementById('routeDistance').textContent = 'Distance: ' + leg.distance.text;
              document.getElementById('routeDuration').textContent = 'Duration: ' + leg.duration.text;
              document.getElementById('routeInfo').classList.add('show');
            }

            function toggleView() {
              const toggleButton = document.getElementById('toggleButton');
              const isActive = toggleButton.classList.contains('active');
              
              // Get current map position and zoom
              const currentCenter = map.getCenter();
              const currentZoom = map.getZoom();
              const mapPosition = {
                center: { lat: currentCenter.lat(), lng: currentCenter.lng() },
                zoom: currentZoom
              };
              
              if (isActive) {
                // Currently showing heatmap, switch to individual circles
                toggleButton.classList.remove('active');
                currentViewMode = 'alerts';
                showIndividualCircles();
                hideHeatmap();
                
                // Update legend for alerts view
                updateLegendForAlerts();
                
                // Send view mode change to React Native with map position
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'viewModeChanged',
                  mode: 'alerts',
                  mapPosition: mapPosition
                }));
              } else {
                // Currently showing individual circles, switch to heatmap
                toggleButton.classList.add('active');
                currentViewMode = 'heatmap';
                showHeatmap();
                hideIndividualCircles();
                
                // Update legend for heatmap view
                updateLegendForHeatmap();
                
                // Send view mode change to React Native with map position
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'viewModeChanged',
                  mode: 'heatmap',
                  mapPosition: mapPosition
                }));
              }
            }
            
            window.onload = function() {
              initMap();
              
              // Set initial view mode based on stored state
              if (initialViewMode === 'alerts') {
                // Start in alerts mode (grey button, individual circles)
                currentViewMode = 'alerts';
                document.getElementById('toggleButton').classList.remove('active');
                showIndividualCircles();
                hideHeatmap();
                updateLegendForAlerts();
              } else {
                // Start in heatmap mode (blue button, heatmap)
                currentViewMode = 'heatmap';
                document.getElementById('toggleButton').classList.add('active');
                showHeatmap();
                hideIndividualCircles();
                updateLegendForHeatmap();
              }
              // After init, request RN to push initial data
              if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'mapReady' }));
              }
            };
          </script>
        </body>
      </html>
    `;
  };

  const handleWebViewMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      
      if (data.type === 'filterChanged') {
        selectFilter(data.filter);
      } else if (data.type === 'viewModeChanged') {
        setCurrentViewMode(data.mode);
        // Save the current map position when view mode changes
        if (data.mapPosition) {
          setSavedMapPosition(data.mapPosition);
        }
      } else if (data.type === 'saveMapPosition') {
        // Save the current map position when filter changes
        if (data.mapPosition) {
          setSavedMapPosition(data.mapPosition);
        }
      } else if (data.type === 'timeFilterChanged') {
        // Handle time filter changes
        selectTimeFilter(data.timeFrame);
      } else if (data.type === 'mapReady') {
        // Push current alerts/heatmap on initial ready event
        const alerts = policeAlerts;
        if (webViewRef.current) {
          const individualAlertsData = alerts.map((alert: PoliceAlert) => ({
            lat: alert.latitude,
            lng: alert.longitude,
            reliability: alert.alert_reliability,
            confidence: alert.alert_confidence || 0,
            thumbsUp: alert.num_thumbs_up || 0,
            description: alert.description || 'Police Alert',
            timestamp: alert.publish_datetime_utc,
            state: alert.state,
            city: alert.city,
            subtype: alert.subtype
          }));
          webViewRef.current.postMessage(JSON.stringify({ type: 'updateAlertsData', alerts: individualAlertsData }));
          webViewRef.current.postMessage(JSON.stringify({ type: 'updateHeatmapData', alerts: individualAlertsData }));
        }
      } else if (data.type === 'getUserLocation') {
        // Handle recenter request
        if (userLocation && webViewRef.current) {
          webViewRef.current.postMessage(JSON.stringify({
            type: 'recenterToLocation',
            lat: userLocation.latitude,
            lng: userLocation.longitude
          }));
        }
      } else if (data.type === 'boundsChanged' && data.bounds) {
        // If we have a previous expanded fetched area and current bounds fit inside it, skip refetch.
        if (fetchedAreas.length && anyAreaContains(fetchedAreas, data.bounds)) {
          // Update remembered zoom but avoid network call
          if (typeof data.zoom === 'number') setLastZoom(data.zoom);
          return;
        }
        // If zooming in (higher zoom), don't refetch; existing data already covers it
        if (typeof data.zoom === 'number' && lastZoom !== null && data.zoom > lastZoom) {
          setLastZoom(data.zoom);
          return;
        }
        if (typeof data.zoom === 'number') setLastZoom(data.zoom);
        // Fetch alerts for current bounds (with expansion inside the function)
        fetchAlertsForBounds(data.bounds);
      }
    } catch (error) {
      console.log('Error parsing WebView message:', error);
    }
  };



  const openSearchModal = () => {
    setSearchModalVisible(true);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading police alerts...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.mapContainer}>
        <WebView
          ref={webViewRef}
          source={{ html: createBaseMapHTML() }}
          style={styles.webview}
          onMessage={handleWebViewMessage}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          startInLoadingState={true}
          renderLoading={() => (
            <View style={styles.webviewLoading}>
              <ActivityIndicator size="large" color="#007AFF" />
              <Text style={styles.webviewLoadingText}>Loading interactive map...</Text>
            </View>
          )}
        />
      </View>
      
      <View style={styles.bottomControls}>
        <View style={styles.controlButtons}>
          <TouchableOpacity style={styles.routeButton} onPress={() => setRouteModalVisible(true)}>
            <Text style={styles.routeButtonText}>Plan Route</Text>
          </TouchableOpacity>
          {routeData && (
            <TouchableOpacity style={styles.clearButton} onPress={clearRoute}>
              <Text style={styles.clearButtonText}>Clear</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.searchButton} onPress={openSearchModal}>
            <Text style={styles.searchButtonText}>Search</Text>
          </TouchableOpacity>
        </View>
        
        <View style={styles.statusBar}>
          <Text style={styles.statusText}>
            {routeData 
              ? `Route: ${startLocation} → ${endLocation}`
              : `Showing ${policeAlerts.length} ${alertFilter === 'police_hiding' ? 'Hidden Police' : 'police'} alerts`
            }
          </Text>
          {!routeData && (
            <Text style={styles.alertCounter}>
              {`${policeAlerts.length} alerts displayed (${databaseAlertCount} total in database)`}
            </Text>
          )}

        </View>
      </View>

      {/* Route Planning Modal */}
      <Modal
        visible={routeModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setRouteModalVisible(false)}
      >
        <KeyboardAvoidingView 
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView 
            contentContainerStyle={styles.scrollContainer}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Plan Your Route</Text>
              <Text style={styles.modalSubtitle}>Find police hotspots along your route</Text>
              
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Start Location</Text>
                <View style={styles.locationInputContainer}>
                <TextInput
                    style={[styles.input, startLocation === 'My Location' && styles.myLocationInput]}
                  placeholder="Start location (address, city, or ZIP)"
                  value={startLocation}
                  onChangeText={handleStartLocationChange}
                    onFocus={() => {
                      if (startLocation === 'My Location') {
                        setStartLocation('');
                      }
                      setShowStartSuggestions(true);
                    }}
                  />
                  {startLocation === 'My Location' && (
                    <Text style={styles.myLocationBadge}>📍 My Location</Text>
                  )}
                </View>
                {showStartSuggestions && startSuggestions.length > 0 && (
                  <View style={styles.suggestionsContainer}>
                    {startSuggestions.map((suggestion, index) => (
                      <TouchableOpacity
                        key={index}
                        style={styles.suggestionItem}
                        onPress={() => selectStartSuggestion(suggestion)}
                      >
                        <Text style={styles.suggestionText}>{suggestion}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
              
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>End Location</Text>
                <TextInput
                  style={styles.input}
                  placeholder="End location (address, city, or ZIP)"
                  value={endLocation}
                  onChangeText={handleEndLocationChange}
                  onFocus={() => setShowEndSuggestions(true)}
                />
                {showEndSuggestions && endSuggestions.length > 0 && (
                  <View style={styles.suggestionsContainer}>
                    {endSuggestions.map((suggestion, index) => (
                      <TouchableOpacity
                        key={index}
                        style={styles.suggestionItem}
                        onPress={() => selectEndSuggestion(suggestion)}
                      >
                        <Text style={styles.suggestionText}>{suggestion}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
              
              <View style={styles.modalButtons}>
                <TouchableOpacity 
                  style={styles.cancelButton} 
                  onPress={() => setRouteModalVisible(false)}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={styles.planButton} 
                  onPress={planRoute}
                  disabled={routeLoading}
                >
                  <Text style={styles.planButtonText}>
                    {routeLoading ? 'Planning...' : 'Plan Route'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Search Location Modal */}
      <Modal
        visible={searchModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSearchModalVisible(false)}
      >
        <KeyboardAvoidingView 
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView 
            contentContainerStyle={styles.scrollContainer}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Search Location</Text>
              <Text style={styles.modalSubtitle}>Enter an address to center the map</Text>
              
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Address</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter address, city, or ZIP code"
                  value={searchQuery}
                  onChangeText={handleSearchQueryChange}
                  onFocus={() => setShowSearchSuggestions(true)}
                />
                {showSearchSuggestions && searchSuggestions.length > 0 && (
                  <View style={styles.suggestionsContainer}>
                    {searchSuggestions.map((suggestion, index) => (
                      <TouchableOpacity
                        key={index}
                        style={styles.suggestionItem}
                        onPress={() => selectSearchSuggestion(suggestion)}
                      >
                        <Text style={styles.suggestionText}>{suggestion}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
              
              <View style={styles.modalButtons}>
                <TouchableOpacity 
                  style={styles.cancelButton} 
                  onPress={() => setSearchModalVisible(false)}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={styles.planButton} 
                  onPress={performSearch}
                >
                  <Text style={styles.planButtonText}>Search</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#64748b',
    fontWeight: '500',
  },
  mapContainer: {
    flex: 1,
    position: 'relative',
  },
  webview: {
    flex: 1,
  },
  webviewLoading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  webviewLoadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#64748b',
    fontWeight: '500',
  },
  bottomControls: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.05)',
    paddingBottom: 20,
  },
  controlButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  routeButton: {
    backgroundColor: '#34C759',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    minWidth: 120,
    alignItems: 'center',
    shadowColor: '#34C759',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  routeButtonText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  clearButton: {
    backgroundColor: '#ef4444',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    minWidth: 80,
    alignItems: 'center',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  clearButtonText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  statusBar: {
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  statusText: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    fontWeight: '500',
  },
  alertCounter: {
    fontSize: 12,
    color: '#6366f1',
    textAlign: 'center',
    fontWeight: '600',
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    padding: 28,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 20,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1a2e',
    textAlign: 'center',
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  modalSubtitle: {
    fontSize: 15,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 24,
    fontWeight: '500',
  },
  inputContainer: {
    marginBottom: 20,
    position: 'relative',
  },
  input: {
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    color: '#1a1a2e',
    fontWeight: '500',
  },
  suggestionsContainer: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    maxHeight: 150,
    zIndex: 1000,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  suggestionItem: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  suggestionText: {
    fontSize: 15,
    color: '#1a1a2e',
    fontWeight: '500',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 16,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#64748b',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#64748b',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  cancelButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  planButton: {
    flex: 1,
    backgroundColor: '#6366f1',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  planButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  searchButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    minWidth: 100,
    alignItems: 'center',
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  searchButtonText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  locationInputContainer: {
    position: 'relative',
  },
  myLocationInput: {
    backgroundColor: '#f0f9ff',
    borderColor: '#0ea5e9',
  },
  myLocationBadge: {
    position: 'absolute',
    right: 12,
    top: 16,
    fontSize: 12,
    color: '#0ea5e9',
    fontWeight: '600',
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },


}); 