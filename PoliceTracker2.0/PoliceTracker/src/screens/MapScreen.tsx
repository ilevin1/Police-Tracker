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
import { getPoliceAlerts, getAllPoliceAlerts, getPoliceAlertsByState, getPoliceHeatmapData, getSimpleHeatmapData, getPoliceAlertsCount } from '../services/supabase';

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
      
      // Try to fetch all alerts, fallback to limited if needed
      let alerts;
      try {
        console.log('Fetching all police alerts...');
        alerts = await getAllPoliceAlerts();
        setPoliceAlerts(alerts);
        console.log(`Loaded ${alerts.length} alerts`);
      } catch (error) {
        console.warn('Full alerts fetch failed, trying limited fetch:', error);
        // Fallback to limited fetch
        alerts = await getPoliceAlerts(500);
        setPoliceAlerts(alerts);
        console.log(`Loaded ${alerts.length} alerts (limited)`);
      }

      // Get the total count from database for comparison
      try {
        const totalCount = await getPoliceAlertsCount();
        setDatabaseAlertCount(totalCount);
        console.log(`Database contains ${totalCount} total police alerts`);
      } catch (error) {
        console.warn('Failed to get database count:', error);
      }
      try {
        const states = await getPoliceAlertsByState();
        setStateAlerts(states);
      } catch (error) {
        // Silently handle state data error and use fallback
        // Fallback: create state data from individual alerts
        const stateMap = new Map();
        alerts.forEach((alert: PoliceAlert) => {
          const state = alert.state;
          if (!stateMap.has(state)) {
            stateMap.set(state, {
              state,
              alert_count: 0,
              avg_reliability: 0,
              avg_confidence: 0,
              total_thumbs_up: 0,
              center_lat: alert.latitude,
              center_lng: alert.longitude
            });
          }
          const stateData = stateMap.get(state);
          stateData.alert_count++;
          stateData.avg_reliability += alert.alert_reliability;
          stateData.avg_confidence += alert.alert_confidence || 0;
          stateData.total_thumbs_up += alert.num_thumbs_up || 0;
        });
        // Calculate averages
        stateMap.forEach((stateData) => {
          stateData.avg_reliability = Math.round((stateData.avg_reliability / stateData.alert_count) * 100) / 100;
          stateData.avg_confidence = Math.round((stateData.avg_confidence / stateData.alert_count) * 100) / 100;
        });
        setStateAlerts(Array.from(stateMap.values()));
      }
    } catch (error) {
      console.error('Error loading data:', error);
      Alert.alert('Error', 'Failed to load police alerts');
    } finally {
      setLoading(false);
    }
  };

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

  const webViewRef = React.useRef<WebView>(null);

  const createMapHTML = () => {
    const googleMapsApiKey = 'AIzaSyBEftn_87WiK5VgBcMKXzVV8oKfunswejA';
    const center = userLocation || { latitude: 39.8283, longitude: -98.5795 };

    // Heatmap data for Google Maps
    const heatmapData = heatmapPoints.map((pt: any) => `new google.maps.LatLng(${pt.lat}, ${pt.lng})`).join(',\n');
    const heatmapWeights = heatmapPoints.map((pt: any) => pt.intensity || 1).join(',');
    
    // Individual police alerts data for Alerts mode
    const individualAlertsData = policeAlerts.map((alert: PoliceAlert) => ({
      lat: alert.latitude,
      lng: alert.longitude,
      reliability: alert.alert_reliability,
      confidence: alert.alert_confidence || 0,
      thumbsUp: alert.num_thumbs_up || 0,
      description: alert.description || 'Police Alert',
      timestamp: alert.publish_datetime_utc,
      state: alert.state,
      city: alert.city
    }));

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <script src="https://maps.googleapis.com/maps/api/js?key=${googleMapsApiKey}&libraries=visualization,geometry"></script>
          <style>
            body { 
              margin: 0; 
              padding: 0; 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
              padding-top: env(safe-area-inset-top, 44px);
            }
            #map { width: 100vw; height: 100vh; }
            
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
            
            /* Compass button styles - premium */
            .compass-button {
              position: absolute;
              top: 70px;
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
            }
            
            .compass-button:hover {
              background: rgba(255, 255, 255, 1);
              transform: scale(1.05);
              box-shadow: 0 6px 25px rgba(0,0,0,0.15);
            }
            
            .compass-button:active {
              transform: scale(0.95);
            }
            
            /* Toggle button styles - premium */
            .toggle-button {
              position: absolute;
              top: 70px;
              right: 68px;
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
          <div class="legend">
            <h4>Police Activity</h4>
            <div class="legend-content">
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
            Alerts
          </button>
          
          <!-- Compass Button -->
          <button class="compass-button" onclick="recenterToUserLocation()" title="Recenter to your location">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="currentColor"/>
            </svg>
          </button>
          
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
            let userLocationMarker;
            let userLocation = { lat: ${center.latitude}, lng: ${center.longitude} };
            let individualCircles = [];
            let individualAlertsData = ${JSON.stringify(individualAlertsData)};
            
            function initMap() {
              map = new google.maps.Map(document.getElementById('map'), {
                zoom: 12,
                center: userLocation,
                mapTypeId: 'roadmap',
                gestureHandling: 'greedy',
                zoomControl: true,
                mapTypeControl: false,
                streetViewControl: false,
                fullscreenControl: false,
                styles: [
                  { elementType: 'geometry', stylers: [{ color: '#f5f5f5' }] },
                  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
                  { elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
                  { elementType: 'labels.text.stroke', stylers: [{ color: '#f5f5f5' }] },
                  { featureType: 'administrative.land_parcel', elementType: 'labels.text.fill', stylers: [{ color: '#bdbdbd' }] },
                  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#eeeeee' }] },
                  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#e5e5e5' }] },
                  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
                  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
                  { featureType: 'road.arterial', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
                  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#dadada' }] },
                  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
                  { featureType: 'road.local', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
                  { featureType: 'transit.line', elementType: 'geometry', stylers: [{ color: '#e5e5e5' }] },
                  { featureType: 'transit.station', elementType: 'geometry', stylers: [{ color: '#eeeeee' }] },
                  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#e3f2fd' }] },
                  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#1976d2' }] }
                ]
              });
              
              heatmap = new google.maps.visualization.HeatmapLayer({
                data: [${heatmapData}],
                map: map,
                radius: 30,
                opacity: 0.8,
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
              
              // Add user location marker
              userLocationMarker = new google.maps.Marker({
                position: userLocation,
                map: map,
                icon: {
                  path: google.maps.SymbolPath.CIRCLE,
                  scale: 8,
                  fillColor: '#4285F4',
                  fillOpacity: 1,
                  strokeColor: '#fff',
                  strokeWeight: 2
                },
                title: 'Your Location'
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
                  } else if (data.type === 'updateUserLocation') {
                    updateUserLocation(data.lat, data.lng);
                  } else if (data.type === 'toggleIndividualAlerts') {
                    toggleIndividualAlerts(data.show);
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
                  radius: 100, // 100 meters radius
                  zIndex: 1
                });
                
                // Add click listener for info
                circle.addListener('click', function() {
                  const infoWindow = new google.maps.InfoWindow({
                    content: \`
                      <div style="padding: 8px; max-width: 250px;">
                        <h4 style="margin: 0 0 4px 0; color: #333;">Police Alert</h4>
                        <p style="margin: 0; font-size: 12px; color: #666;">
                          <strong>Description:</strong> \${alert.description}<br>
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
              if (userLocation) {
                map.setCenter(userLocation);
                map.setZoom(12);
                
                // Add a subtle animation effect
                const button = document.querySelector('.compass-button');
                button.style.transform = 'scale(0.9)';
                setTimeout(() => {
                  button.style.transform = 'scale(1)';
                }, 150);
              }
            }
            
            function updateUserLocation(lat, lng) {
              userLocation = { lat: lat, lng: lng };
              if (userLocationMarker) {
                userLocationMarker.setPosition(userLocation);
              }
            }
            
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
              const heatmapData = [${heatmapData}];
              
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
              const currentText = toggleButton.textContent;
              const newText = currentText === 'Alerts' ? 'Heatmap' : 'Alerts';
              toggleButton.textContent = newText;
              toggleButton.classList.toggle('active');
              
              if (newText === 'Heatmap') {
                showHeatmap();
                hideIndividualCircles();
              } else {
                showIndividualCircles();
                hideHeatmap();
              }
            }
            
            window.onload = initMap;
          </script>
        </body>
      </html>
    `;
  };

  const handleWebViewMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      // Handle any future WebView messages here
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
          source={{ html: createMapHTML() }}
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
              : `Showing ${policeAlerts.length} police alerts`
            }
          </Text>
          {!routeData && (
            <Text style={styles.alertCounter}>
              {`${policeAlerts.length} alerts displayed (${databaseAlertCount} in database)`}
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
    backgroundColor: '#6366f1',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    minWidth: 120,
    alignItems: 'center',
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
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
    backgroundColor: '#10B981',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    minWidth: 100,
    alignItems: 'center',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
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