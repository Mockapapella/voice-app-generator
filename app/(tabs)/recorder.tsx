import React, { useState, useEffect, useCallback, useRef } from 'react';
import { StyleSheet, View, TouchableOpacity, Text, Alert, Platform,
         SafeAreaView, StatusBar, ActivityIndicator } from 'react-native';
import { Audio } from 'expo-av';
import { WebView } from 'react-native-webview';
import Constants from 'expo-constants';

// Groq API endpoints
const GROQ_TRANSCRIPTION_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_API_KEY = Constants.expoConfig?.extra?.groqApiKey;

// WARNING: This demo app is configured to use client-side API calls.
// For production, API keys should NEVER be stored in client-side code.
// Use a backend proxy or server-side API instead.

export default function RecorderScreen() {
  // Core state
  const [recording, setRecording] = useState(null);
  const [sound, setSound] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [recordingURI, setRecordingURI] = useState(null);
  const [recordingBlob, setRecordingBlob] = useState(null);

  // App generation state
  const [generatedComponent, setGeneratedComponent] = useState(null);
  const [processingStatus, setProcessingStatus] = useState(null);
  const [isModifying, setIsModifying] = useState(false);
  const [currentComponent, setCurrentComponent] = useState(null);
  const [webViewKey, setWebViewKey] = useState(Date.now()); // Add key state for WebView re-rendering

  // Setup audio permissions on mount
  useEffect(() => {
    Audio.requestPermissionsAsync().then(result => {
      if (result.status !== 'granted') {
        Alert.alert('Permission Required', 'Microphone permission is needed');
      } else {
        Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true
        });
      }
    });

    // Cleanup on unmount
    return () => {
      if (recording) recording.stopAndUnloadAsync();
      if (sound) sound.unloadAsync();
    };
  }, []);

  // Toggle recording
  const toggleRecording = async () => {
    if (isRecording) {
      await stopRecording();
    } else {
      await startRecording();
    }
  };

  // Start recording
  const startRecording = async () => {
    try {
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(recording);
      setIsRecording(true);
    } catch (error) {
      Alert.alert('Recording Failed', error.message);
    }
  };

  // Stop recording
  const stopRecording = async () => {
    if (!recording) return;

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setIsRecording(false);
      setRecordingURI(uri);

      // For web, create a blob
      if (Platform.OS === 'web' && uri) {
        try {
          const response = await fetch(uri);
          const blob = await response.blob();
          setRecordingBlob(blob);
        } catch (error) {
          console.error('Blob creation error:', error);
        }
      }

      // Auto-process modifications when recording stops, but with guards
      if (isModifying && (currentComponent || generatedComponent)) {
        // Small delay to ensure state updates have propagated
        setTimeout(() => modifyApp(), 100);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to stop recording');
      setIsModifying(false); // Reset modify state on error
    }
  };

  // Play/stop the recording
  const togglePlayback = async () => {
    if (isPlaying) {
      if (sound) {
        await sound.stopAsync();
        setIsPlaying(false);
      }
    } else {
      await playRecording();
    }
  };

  // Play recording
  const playRecording = async () => {
    if (!recordingURI) return;

    try {
      if (sound) await sound.unloadAsync();

      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: recordingURI },
        { shouldPlay: true }
      );

      setSound(newSound);
      setIsPlaying(true);

      // Auto-detect end of playback
      newSound.setOnPlaybackStatusUpdate(status => {
        if (status.isLoaded && status.didJustFinish) {
          setIsPlaying(false);
        }
      });
    } catch (error) {
      Alert.alert('Playback Error', error.message);
      setIsPlaying(false);
    }
  };

  // Create app from recording
  const createApp = async () => {
    if (!recordingURI) return;

    setIsSending(true);
    setProcessingStatus('Processing...');
    setGeneratedComponent(null);

    try {
      // Prepare file for transcription
      let transcriptionResponse;

      if (Platform.OS === 'web') {
        if (!recordingBlob) throw new Error('Recording not available');

        const formData = new FormData();
        formData.append('file', new File([recordingBlob], 'recording.webm', { type: 'audio/webm' }));
        formData.append('model', 'whisper-large-v3');

        transcriptionResponse = await fetch(GROQ_TRANSCRIPTION_URL, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${GROQ_API_KEY}` },
          body: formData
        });
      } else {
        const formData = new FormData();
        formData.append('file', {
          uri: recordingURI,
          name: 'recording.m4a',
          type: 'audio/m4a'
        });
        formData.append('model', 'whisper-large-v3');

        transcriptionResponse = await fetch(GROQ_TRANSCRIPTION_URL, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${GROQ_API_KEY}` },
          body: formData
        });
      }

      if (!transcriptionResponse.ok) {
        throw new Error(`Transcription failed: ${transcriptionResponse.statusText}`);
      }

      // Get transcript
      const transcriptionData = await transcriptionResponse.json();
      const transcript = transcriptionData.text;
      setProcessingStatus('Creating app...');

      // Generate app from transcript
      const appResponse = await fetch(GROQ_CHAT_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'llama3-70b-8192',
          messages: [
            {
              role: 'system',
              content: `You are an HTML generator that creates mobile-friendly web components for a WebView with emphasis on clean, responsive CSS styling.

IMPORTANT RULES:
- Create a SINGLE HTML segment with the requested functionality
- Use standard HTML5 elements with embedded CSS and JavaScript
- NO external libraries or frameworks
- Include interactive behavior with vanilla JavaScript
- NEVER include introductions like "Here is a..." or "This is a..." - just output the HTML directly
- DO NOT add any explanatory text before or after the HTML
- Keep it simple and focused on the core functionality
- Ensure proper mobile layout and styling
- Handle user interactions appropriately
- Make error messages visible to users
- Test thoroughly for edge cases

CSS REQUIREMENTS:
- ALWAYS generate complete CSS styling for all elements
- Default to a Material Design inspired theme unless otherwise specified
- Use a clean, modern visual hierarchy with appropriate spacing
- Include subtle shadows and rounded corners for elements
- Follow material color scheme with primary/secondary colors and proper contrast
- Implement hover/active states for interactive elements
- Ensure all text is highly readable with proper font sizes and contrast
- Make components fully responsive for all screen sizes

MATERIAL DESIGN DEFAULTS:
- Primary color: #6200ee (deep purple)
- Secondary color: #03dac6 (teal)
- Background: #ffffff
- Surface elements: #ffffff with subtle shadows
- Error color: #b00020
- Text on light bg: #000000 (primary), #757575 (secondary)
- Rounded corners: 4-8px border radius
- Shadows for elevation: 2-4px subtle box shadows
- Font: system-ui or Roboto

EXAMPLE OUTPUT FORMAT:
<div class="container">
  <h1 class="title">Counter App</h1>
  <p class="count">Count: <span id="counter">0</span></p>
  <button id="increment-btn" class="button">Increment</button>

  <style>
    /* Base styles */
    .container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      font-family: Roboto, system-ui, sans-serif;
      max-width: 600px;
      margin: 0 auto;
      padding: 24px;
      background-color: #ffffff;
    }

    .title {
      font-size: 24px;
      font-weight: 500;
      margin-bottom: 24px;
      color: rgba(0, 0, 0, 0.87);
    }

    .count {
      font-size: 18px;
      margin-bottom: 32px;
      color: rgba(0, 0, 0, 0.6);
    }

    /* Material button */
    .button {
      background-color: #6200ee;
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 4px;
      font-size: 14px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 1.25px;
      cursor: pointer;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
      transition: all 0.3s;
    }

    .button:hover {
      background-color: #5000d6;
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
    }

    .button:active {
      background-color: #4b00c0;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
      transform: translateY(1px);
    }

    /* Responsive adjustments */
    @media (max-width: 480px) {
      .container {
        padding: 16px;
      }
      .title {
        font-size: 20px;
      }
    }
  </style>

  <script>
    // Simple counter functionality
    const counterElement = document.getElementById('counter');
    const incrementButton = document.getElementById('increment-btn');
    let count = 0;

    incrementButton.addEventListener('click', function() {
      count++;
      counterElement.textContent = count;
    });
  </script>
</div>`
            },
            {
              role: 'user',
              content: `Create a simple web component that does: "${transcript}". Your output must be ONLY the raw HTML with embedded CSS and JavaScript - no introductory text, no explanations, no doctype or head/body tags - just the component HTML that will be placed in a container.`
            }
          ],
          temperature: 0.5
        })
      });

      if (!appResponse.ok) {
        throw new Error(`App generation failed: ${appResponse.statusText}`);
      }

      const appData = await appResponse.json();
      setGeneratedComponent(appData.choices[0].message.content);
      // Update the WebView key to force re-render
      setWebViewKey(Date.now());
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setIsSending(false);
      setProcessingStatus(null);
    }
  };

  // Extract HTML content from LLM response
  const extractComponentCode = useCallback((text) => {
    // If the text contains markdown code blocks, extract the content
    if (text.includes('```')) {
      const codeBlockMatch = text.match(/```(?:html|markup)?\s*([\s\S]*?)```/);
      if (codeBlockMatch && codeBlockMatch[1]) {
        return codeBlockMatch[1].trim();
      }
    }

    // If no code blocks, just return the raw text
    return text;
  }, []);

  // Create a ref for the WebView
  const webViewRef = useRef(null);

  // Create minimal HTML wrapper that lets the component's CSS take precedence
  const generateHTML = useCallback((htmlCode, timestamp = Date.now()) => {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta name="refresh-timestamp" content="${timestamp}">
  <style>
    /* Only minimal reset and error styles */
    html, body {
      height: 100%;
      margin: 0;
      padding: 0;
    }
    #error-container {
      display: none;
      color: #cc0000;
      background-color: #ffe6e6;
      border: 2px solid #ff0000;
      padding: 10px;
      margin: 10px;
      font-family: system-ui;
    }
  </style>
</head>
<body>
  <div id="error-container"></div>
  <div id="app-container">
    ${htmlCode}
  </div>

  <script>
    // Simple error handler
    window.onerror = function(message, source, lineno, colno, error) {
      const errorContainer = document.getElementById('error-container');
      errorContainer.style.display = 'block';
      errorContainer.innerHTML = '<h3>Error:</h3><p>' + message + '</p><p>Line: ' + lineno + '</p>';
      return true; // Prevents default error handling
    };

    // Check if container has content
    document.addEventListener('DOMContentLoaded', function() {
      // If empty content, show error
      if (document.getElementById('app-container').innerHTML.trim() === '') {
        const errorContainer = document.getElementById('error-container');
        errorContainer.style.display = 'block';
        errorContainer.innerHTML = '<h3>Error:</h3><p>No content was generated</p>';
      }
    });
  </script>
</body>
</html>
    `;
  }, []);

  // Start/stop modification flow
  const startModifying = async () => {
    if (isRecording) {
      // If recording, stop it (will auto-process via stopRecording)
      await stopRecording();
    } else {
      // First, ensure we have a component to modify
      if (!generatedComponent) {
        Alert.alert('Error', 'No component to modify');
        return;
      }

      // Store the current component BEFORE setting other states
      const componentToModify = generatedComponent;

      // Setup recording state
      setIsModifying(true);
      setRecordingURI(null);
      setRecordingBlob(null);

      // Set the component explicitly to ensure it's stored before any recording happens
      setCurrentComponent(componentToModify);

      // Start recording after a small delay to ensure state updates have completed
      setTimeout(async () => {
        try {
          await startRecording();
        } catch (error) {
          // Handle error and reset states
          Alert.alert('Recording Error', error.message);
          setIsModifying(false);
        }
      }, 100);
    }
  };

  // Reset to recording screen
  const resetToRecording = () => {
    setGeneratedComponent(null);
    setIsModifying(false);
    setCurrentComponent(null);
  };

  // Modify app with voice instructions
  const modifyApp = async () => {
    if (!recordingURI || (!currentComponent && !generatedComponent)) return; // Restore safety check

    // Set state to trigger UI updates
    setIsSending(true);
    setProcessingStatus('Processing...');

    // Store original component to ensure we have it
    const originalComponent = currentComponent || generatedComponent;

    try {
      // Prepare file for transcription
      let transcriptionResponse;

      if (Platform.OS === 'web') {
        if (!recordingBlob) throw new Error('Recording not available');

        const formData = new FormData();
        formData.append('file', new File([recordingBlob], 'recording.webm', { type: 'audio/webm' }));
        formData.append('model', 'whisper-large-v3');

        transcriptionResponse = await fetch(GROQ_TRANSCRIPTION_URL, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${GROQ_API_KEY}` },
          body: formData
        });
      } else {
        const formData = new FormData();
        formData.append('file', {
          uri: recordingURI,
          name: 'recording.m4a',
          type: 'audio/m4a'
        });
        formData.append('model', 'whisper-large-v3');

        transcriptionResponse = await fetch(GROQ_TRANSCRIPTION_URL, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${GROQ_API_KEY}` },
          body: formData
        });
      }

      if (!transcriptionResponse.ok) {
        throw new Error(`Transcription failed: ${transcriptionResponse.statusText}`);
      }

      // Get transcript
      const transcriptionData = await transcriptionResponse.json();
      const transcript = transcriptionData.text;
      setProcessingStatus('Modifying app...');

      // Get existing component code - use the fallback we created
      const existingCode = extractComponentCode(originalComponent);

      // Generate modified app based on transcript and existing code
      const appResponse = await fetch(GROQ_CHAT_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'llama3-70b-8192',
          messages: [
            {
              role: 'system',
              content: `You are an HTML modifier that updates existing web components based on user voice instructions.

IMPORTANT RULES:
- Modify the existing HTML/CSS/JS according to the user's request
- Preserve the existing structure and styling when possible
- Never include introductions or explanations - only output the modified HTML
- Keep the Material Design styling consistent with the original
- Make sure the modified component still functions correctly
- Do not remove existing functionality unless explicitly requested
- Make minimal changes needed to fulfill the request
- Output the complete component with all modifications`
            },
            {
              role: 'user',
              content: `Here is my existing component:\n\n${existingCode}\n\nModify it to: "${transcript}". Return the complete updated HTML with all modifications applied.`
            }
          ],
          temperature: 0.5
        })
      });

      if (!appResponse.ok) {
        throw new Error(`Modification failed: ${appResponse.statusText}`);
      }

      const appData = await appResponse.json();
      const newContent = appData.choices[0].message.content;

      // Update the generated component content
      setGeneratedComponent(newContent);

      // Update WebView key to force re-render after modification
      const newKey = Date.now();
      setWebViewKey(newKey);

      // Try to force reload via ref if available
      if (webViewRef.current) {
        setTimeout(() => {
          try {
            webViewRef.current.reload();
          } catch (error) {
            console.log('WebView reload error:', error);
          }
        }, 150);
      }

      setIsModifying(false);
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setIsSending(false);
      setProcessingStatus(null);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <Text style={styles.header}>Voice App Generator</Text>

      {!generatedComponent ? (
        <View style={styles.recordingView}>
          {/* Toggle record button */}
          <TouchableOpacity
            style={[
              styles.recordButton,
              isRecording ? styles.recordingActive : null
            ]}
            onPress={toggleRecording}
          >
            <View style={isRecording ? styles.stopIcon : styles.micIcon} />
          </TouchableOpacity>

          {/* Playback & create app buttons (shown only when recording is available) */}
          {recordingURI && (
            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={[styles.button, styles.playButton]}
                onPress={togglePlayback}
              >
                <Text style={styles.buttonText}>
                  {isPlaying ? 'Stop' : 'Play'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.button, styles.createButton]}
                onPress={createApp}
                disabled={isSending}
              >
                {isSending ? (
                  <ActivityIndicator color="white" size="small" />
                ) : (
                  <Text style={styles.buttonText}>Create App</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* Status message */}
          {processingStatus && (
            <Text style={styles.statusText}>{processingStatus}</Text>
          )}
        </View>
      ) : (
        <View style={styles.generatedView}>
          <Text style={styles.subheader}>Your Generated App</Text>

          {/* Component preview */}
          <View style={styles.previewContainer}>
            <WebView
              ref={webViewRef}
              key={webViewKey}
              originWhitelist={['*']}
              source={{
                html: generateHTML(extractComponentCode(generatedComponent), webViewKey),
                baseUrl: '',
                forceReload: webViewKey // Add property to force update
              }}
              style={styles.webView}
              javaScriptEnabled={true}
            />
          </View>

          {/* Status message */}
          {processingStatus && (
            <Text style={styles.statusText}>{processingStatus}</Text>
          )}

          {/* Action buttons */}
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={[
                styles.button,
                isModifying && isRecording ? styles.recordingActive : styles.playButton
              ]}
              onPress={startModifying}
              disabled={isSending}
            >
              {isSending && isModifying ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <Text style={styles.buttonText}>
                  {isModifying && isRecording ? "Recording..." : "Modify"}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.createButton]}
              onPress={resetToRecording}
              disabled={isSending || (isModifying && isRecording)}
            >
              <Text style={styles.buttonText}>Create</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f8f8',
  },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#333',
    marginTop: 60,
    marginBottom: 20,
  },
  recordingView: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  recordButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FF453A',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 30,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
      },
      android: {
        elevation: 5,
      }
    })
  },
  recordingActive: {
    backgroundColor: '#FF453A', // Changed from #555 to match main record button color
  },
  micIcon: {
    width: 30,
    height: 40,
    backgroundColor: 'white',
    borderRadius: 15,
  },
  stopIcon: {
    width: 20,
    height: 20,
    backgroundColor: 'white',
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    width: '100%',
    gap: 15,
  },
  button: {
    height: 50,
    flex: 1,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 2,
      },
      android: {
        elevation: 3,
      }
    })
  },
  playButton: {
    backgroundColor: '#0A84FF',
  },
  createButton: {
    backgroundColor: '#30D158',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  statusText: {
    marginTop: 20,
    fontSize: 16,
    color: '#666',
  },
  generatedView: {
    flex: 1,
    padding: 15,
  },
  subheader: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
    textAlign: 'center',
  },
  previewContainer: {
    flex: 1,
    borderColor: '#ddd',
    borderWidth: 1,
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 15,
  },
  webView: {
    width: '100%',
    height: '100%',
  },
  resetButton: {
    backgroundColor: '#0A84FF',
    padding: 15,
    borderRadius: 25,
    alignItems: 'center',
    marginBottom: 20,
  },
});
