import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
  Image,
  TextInput,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import EmojiPicker from 'rn-emoji-keyboard';
import { useAuth } from '../context/AuthContext';
import {
  getReactions,
  addReaction,
  deleteReaction,
  deletePost,
  updatePost,
} from '../firebase/firestoreHelpers';

export default function PlaceDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    placeId: string;
    placeName: string;
    latitude?: string;
    longitude?: string;
    description?: string;
    images?: string;
    postType?: string;
    createdBy?: string;
    createdByName?: string;
    pinColor?: string;
    tags?: string;
  }>();
  const { user } = useAuth();

  const [reactions, setReactions] = useState<any[]>([]);
  const [myReaction, setMyReaction] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPicker, setShowPicker] = useState(false);

  // Edit mode
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(params.placeName || '');
  const [editDescription, setEditDescription] = useState(params.description || '');

  const isOwner = user && params.createdBy && user.uid === params.createdBy;
  const imageList = params.images ? params.images.split('|').filter(Boolean) : [];
  const tagList = params.tags ? params.tags.split('|').filter(Boolean) : [];

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      if (!params.placeId) return;

      const placeReactions: any[] = await getReactions(params.placeId);
      setReactions(placeReactions);

      if (user) {
        const mine = placeReactions.find((r: any) => r.userId === user.uid);
        if (mine) setMyReaction(mine.emoji);
      }
    } catch (e) {
      console.error('Error loading place detail:', e);
    } finally {
      setLoading(false);
    }
  };

  const emojiBreakdown = () => {
    const counts: Record<string, number> = {};
    reactions.forEach((r: any) => {
      counts[r.emoji] = (counts[r.emoji] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([emoji, count]) => ({ emoji, count }))
      .sort((a, b) => b.count - a.count);
  };

  const requireAuth = (action: () => void) => {
    if (!user) {
      Alert.alert('Login Required', 'You need to log in to do this.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Log In', onPress: () => router.push('/login' as any) },
      ]);
      return;
    }
    action();
  };

  const handleEmojiPick = async (emojiObject: any) => {
    if (!user || !params.placeId) return;
    try {
      await addReaction(params.placeId, { userId: user.uid, emoji: emojiObject.emoji });
      setMyReaction(emojiObject.emoji);
      setShowPicker(false);
      const updated = await getReactions(params.placeId);
      setReactions(updated);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const handleRemoveReaction = async () => {
    if (!user || !params.placeId) return;
    try {
      await deleteReaction(params.placeId, user.uid);
      setMyReaction(null);
      const updated = await getReactions(params.placeId);
      setReactions(updated);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const handleDelete = () => {
    if (!params.placeId) return;
    Alert.alert('Delete Post', 'Are you sure you want to delete this?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePost(params.placeId);
            router.back();
          } catch (e: any) {
            Alert.alert('Error', e.message);
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8AA6A3" />
      </View>
    );
  }

  const breakdown = emojiBreakdown();
  const topEmoji = breakdown.length > 0 ? breakdown[0] : null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>{'<-'}</Text>
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {editing ? 'Edit Post' : (params.placeName || 'Place')}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Post type badge */}
        {params.postType ? (
          <View style={[styles.typeBadge, params.postType === 'meetup' ? styles.meetupBadge : styles.shareBadge]}>
            <Text style={styles.typeBadgeText}>
              {params.postType === 'meetup' ? '📍 Meetup' : '📌 Shared Location'}
            </Text>
          </View>
        ) : null}

        {/* Edit mode */}
        {editing ? (
          <View style={styles.editSection}>
            <TextInput
              style={styles.editInput}
              value={editTitle}
              onChangeText={setEditTitle}
              placeholder="Title"
            />
            <TextInput
              style={[styles.editInput, styles.editTextArea]}
              value={editDescription}
              onChangeText={setEditDescription}
              placeholder="Description"
              multiline
            />
            <View style={styles.editButtons}>
              <Pressable style={styles.editCancelBtn} onPress={() => setEditing(false)}>
                <Text style={styles.editCancelBtnText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <>
            <View style={styles.placeInfo}>
              <Text style={styles.placeName}>{params.placeName}</Text>
              {params.createdByName ? (
                <Text style={styles.postedBy}>by {params.createdByName}</Text>
              ) : null}
              {tagList.length > 0 && (
                <View style={styles.tagsRow}>
                  {tagList.map((tag) => (
                    <View key={tag} style={styles.tagChip}>
                      <Text style={styles.tagChipText}>{tag}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Description */}
            {params.description ? (
              <Text style={styles.description}>{params.description}</Text>
            ) : null}

            {/* Images */}
            {imageList.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imagesRow}>
                {imageList.map((uri, i) => (
                  <Image key={i} source={{ uri }} style={styles.placeImage} />
                ))}
              </ScrollView>
            )}

            {/* Owner actions */}
            {isOwner && (
              <View style={styles.ownerActions}>
                <Pressable style={styles.editBtn} onPress={() => setEditing(true)}>
                  <Text style={styles.editBtnText}>Edit</Text>
                </Pressable>
                <Pressable style={styles.deleteBtn} onPress={handleDelete}>
                  <Text style={styles.deleteBtnText}>Delete</Text>
                </Pressable>
              </View>
            )}
          </>
        )}

        {/* Coordinates */}
        {params.latitude && params.longitude ? (
          <Text style={styles.coords}>
            {parseFloat(params.latitude).toFixed(4)}, {parseFloat(params.longitude).toFixed(4)}
          </Text>
        ) : null}

        {topEmoji && (
          <View style={styles.topReactionCard}>
            <Text style={styles.topEmoji}>{topEmoji.emoji}</Text>
            <Text style={styles.topCount}>{topEmoji.count}</Text>
            <Text style={styles.topLabel}>
              {reactions.length} total reaction{reactions.length !== 1 ? 's' : ''}
            </Text>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Reaction</Text>
          {myReaction ? (
            <View style={styles.myReactionRow}>
              <Text style={styles.myReactionEmoji}>{myReaction}</Text>
              <Pressable onPress={() => setShowPicker(true)} style={styles.changeButton}>
                <Text style={styles.changeText}>Change</Text>
              </Pressable>
              <Pressable onPress={handleRemoveReaction} style={styles.removeButton}>
                <Text style={styles.removeText}>Remove</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={() => requireAuth(() => setShowPicker(true))} style={styles.addReactionButton}>
              <Text style={styles.addReactionText}>+ Add Reaction</Text>
            </Pressable>
          )}
        </View>

        {breakdown.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>All Reactions</Text>
            {breakdown.map(({ emoji, count }) => (
              <View key={emoji} style={styles.breakdownRow}>
                <Text style={styles.breakdownEmoji}>{emoji}</Text>
                <View style={styles.breakdownBarContainer}>
                  <View
                    style={[
                      styles.breakdownBar,
                      { width: `${(count / reactions.length) * 100}%` },
                    ]}
                  />
                </View>
                <Text style={styles.breakdownCount}>{count}</Text>
              </View>
            ))}
          </View>
        )}

        {reactions.length === 0 && (
          <Text style={styles.emptyText}>No reactions yet. Be the first!</Text>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      <EmojiPicker
        onEmojiSelected={handleEmojiPick}
        open={showPicker}
        onClose={() => setShowPicker(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 60, paddingHorizontal: 16, paddingBottom: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  backText: { fontSize: 20, color: '#111', fontWeight: '600' },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: '#111', textAlign: 'center' },
  headerSpacer: { width: 40, height: 40 },

  scrollContent: { paddingHorizontal: 20, paddingTop: 24 },

  typeBadge: {
    alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 12, marginBottom: 12,
  },
  meetupBadge: { backgroundColor: '#8AA6A3' },
  shareBadge: { backgroundColor: '#f5c842' },
  typeBadgeText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  placeInfo: { marginBottom: 16 },
  placeName: { fontSize: 26, fontWeight: '800', color: '#111', marginBottom: 4 },
  postedBy: { fontSize: 13, color: '#999', marginBottom: 8 },
tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  tagChip: { backgroundColor: '#f0f0f0', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12 },
  tagChipText: { fontSize: 13, color: '#444', fontWeight: '500' },

  description: { fontSize: 15, color: '#444', lineHeight: 22, marginBottom: 16 },

  imagesRow: { marginBottom: 16 },
  placeImage: { width: 180, height: 130, borderRadius: 12, marginRight: 10, backgroundColor: '#e0e0e0' },

  coords: { fontSize: 13, color: '#999', marginBottom: 16 },

  ownerActions: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  editBtn: { backgroundColor: '#f0f0f0', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12 },
  editBtnText: { fontSize: 14, color: '#333', fontWeight: '600' },
  deleteBtn: { backgroundColor: '#FEF2F2', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12 },
  deleteBtnText: { fontSize: 14, color: '#E76F51', fontWeight: '600' },

  editSection: { marginBottom: 20 },
  editInput: { backgroundColor: '#f5f5f5', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: '#111', marginBottom: 12 },
  editTextArea: { minHeight: 100, textAlignVertical: 'top' },
  editButtons: { flexDirection: 'row' },
  editCancelBtn: { backgroundColor: '#f0f0f0', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  editCancelBtnText: { color: '#333', fontSize: 15, fontWeight: '600' },

  topReactionCard: {
    alignItems: 'center', backgroundColor: '#f8f8f8',
    borderRadius: 16, padding: 24, marginBottom: 24,
  },
  topEmoji: { fontSize: 48 },
  topCount: { fontSize: 28, fontWeight: '800', color: '#111', marginTop: 4 },
  topLabel: { fontSize: 13, color: '#666', marginTop: 4 },

  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#111', marginBottom: 12 },

  myReactionRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  myReactionEmoji: { fontSize: 36 },
  changeButton: { backgroundColor: '#f0f0f0', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
  changeText: { fontSize: 14, color: '#333', fontWeight: '500' },
  removeButton: { backgroundColor: '#FEF2F2', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
  removeText: { fontSize: 14, color: '#E76F51', fontWeight: '500' },

  addReactionButton: {
    backgroundColor: '#f8f8f8', paddingVertical: 16, borderRadius: 14, alignItems: 'center',
  },
  addReactionText: { fontSize: 16, color: '#8AA6A3', fontWeight: '600' },

  breakdownRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  breakdownEmoji: { fontSize: 22, width: 36 },
  breakdownBarContainer: {
    flex: 1, height: 20, backgroundColor: '#f0f0f0',
    borderRadius: 10, marginHorizontal: 10, overflow: 'hidden',
  },
  breakdownBar: { height: '100%', backgroundColor: '#8AA6A3', borderRadius: 10 },
  breakdownCount: { width: 30, fontSize: 14, color: '#666', textAlign: 'right', fontWeight: '600' },

  emptyText: { fontSize: 15, color: '#999', fontStyle: 'italic', textAlign: 'center', marginTop: 20 },
});
