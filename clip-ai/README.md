# CLIP AI — Hobby Image Classifier

A locally-hosted AI service that uses OpenAI's [CLIP](https://openai.com/research/clip) model to classify images against a set of hobby/activity categories. Used by the Huzz app to auto-suggest tags when creating meetups.

## How It Works

The service runs a FastAPI server with a single endpoint. You send it an image + a list of categories (your saved hobbies), and CLIP returns confidence scores for each category — telling you which hobby best matches the photo.

## Setup

### 1. Create & activate a Python virtual environment

```bash
cd clip-ai
python3 -m venv venv
source venv/bin/activate
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

> **Note:** The first run will download the CLIP model (~600 MB). PyTorch with CUDA support is installed by default — if you don't have an NVIDIA GPU, install the CPU-only version instead:
> ```bash
> pip install torch --index-url https://download.pytorch.org/whl/cpu
> ```

### 3. Start the server

```bash
cd app
uvicorn main:app --host 0.0.0.0 --port 8000
```

Wait for `✅ AI Engine is ready!` to appear. The server is now listening on port 8000.

## API

### `POST /classify-image/`

Classifies an image against the provided categories.

**Request** (multipart/form-data):

| Field        | Type         | Description                                      |
|-------------|-------------|--------------------------------------------------|
| `file`      | File upload  | The image to classify (JPEG, PNG, etc.)          |
| `categories`| String       | Comma-separated list of categories to match against |

**Example:**

```bash
curl -X POST http://localhost:8000/classify-image/ \
  -F "file=@photo.jpg" \
  -F "categories=pickleball, pottery, bird watching, hiking"
```

**Response:**

```json
{
  "filename": "photo.jpg",
  "predictions": {
    "hiking": 52.4,
    "pickleball": 25.1,
    "bird watching": 18.3,
    "pottery": 4.2
  }
}
```

Predictions are sorted highest-confidence first. Values are percentages that sum to 100.

## Connecting to the Huzz App

The React Native app calls this API when a user adds a photo to a meetup. It sends the user's saved chip bar hobbies as categories and auto-suggests the best match as a tag.

The API URL is configured in `huzz/app/ActionSheet.tsx`:

```ts
const CLIP_API_URL = 'http://<YOUR_LAN_IP>:8000';
```

To find your LAN IP:

```bash
hostname -I | awk '{print $1}'
```

**Important:** Your phone and laptop must be on the same network for this to work.

## Testing

There's a test script included:

```bash
source venv/bin/activate
python app/scripts/test_api.py
```

This sends `app/pics/test.jpg` to the API with sample categories and prints the results.
