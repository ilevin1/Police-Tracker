import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { PoliceAlertService } from '../services/supabase';

interface StatsData {
  state: string;
  alert_count: number;
}

interface CityStatsData {
  city: string;
  state: string;
  alert_count: number;
}

interface StatsScreenProps {
  navigation: any;
}

export default function StatsScreen({ navigation }: StatsScreenProps) {
  const [stateStats, setStateStats] = useState<StatsData[]>([]);
  const [cityStats, setCityStats] = useState<CityStatsData[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'states' | 'cities'>('states');

  useEffect(() => {
    loadStateStats();
  }, []);

  const loadStateStats = async () => {
    setLoading(true);
    try {
      const stats = await PoliceAlertService.getPoliceAlertsByState();
      setStateStats(stats);
    } catch (error) {
      console.error('Error loading state stats:', error);
      Alert.alert('Error', 'Failed to load state statistics');
    } finally {
      setLoading(false);
    }
  };

  const loadCityStats = async (state?: string) => {
    setLoading(true);
    try {
      const stats = await PoliceAlertService.getPoliceAlertsByCity(state);
      setCityStats(stats);
    } catch (error) {
      console.error('Error loading city stats:', error);
      Alert.alert('Error', 'Failed to load city statistics');
    } finally {
      setLoading(false);
    }
  };

  const handleStatePress = (state: string) => {
    setSelectedState(state);
    setViewMode('cities');
    loadCityStats(state);
  };

  const handleBackToStates = () => {
    setSelectedState(null);
    setViewMode('states');
  };

  const renderStateItem = ({ item, index }: { item: StatsData; index: number }) => (
    <TouchableOpacity
      style={styles.statItem}
      onPress={() => handleStatePress(item.state)}
    >
      <View style={styles.statHeader}>
        <Text style={styles.statTitle}>{item.state}</Text>
        <Text style={styles.statCount}>{item.alert_count}</Text>
      </View>
      <View style={styles.progressBar}>
        <View 
          style={[
            styles.progressFill, 
            { 
              width: `${Math.min((item.alert_count / Math.max(...stateStats.map(s => s.alert_count))) * 100, 100)}%` 
            }
          ]} 
        />
      </View>
    </TouchableOpacity>
  );

  const renderCityItem = ({ item, index }: { item: CityStatsData; index: number }) => (
    <View style={styles.statItem}>
      <View style={styles.statHeader}>
        <Text style={styles.statTitle}>{item.city}</Text>
        <Text style={styles.statCount}>{item.alert_count}</Text>
      </View>
      <View style={styles.progressBar}>
        <View 
          style={[
            styles.progressFill, 
            { 
              width: `${Math.min((item.alert_count / Math.max(...cityStats.map(s => s.alert_count))) * 100, 100)}%` 
            }
          ]} 
        />
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          {viewMode === 'states' ? 'Police Alerts by State' : `${selectedState} Cities`}
        </Text>
        {viewMode === 'cities' && (
          <TouchableOpacity style={styles.backButton} onPress={handleBackToStates}>
            <Text style={styles.backButtonText}>← Back to States</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading statistics...</Text>
        </View>
      ) : viewMode === 'states' ? (
        <FlatList
          data={stateStats}
          renderItem={renderStateItem}
          keyExtractor={(item) => item.state}
          style={styles.list}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <FlatList
          data={cityStats}
          renderItem={renderCityItem}
          keyExtractor={(item) => `${item.city}-${item.state}`}
          style={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Data updates every hour from Waze API
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#007AFF',
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 10,
  },
  backButton: {
    alignSelf: 'flex-start',
  },
  backButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  list: {
    flex: 1,
    paddingHorizontal: 20,
  },
  statItem: {
    backgroundColor: 'white',
    marginVertical: 8,
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  statHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  statTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  statCount: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  progressBar: {
    height: 8,
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#007AFF',
    borderRadius: 4,
  },
  footer: {
    padding: 20,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
}); 