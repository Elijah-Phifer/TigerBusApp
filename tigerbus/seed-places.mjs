/**
 * One-time seed script: uploads place images to Cloudinary,
 * then creates Firestore posts for each place from the CSV.
 *
 * Usage: node seed-places.mjs
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, query, where, serverTimestamp } from 'firebase/firestore';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { basename } from 'path';

// ─── Firebase Config ─────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyBCy8h25qOXh725ztXg5TpaqSTo9ezU6TQ",
  authDomain: "huzz-e347f.firebaseapp.com",
  projectId: "huzz-e347f",
  storageBucket: "huzz-e347f.firebasestorage.app",
  messagingSenderId: "478275774188",
  appId: "1:478275774188:web:f3fe72e47b7a38c53267c9",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ─── Cloudinary Config ───────────────────────────
const CLOUD_NAME = 'dhwlgojtc';
const UPLOAD_PRESET = 'huzz_upload';
const UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;

// ─── Image directory ─────────────────────────────
const IMAGE_DIR = '/Users/steventan/hackathonhuzz';

// ─── Parse CSV ───────────────────────────────────
function parseCSV(filepath) {
  const raw = readFileSync(filepath, 'utf-8');
  const lines = raw.split('\n').filter(l => l.trim());
  const rows = [];

  // Skip header
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i]);
    if (fields.length < 5) continue;

    const [name, description, hobbies, address, coords, notes] = fields;

    // Parse coordinates
    const coordParts = coords.split(',').map(s => parseFloat(s.trim()));
    if (coordParts.length < 2 || isNaN(coordParts[0]) || isNaN(coordParts[1])) {
      console.warn(`  Skipping "${name}" — bad coordinates: "${coords}"`);
      continue;
    }

    rows.push({
      name: name.trim(),
      description: description.trim(),
      hobbies: hobbies.split(';').map(h => h.trim()).filter(Boolean),
      address: address.trim(),
      latitude: coordParts[0],
      longitude: coordParts[1],
    });
  }

  return rows;
}

// Handle quoted CSV fields with commas inside
function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

// ─── Upload image to Cloudinary ──────────────────
async function uploadToCloudinary(filePath) {
  const fileBuffer = readFileSync(filePath);
  const form = new FormData();
  form.append('file', new Blob([fileBuffer], { type: 'image/png' }), 'upload.png');
  form.append('upload_preset', UPLOAD_PRESET);

  const res = await fetch(UPLOAD_URL, {
    method: 'POST',
    body: form,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Cloudinary upload failed: ${err}`);
  }

  const data = await res.json();
  return data.secure_url;
}

// ─── Build image lookup (lowercase name → file paths) ─
const allPngs = readdirSync(IMAGE_DIR).filter(f => f.endsWith('.png'));
const imageLookup = {};
for (const file of allPngs) {
  const match = file.match(/^(.+)_(\d+)\.png$/);
  if (!match) continue;
  const key = match[1].toLowerCase();
  if (!imageLookup[key]) imageLookup[key] = [];
  imageLookup[key].push(`${IMAGE_DIR}/${file}`);
}

// CSV name → image name mappings for mismatches
const NAME_MAP = {
  'cherrybomb coffee': 'cherry bomb coffee',
  'brec laurens henry cohn, senior memorial plant arboretum': 'brec laurens henry cohn senior memorial plant arboretum',
  'anger management, llc (rage room)': 'anger management llc (rage room)',
  'baton rouge gallery - center for contemporary art': 'baton rouge gallery - center for contemporary art',
  'lsu levee during sunset': 'lsu levee during sunset',
  'the garage band - top of the union square garage': 'the garage band - top of the union square garage',
  "leola's cafe and coffee house": "leola's cafe and coffee house",
};

function findImages(placeName) {
  const key = placeName.toLowerCase();
  // Direct match
  if (imageLookup[key]) return imageLookup[key].sort();
  // Mapped match
  const mapped = NAME_MAP[key];
  if (mapped && imageLookup[mapped]) return imageLookup[mapped].sort();
  // Fuzzy: try partial match
  for (const k of Object.keys(imageLookup)) {
    if (k.includes(key) || key.includes(k)) return imageLookup[k].sort();
  }
  return [];
}

// ─── Main ────────────────────────────────────────
async function main() {
  const csvPath = `${IMAGE_DIR}/wics_places_updated_with_addresses_coordinates.csv`;
  const places = parseCSV(csvPath);

  console.log(`Found ${places.length} places in CSV\n`);

  // Clean up old static places first
  console.log('Cleaning up old static places...');
  const q = query(collection(db, 'posts'), where('isStaticPlace', '==', true));
  const oldSnap = await getDocs(q);
  for (const d of oldSnap.docs) {
    await deleteDoc(doc(db, 'posts', d.id));
  }
  console.log(`Deleted ${oldSnap.size} old static places.\n`);

  let success = 0;
  let failed = 0;

  for (const place of places) {
    console.log(`Processing: ${place.name}`);

    // Find and upload images
    const imagePaths = findImages(place.name);
    const imageUrls = [];

    for (const imgPath of imagePaths) {
      try {
        console.log(`  Uploading ${basename(imgPath)}...`);
        const url = await uploadToCloudinary(imgPath);
        imageUrls.push(url);
        console.log(`  ✓ Uploaded`);
      } catch (e) {
        console.warn(`  ✗ Failed to upload ${basename(imgPath)}: ${e.message}`);
      }
    }

    if (imagePaths.length === 0) {
      console.log(`  No images found for "${place.name}"`);
    }

    // Create Firestore post
    try {
      await addDoc(collection(db, 'posts'), {
        type: 'share',
        createdBy: 'system',
        createdByName: 'Huzz',
        title: place.name,
        description: place.description,
        images: imageUrls,
        latitude: place.latitude,
        longitude: place.longitude,
        tags: place.hobbies,
        pinColor: '#8AA6A3',
        address: place.address,
        isStaticPlace: true,
        createdAt: serverTimestamp(),
      });
      console.log(`  ✓ Created post with ${imageUrls.length} images\n`);
      success++;
    } catch (e) {
      console.error(`  ✗ Failed to create post: ${e.message}\n`);
      failed++;
    }
  }

  console.log(`\nDone! ${success} created, ${failed} failed.`);
  process.exit(0);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
