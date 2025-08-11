import React from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';

type RoutePlannerModalProps = {
  visible: boolean;
  onClose: () => void;
  onPlanRoute: () => void;
  routeLoading: boolean;
  startLocation: string;
  endLocation: string;
  onChangeStart: (text: string) => void;
  onChangeEnd: (text: string) => void;
  showStartSuggestions: boolean;
  startSuggestions: string[];
  onSelectStartSuggestion: (s: string) => void;
  showEndSuggestions: boolean;
  endSuggestions: string[];
  onSelectEndSuggestion: (s: string) => void;
  onStartInputFocus?: () => void;
  onEndInputFocus?: () => void;
};

export default function RoutePlannerModal(props: RoutePlannerModalProps) {
  const {
    visible,
    onClose,
    onPlanRoute,
    routeLoading,
    startLocation,
    endLocation,
    onChangeStart,
    onChangeEnd,
    showStartSuggestions,
    startSuggestions,
    onSelectStartSuggestion,
    showEndSuggestions,
    endSuggestions,
    onSelectEndSuggestion,
    onStartInputFocus,
    onEndInputFocus,
  } = props;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Plan Your Route</Text>
            <Text style={styles.modalSubtitle}>Find police hotspots along your route</Text>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Start Location</Text>
              <View style={styles.locationInputContainer}>
                <TextInput
                  style={styles.input}
                  placeholder="Start location (address, city, or ZIP)"
                  value={startLocation}
                  onChangeText={onChangeStart}
                  onFocus={onStartInputFocus}
                />
              </View>
              {showStartSuggestions && startSuggestions.length > 0 && (
                <View style={styles.suggestionsContainer}>
                  {startSuggestions.map((suggestion, index) => (
                    <TouchableOpacity
                      key={index}
                      style={styles.suggestionItem}
                      onPress={() => onSelectStartSuggestion(suggestion)}
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
                onChangeText={onChangeEnd}
                onFocus={onEndInputFocus}
              />
              {showEndSuggestions && endSuggestions.length > 0 && (
                <View style={styles.suggestionsContainer}>
                  {endSuggestions.map((suggestion, index) => (
                    <TouchableOpacity
                      key={index}
                      style={styles.suggestionItem}
                      onPress={() => onSelectEndSuggestion(suggestion)}
                    >
                      <Text style={styles.suggestionText}>{suggestion}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.planButton} onPress={onPlanRoute} disabled={routeLoading}>
                <Text style={styles.planButtonText}>{routeLoading ? 'Planning...' : 'Plan Route'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  locationInputContainer: {
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
});


