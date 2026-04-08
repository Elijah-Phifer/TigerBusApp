import { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, PanResponder,
  StyleSheet, Animated
} from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { logIn, signUp, resetPassword } from '../firebase/authHelpers';

// Import smile images statically
const smileImages = [
  require('../assets/images/smile1.png'),
  require('../assets/images/smile2.png'),
  require('../assets/images/smile3.png'),
  require('../assets/images/smile4.png'),
  require('../assets/images/smile5.png'),
  require('../assets/images/smile6.png'),
];

export default function LoginScreen() {
  const router = useRouter();
  const [isSignUp, setIsSignUp] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 12,
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 80 && router.canGoBack()) {
          router.back();
        }
      },
    })
  ).current;

  // Score that encourages all active fields to contribute
  const usernameScore = Math.min(username.length, 4);
  const emailScore = Math.min(email.length, 4);
  const passwordScore = Math.min(password.length, 4);
  // Sign-up has 3 fields (max 12), login has 2 fields (max 8) — thresholds scale accordingly
  const combinedScore = isSignUp
    ? usernameScore + emailScore + passwordScore   // 0..12
    : usernameScore + passwordScore;               // 0..8

  let smileIndex = 1;
  if (combinedScore >= 8) {
    smileIndex = 6;
  } else if (combinedScore >= 6) {
    smileIndex = 5;
  } else if (combinedScore >= 4) {
    smileIndex = 4;
  } else if (combinedScore >= 3) {
    smileIndex = 3;
  } else if (combinedScore >= 2) {
    smileIndex = 2;
  }

  const smileImage = smileImages[smileIndex - 1];

  const handleSubmit = async () => {
    if (isSignUp && (!username || !email || !password)) {
      Alert.alert('Missing fields', 'Please fill in all fields.');
      return;
    }
    if (!isSignUp && (!username || !password)) {
      Alert.alert('Missing fields', 'Please fill in all fields.');
      return;
    }
    setLoading(true);
    try {
      if (isSignUp) {
        await signUp(email, password, username);
      } else {
        await logIn(username, password);
      }
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!username) {
      Alert.alert('Enter your username', 'Please type your username first, then tap Forgot Password.');
      return;
    }
    try {
      await resetPassword(username);
      Alert.alert('Check your email', 'A password reset link has been sent to the email associated with your account.');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  return (
    <KeyboardAvoidingView
      {...panResponder.panHandlers}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-[#FEF9EF] justify-center px-8"
    >
      <View className="items-center mb-8">
        <Image
          source={smileImage}
          style={{ width: 120, height: 120 }}
          contentFit="contain"
        />
      </View>

      <View className="mb-10">
        <Text className="text-4xl font-bold text-[#FFC753] text-center">Welcome</Text>
        <Text className="text-gray-500 mt-1 text-base text-center">Find your third place</Text>
      </View>

      <TextInput
        className="border border-gray-200 rounded-xl px-4 mb-3"
        style={{ paddingVertical: 16, fontSize: 16, minHeight: 54, textAlignVertical: 'center' }}
        placeholder="Username"
        placeholderTextColor="#4B5563"
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
      />

      {isSignUp && (
        <TextInput
          className="border border-gray-200 rounded-xl px-4 mb-3"
          style={{ paddingVertical: 16, fontSize: 16, minHeight: 54, textAlignVertical: 'center' }}
          placeholder="Email"
          placeholderTextColor="#4B5563"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
      )}

      <TextInput
        className="border border-gray-200 rounded-xl px-4 mb-3"
        style={{ paddingVertical: 16, fontSize: 16, minHeight: 54, textAlignVertical: 'center' }}
        placeholder="Password"
        placeholderTextColor="#4B5563"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      {!isSignUp && (
        <TouchableOpacity className="items-end mb-5" onPress={handleForgotPassword}>
          <Text className="text-[#FFC753] text-sm">Forgot Password?</Text>
        </TouchableOpacity>
      )}

      {isSignUp && <View className="mb-2" />}

      <TouchableOpacity
        style={[styles.loginButton, loading && styles.loginButtonDisabled]}
        onPress={handleSubmit}
        disabled={loading}
      >
        {loading
          ? <ActivityIndicator color="white" />
          : <Text style={styles.loginButtonText}>{isSignUp ? 'Sign Up' : 'Log In'}</Text>
        }
      </TouchableOpacity>

      <TouchableOpacity className="mt-5 items-center" onPress={() => setIsSignUp(!isSignUp)}>
        <Text className="text-gray-500">
          {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
          <Text className="text-orange-500 font-semibold">{isSignUp ? 'Log In' : 'Sign Up'}</Text>
        </Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  loginButton: {
    width: '100%',
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#6B4226',
    shadowColor: '#6B4226',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 6,
  },
  loginButtonDisabled: {
    backgroundColor: '#8b6a58',
    opacity: 0.75,
  },
  loginButtonText: {
    color: '#FDF7F1',
    fontWeight: '700',
    fontSize: 16,
    letterSpacing: 0.6,
  },
});
