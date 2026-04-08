import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as ImageManipulator from 'expo-image-manipulator';
import { createPost } from '../firebase/firestoreHelpers';
import { uploadImages } from '../utils/cloudinary';
import { useAuth } from '../context/AuthContext';

const PIN_COLORS = [
  { name: 'Red', value: '#FF3B30' },
  { name: 'Orange', value: '#FF9500' },
  { name: 'Yellow', value: '#f5c842' },
  { name: 'Green', value: '#34C759' },
  { name: 'Teal', value: '#8AA6A3' },
  { name: 'Blue', value: '#007AFF' },
  { name: 'Purple', value: '#AF52DE' },
  { name: 'Pink', value: '#FF2D55' },
];

// CLIP AI servers — tries local first, then teammate's remote server
const CLIP_URLS = [
  'http://167.96.97.124:8000',   // Your machine (local)
  'http://167.96.122.149:8000',  // Teammate's server
];

type Props = {
  visible: boolean;
  onClose: () => void;
  onDragProgress?: (progress: number) => void;
  onPostCreated?: () => void;
  pinnedLocation?: { latitude: number; longitude: number } | null;
  chips?: string[];
};

export default function ActionSheet({ visible, onClose, onDragProgress, onPostCreated, pinnedLocation, chips = [] }: Props) {
  const slideAnim = useRef(new Animated.Value(500)).current;
  const [mounted, setMounted] = useState(false);
  const { user } = useAuth();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [pinColor, setPinColor] = useState('#FF3B30');
  const [submitting, setSubmitting] = useState(false);

  // CLIP AI state
  const [suggestedTags, setSuggestedTags] = useState<{ label: string; confidence: number }[]>([]);
  const [classifying, setClassifying] = useState(false);

  useEffect(() => {
    if (visible) {
      slideAnim.setValue(500);
      setMounted(true);
      setTimeout(() => {
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 500,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }).start();
      }, 10);
    } else {
      Animated.timing(slideAnim, {
        toValue: 500,
        duration: 350,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }).start(() => {
        slideAnim.setValue(500);
        setMounted(false);
      });
    }
  }, [visible]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => g.dy > 4,
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) {
          slideAnim.setValue(g.dy);
          const progress = Math.min(g.dy / 500, 1);
          onDragProgress?.(progress);
        }
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 80) {
          Animated.timing(slideAnim, {
            toValue: 600,
            duration: 300,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }).start(() => {
            slideAnim.setValue(500);
            onDragProgress?.(1);
            setMounted(false);
            onClose();
          });
        } else {
          onDragProgress?.(0);
          Animated.timing(slideAnim, {
            toValue: 0,
            duration: 250,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  // CLIP AI — classify a single image, returns predictions array
  const classifySingleImage = async (uri: string, categories: string[]) => {
    const resized = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 512 } }],
      { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG }
    );

    const formData = new FormData();
    formData.append('file', {
      uri: resized.uri,
      type: 'image/jpeg',
      name: 'photo.jpg',
    } as any);
    formData.append('categories', categories.join(', '));

    let res: Response | null = null;
    for (const url of CLIP_URLS) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        res = await fetch(`${url}/classify-image/`, {
          method: 'POST',
          body: formData,
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (res.ok) break;
      } catch {
        continue;
      }
    }

    if (!res || !res.ok) throw new Error('CLIP API unavailable');
    const data = await res.json();
    return data.predictions as Record<string, number>;
  };

  // Classify all images and merge results (highest confidence per tag wins)
  const classifyAllImages = async (uris: string[]) => {
    const categories = chips.filter(c => c !== '\u23CF');
    if (categories.length === 0 || uris.length === 0) {
      setSuggestedTags([]);
      setSelectedTags([]);
      return;
    }

    setClassifying(true);
    try {
      const allResults = await Promise.all(
        uris.map(uri => classifySingleImage(uri, categories).catch(() => null))
      );

      // Merge: take the highest confidence for each tag across all images
      const merged: Record<string, number> = {};
      for (const result of allResults) {
        if (!result) continue;
        for (const [label, confidence] of Object.entries(result)) {
          if (!merged[label] || confidence > merged[label]) {
            merged[label] = confidence;
          }
        }
      }

      const predictions = Object.entries(merged)
        .map(([label, confidence]) => ({ label, confidence }))
        .filter(p => Math.round(p.confidence) > 0)
        .sort((a, b) => b.confidence - a.confidence);

      setSuggestedTags(predictions);
      // Auto-select top tag only if user hasn't manually picked any yet
      if (selectedTags.length === 0 && predictions.length > 0) {
        setSelectedTags([predictions[0].label]);
      }
    } catch (err) {
      console.warn('CLIP classification failed:', err);
    } finally {
      setClassifying(false);
    }
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
    });
    if (!result.canceled) {
      const uris = result.assets.map((a) => a.uri);
      const allImages = [...images, ...uris];
      setImages(allImages);
      classifyAllImages(allImages);
    }
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setImages([]);
    setSelectedTags([]);
    setSuggestedTags([]);
    setPinColor('#FF3B30');
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      Alert.alert('Missing Title', 'Please enter a title.');
      return;
    }
    if (!user) {
      Alert.alert('Not Logged In', 'You need to be logged in to post.');
      return;
    }

    setSubmitting(true);
    try {
      let lat: number, lng: number;
      if (pinnedLocation) {
        lat = pinnedLocation.latitude;
        lng = pinnedLocation.longitude;
      } else {
        const loc = await Location.getCurrentPositionAsync({});
        lat = loc.coords.latitude;
        lng = loc.coords.longitude;
      }

      // Upload images to Cloudinary, get public URLs
      const imageUrls = images.length > 0 ? await uploadImages(images) : [];

      await createPost({
        type: 'share',
        createdBy: user.uid,
        createdByName: user.displayName || 'Anonymous',
        title: title.trim(),
        description: description.trim(),
        images: imageUrls,
        latitude: lat,
        longitude: lng,
        tags: selectedTags,
        pinColor,
      });

      resetForm();
      onClose();
      onPostCreated?.();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!mounted) return null;

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <Animated.View
        style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}
      >
        {/* Handle */}
        <View {...panResponder.panHandlers} style={styles.handleArea}>
          <View style={styles.handle} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
        >
          {/* Header */}
          <View style={styles.headerRow}>
            <Text style={styles.heading}>Add New Location</Text>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeText}>{'\u2715'}</Text>
            </Pressable>
          </View>

          {/* Title */}
          <TextInput
            style={styles.input}
            placeholder="Location Title"
            placeholderTextColor="#aaa"
            value={title}
            onChangeText={setTitle}
          />

          {/* Description */}
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Description of Location..."
            placeholderTextColor="#aaa"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
          />

          {/* Image Picker */}
          <Pressable style={styles.imagePicker} onPress={images.length === 0 ? pickImage : undefined}>
            {images.length === 0 ? (
              <View style={styles.imagePickerInner}>
                <Text style={styles.imagePickerText}>Add Photos</Text>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {images.map((uri, i) => (
                  <View key={i} style={styles.thumbWrapper}>
                    <Image source={{ uri }} style={styles.imageThumb} />
                    <Pressable
                      style={styles.removeButton}
                      onPress={() => {
                        const updated = images.filter((_, idx) => idx !== i);
                        setImages(updated);
                        classifyAllImages(updated);
                      }}
                    >
                      <Text style={styles.removeButtonText}>{'\u2715'}</Text>
                    </Pressable>
                  </View>
                ))}
                <Pressable style={styles.addMoreButton} onPress={pickImage}>
                  <Text style={styles.addMoreText}>+</Text>
                </Pressable>
              </ScrollView>
            )}
          </Pressable>

          {/* AI Tags (from CLIP) */}
          <Text style={styles.tagsLabel}>
            {classifying ? 'AI is analyzing your photo...' : 'Tags'}
          </Text>
          <View style={styles.tagsRow}>
            {suggestedTags.map(({ label, confidence }) => {
              const active = selectedTags.includes(label);
              return (
                <Pressable
                  key={label}
                  style={[styles.tag, active && styles.activeTag]}
                  onPress={() => toggleTag(label)}
                >
                  <Text style={[styles.tagText, active && styles.activeTagText]}>
                    {label} {Math.round(confidence)}%
                  </Text>
                </Pressable>
              );
            })}
            {suggestedTags.length === 0 && !classifying && (
              <Text style={styles.hintText}>Add a photo to get AI tag suggestions</Text>
            )}
          </View>

          {/* Pin Color */}
          <Text style={styles.tagsLabel}>Pin Color</Text>
          <View style={styles.colorRow}>
            {PIN_COLORS.map((c) => (
              <Pressable
                key={c.value}
                onPress={() => setPinColor(c.value)}
                style={[
                  styles.colorCircle,
                  { backgroundColor: c.value },
                  pinColor === c.value && styles.colorCircleSelected,
                ]}
              />
            ))}
          </View>

          {/* Submit */}
          <Pressable
            style={[styles.submitButton, submitting && { opacity: 0.6 }]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitText}>Add New Location</Text>
            )}
          </Pressable>
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: 40,
    paddingTop: 14,
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -4 },
    elevation: 10,
  },
  handleArea: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingVertical: 12,
  },
  handle: {
    width: 64,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#000',
  },
  content: {
    paddingHorizontal: 24,
    paddingBottom: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  heading: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111',
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeText: {
    fontSize: 15,
    color: '#333',
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#f5f5f5',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#111',
    marginBottom: 14,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  imagePicker: {
    backgroundColor: '#f5c842',
    borderRadius: 16,
    minHeight: 130,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    overflow: 'hidden',
    padding: 12,
  },
  imagePickerInner: {
    alignItems: 'center',
    gap: 8,
  },
  imagePickerIcon: {
    fontSize: 32,
  },
  imagePickerText: {
    fontSize: 15,
    color: '#fff',
    fontWeight: '600',
  },
  imageThumb: {
    width: 100,
    height: 110,
    borderRadius: 10,
    marginRight: 10,
  },
  thumbWrapper: {
    position: 'relative',
    marginRight: 10,
  },
  removeButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  addMoreButton: {
    width: 100,
    height: 110,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addMoreText: {
    fontSize: 32,
    color: '#fff',
    fontWeight: '600',
  },
  tagsLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111',
    marginBottom: 12,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 28,
  },
  tag: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
  },
  activeTag: {
    backgroundColor: '#8AA6A3',
  },
  tagText: {
    fontSize: 15,
    color: '#444',
    fontWeight: '500',
  },
  activeTagText: {
    color: '#fff',
  },
  colorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 28,
  },
  colorCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorCircleSelected: {
    borderColor: '#111',
    borderWidth: 3,
  },
  submitButton: {
    backgroundColor: '#111',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
  },
  submitText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
  },
  hintText: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
  },
});
